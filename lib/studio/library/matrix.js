import { COMPOSITIONS } from '../compositions.js';
import { hashOf } from '../util.js';
import { VERSIONS } from '../budget.js';
import { SAMPLES, SEQUENCE } from './samples.js';
import { styleVisual } from '../styles.js';

// Style × composition compatibility (docs/library/matrix.json, written by
// scripts/style-qa.mjs). A pair's status is earned, never derived from the
// product of styles and compositions:
//   not_claimed   the style does not declare the composition's role/format
//   failed        an automated check failed (quality gate, browser overflow)
//   needs_review  automated checks passed; nobody has looked at it since the
//                 last change to the style, composition or samples
//   ready         passed, rendered, and a recorded review says ready for
//                 the current fingerprint
//   unsuitable    passed, but the review found it does not work

// Composition → the content role a style must claim. The collage (tilted,
// taped cut-outs) is its own role: only collage styles claim it. The stat
// page is the evidence role (a figure with its source).
export const ROLE_OF = { hero: 'cover', collage: 'collage', list: 'list', post: 'list', quote: 'quote', comparison: 'comparison', statement: 'statement', numbered: 'steps', outro: 'cta', stat: 'evidence', framework: 'framework' };

export const claims = (style, compositionId, format) => style.roles.includes(ROLE_OF[compositionId]) && style.formats.includes(format);

// A review holds for what it looked at: the layout engine version, the
// style's visual fields, the composition (its code included) and the
// samples. Any change to one of them changes the fingerprint.
export function pairFingerprint(style, compositionId) {
  const comp = COMPOSITIONS[compositionId];
  return hashOf({
    engine: VERSIONS.layout,
    style: styleVisual(style),
    composition: { id: compositionId, version: comp?.version ?? null, blocks: String(comp?.blocks ?? ''), decor: String(comp?.decor ?? '') },
    samples: SAMPLES[compositionId] ?? null,
  }).slice(0, 16);
}

// The acceptance carousel as a style builds it: the cover falls back to
// the typographic one (without the cut-outs) when the style does not claim
// the collage.
export const sequencePages = (style, format = 'portrait') =>
  SEQUENCE.pages.map(({ fallback, ...p }) => {
    if (!fallback || claims(style, p.composition, format)) return p;
    // The typographic cover carries no cut-outs.
    const { art, artAlt, ...content } = p.content;
    return { ...p, composition: fallback, content };
  });

export function sequenceFingerprint(style) {
  const pages = sequencePages(style);
  const comps = [...new Set(pages.map((p) => p.composition))].map((id) => ({ id, version: COMPOSITIONS[id]?.version ?? null, blocks: String(COMPOSITIONS[id]?.blocks ?? ''), decor: String(COMPOSITIONS[id]?.decor ?? '') }));
  return hashOf({ engine: VERSIONS.layout, style: styleVisual(style), pages, comps }).slice(0, 16);
}

export function pairStatus({ claimed, automated, rendered, review, fingerprint }) {
  if (!claimed) return 'not_claimed';
  if (!automated) return 'failed';
  if (!rendered || !review || review.fingerprint !== fingerprint) return 'needs_review';
  if (review.verdict === 'ready') return 'ready';
  if (review.verdict === 'unsuitable') return 'unsuitable';
  return 'needs_review';
}

// A style's status may claim preview_verified or reusable only when every
// pair it claims is ready in the matrix; reusable also needs every format it
// declares in the matrix and the acceptance carousel reviewed ready.
// Returns the problems; empty means the claim holds.
export function styleClaimProblems(style, matrix) {
  if (!['preview_verified', 'reusable'].includes(style.status)) return [];
  const pairs = (matrix?.pairs ?? []).filter((p) => p.style === style.id && p.claimed);
  const out = [];
  if (!pairs.length) out.push(`${style.id}: status ${style.status} without any QA pair`);
  for (const p of pairs) {
    if (p.status !== 'ready') out.push(`${style.id}/${p.composition}/${p.format}: ${p.status}`);
    else if (p.fingerprint !== pairFingerprint(style, p.composition)) out.push(`${style.id}/${p.composition}/${p.format}: reviewed an older version`);
  }
  if (style.status === 'reusable') {
    for (const f of style.formats) if (!pairs.some((p) => p.format === f)) out.push(`${style.id}: format ${f} not in the matrix`);
    // Reusable also means the whole carousel was built, rendered and looked at.
    const seq = matrix?.sequences?.[style.id];
    if (seq?.status !== 'ready') out.push(`${style.id}: acceptance carousel ${seq?.status ?? 'not run'}`);
    else if (seq.fingerprint !== sequenceFingerprint(style)) out.push(`${style.id}: acceptance carousel reviewed for an older version`);
  }
  return out;
}
