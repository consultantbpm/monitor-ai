// One-off: build media/demo.gif from frame-templated SVG using sharp + gifenc.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const W = 800, H = 240, FRAMES = 24, DELAY_MS = 200;
const OUT = path.join(__dirname, '..', 'media', 'demo.gif');

// 24 frames of climbing %. Per-frame sparkline grows.
const startPct = 0;
const endPct   = 37.4;

const feedEvents = [
  { type: 'rescan',  label: 'workspace rescanned',          meta: '23,907 L' },
  { type: 'exposed', label: 'package.json',                 meta: '98 L' },
  { type: 'exposed', label: 'src/extension.ts',             meta: '126 L' },
  { type: 'exposed', label: 'src/exposureTracker.ts',       meta: '264 L' },
  { type: 'changed', label: 'src/dashboard.ts',             meta: '+12 L' },
  { type: 'exposed', label: 'src/currentProjectView.ts',    meta: '218 L' },
  { type: 'changed', label: 'README.md',                    meta: '+8 L' },
  { type: 'exposed', label: 'src/statusBar.ts',             meta: '30 L' },
];

const badgeChar  = { exposed: '●', changed: '✎', created: '+', deleted: '✕', reset: '↻', rescan: '↻' };
const badgeColor = { exposed: '#4ec9b0', changed: '#569cd6', created: '#c586c0', deleted: '#f44747', reset: '#d7ba7d', rescan: '#d7ba7d' };

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function svgFrame(i) {
  const t = i / (FRAMES - 1);
  const pct = startPct + (endPct - startPct) * easeOutCubic(t);
  // Sparkline: linear progress; samples = i+2 visible
  const samples = Math.max(2, Math.floor(2 + (FRAMES - 2) * t));
  const sparkW = 520, sparkH = 50;
  const step = sparkW / Math.max(1, FRAMES + 1);
  let path = '';
  for (let k = 0; k < samples; k++) {
    const kt = k / (FRAMES - 1);
    const v = startPct + (endPct - startPct) * easeOutCubic(kt);
    const x = k * step;
    const y = sparkH - (v / endPct) * (sparkH - 3) - 1;
    path += (k === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  const lastX = (samples - 1) * step;
  const area = path.trim() + ` L${lastX.toFixed(1)},${sparkH} L0,${sparkH} Z`;

  // Feed reveals one event every 3 frames, newest first
  const revealedCount = Math.min(feedEvents.length, Math.floor(i / 2.5));
  const visible = feedEvents.slice(0, revealedCount).reverse();
  let feedSvg = '';
  visible.slice(0, 4).forEach((ev, idx) => {
    const fresh = idx === 0 && (i % 3 < 2); // flash on most recent for first 2 of every 3 frames
    const rowOpacity = fresh ? 1 : 0.92;
    const flashBg = fresh ? `<rect x="-4" y="-12" width="240" height="18" rx="3" fill="#4ec9b0" opacity="0.18"/>` : '';
    feedSvg += `
      <g transform="translate(0, ${idx * 22})" opacity="${rowOpacity}">
        ${flashBg}
        <text x="0" y="0" fill="${badgeColor[ev.type]}" font-size="11">${badgeChar[ev.type]}</text>
        <text x="14" y="0" fill="#cccccc" font-size="11">${ev.label}</text>
        <text x="236" y="0" fill="#777" font-size="10" text-anchor="end">${ev.meta}</text>
      </g>`;
  });

  // Heartbeat dot pulses every 2 frames
  const beatScale = (i % 2 === 0) ? 1.4 : 1.0;
  const beatRing  = (i % 2 === 0) ? 8 : 4;
  const beatRingOpacity = (i % 2 === 0) ? 0.35 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif">
    <defs>
      <linearGradient id="fillGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#4ec9b0"/>
        <stop offset="100%" stop-color="#c586c0"/>
      </linearGradient>
      <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#4ec9b0" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#4ec9b0" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0e1116"/>

    <!-- Left: big % + bar -->
    <g transform="translate(24, 24)">
      <text x="0" y="14" fill="#9aa4b2" font-size="10" letter-spacing="1.5">AI EXPOSURE</text>
      <text x="0" y="64" fill="#e8e8e8" font-size="46" font-weight="700" font-variant-numeric="tabular-nums">${pct.toFixed(1)}%</text>
      <rect x="0" y="80" width="220" height="10" rx="5" fill="#3c3c3c"/>
      <rect x="0" y="80" width="${(pct/100*220).toFixed(1)}" height="10" rx="5" fill="url(#fillGrad)"/>
      <text x="0" y="108" fill="#7a8290" font-size="10">monitor-ai</text>

      <!-- mini counters -->
      <g transform="translate(0, 130)" font-size="11">
        <text x="0" y="0" fill="#9aa4b2">Exposed</text>
        <text x="0" y="16" fill="#e8e8e8" font-weight="700">${Math.round(pct/100*23907).toLocaleString()} L</text>
        <text x="100" y="0" fill="#9aa4b2">Files</text>
        <text x="100" y="16" fill="#e8e8e8" font-weight="700">${Math.round(pct/100*182*0.26 + 5)}</text>
      </g>
    </g>

    <!-- Center: sparkline -->
    <g transform="translate(280, 28)">
      <text x="0" y="0" fill="#9aa4b2" font-size="9" letter-spacing="1.4">LIVE  ${i+1}s</text>
      <circle cx="38" cy="-4" r="3.5" fill="#4ec9b0" transform="scale(${beatScale})" transform-origin="38 -4"/>
      <circle cx="38" cy="-4" r="${beatRing}" fill="none" stroke="#4ec9b0" stroke-opacity="${beatRingOpacity}"/>
      <rect x="0" y="14" width="${sparkW}" height="${sparkH}" rx="3" fill="#1e1e1e"/>
      <g transform="translate(0, 14)">
        <path fill="url(#sparkFill)" d="${area}"/>
        <path fill="none" stroke="#4ec9b0" stroke-width="1.6" d="${path.trim()}"/>
      </g>
    </g>

    <!-- Right: feed (under sparkline) -->
    <g transform="translate(280, 110)">
      ${feedSvg}
    </g>

    <!-- Status bar bottom -->
    <rect x="0" y="${H-22}" width="${W}" height="22" fill="#005a9e"/>
    <text x="12" y="${H-7}" fill="#fff" font-size="11">👁 AI exposure: ${pct.toFixed(1)}%</text>
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
    // gifenc wants Uint8Array RGBA
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
