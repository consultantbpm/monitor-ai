// Render the SVG mockups in media/ to PNG (marketplace screenshots).
// Usage: node scripts/make-screenshots.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MEDIA = path.join(__dirname, '..', 'media');
const TARGETS = ['screenshot-dashboard', 'screenshot-sidebar'];

(async () => {
  for (const name of TARGETS) {
    const svgPath = path.join(MEDIA, name + '.svg');
    const pngPath = path.join(MEDIA, name + '.png');
    if (!fs.existsSync(svgPath)) { console.warn('skip (no svg):', name); continue; }
    const svg = fs.readFileSync(svgPath);
    await sharp(svg, { density: 144 }).png().toFile(pngPath);
    const kb = (fs.statSync(pngPath).size / 1024).toFixed(1);
    console.log(`Wrote ${pngPath} (${kb} KB)`);
  }
})();
