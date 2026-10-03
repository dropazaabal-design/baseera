// The typesetter contract. A typesetter measures and draws an ArabicText
// spec in one shaping engine; everything else (markup, motion, adapters)
// works from the data it returns. Chromium (HTML/CSS: HarfBuzz shaping,
// the Unicode bidi algorithm, the same engine as the editor and the video
// capture) is the one in use. Another engine — Pango with HarfBuzz, for a
// server without a browser — can be added by implementing this contract
// and passing scripts/arabic-text-check.mjs; no Pango dependency is
// included until then.
//
// interface Typesetter {
//   name: string; version: string            // part of every cache key
//   prepareFonts(requests: {family, weight, style?, text?}[]): Promise<FontResult[]>
//   typeset(spec, { raster?: boolean, scale?: number, marks?: 'static'|'none' }):
//     Promise<{ ok, errors[], warnings[], layout, raster?: { png, width, height, scale, ink, clipped }, key: { layout, raster }, renderer }>
//   renderHtml(html, { width, height, scale?, transparent? }): Promise<Uint8Array>   // HTML-engine frames
//   close(): Promise<void>
// }
//
// layout (serializable): { fontSize, direction, align, box, content, layer,
//   lineHeightPx, ascent, descent, lines[{index,start,end,words,box,content,
//   baseline,ink}], words[{index,start,end,text,rtl,box,ink,line,baseline}],
//   ink, inkOverflow, joining, bidi }

const REGISTRY = new Map();

export function registerTypesetter(name, factory, meta = {}) {
  REGISTRY.set(name, { factory, meta });
}

export function typesetters() {
  return [...REGISTRY.entries()].map(([name, { factory, meta }]) => ({ name, available: Boolean(factory), ...meta }));
}

export async function createTypesetter(name, options) {
  const entry = REGISTRY.get(name);
  if (!entry) throw new Error(`unknown typesetter "${name}" (known: ${[...REGISTRY.keys()].join(', ')})`);
  if (!entry.factory) throw new Error(`typesetter "${name}" is not installed: ${entry.meta.reason ?? ''}`);
  return entry.factory(options);
}

registerTypesetter('pango', null, {
  reason: 'not bundled. An adapter must implement this contract with pangocairo + HarfBuzz, use the same local font files, and pass scripts/arabic-text-check.mjs before it is offered.',
});
