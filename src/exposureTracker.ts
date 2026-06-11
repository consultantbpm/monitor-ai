import * as vscode from 'vscode';
import * as path from 'path';
import { scanRiskByPath, scanRiskByContent, RiskFinding } from './secrets';
import { detectAi, AiPresence } from './aiDetect';

interface FileEntry {
  lines: number;
  risk?: RiskFinding[];
}

export interface ProjectPeak {
  percent: number;
  percentAt: number;       // epoch ms when this peak was reached
  exposedLines: number;
  exposedLinesAt: number;
}

export interface ProjectMetrics {
  workspacePath: string;
  displayName: string;
  totalFiles: number;
  totalLines: number;
  exposedFiles: number;
  exposedLines: number;
  percent: number;
  peak: ProjectPeak;
  lastSeen: number;
  sensitiveExposedFiles: number;
  sensitivePeak: { count: number; at: number };
  ai: AiPresence;
}

export type ActivityType =
  | 'exposed'
  | 'changed'
  | 'created'
  | 'deleted'
  | 'reset'
  | 'rescan';

export interface ActivityEvent {
  type: ActivityType;
  path?: string;
  rel?: string;
  lines?: number;
  ts: number;
  risk?: string[];  // risk pattern labels if file is sensitive
}

const PROJECTS_KEY = 'aiExposure.projects';
const EXPOSED_FILES_KEY_PREFIX = 'aiExposure.exposedFiles:'; // per-workspace persisted set
const MAX_ACTIVITY = 80;

export class ExposureTracker {
  private readonly _onChange = new vscode.EventEmitter<void>();
  readonly onChange = this._onChange.event;

  private readonly _onActivity = new vscode.EventEmitter<ActivityEvent>();
  readonly onActivity = this._onActivity.event;

  private fileIndex = new Map<string, FileEntry>();
  private exposed = new Set<string>();
  private changeDebounce = new Map<string, NodeJS.Timeout>();
  private recentActivity: ActivityEvent[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  private relPath(fsPath: string): string {
    const wp = this.workspacePath;
    if (wp && fsPath.startsWith(wp)) return fsPath.slice(wp.length + 1);
    return fsPath;
  }

  private pushActivity(ev: ActivityEvent): void {
    this.recentActivity.push(ev);
    if (this.recentActivity.length > MAX_ACTIVITY) this.recentActivity.shift();
    this._onActivity.fire(ev);
  }

  getRecentActivity(): ActivityEvent[] {
    return this.recentActivity.slice();
  }

  private get workspacePath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private storageKey(): string | null {
    const wp = this.workspacePath;
    return wp ? EXPOSED_FILES_KEY_PREFIX + wp : null;
  }

  async init(): Promise<void> {
    if (this.persistEnabled()) {
      const key = this.storageKey();
      if (key) {
        const saved = this.context.globalState.get<string[]>(key, []);
        for (const p of saved) this.exposed.add(p);
      }
    }
    await this.rescan();
  }

  async rescan(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('aiExposure');
    const include = cfg.get<string[]>('includeGlobs') ?? [];
    const exclude = cfg.get<string[]>('excludeGlobs') ?? [];
    const maxBytes = (cfg.get<number>('maxFileSizeKB') ?? 2048) * 1024;

    this.fileIndex.clear();

    const includePattern = include.length <= 1 ? (include[0] ?? '**/*') : `{${include.join(',')}}`;
    const excludePattern = exclude.length === 0 ? undefined
      : exclude.length === 1 ? exclude[0]
      : `{${exclude.join(',')}}`;

    const uris = await vscode.workspace.findFiles(includePattern, excludePattern);
    await Promise.all(uris.map((uri) => this.indexFile(uri, maxBytes)));
    this.persistMetrics();
    this.pushActivity({ type: 'rescan', lines: this.totalLines(), ts: Date.now() });
    this._onChange.fire();
  }

  private async indexFile(uri: vscode.Uri, maxBytes: number): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type !== vscode.FileType.File) return;
      if (stat.size > maxBytes) return;
      const data = await vscode.workspace.fs.readFile(uri);
      const risk = [...scanRiskByPath(uri.fsPath), ...scanRiskByContent(data)];
      this.fileIndex.set(uri.fsPath, { lines: countLines(data), risk: risk.length ? risk : undefined });
    } catch { /* unreadable / vanished */ }
  }

  markExposed(uri: vscode.Uri): void {
    if (uri.scheme !== 'file') return;
    const fsPath = uri.fsPath;
    const entry = this.fileIndex.get(fsPath);
    if (!entry) return;
    if (this.exposed.has(fsPath)) return;
    this.exposed.add(fsPath);
    this.persistExposed();
    this.persistMetrics();
    const risk = entry.risk?.map((r) => r.pattern);
    this.pushActivity({ type: 'exposed', path: fsPath, rel: this.relPath(fsPath), lines: entry.lines, ts: Date.now(), risk });
    this._onChange.fire();
  }

  async reset(): Promise<void> {
    this.exposed.clear();
    this.persistExposed();
    this.persistMetrics();
    this.pushActivity({ type: 'reset', ts: Date.now() });
    this._onChange.fire();
  }

  onFileChanged(uri: vscode.Uri): void {
    if (uri.scheme !== 'file') return;
    const fsPath = uri.fsPath;
    if (!this.fileIndex.has(fsPath)) return;
    const existing = this.changeDebounce.get(fsPath);
    if (existing) clearTimeout(existing);
    this.changeDebounce.set(
      fsPath,
      setTimeout(async () => {
        this.changeDebounce.delete(fsPath);
        try {
          const data = await vscode.workspace.fs.readFile(uri);
          const prev = this.fileIndex.get(fsPath)?.lines ?? 0;
          const next = countLines(data);
          this.fileIndex.set(fsPath, { lines: next });
          this.persistMetrics();
          if (next !== prev) {
            this.pushActivity({ type: 'changed', path: fsPath, rel: this.relPath(fsPath), lines: next - prev, ts: Date.now() });
          }
          this._onChange.fire();
        } catch { /* ignore */ }
      }, 800)
    );
  }

  async onFileCreated(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file') return;
    const cfg = vscode.workspace.getConfiguration('aiExposure');
    const maxBytes = (cfg.get<number>('maxFileSizeKB') ?? 2048) * 1024;
    await this.indexFile(uri, maxBytes);
    const lines = this.fileIndex.get(uri.fsPath)?.lines;
    this.persistMetrics();
    if (lines !== undefined) {
      this.pushActivity({ type: 'created', path: uri.fsPath, rel: this.relPath(uri.fsPath), lines, ts: Date.now() });
    }
    this._onChange.fire();
  }

  onFileDeleted(uri: vscode.Uri): void {
    const lines = this.fileIndex.get(uri.fsPath)?.lines;
    if (this.fileIndex.delete(uri.fsPath)) {
      this.exposed.delete(uri.fsPath);
      this.persistExposed();
      this.persistMetrics();
      this.pushActivity({ type: 'deleted', path: uri.fsPath, rel: this.relPath(uri.fsPath), lines, ts: Date.now() });
      this._onChange.fire();
    }
  }

  // ---- read-side ---------------------------------------------------------

  totalLines(): number {
    let n = 0;
    for (const e of this.fileIndex.values()) n += e.lines;
    return n;
  }

  exposedLines(): number {
    let n = 0;
    for (const p of this.exposed) {
      const e = this.fileIndex.get(p);
      if (e) n += e.lines;
    }
    return n;
  }

  exposedFileCount(): number {
    let n = 0;
    for (const p of this.exposed) if (this.fileIndex.has(p)) n++;
    return n;
  }

  sensitiveExposedCount(): number {
    let n = 0;
    for (const p of this.exposed) {
      const e = this.fileIndex.get(p);
      if (e && e.risk && e.risk.length > 0) n++;
    }
    return n;
  }

  sensitiveExposedList(limit = 50): { path: string; risk: string[] }[] {
    const out: { path: string; risk: string[] }[] = [];
    for (const p of this.exposed) {
      const e = this.fileIndex.get(p);
      if (e && e.risk && e.risk.length > 0) {
        out.push({ path: p, risk: e.risk.map((r) => r.pattern) });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  totalFileCount(): number {
    return this.fileIndex.size;
  }

  percent(): number {
    const total = this.totalLines();
    if (total === 0) return 0;
    return (this.exposedLines() / total) * 100;
  }

  breakdown(): { path: string; lines: number; exposed: boolean }[] {
    const out: { path: string; lines: number; exposed: boolean }[] = [];
    for (const [p, e] of this.fileIndex) {
      out.push({ path: p, lines: e.lines, exposed: this.exposed.has(p) });
    }
    return out.sort((a, b) => b.lines - a.lines);
  }

  currentMetrics(): ProjectMetrics | null {
    const wp = this.workspacePath;
    if (!wp) return null;
    const all = this.allProjects();
    const existing = all[wp];
    const pct = this.percent();
    const exposedLines = this.exposedLines();
    const sensitive = this.sensitiveExposedCount();
    const peak: ProjectPeak = {
      percent: Math.max(existing?.peak.percent ?? 0, pct),
      percentAt: (existing?.peak.percent ?? 0) >= pct ? (existing?.peak.percentAt ?? Date.now()) : Date.now(),
      exposedLines: Math.max(existing?.peak.exposedLines ?? 0, exposedLines),
      exposedLinesAt: (existing?.peak.exposedLines ?? 0) >= exposedLines ? (existing?.peak.exposedLinesAt ?? Date.now()) : Date.now(),
    };
    const prevSensitive = existing?.sensitivePeak?.count ?? 0;
    const sensitivePeak = {
      count: Math.max(prevSensitive, sensitive),
      at: prevSensitive >= sensitive ? (existing?.sensitivePeak?.at ?? Date.now()) : Date.now(),
    };
    return {
      workspacePath: wp,
      displayName: path.basename(wp),
      totalFiles: this.totalFileCount(),
      totalLines: this.totalLines(),
      exposedFiles: this.exposedFileCount(),
      exposedLines,
      percent: pct,
      peak,
      lastSeen: Date.now(),
      sensitiveExposedFiles: sensitive,
      sensitivePeak,
      ai: detectAi(),
    };
  }

  allProjects(): Record<string, ProjectMetrics> {
    return this.context.globalState.get<Record<string, ProjectMetrics>>(PROJECTS_KEY, {});
  }

  async resetAllPeaks(): Promise<void> {
    const all = this.allProjects();
    for (const k of Object.keys(all)) {
      const p = all[k];
      p.peak = { percent: p.percent, percentAt: Date.now(), exposedLines: p.exposedLines, exposedLinesAt: Date.now() };
    }
    await this.context.globalState.update(PROJECTS_KEY, all);
    this._onChange.fire();
  }

  async forgetProject(workspacePath: string): Promise<void> {
    const all = this.allProjects();
    if (!(workspacePath in all)) return;
    delete all[workspacePath];
    await this.context.globalState.update(PROJECTS_KEY, all);
    this._onChange.fire();
  }

  // ---- persistence -------------------------------------------------------

  private persistEnabled(): boolean {
    return vscode.workspace.getConfiguration('aiExposure').get<boolean>('persistAcrossSessions', true);
  }

  private persistExposed(): void {
    if (!this.persistEnabled()) return;
    const key = this.storageKey();
    if (!key) return;
    void this.context.globalState.update(key, [...this.exposed]);
  }

  private persistMetrics(): void {
    const m = this.currentMetrics();
    if (!m) return;
    const all = this.allProjects();
    all[m.workspacePath] = m;
    void this.context.globalState.update(PROJECTS_KEY, all);
  }
}

function countLines(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x0a) count++;
  }
  if (data[data.length - 1] === 0x0a) count--;
  return count;
}
