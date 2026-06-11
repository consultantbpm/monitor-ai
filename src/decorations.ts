import * as vscode from 'vscode';
import { scanRiskMatches, RiskCategory } from './secrets';
import { ExposureTracker } from './exposureTracker';

/**
 * Live highlighting of sensitive content inside open editors. Each category
 * (secret / credential / pii) gets its own colored marker so the exact bytes an
 * AI tool could read are visible at a glance. Test-data files are skipped.
 */

const CATEGORY_STYLE: Record<RiskCategory, { rgba: string; border: string; label: string }> = {
  secret:     { rgba: 'rgba(229, 57, 53, 0.22)',  border: 'rgba(229, 57, 53, 0.9)',  label: 'SECRET' },
  credential: { rgba: 'rgba(245, 124, 0, 0.22)',  border: 'rgba(245, 124, 0, 0.9)',  label: 'CREDENTIAL' },
  pii:        { rgba: 'rgba(251, 192, 45, 0.22)', border: 'rgba(251, 192, 45, 0.9)', label: 'PII' },
};

function makeDecoration(cat: RiskCategory): vscode.TextEditorDecorationType {
  const s = CATEGORY_STYLE[cat];
  return vscode.window.createTextEditorDecorationType({
    backgroundColor: s.rgba,
    borderRadius: '2px',
    border: `1px solid ${s.border}`,
    overviewRulerColor: s.border,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
}

function highlightEnabled(): boolean {
  return vscode.workspace.getConfiguration('aiExposure').get<boolean>('highlightSensitive.enabled', true);
}

export function installSensitiveDecorations(tracker: ExposureTracker): vscode.Disposable {
  const decoTypes: Record<RiskCategory, vscode.TextEditorDecorationType> = {
    secret: makeDecoration('secret'),
    credential: makeDecoration('credential'),
    pii: makeDecoration('pii'),
  };

  const updateDebounce = new Map<string, NodeJS.Timeout>();

  function clear(editor: vscode.TextEditor): void {
    for (const cat of Object.keys(decoTypes) as RiskCategory[]) {
      editor.setDecorations(decoTypes[cat], []);
    }
  }

  function decorate(editor: vscode.TextEditor): void {
    const doc = editor.document;
    if (doc.uri.scheme !== 'file' || !highlightEnabled() || tracker.isTestData(doc.uri.fsPath)) {
      clear(editor);
      return;
    }
    const matches = scanRiskMatches(doc.getText());
    const byCat: Record<RiskCategory, vscode.DecorationOptions[]> = { secret: [], credential: [], pii: [] };
    for (const m of matches) {
      const range = new vscode.Range(doc.positionAt(m.start), doc.positionAt(m.end));
      byCat[m.category].push({
        range,
        hoverMessage: `⚠ ${CATEGORY_STYLE[m.category].label}: ${m.pattern} — visible to AI tools reading this file.`,
      });
    }
    for (const cat of Object.keys(decoTypes) as RiskCategory[]) {
      editor.setDecorations(decoTypes[cat], byCat[cat]);
    }
  }

  function scheduleDecorate(editor: vscode.TextEditor | undefined): void {
    if (!editor) return;
    const key = editor.document.uri.toString();
    const existing = updateDebounce.get(key);
    if (existing) clearTimeout(existing);
    updateDebounce.set(key, setTimeout(() => {
      updateDebounce.delete(key);
      // editor may have closed; re-resolve the visible editor for this doc
      const vis = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === key);
      if (vis) decorate(vis);
    }, 250));
  }

  function decorateAllVisible(): void {
    for (const ed of vscode.window.visibleTextEditors) decorate(ed);
  }

  // Initial pass over whatever is already open.
  decorateAllVisible();

  const subs: vscode.Disposable[] = [
    vscode.window.onDidChangeActiveTextEditor((ed) => { if (ed) decorate(ed); }),
    vscode.window.onDidChangeVisibleTextEditors(() => decorateAllVisible()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const ed = vscode.window.visibleTextEditors.find((v) => v.document === e.document);
      scheduleDecorate(ed);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiExposure.highlightSensitive.enabled')) decorateAllVisible();
    }),
    // Re-highlight when test-data flags change (a file may become un/excluded).
    tracker.onChange(() => decorateAllVisible()),
  ];

  return new vscode.Disposable(() => {
    for (const t of updateDebounce.values()) clearTimeout(t);
    updateDebounce.clear();
    for (const s of subs) s.dispose();
    for (const cat of Object.keys(decoTypes) as RiskCategory[]) decoTypes[cat].dispose();
  });
}
