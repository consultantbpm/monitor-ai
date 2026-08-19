#!/usr/bin/env node
'use strict';
/**
 * AI Code Exposure Monitor — Claude Code CLI.
 *
 * Same dispatcher pattern GitKraken uses: hooks.json stays a thin wire and all
 * behaviour lives here, so the logic is testable outside a Claude session.
 *
 *   exposure hook pre     < payload.json   PreToolUse  — gate sensitive reads
 *   exposure hook post    < payload.json   PostToolUse — record what was exposed
 *   exposure report [--html <file>] [--json] [--cwd <dir>]
 *   exposure approve <file> | mark-test <file> | reset
 *
 * Contact: ConsultantBPM Human Software <consultantbpm@gmail.com>
 */

const fs = require('fs');
const path = require('path');
const core = require('../lib/core.js');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

/** Tools whose input names a file we can gate on. */
const PATH_FIELDS = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
};

/** Shell readers that pull a file into context without going through Read. */
const SHELL_READ_RE = /\b(?:cat|type|Get-Content|gc|head|tail|less|more)\b\s+(?:-\w+\s+)*["']?([^\s"'|;&]+)/i;

// ------------------------------------------------------------------ stdin ---

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parsePayload() {
  const raw = readStdin();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Resolve the file a tool call is about, or null when it is not file-shaped. */
function targetFile(payload) {
  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const cwd = payload.cwd || process.cwd();

  const field = PATH_FIELDS[tool];
  if (field && typeof input[field] === 'string') {
    return path.resolve(cwd, input[field]);
  }
  if ((tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string') {
    const m = SHELL_READ_RE.exec(input.command);
    if (m) return path.resolve(cwd, m[1]);
  }
  return null;
}

// ------------------------------------------------------------- hook output ---

function emitDecision(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

/** Any unexpected failure must let the tool call through untouched. */
function bail() {
  process.exit(0);
}

// -------------------------------------------------------------- hook: pre ---

function hookPre() {
  const payload = parsePayload();
  if (!payload) bail();

  const cfg = core.loadConfig(PLUGIN_ROOT);
  if (cfg.mode === 'off') bail();

  const file = targetFile(payload);
  if (!file) bail();

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    bail();
  }
  if (!stat.isFile()) bail();

  const projectRoot = payload.cwd || process.cwd();
  const state = core.loadState(projectRoot);
  const rel = core.relPath(projectRoot, file);

  // Files the user already vouched for never prompt again.
  if (state.approved.includes(rel) || state.testData.includes(rel)) bail();

  const risk = core.scanFile(file, cfg.maxFileSizeKB);
  const gating = core.gatingFindings(risk.findings, cfg);
  if (gating.length === 0) bail();

  const what = core.summarizeFindings(gating);
  const reason =
    `AI Code Exposure Monitor blocked this read.\n\n` +
    `File: ${rel}\n` +
    `Detected: ${what.join(', ')}\n\n` +
    `Reading it would place these values in the model's context. ` +
    `If this is a test fixture, run:  exposure mark-test "${rel}"\n` +
    `To allow it once and for all:    exposure approve "${rel}"`;

  state.blocked.push({ file: rel, at: new Date().toISOString(), findings: what });
  if (state.blocked.length > 200) state.blocked = state.blocked.slice(-200);
  try {
    core.saveState(projectRoot, state);
  } catch { /* never fail the hook over bookkeeping */ }

  if (cfg.mode === 'warn') {
    emitDecision('allow', reason);
  } else {
    emitDecision(cfg.mode === 'block' ? 'deny' : 'ask', reason);
  }
  process.exit(0);
}

// ------------------------------------------------------------- hook: post ---

function hookPost() {
  const payload = parsePayload();
  if (!payload) bail();

  const cfg = core.loadConfig(PLUGIN_ROOT);
  if (!cfg.trackExposure) bail();

  const file = targetFile(payload);
  if (!file) bail();

  const projectRoot = payload.cwd || process.cwd();
  if (core.isOutsideProject(projectRoot, file)) bail();
  if (!core.isSourceFile(file)) bail();

  try {
    const state = core.loadState(projectRoot);
    const risk = core.scanFile(file, cfg.maxFileSizeKB);
    core.recordExposure(projectRoot, state, file, cfg, risk);
    const totals = core.getTotals(projectRoot, state, cfg);
    const { percent } = core.computePercent(state, totals);
    if (percent > state.peakPercent) state.peakPercent = percent;
    core.saveState(projectRoot, state);
  } catch { /* tracking is best-effort */ }
  process.exit(0);
}

// ----------------------------------------------------------------- report ---

function buildReport(projectRoot) {
  const cfg = core.loadConfig(PLUGIN_ROOT);
  const state = core.loadState(projectRoot);
  const totals = core.getTotals(projectRoot, state, cfg);
  const { percent, exposedLines, totalLines } = core.computePercent(state, totals);
  const files = Object.entries(state.exposed)
    .map(([rel, e]) => ({ file: rel, ...e }))
    .sort((a, b) => b.lines - a.lines);
  return {
    project: path.resolve(projectRoot),
    percent, exposedLines, totalLines,
    totalFiles: totals.files,
    exposedFiles: files.length,
    peakPercent: Math.max(state.peakPercent, percent),
    files,
    blocked: state.blocked.slice(-20).reverse(),
    testData: state.testData,
    approved: state.approved,
    mode: cfg.mode,
  };
}

function reportText(r) {
  const bar = (p) => {
    const n = Math.round(p / 5);
    return `[${'#'.repeat(n)}${'.'.repeat(20 - n)}]`;
  };
  const lines = [];
  lines.push(`AI Code Exposure — ${path.basename(r.project)}`);
  lines.push('');
  lines.push(`  ${bar(r.percent)}  ${r.percent.toFixed(1)}%  (peak ${r.peakPercent.toFixed(1)}%)`);
  lines.push(`  ${r.exposedLines.toLocaleString()} of ${r.totalLines.toLocaleString()} lines seen by AI`);
  lines.push(`  ${r.exposedFiles} of ${r.totalFiles} source files`);
  lines.push(`  gate mode: ${r.mode}`);
  if (r.files.length) {
    lines.push('');
    lines.push('  Most exposed:');
    for (const f of r.files.slice(0, 10)) {
      const flag = f.risk === 'high' ? ' !' : '';
      lines.push(`    ${String(f.lines).padStart(6)}  ${f.file}${flag}`);
    }
  }
  if (r.blocked.length) {
    lines.push('');
    lines.push(`  Recently gated (${r.blocked.length}):`);
    for (const b of r.blocked.slice(0, 5)) {
      lines.push(`    ${b.file} — ${b.findings.join(', ')}`);
    }
  }
  return lines.join('\n');
}

function reportHtml(r) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
  const rows = r.files.slice(0, 50).map((f) => `
      <tr>
        <td class="f">${esc(f.file)}</td>
        <td class="n">${f.lines.toLocaleString()}</td>
        <td class="n">${f.count}</td>
        <td>${f.risk === 'high' ? '<span class="risk">sensitive</span>' : ''}</td>
      </tr>`).join('');
  const blocked = r.blocked.map((b) => `
      <tr><td class="f">${esc(b.file)}</td><td>${esc(b.findings.join(', '))}</td>
      <td class="n">${esc(b.at.replace('T', ' ').slice(0, 16))}</td></tr>`).join('');

  return `<title>AI Code Exposure Monitor &amp; Prevention</title>
<style>
  :root {
    --bg: #ffffff; --fg: #0e1116; --muted: #5b6572; --line: #e3e7ec;
    --accent: #d9534f; --track: #eef1f4; --chip: #fdecea; --chipfg: #a3211c;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e1116; --fg: #e6edf3; --muted: #8b949e; --line: #21262d;
      --accent: #f85149; --track: #1c2128; --chip: #3d1513; --chipfg: #ff9d97;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0e1116; --fg: #e6edf3; --muted: #8b949e; --line: #21262d;
    --accent: #f85149; --track: #1c2128; --chip: #3d1513; --chipfg: #ff9d97;
  }
  body { background: var(--bg); color: var(--fg); margin: 0; padding: 2rem 1.25rem;
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .sub { color: var(--muted); font-size: .9rem; margin-bottom: 1.75rem; }
  .pct { font-size: 3rem; font-weight: 700; line-height: 1; letter-spacing: -.02em; }
  .track { height: 10px; background: var(--track); border-radius: 999px; overflow: hidden; margin: .9rem 0 .5rem; }
  .fill { height: 100%; background: var(--accent); border-radius: 999px; }
  .meta { color: var(--muted); font-size: .9rem; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em;
       color: var(--muted); margin: 2.25rem 0 .6rem; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .88rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 500; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .f { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: .84rem; }
  .risk { background: var(--chip); color: var(--chipfg); padding: .1rem .45rem;
          border-radius: 4px; font-size: .75rem; }
  footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line);
           color: var(--muted); font-size: .82rem; }
  a { color: inherit; }
</style>
<div class="wrap">
  <h1>AI Code Exposure Monitor &amp; Prevention</h1>
  <div class="sub">${esc(r.project)}</div>

  <div class="pct">${r.percent.toFixed(1)}%</div>
  <div class="track"><div class="fill" style="width:${Math.min(100, r.percent).toFixed(1)}%"></div></div>
  <div class="meta">
    ${r.exposedLines.toLocaleString()} of ${r.totalLines.toLocaleString()} lines &middot;
    ${r.exposedFiles} of ${r.totalFiles} files &middot;
    peak ${r.peakPercent.toFixed(1)}% &middot; gate: ${esc(r.mode)}
  </div>

  <h2>Most exposed files</h2>
  <div class="scroll"><table>
    <tr><th>File</th><th class="n">Lines</th><th class="n">Reads</th><th></th></tr>
    ${rows || '<tr><td colspan="4" class="meta">Nothing recorded yet.</td></tr>'}
  </table></div>

  <h2>Gated reads</h2>
  <div class="scroll"><table>
    <tr><th>File</th><th>Detected</th><th class="n">When</th></tr>
    ${blocked || '<tr><td colspan="3" class="meta">No sensitive file has been gated.</td></tr>'}
  </table></div>

  <footer>
    AI Code Exposure Monitor &amp; Prevention — 100% local, nothing leaves this machine.<br>
    ConsultantBPM Human Software &middot;
    <a href="mailto:consultantbpm@gmail.com">consultantbpm@gmail.com</a> &middot;
    <a href="https://github.com/consultantbpm/monitor-ai">github.com/consultantbpm/monitor-ai</a>
  </footer>
</div>`;
}

// -------------------------------------------------------------------- main ---

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const sub = args[1];
  const cwd = argValue(args, '--cwd') || process.cwd();

  if (cmd === 'hook' && sub === 'pre') return hookPre();
  if (cmd === 'hook' && sub === 'post') return hookPost();

  if (cmd === 'report') {
    const r = buildReport(cwd);
    const htmlOut = argValue(args, '--html');
    if (htmlOut) {
      fs.writeFileSync(htmlOut, reportHtml(r), 'utf8');
      process.stdout.write(`${htmlOut}\n`);
    } else if (args.includes('--json')) {
      process.stdout.write(JSON.stringify(r, null, 2));
    } else {
      process.stdout.write(`${reportText(r)}\n`);
    }
    return;
  }

  if (cmd === 'approve' || cmd === 'mark-test') {
    const file = args[1];
    if (!file) {
      process.stderr.write(`usage: exposure ${cmd} <file>\n`);
      process.exit(1);
    }
    const state = core.loadState(cwd);
    const rel = core.relPath(cwd, path.resolve(cwd, file));
    const list = cmd === 'approve' ? state.approved : state.testData;
    if (!list.includes(rel)) list.push(rel);
    core.saveState(cwd, state);
    process.stdout.write(`${cmd}: ${rel}\n`);
    return;
  }

  if (cmd === 'reset') {
    core.saveState(cwd, core.emptyState(cwd));
    process.stdout.write(`reset: ${core.statePath(cwd)}\n`);
    return;
  }

  process.stdout.write(
    'AI Code Exposure Monitor & Prevention (Claude Code)\n\n' +
    '  exposure report [--html <file>] [--json] [--cwd <dir>]\n' +
    '  exposure approve <file>      allow a sensitive file through the gate\n' +
    '  exposure mark-test <file>    flag a file as test data\n' +
    '  exposure reset               clear this project\'s state\n\n' +
    '  contact: consultantbpm@gmail.com\n'
  );
}

try {
  main();
} catch {
  // A crashing hook must never take the session down with it.
  process.exit(0);
}
