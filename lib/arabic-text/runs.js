import { segmentBidi } from '../bidi.js';
import { normalizeSpec } from './spec.js';

// Runs: the text cut where an isolate or a mark starts or ends, per
// paragraph ("\n"). Each run keeps its exact slice of the stored text, so
// joining the runs gives the text back unchanged (tests check it). Isolates
// come from explicit spans first; with bidi "auto", runs the detector finds
// (lib/bidi.js: Latin words, numbers, handles, links…) are added only where
// no explicit isolate already decides.

const labelOf = (t) => (/^@/.test(t) ? 'handle' : /^#/.test(t) ? 'hashtag' : /:\/\/|^www\./i.test(t) ? 'url' : /^[+\d٠-٩۰-۹][\d٠-٩۰-۹.,:%/ +\-]*$/.test(t) ? 'number' : 'latin');

// Detected LTR runs of one paragraph, in absolute indexes.
export function autoSpans(text, offset = 0) {
  const out = [];
  let pos = offset;
  for (const seg of segmentBidi(text)) {
    if (seg.ltr) out.push({ start: pos, end: pos + seg.text.length, dir: 'ltr', label: labelOf(seg.text), auto: true });
    pos += seg.text.length;
  }
  return out;
}

export function paragraphsOf(text) {
  const out = [];
  let start = 0;
  for (const line of text.split('\n')) {
    out.push({ start, end: start + line.length, text: line });
    start += line.length + 1;
  }
  return out;
}

/**
 * @returns {{ paragraphs: { start:number, end:number, runs: { start:number, end:number, text:string, dir:'ltr'|'rtl'|null, iso:number|null, mark:'accent'|'highlight'|null, label?:string }[] }[], isolates: object[], source: 'explicit'|'auto'|'mixed'|'none' }}
 */
export function buildRuns(input) {
  const spec = normalizeSpec(input);
  const text = spec.text ?? '';
  const explicitIso = spec.spans.filter((s) => s.dir);
  const marks = spec.spans.filter((s) => s.mark);
  const paragraphs = paragraphsOf(text);
  const overlaps = (a, b) => a.start < b.end && b.start < a.end;
  let isolates = explicitIso.map((s, i) => ({ ...s, id: i }));
  if (spec.bidi === 'auto') {
    const found = paragraphs.flatMap((p) => autoSpans(p.text, p.start)).filter((a) => !explicitIso.some((e) => overlaps(a, e)));
    isolates = [...isolates, ...found.map((s, i) => ({ ...s, id: explicitIso.length + i }))];
  }
  const source = !isolates.length ? 'none' : isolates.every((s) => s.auto) ? 'auto' : isolates.some((s) => s.auto) ? 'mixed' : 'explicit';

  const out = paragraphs.map((p) => {
    const cuts = new Set([p.start, p.end]);
    for (const s of [...isolates, ...marks]) {
      if (s.start > p.start && s.start < p.end) cuts.add(s.start);
      if (s.end > p.start && s.end < p.end) cuts.add(s.end);
    }
    const points = [...cuts].sort((a, b) => a - b);
    const runs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      // The innermost isolate decides (isolates nest, never cross).
      const iso = isolates.filter((s) => s.start <= start && s.end >= end).sort((a, b) => a.end - a.start - (b.end - b.start))[0] ?? null;
      const mark = marks.find((s) => s.start <= start && s.end >= end)?.mark ?? null;
      const prev = runs[runs.length - 1];
      if (prev && prev.iso === (iso?.id ?? null) && prev.mark === mark) {
        prev.end = end;
        prev.text = text.slice(prev.start, end);
        continue;
      }
      runs.push({ start, end, text: text.slice(start, end), dir: iso?.dir ?? null, iso: iso?.id ?? null, mark, ...(iso?.label && { label: iso.label }) });
    }
    return { start: p.start, end: p.end, runs };
  });
  return { paragraphs: out, isolates: isolates.map(({ id, ...s }) => s), source };
}

// Words: maximal runs of non-space characters. These are the only places
// where Arabic text may be cut into separate moving pieces: a space never
// sits inside a joined letter group.
export function wordsOf(text) {
  return [...String(text).matchAll(/\S+/g)].map((m, i) => ({ index: i, start: m.index, end: m.index + m[0].length, text: m[0] }));
}
