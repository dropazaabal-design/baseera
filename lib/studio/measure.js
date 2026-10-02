import { ARABIC_LETTERS, METRICS, OTHER_CHARS } from './metrics.js';

// Text measurement without a browser, from the calibrated advance widths in
// metrics.js. Layout, reflow and the quality gate take a `measure` function,
// so the editor can pass an exact DOM-based one instead (see
// components/studio/domMeasure.js); this estimate is the default.

export const FONT_IDS = Object.keys(METRICS);

// Calibrated line widths run ~1% short and are off by up to ~7% on one
// line; 4% extra keeps the estimate on the safe (wider) side in practice.
export const SAFETY = 1.04;

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/;
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩]/g;
const EMOJI = /\p{Extended_Pictographic}/u;

const tables = {};
function table(font, weight) {
  const byWeight = METRICS[font] ?? METRICS.cairo;
  const available = Object.keys(byWeight).map(Number);
  const w = available.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best), available[0]);
  const key = `${font}:${w}`;
  if (!tables[key]) {
    const m = byWeight[w];
    const map = new Map();
    [...ARABIC_LETTERS].forEach((ch, i) => map.set(ch, m.arabic[i]));
    [...OTHER_CHARS].forEach((ch, i) => map.set(ch, m.other[i]));
    const avgArabic = m.arabic.reduce((a, b) => a + b, 0) / m.arabic.length;
    tables[key] = { map, space: m.space, avgArabic };
  }
  return tables[key];
}

// Accent markers (*word*) are not rendered and bidi controls have no width.
export const plainText = (text) => String(text ?? '').replace(/\*/g, '').replace(BIDI_CONTROLS, '');

function charWidth(t, ch) {
  if (ch === ' ') return t.space;
  const known = t.map.get(ch);
  if (known !== undefined) return known;
  if (DIACRITICS.test(ch) || ch === '‌' || ch === '‍' || ch === '️') return 0;
  if (EMOJI.test(ch)) return 1.05;
  if (/[؀-ۿݐ-ݿﭐ-﻿]/.test(ch)) return t.avgArabic;
  return 0.55;
}

export function textWidth(text, { font = 'cairo', weight = 400, size }) {
  const t = table(font, weight);
  let em = 0;
  for (const ch of plainText(text)) em += charWidth(t, ch);
  return em * size * SAFETY;
}

// Greedy word wrap, as browsers do for Arabic (no hyphenation). A single
// word wider than the line overflows it, like `overflow-wrap: normal`.
export function wrapLines(text, style, width) {
  const t = table(style.font, style.weight);
  const spaceWidth = t.space * style.size * SAFETY;
  const lines = [];
  for (const paragraph of plainText(text).split('\n')) {
    const words = paragraph.split(/ +/).filter(Boolean);
    if (!words.length) {
      lines.push({ text: '', width: 0 });
      continue;
    }
    let current = '';
    let currentWidth = 0;
    for (const word of words) {
      const w = textWidth(word, style);
      if (current && currentWidth + spaceWidth + w > width) {
        lines.push({ text: current, width: currentWidth });
        current = word;
        currentWidth = w;
      } else {
        current = current ? `${current} ${word}` : word;
        currentWidth = current === word ? w : currentWidth + spaceWidth + w;
      }
    }
    lines.push({ text: current, width: currentWidth });
  }
  return lines;
}

// Height of a text block: browsers make every line box exactly
// lineHeight × fontSize when line-height is unitless.
export function estimateMeasure(text, style, width) {
  const lines = wrapLines(text, style, width);
  const maxLineWidth = Math.max(0, ...lines.map((l) => l.width));
  const longestWord = Math.max(0, ...plainText(text).split(/\s+/).map((w) => textWidth(w, style)));
  return {
    lines: lines.length,
    height: lines.length * style.size * (style.lineHeight ?? 1.4),
    width: maxLineWidth,
    // A word wider than the box cannot wrap: it would be clipped.
    clipped: longestWord > width + 0.5,
  };
}

// Largest integer size in [min, max] at which the text fits the box, or
// { size: min, fits: false }. Never goes below `min`: that is the
// readability floor, and overflow is reported instead (see reflow.js).
export function fitSize(text, style, box, { min, max }, measure = estimateMeasure) {
  const fits = (size) => {
    const m = measure(text, { ...style, size }, box.width);
    return m.height <= box.height + 0.5 && !m.clipped;
  };
  let lo = Math.ceil(min);
  let hi = Math.floor(max);
  if (!fits(lo)) return { size: lo, fits: false };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return { size: lo, fits: true };
}
