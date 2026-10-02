import { FONTS, loadFont } from '../../lib/fonts.js';
import { plainText } from '../../lib/studio/measure.js';

// Exact text measurement in the browser, with the same contract as the
// estimate in lib/studio/measure.js: (text, { font, weight, size,
// lineHeight }, width) → { lines, height, width, clipped }. The layout and
// reflow engines take it as `measure`, so in the editor every layout is
// computed on the real glyphs.
export function createDomMeasure() {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.className = 'slide-root';
  host.style.cssText = 'position:fixed;left:-30000px;top:0;visibility:hidden;pointer-events:none;';
  host.dir = 'rtl';
  const box = document.createElement('div');
  host.append(box);
  document.body.append(host);
  const cache = new Map();

  const measure = (text, style, width) => {
    const key = `${style.font}|${style.weight}|${style.size}|${style.lineHeight}|${Math.round(width)}|${text}`;
    const hit = cache.get(key);
    if (hit) return hit;
    box.style.cssText = `width:${width}px;font-family:${FONTS[style.font]?.family ?? "'Cairo'"},sans-serif;font-weight:${style.weight};font-size:${style.size}px;line-height:${style.lineHeight ?? 1.4};white-space:pre-line;`;
    box.textContent = plainText(text);
    const height = box.offsetHeight;
    const result = {
      height,
      lines: Math.max(1, Math.round(height / (style.size * (style.lineHeight ?? 1.4)))),
      width: Math.min(width, box.scrollWidth),
      clipped: box.scrollWidth > width + 1,
    };
    if (cache.size > 5000) cache.clear();
    cache.set(key, result);
    return result;
  };
  measure.dispose = () => host.remove();
  return measure;
}

// Every face a document can use, loaded for its text before measuring.
export async function loadDocFonts(doc) {
  const text = doc.pages.flatMap((p) => p.elements.filter((e) => e.kind === 'text').map((e) => e.text)).join(' ');
  const ids = [...new Set([doc.theme.fonts.heading, doc.theme.fonts.body])].filter((id) => FONTS[id]);
  await Promise.all(ids.map((id) => loadFont(id, text)));
}
