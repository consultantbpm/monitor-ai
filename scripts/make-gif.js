// One-off: build media/demo.gif from frame-templated SVG using sharp + gifenc.
// v0.6 — shows: % climb, sparkline, AI banner, sensitive file detection, inline
//        highlight of the leaked values + modal popup at peak.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const W = 900, H = 320, FRAMES = 30, DELAY_MS = 220;
const OUT = path.join(__dirname, '..', 'media', 'demo.gif');

const startPct = 0;
const endPct   = 79.2;

// Event timeline: which frame revealing what (idx, type, rel, meta, cats)
const TIMELINE = [
  { frame: 2,  type: 'rescan',  label: 'workspace rescanned',          meta: '11,287 L' },
  { frame: 4,  type: 'exposed', label: 'package.json',                 meta: '98 L' },
  { frame: 6,  type: 'exposed', label: 'src/extension.ts',             meta: '126 L' },
  { frame: 8,  type: 'exposed', label: 'src/exposureTracker.ts',       meta: '264 L' },
  { frame: 10, type: 'changed', label: 'src/dashboard.ts',             meta: '+12 L' },
  { frame: 13, type: 'exposed', label: 'src/currentProjectView.ts',    meta: '218 L' },
  { frame: 16, type: 'exposed', label: '⚠ .env',                       meta: '.env file', sensitive: true, cats: ['credential'] },
  { frame: 19, type: 'exposed', label: 'README.md',                    meta: '85 L' },
  { frame: 22, type: 'exposed', label: '⚠ config/credentials.json',    meta: 'AWS key', sensitive: true, cats: ['secret', 'credential'] },
  { frame: 25, type: 'exposed', label: 'src/statusBar.ts',             meta: '30 L' },
];

// Modal popup appears between frames 23-27
const POPUP_FROM = 23, POPUP_TO = 28;

const badgeChar  = { exposed: '●', changed: '✎', created: '+', deleted: '✕', reset: '↻', rescan: '↻' };
const badgeColor = { exposed: '#f44747', changed: '#569cd6', created: '#c586c0', deleted: '#f44747', reset: '#d7ba7d', rescan: '#d7ba7d' };

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function pctColor(p) {
  if (p > 50) return '#f44747';
  if (p > 25) return '#e8731a';
  return '#cccccc';
}
function fillColor(p) {
  if (p > 50) return 'url(#fillDanger)';
  if (p > 25) return 'url(#fillWarn)';
  return 'url(#fillTeal)';
}

function svgFrame(i) {
  const t = i / (FRAMES - 1);
  const pct = startPct + (endPct - startPct) * easeOutCubic(t);
  const sparkW = 480, sparkH = 56;
  const step = sparkW / Math.max(1, FRAMES + 1);
  const samples = Math.max(2, Math.floor(2 + (FRAMES - 2) * t));
  let path = '';
  for (let k = 0; k < samples; k++) {
    const kt = k / (FRAMES - 1);
    const v = startPct + (endPct - startPct) * easeOutCubic(kt);
    const x = k * step;
    const y = sparkH - (v / endPct) * (sparkH - 4) - 2;
    path += (k === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  const lastX = (samples - 1) * step;
  const area = path.trim() + ` L${lastX.toFixed(1)},${sparkH} L0,${sparkH} Z`;

  const visible = TIMELINE.filter(e => e.frame <= i).reverse();
  let feedSvg = '';
  visible.slice(0, 5).forEach((ev, idx) => {
    const fresh = idx === 0 && (i - ev.frame < 2);
    const flashBg = fresh ? `<rect x="-6" y="-12" width="320" height="18" rx="3" fill="${ev.sensitive ? '#ffb86b' : '#f44747'}" opacity="${ev.sensitive ? 0.22 : 0.16}"/>` : '';
    const badgeC = ev.sensitive ? '#ffb86b' : badgeColor[ev.type];
    feedSvg += `
      <g transform="translate(0, ${idx * 22})">
        ${flashBg}
        <text x="0" y="0" fill="${badgeC}" font-size="11">${badgeChar[ev.type]}</text>
        <text x="14" y="0" fill="#cccccc" font-size="11">${ev.label}</text>
        <text x="316" y="0" fill="#7a7a7a" font-size="10" text-anchor="end">${ev.meta}</text>
      </g>`;
  });

  // Per-category counts (cumulative)
  let nSec = 0, nCred = 0, nPii = 0;
  visible.forEach((ev) => {
    if (ev.cats) {
      if (ev.cats.includes('secret')) nSec++;
      if (ev.cats.includes('credential')) nCred++;
      if (ev.cats.includes('pii')) nPii++;
    }
  });

  // Heartbeat
  const beatScale = (i % 2 === 0) ? 1.35 : 1.0;

  // Modal popup overlay during sensitive discovery
  const showPopup = i >= POPUP_FROM && i <= POPUP_TO;
  const popupFade = showPopup ? Math.min(1, (i - POPUP_FROM + 1) / 2) : 0;
  const popupSvg = showPopup ? `
    <rect width="${W}" height="${H}" fill="black" opacity="${0.55 * popupFade}"/>
    <g transform="translate(${W/2 - 240}, ${H/2 - 90})" opacity="${popupFade}">
      <rect width="480" height="200" rx="6" fill="#2a2d31" stroke="#f44747" stroke-width="2"/>
      <text x="22" y="34" fill="#f44747" font-size="22">⚠</text>
      <text x="50" y="36" fill="#fff" font-size="14" font-weight="700">Sensitive file exposed to AI tools</text>
      <text x="22" y="60" fill="#ffb86b" font-size="12" font-weight="600">config/credentials.json — AWS key, bearer token</text>
      <!-- inline highlight preview of the leaked values -->
      <g font-family="Menlo, Consolas, monospace" font-size="11">
        <text x="22" y="84" fill="#6a737d">aws_access_key_id =</text>
        <rect x="158" y="73" width="150" height="15" rx="2" fill="rgba(229,57,53,0.22)" stroke="rgba(229,57,53,0.9)"/>
        <text x="164" y="84" fill="#e57373">AKIAIOSFODNN7EXAMPLE</text>
        <text x="22" y="104" fill="#6a737d">password =</text>
        <rect x="92" y="93" width="92" height="15" rx="2" fill="rgba(245,124,0,0.22)" stroke="rgba(245,124,0,0.9)"/>
        <text x="98" y="104" fill="#ffb74d">"hunter2pass"</text>
      </g>
      <text x="22" y="128" fill="#cccccc" font-size="11">Values are highlighted inline. Rotate the secret, reset session.</text>
      <rect x="22"  y="158" width="120" height="28" rx="3" fill="#0e639c"/>
      <text x="82"  y="176" fill="#fff" font-size="12" text-anchor="middle">Open dashboard</text>
      <rect x="152" y="158" width="110" height="28" rx="3" fill="#3a3d41"/>
      <text x="207" y="176" fill="#fff" font-size="12" text-anchor="middle">Reset session</text>
      <rect x="272" y="158" width="130" height="28" rx="3" fill="#3a3d41"/>
      <text x="337" y="176" fill="#fff" font-size="12" text-anchor="middle">Don't show again</text>
    </g>
  ` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif">
    <defs>
      <linearGradient id="fillTeal"   x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#4ec9b0"/><stop offset="100%" stop-color="#c586c0"/></linearGradient>
      <linearGradient id="fillWarn"   x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#e8731a"/></linearGradient>
      <linearGradient id="fillDanger" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#f44747"/><stop offset="100%" stop-color="#d92020"/></linearGradient>
      <linearGradient id="sparkFill"  x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#f44747" stop-opacity="0.5"/><stop offset="100%" stop-color="#f44747" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0e1116"/>

    <!-- AI banner top -->
    <rect x="24" y="20" width="${W-48}" height="36" rx="3" fill="rgba(244,71,71,0.08)"/>
    <rect x="24" y="20" width="3" height="36" fill="#f44747"/>
    <text x="40" y="42" font-size="14">🤖</text>
    <text x="62" y="42" fill="#eee" font-size="11">Copilot Chat, Claude Code, Continue, Gemini, pandō · Code visible to 5 AI context windows</text>

    <!-- LEFT: big % + bar + cats -->
    <g transform="translate(24, 72)">
      <text x="0" y="14" fill="#9aa4b2" font-size="10" letter-spacing="1.5">AI EXPOSURE</text>
      <text x="0" y="64" fill="${pctColor(pct)}" font-size="46" font-weight="700" font-variant-numeric="tabular-nums">${pct.toFixed(1)}%</text>
      <rect x="0" y="80" width="220" height="10" rx="5" fill="#3c3c3c"/>
      <rect x="0" y="80" width="${(pct/100*220).toFixed(1)}" height="10" rx="5" fill="${fillColor(pct)}"/>
      <text x="0" y="106" fill="#7a8290" font-size="10">monitor-ai</text>

      <!-- category breakdown -->
      <rect x="0" y="124" width="220" height="62" rx="3" fill="rgba(244,71,71,0.08)"/>
      <rect x="0" y="124" width="3" height="62" fill="#f44747"/>
      <g transform="translate(10, 138)" font-size="9">
        <text x="0"   y="0"  fill="#ffb86b" letter-spacing="0.6">SECRETS</text>
        <text x="200" y="0"  fill="#f44747" font-weight="700" text-anchor="end">${nSec}</text>
        <text x="0"   y="18" fill="#ffb86b" letter-spacing="0.6">PASS / CREDENTIALS</text>
        <text x="200" y="18" fill="#f44747" font-weight="700" text-anchor="end">${nCred}</text>
        <text x="0"   y="36" fill="#ffb86b" letter-spacing="0.6">PII</text>
        <text x="200" y="36" fill="#f44747" font-weight="700" text-anchor="end">${nPii}</text>
      </g>
    </g>

    <!-- Center: sparkline -->
    <g transform="translate(280, 76)">
      <text x="0" y="0" fill="#f44747" font-size="9" letter-spacing="1.4" font-weight="600">LIVE  ${i+1}s</text>
      <circle cx="40" cy="-4" r="3.5" fill="#f44747" transform="scale(${beatScale})" transform-origin="40 -4"/>
      <rect x="0" y="14" width="${sparkW}" height="${sparkH}" rx="3" fill="#1e1e1e"/>
      <g transform="translate(0, 14)">
        <path fill="url(#sparkFill)" d="${area}"/>
        <path fill="none" stroke="#f44747" stroke-width="1.6" d="${path.trim()}"/>
      </g>
    </g>

    <!-- Right: feed (under sparkline) -->
    <g transform="translate(280, 162)">
      ${feedSvg}
    </g>

    <!-- Status bar bottom -->
    <rect x="0" y="${H-22}" width="${W}" height="22" fill="#005a9e"/>
    <text x="12" y="${H-7}" fill="#fff" font-size="11" font-weight="600">👁 AI exposure: ${pct.toFixed(1)}%</text>

    ${popupSvg}
  </svg>`;
}

(async () => {
  console.log(`Rendering ${FRAMES} frames @ ${W}x${H}...`);
  const enc = GIFEncoder();

  for (let i = 0; i < FRAMES; i++) {
    const svg = svgFrame(i);
    const { data } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    enc.writeFrame(index, W, H, { palette, delay: DELAY_MS });
    process.stdout.write('.');
  }
  enc.finish();
  fs.writeFileSync(OUT, Buffer.from(enc.bytes()));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT} (${kb} KB)`);
})();
