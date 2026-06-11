import * as vscode from 'vscode';
import { ExposureTracker, ActivityEvent } from './exposureTracker';

export class CurrentProjectViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiExposure.current';
  private view?: vscode.WebviewView;
  private subs: vscode.Disposable[] = [];

  constructor(private readonly tracker: ExposureTracker) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    this.postState();
    this.postHistory();

    this.subs.push(this.tracker.onChange(() => this.postState()));
    this.subs.push(this.tracker.onActivity((ev) => this.postActivity(ev)));

    view.onDidDispose(() => {
      this.subs.forEach((d) => d.dispose());
      this.subs = [];
      this.view = undefined;
    });
    view.webview.onDidReceiveMessage((m) => {
      if (m?.type === 'dashboard') void vscode.commands.executeCommand('aiExposure.showDashboard');
      if (m?.type === 'rescan')    void vscode.commands.executeCommand('aiExposure.rescan');
      if (m?.type === 'reset')     void vscode.commands.executeCommand('aiExposure.resetCurrent');
    });
  }

  private postState(): void {
    if (!this.view) return;
    const m = this.tracker.currentMetrics();
    this.view.webview.postMessage({
      type: 'state',
      payload: { hasWorkspace: !!m, metrics: m, now: Date.now() },
    });
  }

  private postHistory(): void {
    if (!this.view) return;
    this.view.webview.postMessage({
      type: 'history',
      payload: { activity: this.tracker.getRecentActivity() },
    });
  }

  private postActivity(ev: ActivityEvent): void {
    if (!this.view) return;
    this.view.webview.postMessage({ type: 'activity', payload: ev });
  }

  private html(): string {
    return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: 0.9em; }
  .label { opacity: 0.7; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  .big { font-size: 2.4em; font-weight: 600; line-height: 1.1; margin: 4px 0; font-variant-numeric: tabular-nums; color: var(--vscode-foreground); }
  .num.detail { color: #f44747; }
  .ai-banner { display: flex; gap: 6px; align-items: center; padding: 6px 8px; margin: 4px 0 6px; background: rgba(244,71,71,0.08); border-left: 3px solid #f44747; border-radius: 2px; font-size: 0.78em; }
  .ai-banner.safe { background: rgba(78,201,176,0.06); border-left-color: #4ec9b0; }
  .ai-banner .ai-icon { font-size: 1.1em; }
  .ai-banner .ai-names { opacity: 0.95; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .risk-line { display: flex; gap: 6px; align-items: baseline; padding: 4px 0; }
  .risk-line .lbl { color: #f44747; font-weight: 600; font-size: 0.78em; letter-spacing: 0.5px; text-transform: uppercase; }
  .feed-row.sensitive .badge { color: #ffb86b !important; }
  .feed-row.sensitive .path::before { content: '⚠ '; color: #ffb86b; }
  .bar { height: 10px; background: var(--vscode-input-background); border-radius: 5px; overflow: hidden; margin: 4px 0 8px; position: relative; }
  .fill { height: 100%; background: linear-gradient(90deg, #4ec9b0, #c586c0); transition: width .3s ease, background .3s ease; }
  .fill.warn   { background: linear-gradient(90deg, #d97706, #e8731a); }
  .fill.danger { background: linear-gradient(90deg, #f44747, #d92020); }
  .peakMark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--vscode-foreground); opacity: 0.55; }
  .grid { display: grid; grid-template-columns: 1fr max-content; gap: 3px 8px; margin: 6px 0; }
  .num { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
  .num.bump-up   { color: #f44747; transition: color 1.2s ease; }
  .num.bump-down { color: #f44747; transition: color 1.2s ease; }
  .section { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 4px 10px; cursor: pointer; border-radius: 2px; font-size: 0.85em; margin-right: 4px; font-family: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .empty { opacity: 0.6; font-style: italic; font-size: 0.85em; }
  .peakBadge { font-size: 0.8em; opacity: 0.75; }

  .live { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border); }
  .live-head { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
  .live-head .chev { opacity: 0.6; font-size: 0.8em; width: 10px; display: inline-block; transition: transform .15s ease; }
  .live-head.collapsed .chev { transform: rotate(-90deg); }
  .live-head .title { font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.75; }
  .live-head .age { margin-left: auto; font-size: 0.75em; opacity: 0.6; font-variant-numeric: tabular-nums; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #f44747; box-shadow: 0 0 0 0 rgba(244,71,71,0.7); }
  .dot.beat { animation: beat 0.6s ease-out; }
  @keyframes beat {
    0%   { transform: scale(1);   box-shadow: 0 0 0 0 rgba(244,71,71,0.7); }
    50%  { transform: scale(1.4); box-shadow: 0 0 0 6px rgba(244,71,71,0); }
    100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(244,71,71,0); }
  }
  .live .title { color: #f44747; }
  .dot.stale { background: var(--vscode-disabledForeground); opacity: 0.5; }
  .live-body { margin-top: 6px; display: block; }
  .live-body.hidden { display: none; }
  .spark { width: 100%; height: 36px; display: block; background: var(--vscode-input-background); border-radius: 3px; }
  .feed { margin-top: 6px; max-height: 160px; overflow-y: auto; font-size: 0.78em; }
  .feed-row { display: grid; grid-template-columns: 14px 1fr max-content; gap: 6px; padding: 2px 0; align-items: baseline; border-bottom: 1px dashed transparent; }
  .feed-row.fresh { animation: flash 1.2s ease-out; }
  @keyframes flash {
    0%   { background: rgba(244,71,71,0.18); }
    100% { background: transparent; }
  }
  .feed-row .badge { font-size: 0.85em; text-align: center; opacity: 0.85; }
  .feed-row .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9; }
  .feed-row .meta { opacity: 0.55; font-variant-numeric: tabular-nums; font-size: 0.85em; }
  .b-exposed { color: #f44747; }
  .b-changed { color: #569cd6; }
  .b-created { color: #c586c0; }
  .b-deleted { color: #f44747; }
  .b-reset   { color: #d7ba7d; }
  .b-rescan  { color: #d7ba7d; }
</style></head><body>

<div id="body">
  <div class="empty">Loading…</div>
</div>

<div class="live">
  <div class="live-head" id="liveHead">
    <span class="chev" id="chev">▾</span>
    <span class="dot" id="dot"></span>
    <span class="title">Live</span>
    <span class="age" id="age">—</span>
  </div>
  <div class="live-body" id="liveBody">
    <svg class="spark" id="spark" viewBox="0 0 200 36" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stop-color="#f44747" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#f44747" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path id="sparkArea" fill="url(#sparkFill)" d=""></path>
      <path id="sparkLine" fill="none" stroke="#f44747" stroke-width="1.2" d=""></path>
    </svg>
    <div class="feed" id="feed"></div>
  </div>
</div>

<div class="section">
  <button id="dashboard">Dashboard</button>
  <button id="rescan" class="secondary">Rescan</button>
  <button id="reset" class="secondary">Reset</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  document.getElementById('dashboard').onclick = () => vscode.postMessage({ type: 'dashboard' });
  document.getElementById('rescan').onclick    = () => vscode.postMessage({ type: 'rescan' });
  document.getElementById('reset').onclick     = () => vscode.postMessage({ type: 'reset' });

  const persisted = vscode.getState() || {};
  let collapsed = !!persisted.collapsed;
  applyCollapsed();
  document.getElementById('liveHead').addEventListener('click', () => {
    collapsed = !collapsed;
    vscode.setState({ ...vscode.getState(), collapsed });
    applyCollapsed();
  });
  function applyCollapsed() {
    document.getElementById('liveBody').classList.toggle('hidden', collapsed);
    document.getElementById('liveHead').classList.toggle('collapsed', collapsed);
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

  // Rolling sparkline: one sample per second, last 60 samples.
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
    if (series.length === 0) { line.setAttribute('d', ''); area.setAttribute('d', ''); return; }
    const W = 200, H = 36;
    const maxY = Math.max(5, ...series);
    const step = W / Math.max(1, SPARK_LEN - 1);
    const offset = SPARK_LEN - series.length;
    let d = '';
    series.forEach((v, i) => {
      const x = (i + offset) * step;
      const y = H - (v / maxY) * (H - 3) - 1;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    line.setAttribute('d', d.trim());
    const first = (offset) * step;
    const last  = (SPARK_LEN - 1) * step;
    area.setAttribute('d', d.trim() + ' L' + last.toFixed(1) + ',' + H + ' L' + first.toFixed(1) + ',' + H + ' Z');
  }
  function refreshAge() {
    const ageEl = document.getElementById('age');
    const dot   = document.getElementById('dot');
    if (!lastChangeTs) { ageEl.textContent = 'no events yet'; dot.classList.add('stale'); return; }
    const s = Math.max(0, Math.floor((Date.now() - lastChangeTs) / 1000));
    ageEl.textContent = (s < 60 ? s + 's' : Math.floor(s/60) + 'm') + ' ago';
    dot.classList.toggle('stale', s > 10);
  }

  // Animated counters
  function setNum(id, next) {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = parseInt(el.dataset.value || '0', 10);
    if (prev === next) { el.textContent = fmt(next); return; }
    el.dataset.value = String(next);
    el.classList.remove('bump-up','bump-down');
    void el.offsetWidth;
    el.classList.add(next > prev ? 'bump-up' : 'bump-down');
    const start = performance.now();
    const dur = 450;
    function step(t) {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(prev + (next - prev) * eased);
      el.textContent = fmt(v);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = fmt(next);
    }
    requestAnimationFrame(step);
  }

  function renderBody(x) {
    const pct = x.percent || 0;
    const peakPct = x.peak.percent || 0;
    const ai = x.ai || { host: 'VS Code', nativeAi: false, extensions: [] };
    const aiParts = [];
    if (ai.nativeAi) aiParts.push(escapeHtml(ai.host));
    aiParts.push(...ai.extensions.map(escapeHtml));
    const aiBanner = aiParts.length > 0
      ? '<div class="ai-banner"><span class="ai-icon">🤖</span><span class="ai-names" title="' + escapeHtml(aiParts.join(', ')) + '">' + aiParts.join(', ') + '</span></div>'
      : '<div class="ai-banner safe"><span class="ai-icon">●</span><span class="ai-names">No AI assistants detected</span></div>';
    document.getElementById('body').innerHTML =
      aiBanner +
      '<div class="label">' + escapeHtml(x.displayName) + '</div>' +
      '<div class="big" id="pct">' + pct.toFixed(1) + '%</div>' +
      '<div class="bar">' +
        '<div class="fill" id="fill" style="width:' + pct.toFixed(2) + '%"></div>' +
        (peakPct > pct
          ? '<div class="peakMark" style="left:' + Math.min(99.5, peakPct).toFixed(2) + '%" title="Peak ' + peakPct.toFixed(1) + '%"></div>'
          : '') +
      '</div>' +
      '<div class="peakBadge">Peak ' + peakPct.toFixed(1) + '% &middot; ' + ageLabel(x.peak.percentAt) + '</div>' +
      '<div class="grid" style="margin-top:10px">' +
        '<span>Exposed lines</span><span class="num detail" id="el" data-value="0">0</span>' +
        '<span>Total lines</span><span class="num detail" id="tl" data-value="0">0</span>' +
        '<span>Exposed files</span><span class="num detail" id="ef" data-value="0">0</span>' +
        '<span>Total files</span><span class="num detail" id="tf" data-value="0">0</span>' +
        '<span>⚠ Sensitive exposed</span><span class="num detail" id="se" data-value="0">0</span>' +
        '<span>Peak exposed lines</span><span class="num detail" id="pl" data-value="0">0</span>' +
      '</div>';
  }

  function applyMetrics(x) {
    if (!document.getElementById('pct')) renderBody(x);
    const pct = x.percent || 0;
    const peakPct = x.peak.percent || 0;
    const pctEl = document.getElementById('pct');
    pctEl.textContent = pct.toFixed(1) + '%';
    pctEl.style.color = pctColor(pct);
    const fillEl = document.getElementById('fill');
    fillEl.style.width = pct.toFixed(2) + '%';
    fillEl.className = 'fill' + (pct > 50 ? ' danger' : pct > 25 ? ' warn' : '');
    setNum('el', x.exposedLines);
    setNum('tl', x.totalLines);
    setNum('ef', x.exposedFiles);
    setNum('tf', x.totalFiles);
    setNum('se', x.sensitiveExposedFiles || 0);
    setNum('pl', x.peak.exposedLines);
    lastPct = pct;
  }

  function pushFeedRow(ev, fresh) {
    const feed = document.getElementById('feed');
    const row = document.createElement('div');
    const sensitive = !!(ev.risk && ev.risk.length);
    row.className = 'feed-row' + (fresh ? ' fresh' : '') + (sensitive ? ' sensitive' : '');
    const badgeChar = ({
      exposed: '●', changed: '✎', created: '+', deleted: '✕', reset: '↻', rescan: '↻'
    })[ev.type] || '○';
    const label = ev.rel || ev.path || (ev.type === 'reset' ? 'session reset' : ev.type === 'rescan' ? 'workspace rescanned' : '');
    const meta = (ev.lines !== undefined && (ev.type === 'changed' ? (ev.lines >= 0 ? '+' : '') + ev.lines + ' L' : fmt(ev.lines) + ' L')) || '';
    const titleAttr = sensitive
      ? (ev.path || '') + ' — risk: ' + (ev.risk || []).join(', ')
      : (ev.path || '');
    row.innerHTML =
      '<span class="badge b-' + ev.type + '">' + badgeChar + '</span>' +
      '<span class="path" title="' + escapeHtml(titleAttr) + '">' + escapeHtml(label) + '</span>' +
      '<span class="meta">' + meta + ' &middot; ' + ageLabel(ev.ts) + '</span>';
    feed.insertBefore(row, feed.firstChild);
    while (feed.children.length > 30) feed.removeChild(feed.lastChild);
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m) return;
    if (m.type === 'state') {
      const body = document.getElementById('body');
      if (!m.payload.hasWorkspace || !m.payload.metrics) {
        body.innerHTML = '<div class="empty">No folder open. Open a folder to start monitoring.</div>';
        return;
      }
      applyMetrics(m.payload.metrics);
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
      document.getElementById('dot').classList.remove('beat');
      void document.getElementById('dot').offsetWidth;
      document.getElementById('dot').classList.add('beat');
      refreshAge();
    }
  });
</script>
</body></html>`;
  }
}
