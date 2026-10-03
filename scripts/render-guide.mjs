// Renders an Arabic Markdown document (docs/GUIDE.md) to a right-to-left
// PDF with the bundled Cairo and Tajawal fonts:
//
//   node scripts/render-guide.mjs docs/GUIDE.md docs/GUIDE.pdf
//
// A small converter for what the guide uses: headings, paragraphs, lists,
// tables, fenced code (Arabic prompts right-to-left, shell left-to-right),
// inline code, bold and links. The PDF is a derived file: edit the Markdown.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const [input, output] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--html');
if (!input || !output) {
  console.error('usage: render-guide.mjs IN.md OUT.pdf');
  process.exit(2);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

function toHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const lang = fence[1];
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      const rtl = lang === 'text' || /[؀-ۿ]/.test(body.join('').replace(/#.*$/gm, '')) && lang !== 'sh';
      out.push(`<pre class="${lang === 'text' ? 'prompt' : 'code'}" dir="${rtl ? 'rtl' : 'ltr'}">${esc(body.join('\n'))}</pre>`);
      continue;
    }
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const li = /^(\s*)(-|\d+\.) (.*)$/.exec(line);
    if (li) {
      const ordered = li[2] !== '-';
      const items = [];
      for (; i < lines.length; ) {
        const m = /^(\s*)(-|\d+\.) (.*)$/.exec(lines[i]);
        if (!m) break;
        let text = m[3];
        for (i++; i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(-|\d+\.) /.test(lines[i]); i++) text += ` ${lines[i].trim()}`;
        items.push(`<li>${inline(text)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|```|\||\s*(-|\d+\.) )/.test(lines[i]); i++) para.push(lines[i].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

function fontCss() {
  const rules = [];
  for (const [id, family] of [['cairo', 'Cairo'], ['tajawal', 'Tajawal']]) {
    const dir = path.join(root, 'node_modules/@fontsource', id, 'files');
    for (const file of fs.readdirSync(dir).filter((n) => /-(arabic|latin)-(400|700|800)-normal\.woff2$/.test(n))) {
      const weight = Number(/-(\d+)-normal/.exec(file)[1]);
      rules.push(`@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}) format('woff2');}`);
    }
  }
  return rules.join('\n');
}

const css = `${fontCss()}
@page{size:A4;margin:18mm 16mm}
body{font-family:'Tajawal',sans-serif;font-size:11.5pt;line-height:1.75;color:#14181F;font-synthesis:none}
h1{font-family:'Cairo';font-weight:800;font-size:22pt;line-height:1.4;margin:0 0 8pt;padding-bottom:6pt;border-bottom:3px solid #D9F4EB}
h2{font-family:'Cairo';font-weight:800;font-size:15pt;margin:18pt 0 6pt;break-after:avoid}
h2::before{content:'';display:inline-block;width:10pt;height:10pt;background:#D9F4EB;margin-inline-end:6pt;vertical-align:middle}
h3{font-family:'Cairo';font-weight:700;font-size:12.5pt;margin:12pt 0 4pt;color:#0C855D;break-after:avoid}
p{margin:4pt 0}
ul,ol{margin:4pt 0;padding-inline-start:18pt}
table{width:100%;border-collapse:collapse;margin:6pt 0;font-size:10pt;break-inside:auto}
th,td{border:1px solid #E1E6E9;padding:4pt 6pt;text-align:start;vertical-align:top}
th{background:#F3F7F5;font-family:'Cairo';font-weight:700}
tr{break-inside:avoid}
pre{white-space:pre-wrap;word-break:break-word;border-radius:6px;padding:8pt 10pt;margin:6pt 0;break-inside:avoid}
pre.prompt{background:#F3F7F5;border:1px solid #D9F4EB;border-inline-start:4px solid #0C855D;font-family:'Tajawal';font-size:10.5pt;line-height:1.7}
pre.code{background:#14181F;color:#E1E6E9;font-family:ui-monospace,monospace;font-size:9pt;line-height:1.5}
code{font-family:ui-monospace,monospace;font-size:9pt;background:#F3F7F5;padding:0 3pt;border-radius:3px;unicode-bidi:isolate}
a{color:#0C855D;text-decoration:none}
strong{font-weight:700}`;

const md = fs.readFileSync(input, 'utf8');
const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${css}</style></head><body>${toHtml(md)}</body></html>`;
// --html FILE also writes the page that is printed (to look at it).
const htmlOut = process.argv.indexOf('--html');
if (htmlOut > 0) fs.writeFileSync(process.argv[htmlOut + 1], html);
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: output, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;text-align:center;font-size:8pt;color:#4A515A"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });
await browser.close();
console.log(JSON.stringify({ ok: true, file: output, bytes: fs.statSync(output).size }));
