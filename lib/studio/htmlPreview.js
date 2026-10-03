import { FONTS } from '../fonts.js';
import { richLines } from '../bidi.js';
import { assetSrc } from './render.js';
import { pageTheme, resolveColor, resolveFont } from './theme.js';

// Static HTML of a document's pages, the same way the studio editor draws
// them (components/studio/ScenePage.jsx): every element absolutely placed at
// its frame, Arabic pages dir="rtl" lang="ar", Latin runs isolated in
// <bdi dir="ltr">, *accent* words in the accent colour, text that overflows
// its frame shrunk one px at a time down to its minimum and flagged
// data-overflow when it still does not fit. Text boxes never clip: the
// descent of Cairo passes the line box (clipping hid the dots of a final ي). Used for previews and QA in a
// real browser (fonts loaded before measuring); previews are derived files,
// always rebuildable from the document.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A marker band behind *marked* words (styles with accentMode "highlight"):
// the lower part of the line, a little wider than the words, in the text's
// own colour. Padding and negative margin cancel out, so the line breaks
// where the layout measured it.
export const markerCss = (color) =>
  `background:linear-gradient(to bottom,transparent 52%,${color} 52%,${color} 84%,transparent 84%);-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 .16em;margin:0 -.16em`;

function richHtml(text, accent, highlight = null) {
  return richLines(text ?? '')
    .map((line) =>
      line
        .map((seg) => {
          const inner = seg.parts.map((p) => (p.accent ? `<span style="${highlight ? markerCss(highlight) : `color:${accent}`}">${esc(p.text)}</span>` : esc(p.text))).join('');
          return seg.ltr ? `<bdi dir="ltr">${inner}</bdi>` : inner;
        })
        .join(''),
    )
    .join('<br>');
}

function elementHtml(doc, el, colors, fonts) {
  const f = el.frame;
  const box = `left:${f.x}px;top:${f.y}px;width:${f.width}px;height:${f.height}px;${el.rotation ? `transform:rotate(${el.rotation}deg);` : ''}opacity:${el.opacity ?? 1};`;
  if (el.kind === 'text') {
    const s = el.style;
    const font = resolveFont(s.fontFamily, fonts);
    const family = FONTS[font]?.family ?? "'Cairo'";
    return `<div class="el" data-el="${esc(el.id)}"${el.role ? ` data-role="${esc(el.role)}"` : ''} style="${box}"><div class="t" dir="${s.direction}" data-min="${s.minFontSize ?? s.fontSize}" style="font-family:${family},sans-serif;font-size:${s.fontSize}px;font-weight:${s.weight};color:${resolveColor(s.color, colors)};line-height:${s.lineHeight};text-align:${s.align};"><div class="i" style="white-space:${s.nowrap ? 'nowrap' : 'pre-line'}">${richHtml(el.text, colors.accent, s.highlight ? resolveColor(s.highlight, colors) : null)}</div></div></div>`;
  }
  if (el.kind === 'shape') {
    const fill = el.fill === 'none' ? 'none' : resolveColor(el.fill, colors);
    const stroke = el.stroke ? resolveColor(el.stroke, colors) : null;
    if (el.shape === 'path') {
      return `<div class="el" data-el="${esc(el.id)}" style="${box}"><svg viewBox="0 0 ${el.viewBox[0]} ${el.viewBox[1]}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;display:block"><path d="${esc(el.path)}" fill="${fill}" stroke="${stroke ?? 'none'}" stroke-width="${el.strokeWidth ?? 0}" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
    }
    const radius = el.shape === 'ellipse' ? '50%' : `${el.radius ?? 0}px`;
    const shadow = stroke && el.strokeWidth ? `box-shadow:inset 0 0 0 ${el.strokeWidth}px ${stroke};` : '';
    return `<div class="el" data-el="${esc(el.id)}" style="${box}"><div style="width:100%;height:100%;background:${fill === 'none' ? 'transparent' : fill};border-radius:${radius};${shadow}"></div></div>`;
  }
  if (el.kind === 'image') {
    const src = assetSrc(doc.assets?.[el.assetId], colors);
    if (!src) return `<div class="el missing" data-el="${esc(el.id)}" style="${box}border:4px dashed ${colors.muted};"></div>`;
    return `<div class="el" data-el="${esc(el.id)}" style="${box}"><img src="${src}" alt="${esc(el.alt ?? '')}" style="display:block;width:100%;height:100%;object-fit:${el.fit ?? 'contain'};border-radius:${el.radius ?? 0}px"></div>`;
  }
  return '';
}

export function pageHtml(doc, page) {
  const { colors, fonts } = pageTheme(doc, page);
  const els = [...page.elements].filter((e) => !e.hidden).sort((a, b) => a.z - b.z);
  return `<section class="page" data-page="${esc(page.id)}" dir="rtl" lang="ar" style="width:${page.widthPx}px;height:${page.heightPx}px;background:${colors.bg};color:${colors.text}">${els.map((el) => elementHtml(doc, el, colors, fonts)).join('')}</section>`;
}

// The whole document: pages side by side (or one per row), fonts embedded
// by the caller (fontCss: @font-face rules), and the fitting script.
export function documentHtml(doc, { fontCss = '', pages = null, gap = 40 } = {}) {
  const list = pages ? doc.pages.filter((p, i) => pages.includes(i + 1)) : doc.pages;
  return `<!doctype html><html lang="ar"><head><meta charset="utf-8"><style>${fontCss}
body{margin:0;background:#888;display:flex;flex-wrap:wrap;gap:${gap}px;padding:${gap}px}
.page{position:relative;overflow:hidden;flex:none;font-synthesis:none;letter-spacing:0}
.el{position:absolute}
.t{width:100%;height:100%;overflow:visible}
</style></head><body>${list.map((p) => pageHtml(doc, p)).join('')}
<script>
async function fit(){
  await document.fonts.ready;
  const out=[];
  for (const t of document.querySelectorAll('.t')) {
    const inner=t.firstElementChild; let px=parseFloat(t.style.fontSize); const min=parseFloat(t.dataset.min||px);
    const fits=()=>inner.offsetHeight<=t.clientHeight+1&&inner.scrollWidth<=t.clientWidth+1;
    while(!fits()&&px>min){px-=1;t.style.fontSize=px+'px';}
    if(!fits()){t.setAttribute('data-overflow','');out.push({el:t.parentElement.dataset.el,page:t.closest('.page').dataset.page,size:px});}
    else if(px<parseFloat(t.dataset.size||px)) t.dataset.shrunk=px;
  }
  window.__fit=out;
  // Titles of four words or more whose last line, as the browser drew it,
  // is a lone word (a 2+1 break of a three-word title is normal).
  const orphans=[];
  for (const el of document.querySelectorAll('[data-role="title"] .i')) {
    const tops=[];
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    for (let n=walker.nextNode(); n; n=walker.nextNode()) {
      const re=/\\S+/g; let m;
      while ((m=re.exec(n.data))) { const r=document.createRange(); r.setStart(n,m.index); r.setEnd(n,m.index+m[0].length); const rect=r.getBoundingClientRect(); if (rect.width) tops.push(Math.round(rect.top)); }
    }
    const lines=[...new Set(tops)].sort((a,b)=>a-b);
    if (tops.length>=4 && lines.length>1 && tops.filter((t)=>t===lines[lines.length-1]).length===1) orphans.push({el:el.closest('.el').dataset.el,page:el.closest('.page').dataset.page,lines:lines.length});
  }
  window.__orphans=orphans;
}
fit();
</script></body></html>`;
}
