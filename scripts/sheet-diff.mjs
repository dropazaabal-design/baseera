// Compares two runs of the style QA sheets page by page:
//
//   node scripts/sheet-diff.mjs <reviewed previews dir> <new previews dir>
//
// For every sheet in the new run it reports the pages whose pixels differ
// from the reviewed sheet, so a new review can look at exactly those pages
// (an identical page is the image that was already reviewed).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [oldDir, newDir] = process.argv.slice(2);
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage();
const report = {};
for (const file of fs.readdirSync(newDir).filter((f) => f.endsWith('.png'))) {
  const sheet = file.replace(/\.png$/, '');
  const rectsFile = path.join(newDir, `${sheet}.pages.json`);
  if (!fs.existsSync(rectsFile)) continue;
  const rects = JSON.parse(fs.readFileSync(rectsFile, 'utf8'));
  const oldFile = path.join(oldDir, file);
  if (!fs.existsSync(oldFile)) {
    report[sheet] = { changed: rects.map((r) => r.id), why: 'no reviewed sheet' };
    continue;
  }
  const load = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const changed = await page.evaluate(
    async ({ a, b, rects }) => {
      const img = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const [ia, ib] = await Promise.all([img(a), img(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return rects.map((r) => r.id);
      const draw = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x; };
      const ca = draw(ia);
      const cb = draw(ib);
      return rects
        .filter((r) => {
          const da = ca.getImageData(r.x, r.y, r.w, r.h).data;
          const db = cb.getImageData(r.x, r.y, r.w, r.h).data;
          let diff = 0;
          for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 24) diff++;
          return diff > 0;
        })
        .map((r) => r.id);
    },
    { a: load(oldFile), b: load(path.join(newDir, file)), rects },
  );
  report[sheet] = { pages: rects.length, changed };
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
