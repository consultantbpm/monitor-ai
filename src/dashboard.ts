import * as vscode from 'vscode';
import { ExposureTracker, ActivityEvent } from './exposureTracker';

let panel: vscode.WebviewPanel | undefined;

export function showDashboard(_context: vscode.ExtensionContext, tracker: ExposureTracker): void {
  if (panel) { panel.reveal(); return; }
  panel = vscode.window.createWebviewPanel(
    'aiExposure.dashboard',
    'AI Code Exposure Dashboard',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  const post = () => {
    if (!panel) return;
    panel.webview.postMessage({ type: 'state', payload: snapshot(tracker) });
  };
  const postHistory = () => {
    if (!panel) return;
    panel.webview.postMessage({ type: 'history', payload: { activity: tracker.getRecentActivity() } });
  };
  const postActivity = (ev: ActivityEvent) => {
    if (!panel) return;
    panel.webview.postMessage({ type: 'activity', payload: ev });
  };
  panel.webview.html = renderHtml();
  const subChange   = tracker.onChange(post);
  const subActivity = tracker.onActivity(postActivity);
  panel.onDidDispose(() => { panel = undefined; subChange.dispose(); subActivity.dispose(); });
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === 'rescan')        await vscode.commands.executeCommand('aiExposure.rescan');
    if (msg?.type === 'reset')         await vscode.commands.executeCommand('aiExposure.resetCurrent');
    if (msg?.type === 'resetPeaks')    await vscode.commands.executeCommand('aiExposure.resetPeaks');
    if (msg?.type === 'forget' && typeof msg.path === 'string') {
      await tracker.forgetProject(msg.path);
    }
    if (msg?.type === 'open' && typeof msg.path === 'string') {
      void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
    }
    if (msg?.type === 'openSensitive' && typeof msg.path === 'string') {
      await vscode.commands.executeCommand('aiExposure.openSensitive', msg.path);
    }
    if (msg?.type === 'togglePsde')      await vscode.commands.executeCommand('aiExposure.toggleProactiveProtection');
    if (msg?.type === 'reviewSensitive') await vscode.commands.executeCommand('aiExposure.reviewSensitive');
    if (msg?.type === 'reviewCategory' && (msg.category === 'secret' || msg.category === 'credential' || msg.category === 'pii')) {
      await vscode.commands.executeCommand('aiExposure.reviewSensitiveByCategory', msg.category);
    }
  });
  const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('aiExposure.proactiveProtection')) post();
  });
  panel.onDidDispose(() => cfgSub.dispose());
  post();
  postHistory();
}

function snapshot(tracker: ExposureTracker) {
  const current = tracker.currentMetrics();
  const all = tracker.allProjects();
  const projects = Object.values(all).sort((a, b) => (b.percent || 0) - (a.percent || 0));
  const breakdown = tracker.breakdown().slice(0, 1000).map((f) => {
    const root = current?.workspacePath ?? '';
    return {
      path: f.path,
      rel: root && f.path.startsWith(root) ? f.path.slice(root.length + 1) : f.path,
      lines: f.lines,
      exposed: f.exposed,
    };
  });
  const sensitive = tracker.sensitiveExposedList(50).map((s) => {
    const root = current?.workspacePath ?? '';
    return {
      path: s.path,
      rel: root && s.path.startsWith(root) ? s.path.slice(root.length + 1) : s.path,
      risk: s.risk,
    };
  });
  const psdeOn = !!vscode.workspace.getConfiguration('aiExposure').get<boolean>('proactiveProtection.enabled', false);
  const protectedCount = tracker.sensitiveFilesAll().length;
  return { current, projects, files: breakdown, sensitive, psdeOn, protectedCount };
}

function renderHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
  h1 { font-size: 1.2em; margin: 0 0 8px; }
  h2 { font-size: 1em; margin: 24px 0 8px; opacity: 0.85; }
  .big { font-size: 3em; font-weight: 600; line-height: 1.1; }
  .bar { height: 18px; background: var(--vscode-input-background); border-radius: 9px; overflow: hidden; margin: 8px 0 6px; position: relative; }
  .fill { height: 100%; background: linear-gradient(90deg, #4ec9b0, #c586c0); transition: width .3s ease, background .3s ease; }
  .fill.warn   { background: linear-gradient(90deg, #d97706, #e8731a); }
  .fill.danger { background: linear-gradient(90deg, #f44747, #d92020); }
  .peakMark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--vscode-foreground); opacity: 0.6; }
  .peakBadge { font-size: 0.85em; opacity: 0.75; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: max-content max-content; gap: 4px 24px; margin-bottom: 16px; }
  .grid div:nth-child(odd) { opacity: 0.7; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 6px 12px; margin-right: 8px; cursor: pointer; border-radius: 2px; font-family: inherit; font-size: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.9em; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.action { width: 32px; text-align: center; }
  td.dot { width: 16px; color: var(--vscode-disabledForeground); }
  tr.current { font-weight: 600; }
  tr.exposed td.dot { /* color set via inline style by pctColor */ }
  td.dot { font-size: 1.1em; }
  td.path { font-family: var(--vscode-editor-font-family); cursor: pointer; }
  td.path:hover { text-decoration: underline; }
  tr.exposed td.path { color: #f44747; font-weight: 600; }
  .filter { margin-top: 12px; }
  input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; width: 240px; }
  label { margin-right: 12px; }
  .miniBar { display: inline-block; vertical-align: middle; width: 80px; height: 8px; background: var(--vscode-input-background); border-radius: 4px; overflow: hidden; position: relative; margin-right: 6px; }
  .miniFill { height: 100%; background: linear-gradient(90deg,#4ec9b0,#c586c0); transition: background .3s ease; }
  .miniFill.warn   { background: linear-gradient(90deg, #d97706, #e8731a); }
  .miniFill.danger { background: linear-gradient(90deg, #f44747, #d92020); }
  .miniPeak { position: absolute; top: -1px; bottom: -1px; width: 2px; background: var(--vscode-foreground); opacity: 0.6; }

  .live { margin: 18px 0 6px; padding: 10px 14px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); }
  .live-head { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
  .live-head .chev { opacity: 0.6; width: 12px; display: inline-block; transition: transform .15s ease; font-size: 0.85em; }
  .live-head.collapsed .chev { transform: rotate(-90deg); }
  .live-head .title { font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.78; }
  .live-head .age   { margin-left: auto; font-size: 0.78em; opacity: 0.6; font-variant-numeric: tabular-nums; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #f44747; box-shadow: 0 0 0 0 rgba(244,71,71,0.7); }
  .dot.beat { animation: beat 0.6s ease-out; }
  @keyframes beat {
    0%   { transform: scale(1);   box-shadow: 0 0 0 0 rgba(244,71,71,0.7); }
    50%  { transform: scale(1.4); box-shadow: 0 0 0 7px rgba(244,71,71,0); }
    100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(244,71,71,0); }
  }
  .dot.stale { background: var(--vscode-disabledForeground); opacity: 0.55; }
  .live { border-color: #f44747 !important; }
  .live-head .title { color: #f44747; }
  .live-body { display: grid; grid-template-columns: 1fr 280px; gap: 14px; margin-top: 10px; }
  .live-body.hidden { display: none; }
  .spark { width: 100%; height: 90px; display: block; background: var(--vscode-input-background); border-radius: 4px; }
  .spark-meta { display: flex; justify-content: space-between; font-size: 0.75em; opacity: 0.6; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .feed { max-height: 200px; overflow-y: auto; font-size: 0.85em; }
  .feed-row { display: grid; grid-template-columns: 16px 1fr max-content; gap: 8px; padding: 3px 4px; align-items: baseline; border-radius: 3px; }
  .feed-row.fresh { animation: flash 1.4s ease-out; }
  @keyframes flash {
    0%   { background: rgba(244,71,71,0.22); }
    100% { background: transparent; }
  }
  .feed-row .badge { text-align: center; opacity: 0.9; }
  .feed-row .path  { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.92; cursor: pointer; }
  .feed-row .path:hover { text-decoration: underline; }
  .feed-row .meta  { opacity: 0.55; font-variant-numeric: tabular-nums; font-size: 0.9em; }
  .b-exposed { color: #f44747; }
  .b-changed { color: #569cd6; }
  .b-created { color: #c586c0; }
  .b-deleted { color: #f44747; }
  .b-reset   { color: #d7ba7d; }
  .b-rescan  { color: #d7ba7d; }
  .bump-up   { color: #f44747; transition: color 1.2s ease; }
  .bump-down { color: #f44747; transition: color 1.2s ease; }
  /* All detail values red */
  .grid div:nth-child(even) { color: #f44747; font-weight: 600; }
  .big { color: var(--vscode-foreground); }

  .ai-banner { display: flex; gap: 10px; align-items: center; padding: 10px 14px; margin: 6px 0 14px; background: rgba(244,71,71,0.10); border-left: 4px solid #f44747; border-radius: 4px; }
  .ai-banner.safe { background: rgba(78,201,176,0.08); border-left-color: #4ec9b0; }
  .ai-banner .ai-icon { font-size: 1.3em; }
  .ai-banner .ai-host { opacity: 0.7; font-size: 0.85em; margin-right: 8px; }
  .ai-banner .ai-names { font-weight: 600; }
  .ai-banner .ai-line { display: flex; flex-direction: column; flex: 1; }
  .ai-banner .ai-explain { font-size: 0.82em; opacity: 0.85; margin-top: 2px; }
  .feed-row.sensitive .badge { color: #ffb86b !important; }
  .feed-row.sensitive .path::before { content: '⚠ '; color: #ffb86b; }
  .feed-row.sensitive { background: rgba(255, 184, 107, 0.06); }
  .sensitive-block { margin-top: 18px; padding: 10px 14px; border: 1px solid #ffb86b; border-radius: 4px; background: rgba(255,184,107,0.05); }
  .sensitive-block h3 { margin: 0 0 8px; font-size: 0.9em; color: #ffb86b; letter-spacing: 1px; text-transform: uppercase; }
  .sensitive-list { font-size: 0.85em; }
  .sensitive-list .row { display: grid; grid-template-columns: 1fr max-content; gap: 8px; padding: 3px 0; border-bottom: 1px dashed var(--vscode-panel-border); }
  .sensitive-list .row:last-child { border-bottom: 0; }
  .sensitive-list .risk { color: #ffb86b; font-variant-numeric: tabular-nums; }

  .sen-group { margin: 10px 0; border: 1px solid var(--vscode-panel-border); border-radius: 6px; overflow: hidden; }
  .sen-group-head { padding: 6px 12px; background: var(--vscode-input-background); font-weight: 600; font-size: 0.9em; display: flex; gap: 8px; align-items: baseline; }
  .sen-group-head .cnt { opacity: 0.6; font-weight: 400; font-size: 0.9em; }
  .sen-group-head .cur { margin-left: auto; font-size: 0.75em; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.06em; }
  .sen-row { display: grid; grid-template-columns: 1fr max-content max-content; gap: 10px; align-items: center; padding: 5px 12px; border-top: 1px solid var(--vscode-panel-border); font-size: 0.88em; }
  .sen-path { font-family: var(--vscode-editor-font-family); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f44747; font-weight: 600; }
  .sen-path:hover { text-decoration: underline; }
  .sen-badges { display: flex; gap: 4px; }
  .sen-badge { font-size: 0.72em; padding: 1px 6px; border-radius: 3px; font-weight: 700; letter-spacing: 0.04em; }
  .sen-badge.secret     { background: rgba(229,57,53,0.18);  color: #e57373; }
  .sen-badge.credential { background: rgba(245,124,0,0.18);  color: #ffb74d; }
  .sen-badge.pii        { background: rgba(251,192,45,0.18); color: #fdd835; }
  .sen-open { padding: 2px 10px; margin: 0; }
</style></head>
<body>
  <h1>AI Code Exposure Dashboard</h1>
  <div style="font-size:0.9em; opacity:0.8; margin: 0 0 14px">Current project details, sparkline, and sensitive files are in the <b>AI Code Exposure</b> sidebar (eye icon in the activity bar).</div>

  <h2>All projects</h2>
  <div style="font-size:0.85em; opacity:0.75">Every workspace this extension has seen. Peaks are retained across restarts. ● marks the current workspace. Sorted by current exposure %.</div>
  <div style="margin: 8px 0; display: flex; gap: 8px; align-items: center;">
    <button id="resetPeaks" class="secondary">Reset all peaks</button>
  </div>
  <table>
    <thead><tr>
      <th>Project</th>
      <th class="num">Now %</th>
      <th class="num">Peak %</th>
      <th class="num">Exposed L</th>
      <th class="num">Total L</th>
      <th class="num" title="Files opened (exposed to AI) in this project">Exposed F</th>
      <th class="num">Files</th>
      <th class="num" title="Files exposed containing API keys, private keys, tokens, DB URLs">Secrets</th>
      <th class="num" title="Files exposed containing hardcoded passwords/usernames/auth headers">Pass</th>
      <th class="num" title="Files exposed containing emails, SSN, credit cards, phone, IBAN, DOB">PII</th>
      <th>Last seen</th>
      <th class="action"></th>
    </tr></thead>
    <tbody id="projectRows"></tbody>
    <tfoot id="projectFoot"></tfoot>
  </table>

  <h2>🛡 PSDE — Proactive Sensitive Data Exposure</h2>
  <div style="font-size:0.85em; opacity:0.75">Files containing secrets, credentials, or PII that AI tools could read once opened. Click a file (or <b>Open</b>) to inspect it — sensitive values are highlighted inline. Grouped by project.</div>
  <div style="margin: 8px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
    <button id="psde" class="secondary" title="Proactive Sensitive Data Exposure — prescan + block + review">🛡 PSDE</button>
    <button id="review" class="secondary" title="Review all sensitive files (current project)">Review sensitive</button>
    <span id="psdeStatus" style="font-size:0.85em; opacity:0.75"></span>
  </div>
  <div id="sensitiveGroups"></div>

  <h2>Files (current project)</h2>
  <div class="filter">
    <label>Filter: <input type="text" id="q" placeholder="path substring" /></label>
    <label><input type="checkbox" id="onlyExposed" /> only exposed</label>
  </div>
  <table>
    <thead><tr><th>File</th><th class="num">Lines</th></tr></thead>
    <tbody id="fileRows"></tbody>
  </table>

<script>
  const vscode = acquireVsCodeApi();
  let state = null;

  document.getElementById('resetPeaks').onclick = () => vscode.postMessage({ type: 'resetPeaks' });
  document.getElementById('psde').onclick       = () => vscode.postMessage({ type: 'togglePsde' });
  document.getElementById('review').onclick     = () => vscode.postMessage({ type: 'reviewSensitive' });
  function setPsdeButton(on, protectedCount) {
    const b = document.getElementById('psde');
    const s = document.getElementById('psdeStatus');
    if (!b) return;
    b.style.background = on ? '#4ec9b0' : '';
    b.style.color = on ? '#000' : '';
    b.style.fontWeight = on ? '700' : '';
    b.textContent = '🛡 PSDE: ' + (on ? 'ON (' + (protectedCount || 0) + ')' : 'OFF');
    if (s) s.textContent = on ? '· protecting ' + protectedCount + ' file(s) — AI is blocked from silently seeing them' : '';
  }
  document.getElementById('q').oninput          = renderFiles;
  document.getElementById('onlyExposed').onchange = renderFiles;

  function fmt(n) { return (n || 0).toLocaleString(); }
  function pctColor(p) {
    if (p >= 50) return '#f44747';
    if (p >= 25) return '#e8731a';
    return '#000';
  }
  function ageLabel(ms) {
    if (!ms) return '—';
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.type !== 'state') return;
    state = m.payload;
    setPsdeButton(!!state.psdeOn, state.protectedCount);
    render();
  });

  function render() {
    renderProjects();
    renderSensitive();
    renderFiles();
  }

  function renderSensitive() {
    const host = document.getElementById('sensitiveGroups');
    host.innerHTML = '';
    const projs = (state.projects || []).filter(p => (p.sensitiveFiles || []).length > 0);
    if (!projs.length) {
      host.innerHTML = '<div style="opacity:0.6; font-style:italic; padding:6px 0">No sensitive files detected in any tracked project.</div>';
      return;
    }
    const curPath = state.current ? state.current.workspacePath : null;
    const catLabel = (c) => c === 'credential' ? 'PASS' : c.toUpperCase();
    const frag = document.createDocumentFragment();
    for (const p of projs) {
      const sec = document.createElement('div'); sec.className = 'sen-group';
      const head = document.createElement('div'); head.className = 'sen-group-head';
      const nm = document.createElement('span'); nm.textContent = p.displayName;
      const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = p.sensitiveFiles.length + ' file(s)';
      head.appendChild(nm); head.appendChild(cnt);
      if (curPath === p.workspacePath) { const cur = document.createElement('span'); cur.className = 'cur'; cur.textContent = 'current'; head.appendChild(cur); }
      sec.appendChild(head);
      for (const f of p.sensitiveFiles) {
        const row = document.createElement('div'); row.className = 'sen-row';
        const name = document.createElement('span'); name.className = 'sen-path';
        name.textContent = f.rel; name.title = f.path + '\\n' + (f.risk || []).join(', ');
        name.addEventListener('click', () => vscode.postMessage({ type: 'openSensitive', path: f.path }));
        const badges = document.createElement('span'); badges.className = 'sen-badges';
        (f.cats || []).forEach(c => { const b = document.createElement('span'); b.className = 'sen-badge ' + c; b.textContent = catLabel(c); badges.appendChild(b); });
        const open = document.createElement('button'); open.className = 'secondary sen-open'; open.textContent = 'Open'; open.title = 'Open & highlight sensitive values';
        open.addEventListener('click', () => vscode.postMessage({ type: 'openSensitive', path: f.path }));
        row.appendChild(name); row.appendChild(badges); row.appendChild(open);
        sec.appendChild(row);
      }
      frag.appendChild(sec);
    }
    host.appendChild(frag);
  }

  function renderProjects() {
    const body = document.getElementById('projectRows');
    const foot = document.getElementById('projectFoot');
    body.innerHTML = '';
    foot.innerHTML = '';
    if (!state.projects.length) {
      body.innerHTML = '<tr><td colspan="12" style="opacity:0.6; font-style:italic">No projects tracked yet.</td></tr>';
      return;
    }
    let sumExposed = 0, sumTotal = 0, sumFiles = 0, sumExposedFiles = 0;
    let sumSec = 0, sumCred = 0, sumPii = 0;
    const curPath = state.current ? state.current.workspacePath : null;
    const frag = document.createDocumentFragment();
    for (const p of state.projects) {
      const isCurrent = curPath === p.workspacePath;
      sumExposed += p.exposedLines || 0;
      sumTotal   += p.totalLines   || 0;
      sumFiles   += p.totalFiles   || 0;
      sumExposedFiles += p.exposedFiles || 0;
      const cat = p.sensitiveByCategory || { secret: 0, credential: 0, pii: 0 };
      sumSec  += cat.secret     || 0;
      sumCred += cat.credential || 0;
      sumPii  += cat.pii        || 0;
      const tr = document.createElement('tr');
      tr.className = isCurrent ? 'current' : '';
      const minBarPct = (p.percent || 0).toFixed(2);
      const peakPct   = (p.peak ? p.peak.percent : 0) || 0;
      const peakLeft  = Math.min(99, peakPct).toFixed(2);
      const rowColor = pctColor(p.percent || 0);
      const peakColor = pctColor(peakPct);
      const miniClass = ((p.percent || 0) > 50) ? ' danger' : ((p.percent || 0) > 25) ? ' warn' : '';
      const senCss = (n) => n > 0 ? 'color:#f44747; font-weight:700; cursor:pointer; text-decoration:underline dotted' : 'opacity:0.4';
      const senAttr = (catName, n) => isCurrent && n > 0 ? ' data-cat="' + catName + '" title="Click to review ' + catName + ' files"' : '';
      tr.innerHTML =
        '<td style="' + (rowColor ? 'color:' + rowColor : '') + '" title="' + escapeAttr(p.workspacePath) + '">' + escapeHtml(p.displayName) + '</td>' +
        '<td class="num" style="' + (rowColor ? 'color:' + rowColor : '') + '">' + (p.percent || 0).toFixed(1) + '%</td>' +
        '<td class="num" style="' + (peakColor ? 'color:' + peakColor : '') + '">' + peakPct.toFixed(1) + '%</td>' +
        '<td class="num" style="' + (rowColor ? 'color:' + rowColor : '') + '">' + fmt(p.exposedLines) + '</td>' +
        '<td class="num">' + fmt(p.totalLines) + '</td>' +
        '<td class="num" style="' + (rowColor ? 'color:' + rowColor : '') + '">' + fmt(p.exposedFiles) + '</td>' +
        '<td class="num">' + fmt(p.totalFiles) + '</td>' +
        '<td class="num" style="' + senCss(cat.secret)     + '"' + senAttr('secret', cat.secret)         + '>' + (cat.secret     || 0) + '</td>' +
        '<td class="num" style="' + senCss(cat.credential) + '"' + senAttr('credential', cat.credential) + '>' + (cat.credential || 0) + '</td>' +
        '<td class="num" style="' + senCss(cat.pii)        + '"' + senAttr('pii', cat.pii)               + '>' + (cat.pii        || 0) + '</td>' +
        '<td>' + ageLabel(p.lastSeen) + '</td>' +
        '<td class="action">' + (isCurrent ? '' : '<button class="secondary" data-path="' + escapeAttr(p.workspacePath) + '" title="Forget this project">×</button>') + '</td>';
      frag.appendChild(tr);
    }
    body.appendChild(frag);
    body.querySelectorAll('button[data-path]').forEach(b => {
      b.addEventListener('click', () => vscode.postMessage({ type: 'forget', path: b.dataset.path }));
    });
    body.querySelectorAll('td[data-cat]').forEach((c) => {
      c.addEventListener('click', () => vscode.postMessage({ type: 'reviewCategory', category: c.dataset.cat }));
    });
    const overall = sumTotal ? (sumExposed / sumTotal) * 100 : 0;
    foot.innerHTML =
      '<tr style="font-weight:600; border-top:2px solid var(--vscode-panel-border)">' +
        '<td>Total (' + state.projects.length + ' projects)</td>' +
        '<td class="num" style="' + (pctColor(overall) ? 'color:' + pctColor(overall) : '') + '">' + overall.toFixed(1) + '%</td>' +
        '<td></td>' +
        '<td class="num" style="' + (pctColor(overall) ? 'color:' + pctColor(overall) : '') + '">' + fmt(sumExposed) + '</td>' +
        '<td class="num">' + fmt(sumTotal) + '</td>' +
        '<td class="num" style="' + (pctColor(overall) ? 'color:' + pctColor(overall) : '') + '">' + fmt(sumExposedFiles) + '</td>' +
        '<td class="num">' + fmt(sumFiles) + '</td>' +
        '<td class="num">' + sumSec + '</td>' +
        '<td class="num">' + sumCred + '</td>' +
        '<td class="num">' + sumPii + '</td>' +
        '<td></td><td></td>' +
      '</tr>';
  }

  function renderFiles() {
    if (!state) return;
    const q = document.getElementById('q').value.toLowerCase();
    const only = document.getElementById('onlyExposed').checked;
    const tbody = document.getElementById('fileRows');
    tbody.innerHTML = '';
    let rows = state.files;
    if (only) rows = rows.filter(r => r.exposed);
    if (q)    rows = rows.filter(r => r.rel.toLowerCase().indexOf(q) >= 0);
    const frag = document.createDocumentFragment();
    rows.slice(0, 500).forEach(r => {
      const tr = document.createElement('tr');
      if (r.exposed) tr.className = 'exposed';
      const path = document.createElement('td'); path.className = 'path'; path.textContent = r.rel; path.dataset.path = r.path;
      const num = document.createElement('td'); num.className = 'num'; num.textContent = r.lines.toLocaleString();
      path.addEventListener('click', () => vscode.postMessage({ type: 'open', path: r.path }));
      tr.appendChild(path); tr.appendChild(num);
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }
</script>
</body></html>`;
}
