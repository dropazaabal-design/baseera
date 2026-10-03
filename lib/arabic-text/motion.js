import { MARKER } from './html.js';

// Arabic motion on text that is already shaped.
//
// The text is typeset once (a raster layer, or the same DOM paragraph) and
// never re-shaped per frame. Motion moves pieces of that one result:
//   block  the whole box
//   line   one line at a time
//   word   one word at a time, cut only at spaces (a space never sits inside
//          a joined letter group), never letter by letter
// A reveal is a mask that uncovers the shaped line from the reading start;
// a highlight is a band drawn under the words. Every state is a pure
// function of the frame number (and the fps the motion was written for),
// so preview and export compute the same frame, and the final frame puts
// every piece exactly where the layout put it (no layout drift).

export const EFFECTS = ['fade', 'rise', 'scale', 'reveal', 'highlight'];
export const UNITS = ['block', 'line', 'word'];

export const EASINGS = {
  linear: (x) => x,
  easeOutCubic: (x) => 1 - (1 - x) ** 3,
  easeInOutCubic: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  easeOutBack: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * @typedef {Object} Motion
 * @property {'fade'|'rise'|'scale'|'reveal'|'highlight'} effect
 * @property {'block'|'line'|'word'} [unit]
 * @property {number} [start]     first frame
 * @property {number} [duration]  frames per piece
 * @property {number} [stagger]   frames between pieces (reading order)
 * @property {number} [distance]  rise: px the piece travels up
 * @property {number} [from]      scale: starting scale (0–1)
 * @property {keyof EASINGS} [easing]
 * @property {'marked'|number[]} [words]  highlight: marked words, or word indexes
 * @property {string} [color]     highlight: band colour
 */
export function normalizeMotion(m, { fontSize = 64 } = {}) {
  const unit = m.unit ?? (m.effect === 'reveal' ? 'line' : 'block');
  return {
    effect: m.effect,
    unit: m.effect === 'reveal' && unit === 'block' ? 'line' : unit,
    start: m.start ?? 0,
    duration: m.duration ?? (m.effect === 'reveal' ? 18 : 12),
    stagger: m.stagger ?? (unit === 'word' ? 3 : unit === 'line' ? (m.effect === 'reveal' ? m.duration ?? 18 : 6) : 0),
    distance: m.distance ?? Math.round(fontSize * 0.5),
    from: m.from ?? 0.9,
    easing: m.easing ?? 'easeOutCubic',
    ...(m.effect === 'highlight' && { words: m.words ?? 'marked', color: m.color ?? null }),
  };
}

export function validateMotion(list = []) {
  const errors = [];
  const forbidden = ['letter', 'letters', 'char', 'chars', 'character', 'glyph', 'grapheme'];
  for (const [i, m] of list.entries()) {
    if (forbidden.includes(m.unit)) errors.push({ code: 'motion.letters-forbidden', message: `الحركة ${i + 1}: لا تُفكَّك الحروف العربية إلى عناصر مستقلة؛ استعمل الكتلة أو السطر أو الكلمة.` });
    else if (m.unit !== undefined && !UNITS.includes(m.unit)) errors.push({ code: 'motion.unit', message: `الحركة ${i + 1}: وحدة غير معروفة «${m.unit}».` });
    if (['tracking', 'letterSpacing', 'letter-spacing', 'typewriter'].includes(m.effect)) errors.push({ code: 'motion.tracking-forbidden', message: `الحركة ${i + 1}: لا تباعد حروف ولا إضافة حرف كل إطار؛ للكشف التدريجي استعمل reveal (قناع على النص المشكَّل كاملًا).` });
    else if (!EFFECTS.includes(m.effect)) errors.push({ code: 'motion.effect', message: `الحركة ${i + 1}: تأثير غير معروف «${m.effect}».` });
    for (const k of ['start', 'duration', 'stagger']) if (m[k] !== undefined && !(Number.isInteger(m[k]) && m[k] >= (k === 'duration' ? 1 : 0))) errors.push({ code: 'motion.frames', message: `الحركة ${i + 1}: ${k} عدد إطارات صحيح.` });
    if (m.easing !== undefined && !EASINGS[m.easing]) errors.push({ code: 'motion.easing', message: `الحركة ${i + 1}: تسارع غير معروف «${m.easing}».` });
  }
  if (list.filter((m) => m.effect !== 'highlight').length > 1) errors.push({ code: 'motion.one-text-motion', message: 'حركة نص واحدة لكل صندوق (مع ما شئت من التظليل).' });
  return errors;
}

// Frames from seconds, for motion written in time.
export const framesOf = (seconds, fps) => Math.round(seconds * fps);

const R = (n) => Math.round(n);
const rect = (x, y, width, height) => ({ x: R(x), y: R(y), width: R(x + width) - R(x), height: R(y + height) - R(y) });

/**
 * The pieces a unit cuts the layer into, in box coordinates (the layer is
 * the box plus room for ink). Pieces tile the layer with no gap and no
 * overlap: line slots meet at line boundaries, word slots at the middle of
 * the space between two words. In reading order.
 */
export function segmentsOf(layout, unit) {
  const L = layout.layer;
  const lines = layout.lines;
  if (unit === 'block' || !lines.length) return [{ id: 'block', kind: 'block', order: 0, slot: rect(L.x, L.y, L.width, L.height) }];
  const lineSlot = (i) => {
    const top = i === 0 ? L.y : lines[i].box.y;
    const bottom = i === lines.length - 1 ? L.y + L.height : lines[i + 1].box.y;
    return { top, bottom };
  };
  if (unit === 'line') {
    return lines.map((line, i) => {
      const { top, bottom } = lineSlot(i);
      return { id: `line-${i}`, kind: 'line', order: i, line: i, words: line.words, slot: rect(L.x, top, L.width, bottom - top) };
    });
  }
  const out = [];
  lines.forEach((line, i) => {
    const { top, bottom } = lineSlot(i);
    const ws = line.words.map((w) => layout.words[w]).filter((w) => w.box).sort((a, b) => a.box.x - b.box.x);
    ws.forEach((w, j) => {
      const left = j === 0 ? L.x : (ws[j - 1].box.x + ws[j - 1].box.width + w.box.x) / 2;
      const right = j === ws.length - 1 ? L.x + L.width : (w.box.x + w.box.width + ws[j + 1].box.x) / 2;
      out.push({ id: `word-${w.index}`, kind: 'word', order: w.index, line: i, word: w.index, slot: rect(left, top, right - left, bottom - top) });
    });
  });
  return out.sort((a, b) => a.order - b.order);
}

// Marker bands under words (merged when consecutive on one line), placed
// like the CSS marker: the lower part of the content area, a little wider.
export function bandsOf(layout, words, fontSize = layout.fontSize) {
  const content = layout.ascent + layout.descent;
  const pad = MARKER.pad * fontSize;
  const chosen = words.map((i) => layout.words[i]).filter((w) => w?.box);
  const bands = [];
  for (const w of chosen.sort((a, b) => a.index - b.index)) {
    const prev = bands[bands.length - 1];
    if (prev && prev.line === w.line && prev.last === w.index - 1) {
      prev.x0 = Math.min(prev.x0, w.box.x - pad);
      prev.x1 = Math.max(prev.x1, w.box.x + w.box.width + pad);
      prev.last = w.index;
      prev.words.push(w.index);
      continue;
    }
    bands.push({ line: w.line, last: w.index, words: [w.index], x0: w.box.x - pad, x1: w.box.x + w.box.width + pad, y0: w.box.y + MARKER.top * content, y1: w.box.y + MARKER.bottom * content });
  }
  return bands.map((b, i) => ({ id: `band-${i}`, order: i, line: b.line, words: b.words, rect: { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 } }));
}

// Bands over the marked ranges as the typesetter measured them (one rect
// per line): the same extent as the static CSS marker.
export function bandsOfMarks(layout, fontSize = layout.fontSize) {
  const pad = MARKER.pad * fontSize;
  return layout.marks
    .filter((m) => m.mark === 'highlight' || m.mark === 'accent')
    .flatMap((m) => m.rects.map((r) => ({ line: r.line, rect: { x: r.x - pad, y: r.y + MARKER.top * r.height, width: r.width + 2 * pad, height: (MARKER.bottom - MARKER.top) * r.height } })))
    .sort((a, b) => a.line - b.line || b.rect.x - a.rect.x)
    .map((b, i) => ({ id: `band-${i}`, order: i, ...b }));
}

// Words a highlight targets: the marked ones (spans with mark "highlight"
// or "accent"), or explicit indexes.
export function highlightWords(layout, spans, words) {
  if (Array.isArray(words)) return words;
  const marked = (spans ?? []).filter((s) => s.mark);
  return layout.words.filter((w) => marked.some((s) => w.start < s.end && s.start < w.end)).map((w) => w.index);
}

/**
 * Plans a motion list for a layout: normalized tracks, the pieces, the
 * bands, warnings (ink crossing into a neighbour's piece) and the extent
 * the motion needs around the layer (rise travel, scale overshoot), so the
 * scene keeps room for it.
 */
export function planMotion(layout, motions = [], { spans = [] } = {}) {
  const errors = validateMotion(motions);
  if (errors.length) return { ok: false, errors };
  const tracks = motions.map((m) => normalizeMotion(m, { fontSize: layout.fontSize }));
  const text = tracks.find((t) => t.effect !== 'highlight') ?? null;
  const segments = segmentsOf(layout, text?.unit ?? 'block');
  const warnings = [];
  if (text && text.unit !== 'block') {
    for (const seg of segments) {
      const ws = seg.kind === 'word' ? [layout.words[seg.word]] : seg.words.map((i) => layout.words[i]);
      for (const w of ws) {
        if (!w?.ink) continue;
        const s = seg.slot;
        const over = Math.max(s.x - w.ink.x, w.ink.x + w.ink.width - (s.x + s.width), s.y - w.ink.y, w.ink.y + w.ink.height - (s.y + s.height));
        if (over > 0.5) warnings.push({ code: 'motion.ink-crosses-piece', message: `حبر «${w.text}» يتجاوز قطعته بنحو ${Math.ceil(over)} بكسل: قد يُقص طرفه أثناء الحركة. زد ارتفاع السطر أو حرّك بوحدة أكبر.`, word: w.index, by: Math.ceil(over) });
      }
    }
  }
  const highlights = tracks
    .filter((t) => t.effect === 'highlight')
    .map((t) => ({ track: t, bands: t.words === 'marked' && layout.marks?.length ? bandsOfMarks(layout) : bandsOf(layout, highlightWords(layout, spans, t.words)) }));
  const L = layout.layer;
  const grow = text?.effect === 'scale' && text.easing === 'easeOutBack' ? 0.1 : 0;
  const extent = {
    x: L.x - L.width * grow / 2,
    y: L.y - L.height * grow / 2,
    width: L.width * (1 + grow),
    height: L.height * (1 + grow) + (text?.effect === 'rise' ? text.distance : 0),
  };
  const last = Math.max(0, ...tracks.map((t) => t.start + t.duration + t.stagger * Math.max(0, (t.effect === 'highlight' ? highlights.find((h) => h.track === t).bands.length : segments.length) - 1)));
  return { ok: true, direction: layout.direction ?? 'rtl', layer: layout.layer, tracks, text, segments, highlights, warnings, extent, endFrame: last };
}

/**
 * The state of every piece at a frame. `frame` is an integer frame index of
 * the timeline the motion was written for; nothing reads a clock.
 */
export function frameState(plan, frame) {
  const t = plan.text;
  const ease = t ? EASINGS[t.easing] : null;
  // Reveals and bands start at the reading start: the right edge in RTL.
  const rtl = plan.direction !== 'ltr';
  const segments = plan.segments.map((seg, i) => {
    if (!t) return { ...seg, opacity: 1, dx: 0, dy: 0, scale: 1, clip: null };
    const p = clamp01((frame - t.start - i * t.stagger) / t.duration);
    const e = ease(p);
    if (t.effect === 'fade') return { ...seg, opacity: e, dx: 0, dy: 0, scale: 1, clip: null };
    if (t.effect === 'rise') return { ...seg, opacity: e, dx: 0, dy: (1 - e) * t.distance, scale: 1, clip: null };
    if (t.effect === 'scale') return { ...seg, opacity: clamp01(p * 2), dx: 0, dy: 0, scale: t.from + (1 - t.from) * e, clip: null };
    // reveal: the shaped piece uncovered from the reading start
    return { ...seg, opacity: p > 0 ? 1 : 0, dx: 0, dy: 0, scale: 1, clip: p >= 1 ? null : { side: rtl ? 'right' : 'left', fraction: e } };
  });
  const bands = plan.highlights.flatMap(({ track, bands }) =>
    bands.map((b, i) => {
      const p = clamp01((frame - track.start - i * track.stagger) / track.duration);
      return { ...b, color: track.color, fraction: EASINGS[track.easing](p), side: rtl ? 'right' : 'left' };
    }),
  );
  const identity = (s) => s.opacity === 1 && s.dx === 0 && s.dy === 0 && s.scale === 1 && !s.clip;
  return {
    frame,
    segments,
    bands,
    settled: segments.every(identity) && bands.every((b) => b.fraction === 1),
    textSettled: segments.every(identity),
    hidden: segments.every((s) => s.opacity === 0),
  };
}
