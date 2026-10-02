// Original QA art for the style matrix: abstract paper cut-outs (speech
// bubbles, a sound wave, an open book). No people, faces or hands. Each SVG
// carries data-token attributes so it is recoloured by the page's theme
// like the starter illustration (lib/studio/sample.js). Written for this
// project; no external source.
import { base64Encode, utf8 } from '../util.js';

const BUBBLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200" width="240" height="200"><path d="M24 30 H216 A14 14 0 0 1 230 44 V128 A14 14 0 0 1 216 142 H92 L52 184 L58 142 H24 A14 14 0 0 1 10 128 V44 A14 14 0 0 1 24 30 Z" fill="#2E7BC5" data-token="accent"/><g fill="#FFFFFF" data-token="onAccent"><circle cx="78" cy="86" r="12"/><circle cx="120" cy="86" r="12"/><circle cx="162" cy="86" r="12"/></g></svg>`;

const WAVE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="240" height="160"><rect x="0" y="0" width="240" height="160" rx="18" fill="#FFFFFF" data-token="surface"/><g fill="#2E7BC5" data-token="accent"><rect x="30" y="66" width="14" height="28" rx="7"/><rect x="56" y="46" width="14" height="68" rx="7"/><rect x="82" y="28" width="14" height="104" rx="7"/><rect x="108" y="54" width="14" height="52" rx="7"/><rect x="134" y="36" width="14" height="88" rx="7"/><rect x="160" y="58" width="14" height="44" rx="7"/><rect x="186" y="70" width="14" height="20" rx="7"/></g></svg>`;

const QUIET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220"><path d="M30 40 H190 A12 12 0 0 1 202 52 V140 A12 12 0 0 1 190 152 H120 L84 192 L88 152 H30 A12 12 0 0 1 18 140 V52 A12 12 0 0 1 30 40 Z" fill="#FFFFFF" data-token="surface" stroke="#1C1A17" data-token-stroke="text" stroke-width="6"/><path d="M70 96 H150" stroke="#1C1A17" data-token-stroke="text" stroke-width="8" stroke-linecap="round"/></svg>`;

export const QA_ART = [
  { key: 'bubble', svg: BUBBLE, alt: 'فقاعة حوار', tags: ['حوار'] },
  { key: 'wave', svg: WAVE, alt: 'موجة صوت', tags: ['صوت'] },
  { key: 'quiet', svg: QUIET, alt: 'فقاعة صامتة', tags: ['إنصات'] },
];

export const QA_ART_PROVENANCE = { kind: 'generated', source: 'baseera QA art (hand-written SVG)', rightsNote: 'original artwork for this project' };

// Adds the pack to a studio's asset store; returns { key: assetId }.
export function seedQaArt(studio) {
  const ids = {};
  for (const a of QA_ART) {
    const { record } = studio.assets.add(`data:image/svg+xml;base64,${base64Encode(utf8(a.svg))}`, { tags: a.tags, provenance: QA_ART_PROVENANCE, name: `${a.key}.svg` });
    ids[a.key] = record.id;
  }
  return ids;
}

// Replaces "$art:key" references in a sample with asset ids.
export function withArt(content, ids) {
  const swap = (v) => (typeof v === 'string' && v.startsWith('$art:') ? ids[v.slice(5)] ?? v : Array.isArray(v) ? v.map(swap) : v);
  return Object.fromEntries(Object.entries(content).map(([k, v]) => [k, swap(v)]));
}
