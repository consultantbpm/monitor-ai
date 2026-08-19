'use strict';
/**
 * Shared core for the Claude Code port of AI Code Exposure Monitor.
 *
 * Detection logic is NOT duplicated here: `./secrets.js` is compiled straight
 * from `src/secrets.ts`, the same file the VS Code extension uses, so the two
 * products can never drift apart on what counts as a secret.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { scanRiskByPath, scanRiskByContent, combineRisk } = require('./secrets.js');

const STATE_DIR = path.join(os.homedir(), '.claude', 'ai-exposure');
const TOTALS_TTL_MS = 10 * 60 * 1000; // re-walk the workspace at most every 10 min
const MAX_READ_BYTES = 256 * 1024;    // mirrors MAX_CONTENT_SCAN_BYTES in secrets.ts

/** Mirrors aiExposure.includeGlobs from the extension's package.json. */
const SOURCE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs',
  '.rb', '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
  '.scala', '.vue', '.svelte', '.html', '.css', '.scss', '.less', '.sh',
  '.ps1', '.sql',
]);

/** Mirrors aiExposure.excludeGlobs. */
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.venv', '__pycache__',
  '.next', 'target', '.gradle', '.idea', 'coverage', '.vscode-test',
]);

const DEFAULT_CONFIG = {
  /** 'block' = deny outright | 'ask' = prompt the user | 'warn' = allow, record only | 'off' */
  mode: 'ask',
  maxFileSizeKB: 2048,
  /** Categories that trigger the gate. PII alone is noisy in test fixtures. */
  gateOn: ['secret', 'credential'],
  trackExposure: true,
};

// ---------------------------------------------------------------- config ---

function loadConfig(pluginRoot) {
  const cfg = Object.assign({}, DEFAULT_CONFIG);
  const candidates = [
    pluginRoot ? path.join(pluginRoot, 'config.json') : null,
    path.join(STATE_DIR, 'config.json'),
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      Object.assign(cfg, JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch { /* missing or malformed config must never break a hook */ }
  }
  return cfg;
}

// ----------------------------------------------------------------- state ---

function projectKey(projectRoot) {
  const norm = path.resolve(projectRoot).toLowerCase();
  const hash = crypto.createHash('sha1').update(norm).digest('hex').slice(0, 12);
  const label = path.basename(norm).replace(/[^a-z0-9._-]/gi, '_').slice(0, 40);
  return `${label}-${hash}`;
}

function statePath(projectRoot) {
  return path.join(STATE_DIR, `${projectKey(projectRoot)}.json`);
}

function emptyState(projectRoot) {
  return {
    version: 1,
    project: path.resolve(projectRoot),
    createdAt: new Date().toISOString(),
    updatedAt: null,
    exposed: {},      // relPath -> { lines, count, first, last, risk }
    totals: null,     // { files, lines, at }
    peakPercent: 0,
    testData: [],     // relPaths the user marked as fixtures
    approved: [],     // relPaths the user consciously let through
    blocked: [],      // { file, at, findings }
  };
}

function loadState(projectRoot) {
  try {
    const raw = fs.readFileSync(statePath(projectRoot), 'utf8');
    const st = JSON.parse(raw);
    return Object.assign(emptyState(projectRoot), st);
  } catch {
    return emptyState(projectRoot);
  }
}

function saveState(projectRoot, state) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const target = statePath(projectRoot);
  // Write-then-rename so a killed process can never leave a truncated state file.
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

// ------------------------------------------------------------- filesystem ---

function isSourceFile(fsPath) {
  return SOURCE_EXTS.has(path.extname(fsPath).toLowerCase());
}

function relPath(projectRoot, fsPath) {
  const rel = path.relative(projectRoot, fsPath);
  return rel.split(path.sep).join('/');
}

/** True when the path escapes the project root — those are never counted. */
function isOutsideProject(projectRoot, fsPath) {
  const rel = path.relative(projectRoot, fsPath);
  return rel.startsWith('..') || path.isAbsolute(rel);
}

function countLines(fsPath, maxBytes) {
  try {
    const stat = fs.statSync(fsPath);
    if (stat.size > maxBytes) return 0;
    const text = fs.readFileSync(fsPath, 'utf8');
    if (text.length === 0) return 0;
    let n = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
  } catch {
    return 0;
  }
}

function walkTotals(projectRoot, maxFileSizeKB) {
  let files = 0;
  let lines = 0;
  const maxBytes = maxFileSizeKB * 1024;
  const stack = [projectRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!EXCLUDED_DIRS.has(e.name)) stack.push(full);
      } else if (e.isFile() && isSourceFile(full)) {
        files++;
        lines += countLines(full, maxBytes);
      }
    }
  }
  return { files, lines, at: Date.now() };
}

function getTotals(projectRoot, state, cfg) {
  const cached = state.totals;
  if (cached && Date.now() - cached.at < TOTALS_TTL_MS) return cached;
  state.totals = walkTotals(projectRoot, cfg.maxFileSizeKB);
  return state.totals;
}

// ---------------------------------------------------------------- scanning ---

/**
 * Scan a single file by path and content.
 * @returns {{ level: 'safe'|'high', findings: Array<{pattern:string,source:string,category:string}> }}
 */
function scanFile(fsPath, maxFileSizeKB) {
  const findings = scanRiskByPath(fsPath);
  try {
    const stat = fs.statSync(fsPath);
    if (stat.isFile() && stat.size <= maxFileSizeKB * 1024) {
      const fd = fs.openSync(fsPath, 'r');
      try {
        const len = Math.min(stat.size, MAX_READ_BYTES);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, 0);
        findings.push(...scanRiskByContent(new Uint8Array(buf)));
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch { /* unreadable file: fall back to path-only findings */ }
  return combineRisk(findings);
}

/** Findings reduced to the categories the gate acts on. */
function gatingFindings(findings, cfg) {
  const gate = new Set(cfg.gateOn || []);
  return findings.filter((f) => gate.has(f.category));
}

function summarizeFindings(findings) {
  const seen = new Map();
  for (const f of findings) {
    const key = `${f.category}:${f.pattern}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.keys()].map((k) => {
    const [cat, pat] = k.split(/:(.+)/);
    return `${pat} (${cat})`;
  });
}

// --------------------------------------------------------------- exposure ---

function recordExposure(projectRoot, state, fsPath, cfg, risk) {
  if (!cfg.trackExposure) return;
  if (!isSourceFile(fsPath) || isOutsideProject(projectRoot, fsPath)) return;
  const rel = relPath(projectRoot, fsPath);
  const now = new Date().toISOString();
  const prev = state.exposed[rel];
  state.exposed[rel] = {
    lines: countLines(fsPath, cfg.maxFileSizeKB * 1024),
    count: prev ? prev.count + 1 : 1,
    first: prev ? prev.first : now,
    last: now,
    risk: risk ? risk.level : 'safe',
  };
}

function computePercent(state, totals) {
  const exposedLines = Object.values(state.exposed)
    .reduce((sum, e) => sum + (e.lines || 0), 0);
  if (!totals || !totals.lines) return { percent: 0, exposedLines, totalLines: 0 };
  const percent = Math.min(100, (exposedLines / totals.lines) * 100);
  return { percent, exposedLines, totalLines: totals.lines };
}

module.exports = {
  DEFAULT_CONFIG,
  STATE_DIR,
  loadConfig,
  projectKey,
  statePath,
  loadState,
  saveState,
  emptyState,
  isSourceFile,
  isOutsideProject,
  relPath,
  countLines,
  getTotals,
  walkTotals,
  scanFile,
  gatingFindings,
  summarizeFindings,
  recordExposure,
  computePercent,
};
