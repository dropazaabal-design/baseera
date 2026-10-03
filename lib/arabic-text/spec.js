import { hashOf } from '../studio/util.js';

// ArabicText — the one owner of Arabic text in designs and video.
//
// A spec is data: the text in logical Unicode order (as typed, never
// reversed, never in presentation forms, never with bidi controls added by
// us), explicit spans for runs that keep their own direction (a handle, a
// link, a number) or carry a mark (accent colour, marker band), and the
// layout parameters. Rendering (lib/arabic-text/html.js), measuring (a
// typesetter: Chromium now, Pango possibly later) and motion
// (lib/arabic-text/motion.js) all read the same spec, so a text is shaped
// by one engine with one set of rules wherever it appears.

/**
 * @typedef {Object} Span
 * @property {number} start  UTF-16 index into `text` (inclusive)
 * @property {number} end    UTF-16 index (exclusive)
 * @property {'ltr'|'rtl'} [dir]  isolate this run in that direction (<bdi>)
 * @property {'accent'|'highlight'} [mark]  accent colour, or a marker band
 * @property {'handle'|'url'|'number'|'latin'|'email'|'phone'} [label]  what the run is (informative)
 *
 * @typedef {Object} FontRequest
 * @property {string} family  'Cairo', 'Tajawal' (or a registry id: 'cairo')
 * @property {number} weight  100–900, must exist as a local file
 * @property {'normal'} [style]
 *
 * @typedef {Object} Motion  see lib/arabic-text/motion.js
 *
 * @typedef {Object} ArabicTextSpec
 * @property {1} version
 * @property {string} text
 * @property {Span[]} [spans]
 * @property {'auto'|'explicit'} [bidi]  'auto' adds detected LTR runs where no explicit span covers them
 * @property {string} [lang]           'ar' by default
 * @property {'rtl'|'ltr'} direction   writing direction of the paragraph
 * @property {'start'|'end'|'center'} align  alignment, separate from direction
 * @property {FontRequest} font
 * @property {number} fontSize         px
 * @property {'none'|'shrink'} [fit]   'shrink' may step down to minFontSize, never below
 * @property {number} [minFontSize]    the approved floor
 * @property {number} width            box width in px (padding included)
 * @property {number|null} [maxHeight] box height limit in px (padding included)
 * @property {number} lineHeight       unitless
 * @property {{top:number,right:number,bottom:number,left:number}} [padding]
 * @property {number} [maxLines]       a guidance limit: more lines is a warning
 * @property {string} color            CSS colour of the text
 * @property {{accent?:string, highlight?:string}} [palette]
 * @property {Motion[]} [motion]
 */

export const ARABIC_TEXT_VERSION = 1;
// Bumped when the markup or the measuring rules change: part of every
// cache key, so a cached layout never outlives the code that made it.
export const LAYOUT_RULES_VERSION = 1;

const DEFAULTS = {
  version: ARABIC_TEXT_VERSION,
  spans: [],
  bidi: 'auto',
  lang: 'ar',
  direction: 'rtl',
  align: 'start',
  fit: 'none',
  maxHeight: null,
  lineHeight: 1.5,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  color: '#14181F',
  palette: {},
  motion: [],
};

export const FAMILY_OF = { cairo: 'Cairo', tajawal: 'Tajawal', almarai: 'Almarai', readex: 'Readex Pro', 'readex-pro': 'Readex Pro' };

const pad = (p) => (typeof p === 'number' ? { top: p, right: p, bottom: p, left: p } : { top: 0, right: 0, bottom: 0, left: 0, ...p });

export function normalizeSpec(input) {
  const s = { ...DEFAULTS, ...input };
  s.padding = pad(input?.padding ?? 0);
  s.font = { style: 'normal', ...input?.font, family: FAMILY_OF[input?.font?.family] ?? input?.font?.family };
  s.spans = (input?.spans ?? []).map((x) => ({ ...x })).sort((a, b) => a.start - b.start || b.end - a.end);
  s.palette = { ...input?.palette };
  s.motion = (input?.motion ?? []).map((m) => ({ ...m }));
  if (s.minFontSize === undefined) s.minFontSize = s.fontSize;
  return s;
}

// Display forms (U+FB50–U+FDFF, U+FE70–U+FEFF) are what a "reverse and
// reshape by hand" pipeline produces: the stored text must be logical.
const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻾]/;
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;

export function validateSpec(input) {
  const s = normalizeSpec(input);
  const errors = [];
  const warnings = [];
  const err = (code, message, extra) => errors.push({ code, message, ...extra });
  if (typeof s.text !== 'string') err('spec.text', 'text must be a string');
  else {
    const pf = PRESENTATION_FORMS.exec(s.text);
    if (pf) err('text.presentation-forms', `النص يحوي حروف عرض (U+${pf[0].codePointAt(0).toString(16).toUpperCase()}) عند الموضع ${pf.index}: خزّن النص بترتيبه المنطقي وحروفه الأصلية.`, { index: pf.index });
    const controls = [...s.text.matchAll(BIDI_CONTROLS)];
    if (controls.length) warnings.push({ code: 'text.bidi-controls', message: `النص يحوي ${controls.length} من محارف التحكم بالاتجاه؛ العزل يتم بالترميز لا بإضافة محارف.`, indexes: controls.map((m) => m.index) });
  }
  if (!s.font?.family) err('spec.font', 'font.family required');
  if (!Number.isInteger(s.font?.weight) || s.font.weight < 100 || s.font.weight > 900) err('spec.font.weight', 'font.weight must be an integer 100–900');
  if (!(s.fontSize > 0)) err('spec.fontSize', 'fontSize must be > 0');
  if (!(s.minFontSize > 0) || s.minFontSize > s.fontSize) err('spec.minFontSize', 'minFontSize must be > 0 and ≤ fontSize');
  if (!['none', 'shrink'].includes(s.fit)) err('spec.fit', "fit must be 'none' or 'shrink'");
  if (!['rtl', 'ltr'].includes(s.direction)) err('spec.direction', "direction must be 'rtl' or 'ltr'");
  if (!['start', 'end', 'center'].includes(s.align)) err('spec.align', "align must be 'start', 'end' or 'center'");
  if (!['auto', 'explicit'].includes(s.bidi)) err('spec.bidi', "bidi must be 'auto' or 'explicit'");
  if (!(s.width > s.padding.left + s.padding.right)) err('spec.width', 'width must exceed horizontal padding');
  if (s.maxHeight !== null && !(s.maxHeight > s.padding.top + s.padding.bottom)) err('spec.maxHeight', 'maxHeight must exceed vertical padding');
  if (!(s.lineHeight >= 0.8 && s.lineHeight <= 3)) err('spec.lineHeight', 'lineHeight must be in [0.8, 3]');
  const len = s.text?.length ?? 0;
  s.spans.forEach((sp, i) => {
    if (!(Number.isInteger(sp.start) && Number.isInteger(sp.end) && sp.start >= 0 && sp.end <= len && sp.start < sp.end)) err('spec.spans', `span ${i}: [${sp.start}, ${sp.end}) outside the text`, { span: i });
    if (sp.dir !== undefined && !['ltr', 'rtl'].includes(sp.dir)) err('spec.spans', `span ${i}: dir must be ltr or rtl`, { span: i });
    if (sp.mark !== undefined && !['accent', 'highlight'].includes(sp.mark)) err('spec.spans', `span ${i}: mark must be accent or highlight`, { span: i });
    if (sp.dir === undefined && sp.mark === undefined) err('spec.spans', `span ${i}: needs dir or mark`, { span: i });
  });
  // Isolates may nest but never cross: <bdi> markup cannot express it.
  const iso = s.spans.filter((x) => x.dir);
  for (let i = 0; i < iso.length; i++) {
    for (let j = i + 1; j < iso.length; j++) {
      const a = iso[i];
      const b = iso[j];
      if (b.start < a.end && b.end > a.end) err('spec.spans', `isolates [${a.start}, ${a.end}) and [${b.start}, ${b.end}) cross`);
    }
  }
  return { spec: s, errors, warnings };
}

// `*word*` markers (the studio's stored form) → plain text + mark spans,
// and back. The markers never reach the typesetter.
const MARKED = /\*([^*\n]+)\*/g;

export function fromMarkedText(marked, { mark = 'accent' } = {}) {
  let text = '';
  const spans = [];
  let last = 0;
  for (const m of String(marked ?? '').matchAll(MARKED)) {
    text += marked.slice(last, m.index);
    spans.push({ start: text.length, end: text.length + m[1].length, mark });
    text += m[1];
    last = m.index + m[0].length;
  }
  text += String(marked ?? '').slice(last);
  return { text, spans };
}

export function toMarkedText(text, spans = []) {
  const marks = spans.filter((s) => s.mark).sort((a, b) => a.start - b.start);
  let out = '';
  let last = 0;
  for (const s of marks) {
    out += `${text.slice(last, s.start)}*${text.slice(s.start, s.end)}*`;
    last = s.end;
  }
  return out + text.slice(last);
}

// Fields that decide line breaks and positions. Colour, palette and motion
// do not: a colour change reuses the layout, never re-shapes the text.
const LAYOUT_FIELDS = ['text', 'spans', 'bidi', 'lang', 'direction', 'align', 'font', 'fontSize', 'fit', 'minFontSize', 'width', 'maxHeight', 'lineHeight', 'padding'];

/**
 * @param {ArabicTextSpec} spec
 * @param {{renderer:string, fonts?:string}} env  renderer = engine and version
 *   (e.g. "chromium/141.0.7390.37"), fonts = hash of the font files used
 */
export function layoutKey(spec, env) {
  const s = normalizeSpec(spec);
  return hashOf({ v: LAYOUT_RULES_VERSION, renderer: env?.renderer ?? 'unknown', fonts: env?.fonts ?? null, ...Object.fromEntries(LAYOUT_FIELDS.map((k) => [k, s[k] ?? null])) }).slice(0, 24);
}

// A raster also depends on colours, the marks' rendering and the scale.
export function rasterKey(spec, env, { scale = 1, marks = 'static' } = {}) {
  const s = normalizeSpec(spec);
  return hashOf({ layout: layoutKey(s, env), color: s.color, palette: s.palette, scale, marks }).slice(0, 24);
}

// Serialized form: the spec as given plus, optionally, the layout a
// typesetter produced for it (with the key it was made for), so a project
// reopens without re-measuring when nothing changed.
export function serializeArabicText({ spec, layout = null }) {
  return JSON.stringify({ kind: 'arabic-text', version: ARABIC_TEXT_VERSION, spec: normalizeSpec(spec), ...(layout && { layout }) });
}

export function parseArabicText(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (data?.kind !== 'arabic-text') throw new Error('not an arabic-text document');
  if (data.version !== ARABIC_TEXT_VERSION) throw new Error(`unsupported arabic-text version ${data.version}`);
  const { spec, errors } = validateSpec(data.spec);
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
  return { spec, layout: data.layout ?? null };
}

// The stored text against the approved one, code point by code point.
export function compareStoredText(stored, approved) {
  if (stored === approved) return { equal: true };
  const a = [...stored];
  const b = [...approved];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { equal: false, index: i, stored: a.slice(i, i + 8).join(''), approved: b.slice(i, i + 8).join('') };
}
