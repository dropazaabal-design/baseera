import { assetSrc } from './render.js';
import { pageTheme, resolveColor } from './theme.js';
import { ellipsePath, rectPath } from './paths.js';

// SVG rendering of a page's artwork (every element except text), with
// images embedded. Used to place a whole page's graphics as one layer under
// native text (Canva "partial" mode) and for quick previews without a
// browser. Text is never drawn into this file: words stay editable text.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const num = (n) => Math.round(n * 100) / 100;

function shapeSvg(el, colors) {
  const { x, y, width: w, height: h } = el.frame;
  const fill = el.fill === 'none' ? 'none' : resolveColor(el.fill, colors);
  const stroke = el.stroke ? resolveColor(el.stroke, colors) : null;
  const attrs = [`fill="${fill}"`];
  if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${num(el.strokeWidth ?? 1)}"`, 'stroke-linecap="round"', 'stroke-linejoin="round"');
  if (el.opacity !== undefined && el.opacity < 1) attrs.push(`opacity="${num(el.opacity)}"`);
  const rot = el.rotation ? ` rotate(${num(el.rotation)} ${num(w / 2)} ${num(h / 2)})` : '';
  if (el.shape === 'path') {
    const [vw, vh] = el.viewBox;
    // Strokes scale with the viewBox, as in the browser renderer.
    return `<g transform="translate(${num(x)} ${num(y)})${rot} scale(${num(w / vw)} ${num(h / vh)})"><path d="${esc(el.path)}" ${attrs.join(' ')}/></g>`;
  }
  const d = el.shape === 'ellipse' ? ellipsePath(w, h) : rectPath(w, h, el.radius ?? 0);
  if (stroke) {
    // Inset strokes, matching the editor's inset box-shadow outline.
    const sw = el.strokeWidth ?? 1;
    const inner = el.shape === 'ellipse' ? ellipsePath(w - sw, h - sw) : rectPath(w - sw, h - sw, Math.max(0, (el.radius ?? 0) - sw / 2));
    return `<g transform="translate(${num(x)} ${num(y)})${rot}"><path d="${d}" fill="${fill}"${el.opacity < 1 ? ` opacity="${num(el.opacity)}"` : ''}/><path d="${inner}" transform="translate(${num(sw / 2)} ${num(sw / 2)})" fill="none" stroke="${stroke}" stroke-width="${num(sw)}"${el.opacity < 1 ? ` opacity="${num(el.opacity)}"` : ''}/></g>`;
  }
  return `<g transform="translate(${num(x)} ${num(y)})${rot}"><path d="${d}" ${attrs.join(' ')}/></g>`;
}

function imageSvg(el, asset, colors, clipId) {
  const src = assetSrc(asset, colors);
  if (!src) return '';
  const { x, y, width: w, height: h } = el.frame;
  const rot = el.rotation ? ` transform="rotate(${num(el.rotation)} ${num(x + w / 2)} ${num(y + h / 2)})"` : '';
  const aspect = el.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
  const clip = el.radius ? `<clipPath id="${clipId}"><path transform="translate(${num(x)} ${num(y)})" d="${rectPath(w, h, el.radius)}"/></clipPath>` : '';
  return `${clip}<g${rot}${el.opacity < 1 ? ` opacity="${num(el.opacity)}"` : ''}><image href="${src}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="${aspect}"${clip ? ` clip-path="url(#${clipId})"` : ''}/></g>`;
}

export function renderArtSvg(doc, page, { background = true } = {}) {
  const { colors } = pageTheme(doc, page);
  const parts = [];
  if (background) parts.push(`<rect width="${page.widthPx}" height="${page.heightPx}" fill="${colors.bg}"/>`);
  [...page.elements]
    .filter((e) => !e.hidden && e.kind !== 'text')
    .sort((a, b) => a.z - b.z)
    .forEach((el, i) => {
      if (el.kind === 'shape') parts.push(shapeSvg(el, colors));
      else parts.push(imageSvg(el, doc.assets?.[el.assetId], colors, `c${i}`));
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.widthPx}" height="${page.heightPx}" viewBox="0 0 ${page.widthPx} ${page.heightPx}">${parts.join('')}</svg>`;
}
