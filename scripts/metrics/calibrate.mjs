// Regenerates lib/studio/metrics.js: measures the bundled @fontsource fonts
// in Chromium and fits one average advance width per Arabic letter.
//
//   npx playwright --version            # needs Playwright and a Chromium
//   node scripts/metrics/calibrate.mjs [path-to-chromium]
//
// Fonts are served over HTTP: Chromium does not load web fonts into a page
// set from a file:// or about:blank origin.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(root, 'package.json'));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire(`${process.execPath.replace(/bin\/node$/, '')}lib/node_modules/`)('playwright'));
}

const FONTS = {
  cairo: { family: 'Cairo', dir: 'cairo', weights: [400, 700, 800] },
  tajawal: { family: 'Tajawal', dir: 'tajawal', weights: [400, 700, 800] },
  almarai: { family: 'Almarai', dir: 'almarai', weights: [400, 700, 800] },
  readex: { family: 'Readex Pro', dir: 'readex-pro', weights: [400, 600, 700] },
};
const OTHER_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ٠١٢٣٤٥٦٧٨٩.,:;!?()-—/@#%+«»،؛؟"\'*&_';
const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;

const lines = fs.readFileSync(path.join(import.meta.dirname, 'corpus.txt'), 'utf8').split('\n').filter(Boolean);
const words = [...new Set(lines.join(' ').split(/\s+/).filter(Boolean))];
const letters = [...new Set(words.join('').replace(DIACRITICS, ''))].sort().join('');

const fontsource = path.join(root, 'node_modules/@fontsource');
const server = http.createServer((req, res) => {
  const file = path.join(fontsource, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(fontsource) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html>');
    return;
  }
  const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type }).end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.argv[2] ? { executablePath: process.argv[2] } : {});
const page = await browser.newPage();
await page.goto(`${base}/`);
const links = Object.values(FONTS)
  .flatMap((f) => f.weights.flatMap((w) => ['arabic', 'latin'].map((s) => `<link rel="stylesheet" href="/${f.dir}/${s}-${w}.css">`)))
  .join('');
await page.setContent(
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${links}<style>span{white-space:pre;display:inline-block;font-size:100px;line-height:1;letter-spacing:0;font-synthesis:none}</style></head><body><div id="out"></div></body></html>`,
  { waitUntil: 'load' },
);
const measured = await page.evaluate(
  async ({ FONTS, words, lines, OTHER_CHARS }) => {
    const sample = words.join(' ') + OTHER_CHARS;
    for (const f of Object.values(FONTS)) for (const w of f.weights) await document.fonts.load(`${w} 100px "${f.family}"`, sample);
    await document.fonts.ready;
    const host = document.getElementById('out');
    const out = {};
    for (const [id, f] of Object.entries(FONTS)) {
      out[id] = {};
      for (const w of f.weights) {
        const m = (text) => {
          const s = Object.assign(document.createElement('span'), { textContent: text });
          s.style.fontFamily = `"${f.family}"`;
          s.style.fontWeight = w;
          host.append(s);
          const width = s.getBoundingClientRect().width;
          s.remove();
          return width;
        };
        out[id][w] = {
          // Alef never joins to the next letter, so this isolates the space.
          space: m('ا ا') - m('اا'),
          words: Object.fromEntries(words.map((x) => [x, m(x)])),
          lines: Object.fromEntries(lines.map((x) => [x, m(x)])),
          other: [...OTHER_CHARS].map(m),
        };
      }
    }
    return out;
  },
  { FONTS, words, lines, OTHER_CHARS },
);
await browser.close();
server.close();

// Ridge least squares: word width ≈ Σ count(letter) × width(letter).
function solve(rows, targets, lambda = 0.5) {
  const n = rows[0].length;
  const M = Array.from({ length: n }, () => new Float64Array(n + 1));
  rows.forEach((row, r) => {
    for (let i = 0; i < n; i++) {
      if (!row[i]) continue;
      for (let j = 0; j < n; j++) M[i][j] += row[i] * row[j];
      M[i][n] += row[i] * targets[r];
    }
  });
  for (let i = 0; i < n; i++) M[i][i] += lambda;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}

const round = (px) => Math.round(px * 10) / 1000; // px at 100px → em, 3 decimals
let body = '';
for (const [font, byWeight] of Object.entries(measured)) {
  body += `  ${font}: {\n`;
  for (const [weight, row] of Object.entries(byWeight)) {
    const rows = words.map((w) => {
      const v = new Array(letters.length).fill(0);
      for (const ch of w.replace(DIACRITICS, '')) v[letters.indexOf(ch)]++;
      return v;
    });
    const arabic = solve(rows, words.map((w) => row.words[w])).map(round);
    const width = (text) =>
      text.split(' ').reduce((sum, w) => sum + [...w.replace(DIACRITICS, '')].reduce((s, ch) => s + (arabic[letters.indexOf(ch)] ?? 0.5) * 100, 0), 0) +
      (text.split(' ').length - 1) * row.space;
    const errors = Object.entries(row.lines).map(([text, real]) => Math.abs(width(text) - real) / real);
    console.log(`${font} ${weight}: line error mean ${((errors.reduce((a, b) => a + b, 0) / errors.length) * 100).toFixed(1)}%, max ${(Math.max(...errors) * 100).toFixed(1)}%`);
    body += `    ${weight}: { space: ${round(row.space)}, arabic: [${arabic.join(', ')}], other: [${row.other.map(round).join(', ')}] },\n`;
  }
  body += '  },\n';
}

const header = fs.readFileSync(path.join(root, 'lib/studio/metrics.js'), 'utf8').split('export const')[0];
fs.writeFileSync(
  path.join(root, 'lib/studio/metrics.js'),
  `${header}export const ARABIC_LETTERS = ${JSON.stringify(letters)};\nexport const OTHER_CHARS = ${JSON.stringify(OTHER_CHARS)};\n\nexport const METRICS = {\n${body}};\n`,
);
console.log('wrote lib/studio/metrics.js');
