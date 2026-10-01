// Arabic fonts ship fewer weights than Latin ones, so each family maps the
// three roles templates use (regular / bold / black) onto weights it has.
// The @font-face files are bundled from @fontsource (see app/layout.js), so
// they are same-origin and html-to-image can inline them as base64.
export const FONTS = {
  cairo: { label: 'Cairo', family: "'Cairo'", weights: { regular: 400, bold: 700, black: 800 } },
  tajawal: { label: 'Tajawal', family: "'Tajawal'", weights: { regular: 400, bold: 700, black: 800 } },
  almarai: { label: 'Almarai', family: "'Almarai'", weights: { regular: 400, bold: 700, black: 800 } },
  readex: { label: 'Readex Pro', family: "'Readex Pro'", weights: { regular: 400, bold: 600, black: 700 } },
};

const SAMPLE = 'أبجد هوز Abc ١٢٣ 123';

// document.fonts.ready only waits for faces already requested; unicode-range
// subsets are fetched lazily. Request every weight for the exact text that
// will be rendered, so each subset that text touches is loaded eagerly.
export async function loadFont(fontId, text = '') {
  const { family, weights } = FONTS[fontId];
  await Promise.all(Object.values(weights).map((w) => document.fonts.load(`${w} 64px ${family}`, SAMPLE + text)));
  await document.fonts.ready;
}
