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
  });
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
  return { current, projects, files: breakdown };
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
  .fill { height: 100%; background: linear-gradient(90deg, #4ec9b0, #c586c0); transition: width .3s ease; }
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
  tr.current td.dot { color: #4ec9b0; }
  tr.exposed td.dot { color: #f44747; }
  td.path { font-family: var(--vscode-editor-font-family); cursor: pointer; }
  td.path:hover { text-decoration: underline; }
  .filter { margin-top: 12px; }
  input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; width: 240px; }
  label { margin-right: 12px; }
  .miniBar { display: inline-block; vertical-align: middle; width: 80px; height: 8px; background: var(--vscode-input-background); border-radius: 4px; overflow: hidden; position: relative; margin-right: 6px; }
  .miniFill { height: 100%; background: linear-gradient(90deg,#4ec9b0,#c586c0); }
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
</style></head>
<body>
  <h1>AI Code Exposure Dashboard</h1>

  <div id="currentBlock">
    <div class="big" id="pct">—</div>
    <div class="bar">
      <div class="fill" id="fill" style="width:0%"></div>
      <div class="peakMark" id="peakMark" style="display:none"></div>
    </div>
    <div class="peakBadge" id="peakBadge"></div>
    <div class="grid">
      <div>Project</div><div id="projName">—</div>
      <div>Exposed lines</div><div id="el">0</div>
      <div>Total lines</div><div id="tl">0</div>
      <div>Exposed files</div><div id="ef">0</div>
      <div>Total files</div><div id="tf">0</div>
      <div>Peak %</div><div id="peakPct">0%</div>
      <div>Peak exposed lines</div><div id="peakLines">0</div>
    </div>
    <button id="rescan">Rescan workspace</button>
    <button id="reset" class="secondary">Reset session</button>
    <button id="resetPeaks" class="secondary">Reset all peaks</button>
  </div>

  <div class="live">
    <div class="live-head" id="liveHead">
      <span class="chev" id="chev">▾</span>
      <span class="dot" id="dot"></span>
      <span class="title">Live monitor</span>
      <span class="age" id="age">—</span>
    </div>
    <div class="live-body" id="liveBody">
      <div>
        <svg class="spark" id="spark" viewBox="0 0 600 90" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stop-color="#f44747" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#f44747" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path id="sparkArea" fill="url(#sparkFill)" d=""></path>
          <path id="sparkLine" fill="none" stroke="#f44747" stroke-width="1.4" d=""></path>
        </svg>
        <div class="spark-meta">
          <span>% AI exposure · last 60s (1 sample/s)</span>
          <span id="sparkRange">—</span>
        </div>
      </div>
      <div class="feed" id="feed"></div>
    </div>
  </div>

  <h2>All projects</h2>
  <div style="font-size:0.85em; opacity:0.75">Every workspace this extension has seen. Peaks are retained across restarts. ● marks the current workspace.</div>
  <table>
    <thead><tr>
      <th></th>
      <th>Project</th>
      <th>Current</th>
      <th class="num">Now %</th>
      <th class="num">Peak %</th>
      <th class="num">Exposed L</th>
      <th class="num">Total L</th>
      <th class="num">Files</th>
      <th>Last seen</th>
      <th class="action"></th>
    </tr></thead>
    <tbody id="projectRows"></tbody>
    <tfoot id="projectFoot"></tfoot>
  </table>

  <h2>Files (current project)</h2>
  <div class="filter">
    <label>Filter: <input type="text" id="q" placeholder="path substring" /></label>
    <label><input type="checkbox" id="onlyExposed" /> only exposed</label>
  </div>
  <table>
    <thead><tr><th></th><th>File</th><th class="num">Lines</th></tr></thead>
    <tbody id="fileRows"></tbody>
  </table>

<script>
  const vscode = acquireVsCodeApi();
  let state = null;

  document.getElementById('rescan').onclick     = () => vscode.postMessage({ type: 'rescan' });
  document.getElementById('reset').onclick      = () => vscode.postMessage({ type: 'reset' });
  document.getElementById('resetPeaks').onclick = () => vscode.postMessage({ type: 'resetPeaks' });
  document.getElementById('q').oninput          = renderFiles;
  document.getElementById('onlyExposed').onchange = renderFiles;

  // ----- Live monitor: collapse, sparkline, feed, heartbeat -----
  const persisted = vscode.getState() || {};
  let collapsed = !!persisted.liveCollapsed;
  applyCollapsed();
  document.getElementById('liveHead').addEventListener('click', () => {
    collapsed = !collapsed;
    vscode.setState({ ...vscode.getState(), liveCollapsed: collapsed });
    applyCollapsed();
  });
  function applyCollapsed() {
    document.getElementById('liveBody').classList.toggle('hidden', collapsed);
    document.getElementById('liveHead').classList.toggle('collapsed', collapsed);
  }

  const SPARK_LEN = 60;
  let series = [];
  let lastPct = 0;
  let lastChangeTs = 0;
  setInterval(tick, 1000);
  function tick() {
    series.push(lastPct);
    if (series.length > SPARK_LEN) series.shift();
    drawSpark();
    refreshAge();
  }
  function drawSpark() {
    const line = document.getElementById('sparkLine');
    const area = document.getElementById('sparkArea');
    const range = document.getElementById('sparkRange');
    if (series.length === 0) { line.setAttribute('d', ''); area.setAttribute('d', ''); range.textContent = '—'; return; }
    const W = 600, H = 90;
    const maxY = Math.max(5, ...series);
    const minY = Math.min(...series);
    const step = W / Math.max(1, SPARK_LEN - 1);
    const offset = SPARK_LEN - series.length;
    let d = '';
    series.forEach((v, i) => {
      const x = (i + offset) * step;
      const y = H - (v / maxY) * (H - 4) - 2;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    line.setAttribute('d', d.trim());
    const first = offset * step;
    const last  = (SPARK_LEN - 1) * step;
    area.setAttribute('d', d.trim() + ' L' + last.toFixed(1) + ',' + H + ' L' + first.toFixed(1) + ',' + H + ' Z');
    range.textContent = 'min ' + minY.toFixed(1) + '% · max ' + maxY.toFixed(1) + '%';
  }
  function refreshAge() {
    const ageEl = document.getElementById('age');
    const dot   = document.getElementById('dot');
    if (!lastChangeTs) { ageEl.textContent = 'no events yet'; dot.classList.add('stale'); return; }
    const s = Math.max(0, Math.floor((Date.now() - lastChangeTs) / 1000));
    ageEl.textContent = (s < 60 ? s + 's' : s < 3600 ? Math.floor(s/60) + 'm' : Math.floor(s/3600) + 'h') + ' ago';
    dot.classList.toggle('stale', s > 10);
  }
  function pushFeedRow(ev, fresh) {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    row.className = 'feed-row' + (fresh ? ' fresh' : '');
    const badgeChar = ({
      exposed: '●', changed: '✎', created: '+', deleted: '✕', reset: '↻', rescan: '↻'
    })[ev.type] || '○';
    const label = ev.rel || ev.path || (ev.type === 'reset' ? 'session reset' : ev.type === 'rescan' ? 'workspace rescanned' : '');
    const meta = (ev.lines !== undefined && (ev.type === 'changed' ? (ev.lines >= 0 ? '+' : '') + ev.lines + ' L' : fmt(ev.lines) + ' L')) || '';
    row.innerHTML =
      '<span class="badge b-' + ev.type + '">' + badgeChar + '</span>' +
      '<span class="path" data-path="' + escapeAttr(ev.path || '') + '" title="' + escapeAttr(ev.path || '') + '">' + escapeHtml(label) + '</span>' +
      '<span class="meta">' + meta + ' · ' + ageLabel(ev.ts) + '</span>';
    const pathEl = row.querySelector('.path');
    if (ev.path) pathEl.addEventListener('click', () => vscode.postMessage({ type: 'open', path: ev.path }));
    feed.insertBefore(row, feed.firstChild);
    while (feed.children.length > 60) feed.removeChild(feed.lastChild);
  }
  function bumpDot() {
    const dot = document.getElementById('dot');
    dot.classList.remove('beat');
    void dot.offsetWidth;
    dot.classList.add('beat');
  }
  function animateNum(el, next) {
    if (!el) return;
    const prev = parseInt(el.dataset.value || '0', 10);
    if (prev === next) { el.textContent = fmt(next); el.dataset.value = String(next); return; }
    el.dataset.value = String(next);
    el.classList.remove('bump-up','bump-down');
    void el.offsetWidth;
    el.classList.add(next > prev ? 'bump-up' : 'bump-down');
    const start = performance.now(), dur = 450;
    function step(t) {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(prev + (next - prev) * eased));
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = fmt(next);
    }
    requestAnimationFrame(step);
  }

  function fmt(n) { return (n || 0).toLocaleString(); }
  function pctColor(p) {
    if (p > 50) return '#f44747';
    if (p > 25) return '#e8731a';
    return '';
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
    if (!m) return;
    if (m.type === 'state') {
      state = m.payload;
      render();
      if (state.current) lastPct = state.current.percent || 0;
    } else if (m.type === 'history') {
      const evs = m.payload.activity || [];
      document.getElementById('feed').innerHTML = '';
      evs.slice().reverse().forEach((ev) => pushFeedRow(ev, false));
      if (evs.length) lastChangeTs = evs[evs.length - 1].ts;
      refreshAge();
    } else if (m.type === 'activity') {
      const ev = m.payload;
      pushFeedRow(ev, true);
      lastChangeTs = ev.ts;
      bumpDot();
      refreshAge();
    }
  });

  function render() {
    renderCurrent();
    renderProjects();
    renderFiles();
  }

  function renderCurrent() {
    const c = state.current;
    if (!c) {
      document.getElementById('pct').textContent = '—';
      document.getElementById('projName').textContent = 'no folder open';
      document.getElementById('fill').style.width = '0%';
      document.getElementById('peakMark').style.display = 'none';
      document.getElementById('peakBadge').textContent = '';
      return;
    }
    const pctEl = document.getElementById('pct');
    pctEl.textContent = c.percent.toFixed(1) + '%';
    pctEl.style.color = pctColor(c.percent);
    document.getElementById('fill').style.width = c.percent.toFixed(2) + '%';
    document.getElementById('projName').textContent = c.displayName + '  —  ' + c.workspacePath;
    const peakPctEl = document.getElementById('peakPct');
    peakPctEl.style.color = pctColor(c.peak.percent || 0);
    animateNum(document.getElementById('el'), c.exposedLines);
    animateNum(document.getElementById('tl'), c.totalLines);
    animateNum(document.getElementById('ef'), c.exposedFiles);
    animateNum(document.getElementById('tf'), c.totalFiles);
    document.getElementById('peakPct').textContent  = (c.peak.percent || 0).toFixed(1) + '%';
    animateNum(document.getElementById('peakLines'), c.peak.exposedLines);
    const peakMark = document.getElementById('peakMark');
    if (c.peak.percent > c.percent) {
      peakMark.style.display = 'block';
      peakMark.style.left = Math.min(99.5, c.peak.percent).toFixed(2) + '%';
      peakMark.title = 'Peak ' + c.peak.percent.toFixed(1) + '%';
    } else {
      peakMark.style.display = 'none';
    }
    document.getElementById('peakBadge').textContent =
      'Peak ' + (c.peak.percent || 0).toFixed(1) + '% — ' + ageLabel(c.peak.percentAt) + '. ' +
      'Peak exposed lines ' + fmt(c.peak.exposedLines) + ' — ' + ageLabel(c.peak.exposedLinesAt) + '.';
  }

  function renderProjects() {
    const body = document.getElementById('projectRows');
    const foot = document.getElementById('projectFoot');
    body.innerHTML = '';
    foot.innerHTML = '';
    if (!state.projects.length) {
      body.innerHTML = '<tr><td colspan="10" style="opacity:0.6; font-style:italic">No projects tracked yet.</td></tr>';
      return;
    }
    let sumExposed = 0, sumTotal = 0, sumFiles = 0;
    const curPath = state.current ? state.current.workspacePath : null;
    const frag = document.createDocumentFragment();
    for (const p of state.projects) {
      const isCurrent = curPath === p.workspacePath;
      sumExposed += p.exposedLines || 0;
      sumTotal   += p.totalLines   || 0;
      sumFiles   += p.totalFiles   || 0;
      const tr = document.createElement('tr');
      if (isCurrent) tr.className = 'current';
      const minBarPct = (p.percent || 0).toFixed(2);
      const peakPct   = (p.peak ? p.peak.percent : 0) || 0;
      const peakLeft  = Math.min(99, peakPct).toFixed(2);
      const rowColor = pctColor(p.percent || 0);
      const peakColor = pctColor(peakPct);
      tr.innerHTML =
        '<td class="dot" style="' + (rowColor ? 'color:' + rowColor : '') + '">' + (isCurrent ? '●' : '○') + '</td>' +
        '<td title="' + escapeAttr(p.workspacePath) + '">' + escapeHtml(p.displayName) + '</td>' +
        '<td>' +
          '<span class="miniBar">' +
            '<span class="miniFill" style="width:' + minBarPct + '%"></span>' +
            (peakPct > (p.percent||0) ? '<span class="miniPeak" style="left:' + peakLeft + '%" title="Peak ' + peakPct.toFixed(1) + '%"></span>' : '') +
          '</span>' +
        '</td>' +
        '<td class="num" style="' + (rowColor ? 'color:' + rowColor : '') + '">' + (p.percent || 0).toFixed(1) + '%</td>' +
        '<td class="num" style="' + (peakColor ? 'color:' + peakColor : '') + '">' + peakPct.toFixed(1) + '%</td>' +
        '<td class="num">' + fmt(p.exposedLines) + '</td>' +
        '<td class="num">' + fmt(p.totalLines) + '</td>' +
        '<td class="num">' + fmt(p.totalFiles) + '</td>' +
        '<td>' + ageLabel(p.lastSeen) + '</td>' +
        '<td class="action">' + (isCurrent ? '' : '<button class="secondary" data-path="' + escapeAttr(p.workspacePath) + '" title="Forget this project">×</button>') + '</td>';
      frag.appendChild(tr);
    }
    body.appendChild(frag);
    body.querySelectorAll('button[data-path]').forEach(b => {
      b.addEventListener('click', () => vscode.postMessage({ type: 'forget', path: b.dataset.path }));
    });
    const overall = sumTotal ? (sumExposed / sumTotal) * 100 : 0;
    foot.innerHTML =
      '<tr style="font-weight:600; border-top:2px solid var(--vscode-panel-border)">' +
        '<td></td><td>Total (' + state.projects.length + ' projects)</td>' +
        '<td></td>' +
        '<td class="num">' + overall.toFixed(1) + '%</td>' +
        '<td></td>' +
        '<td class="num">' + fmt(sumExposed) + '</td>' +
        '<td class="num">' + fmt(sumTotal) + '</td>' +
        '<td class="num">' + fmt(sumFiles) + '</td>' +
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
      const dot = document.createElement('td'); dot.className = 'dot'; dot.textContent = r.exposed ? '●' : '○';
      const path = document.createElement('td'); path.className = 'path'; path.textContent = r.rel; path.dataset.path = r.path;
      const num = document.createElement('td'); num.className = 'num'; num.textContent = r.lines.toLocaleString();
      path.addEventListener('click', () => vscode.postMessage({ type: 'open', path: r.path }));
      tr.appendChild(dot); tr.appendChild(path); tr.appendChild(num);
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }
</script>
</body></html>`;
}
