// Local, licensed font files only (npm @fontsource packages, SIL Open Font
// License 1.1). The registry says which weights exist as real files: a
// request for any other weight is an error, never a synthesized bold or a
// silent substitute. In the browser, the weights actually declared with
// @font-face are read from document.fonts (lib/arabic-text/page.js).

export const FONT_REGISTRY = {
  Cairo: { id: 'cairo', package: '@fontsource/cairo', license: 'OFL-1.1', weights: [200, 300, 400, 500, 600, 700, 800, 900], subsets: ['arabic', 'latin', 'latin-ext'] },
  Tajawal: { id: 'tajawal', package: '@fontsource/tajawal', license: 'OFL-1.1', weights: [200, 300, 400, 500, 700, 800, 900], subsets: ['arabic', 'latin'] },
  Almarai: { id: 'almarai', package: '@fontsource/almarai', license: 'OFL-1.1', weights: [300, 400, 700, 800], subsets: ['arabic'] },
  'Readex Pro': { id: 'readex-pro', package: '@fontsource/readex-pro', license: 'OFL-1.1', weights: [200, 300, 400, 500, 600, 700], subsets: ['arabic', 'latin', 'latin-ext', 'vietnamese'] },
};

/**
 * What the registry can say before any file is loaded.
 * @returns {{ok:true}|{ok:false, code:string, message:string, available?:number[]}}
 */
export function checkFontRequest(font) {
  const entry = FONT_REGISTRY[font?.family];
  if (!entry) return { ok: false, code: 'font.missing', message: `الخط «${font?.family}» غير موجود في الخطوط المحلية المرخّصة (${Object.keys(FONT_REGISTRY).join('، ')}).` };
  if (!entry.weights.includes(font.weight)) {
    return { ok: false, code: 'font.weight-unavailable', message: `الوزن ${font.weight} غير متوفر لخط ${font.family}؛ المتوفر: ${entry.weights.join('، ')}. لا يُركَّب وزن صناعي.`, available: entry.weights };
  }
  return { ok: true };
}
