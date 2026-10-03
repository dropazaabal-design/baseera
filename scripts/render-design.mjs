// Renders a design document to rebuildable files:
//
//   node scripts/render-design.mjs DESIGN.json OUTDIR [--pptx NAME.pptx]
//
// OUTDIR/pages/page-N.png   each page at half size, drawn in Chromium with
//                           the bundled Arabic fonts (the same HTML as QA)
// OUTDIR/contact.png        all pages side by side (rhythm, alternation)
// OUTDIR/phone-N.png        pages at a phone's width (390 CSS px), to judge
//                           reading size where the post is actually seen
// OUTDIR/NAME.pptx          editable PowerPoint (texts, shapes, pictures)
// OUTDIR/render.json        browser overflow, lone last words, and the PPTX
//                           text readback compared with the document
//
// Previews are derived files: the document is the source; rerun to rebuild.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { documentHtml } from '../lib/studio/htmlPreview.js';
import { buildPptx, readPptxTexts } from '../lib/studio/canva/pptx.js';
import { plainText } from '../lib/studio/measure.js';
import { FONTS } from '../lib/fonts.js';

const root = path.resolve(import.meta.dirname, '..');
const [designFile, outDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1];
};
if (!designFile || !outDir) {
  console.error('usage: render-design.mjs DESIGN.json OUTDIR [--pptx NAME.pptx]');
  process.exit(2);
}
const doc = JSON.parse(fs.readFileSync(designFile, 'utf8'));
fs.mkdirSync(path.join(outDir, 'pages'), { recursive: true });

function fontCss() {
  const rules = [];
  for (const [id, f] of Object.entries(FONTS)) {
    const dir = path.join(root, 'node_modules/@fontsource', id, 'files');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((n) => /-(arabic|latin)-\d+-normal\.woff2$/.test(n))) {
      const weight = Number(/-(\d+)-normal/.exec(file)[1]);
      rules.push(`@font-face{font-family:${f.family.split(',')[0]};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}) format('woff2');}`);
    }
  }
  return rules.join('\n');
}

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const css = fontCss();
const html = documentHtml(doc, { fontCss: css, gap: 40 });
const report = { design: doc.id, revision: doc.revision, pages: doc.pages.length, size: `${doc.pages[0].widthPx}×${doc.pages[0].heightPx}` };

// Half-size pages, and the browser's own checks.
const half = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 0.5 });
await half.setContent(html, { waitUntil: 'load' });
await half.waitForFunction(() => Array.isArray(window.__orphans), null, { timeout: 30000 });
report.browser = { overflow: await half.evaluate(() => window.__fit), loneLastWord: await half.evaluate(() => window.__orphans) };
for (const [i, p] of doc.pages.entries()) await half.locator(`[data-page="${p.id}"]`).screenshot({ path: path.join(outDir, 'pages', `page-${i + 1}.png`) });
await half.close();

// Contact sheet at a quarter size.
const sheet = await browser.newPage({ viewport: { width: 4 * 1120 + 40, height: 1400 }, deviceScaleFactor: 0.25 });
await sheet.setContent(html, { waitUntil: 'load' });
await sheet.waitForFunction(() => Array.isArray(window.__fit), null, { timeout: 30000 });
await sheet.screenshot({ path: path.join(outDir, 'contact.png'), fullPage: true });
await sheet.close();

// Phone width: a 1080 px page shown 390 CSS px wide.
const phone = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 390 / 1080 });
await phone.setContent(html, { waitUntil: 'load' });
await phone.waitForFunction(() => Array.isArray(window.__fit), null, { timeout: 30000 });
for (const [i, p] of doc.pages.entries()) if (i === 0 || i === doc.pages.length - 1 || i === 1) await phone.locator(`[data-page="${p.id}"]`).screenshot({ path: path.join(outDir, `phone-${i + 1}.png`) });
await phone.close();
await browser.close();

// Editable PPTX, then its text read back and compared with the document.
const pptxName = flag('pptx');
if (pptxName) {
  const built = buildPptx(doc, { title: doc.brief ?? doc.id });
  fs.writeFileSync(path.join(outDir, pptxName), built.bytes);
  const zip = await JSZip.loadAsync(built.bytes);
  const files = new Map();
  for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) files.set(name, await zip.files[name].async('uint8array'));
  const slides = readPptxTexts(files);
  const norm = (t) => plainText(t).replace(/‎/g, '').replace(/\s+/g, ' ').trim();
  const mismatches = [];
  doc.pages.forEach((page, i) => {
    const want = page.elements.filter((e) => e.kind === 'text' && !e.hidden).map((e) => norm(e.text));
    const got = new Set((slides[i]?.texts ?? []).map((t) => norm(t.text)));
    for (const t of want) if (!got.has(t)) mismatches.push({ page: i + 1, missing: t });
  });
  report.pptx = {
    file: pptxName,
    bytes: built.bytes.length,
    native: built.report.native,
    fonts: built.report.fonts,
    degraded: built.report.degraded.length,
    skipped: built.report.skipped.length,
    limitations: built.report.limitations,
    readback: { slides: slides.length, rtlTexts: slides.reduce((t, s) => t + s.texts.filter((x) => x.rtl).length, 0), mismatches },
  };
}
fs.writeFileSync(path.join(outDir, 'render.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify(report, null, 1));
