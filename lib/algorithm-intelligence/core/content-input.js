import { compositionOf } from '../../studio/compositions.js';
import { plainText } from '../../studio/measure.js';
import { hashOf } from '../../studio/util.js';
import { CONTENT_TYPES, validateContentInput } from '../types.js';

// Everything the engine analyzes becomes one ContentInput (types.js): a
// plain post or caption, a thread, a carousel's slides, or a reel's scenes.
// Basira's own objects convert without loss of the parts that matter here:
// a studio design (lib/studio) keeps its kicker, title, body, items, page
// role and layout metadata; a reel plan (lib/studio/canva/reel.js) keeps
// each scene's text and planned seconds.

const text = (v) => (typeof v === 'string' ? plainText(v).trim() : '');
const join = (parts) => parts.map(text).filter(Boolean).join('\n');

// A thread typed as one text: posts separated by blank lines or "1/" marks.
export function splitThread(raw) {
  const t = String(raw ?? '').replace(/\r/g, '').trim();
  const byMarks = t.split(/\n(?=\s*\(?[0-9٠-٩]{1,2}\s*[/)]\s*)/).map((s) => s.trim()).filter(Boolean);
  if (byMarks.length > 1) return byMarks;
  return t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}

export function fromText(raw, type = 'post', extra = {}) {
  if (!CONTENT_TYPES.includes(type)) throw new Error(`unknown content type "${type}"`);
  if (type === 'thread') return { type, thread: splitThread(raw), ...extra };
  if (type === 'reel') return { type, text: String(raw ?? ''), ...extra };
  return { type, text: String(raw ?? ''), ...extra };
}

// Studio design → carousel (or a single post when it has one page).
export function fromDesign(doc, { caption } = {}) {
  if (doc?.schemaVersion !== 2 || !Array.isArray(doc.pages)) throw new Error('not a studio design (schemaVersion 2)');
  const slides = doc.pages.map((p, i) => {
    const c = p.content ?? {};
    const id = p.composition?.id;
    const type = compositionOf(id)?.type;
    const figure = typeof c.figure === 'string' ? c.figure : typeof c.number === 'string' || typeof c.number === 'number' ? String(c.number) : '';
    const title = join([figure, c.title ?? c.hook ?? c.quote]).replace(/\n/g, ' ');
    const items = [...(c.items ?? []), ...(c.points ?? []), ...(c.parts ?? []), ...(c.steps ?? [])].map(text).filter(Boolean);
    const body = join([c.subtitle, c.body, c.takeaway, ...(c.details ?? []), c.beforeLabel, ...(c.before ?? []), c.afterLabel, ...(c.after ?? []), c.author, c.cta, c.save, c.share, c.follow, c.source]);
    // Cover and outro pages say what they are; other pages are left to the
    // analyzer (a last list page that asks a question is still a CTA).
    const role = i === 0 ? 'cover' : type === 'outro' ? 'cta' : undefined;
    return {
      ...(text(c.kicker) && { kicker: text(c.kicker) }),
      title,
      body,
      ...(items.length && { items }),
      ...(role && { role }),
      visual: {
        composition: `${id}/${p.layout?.variant ?? p.composition?.variant ?? ''}`,
        elements: p.elements?.length ?? 0,
        images: p.elements?.filter((e) => e.kind === 'image').length ?? 0,
        ...(typeof p.layout?.scale === 'number' && { scale: p.layout.scale }),
        ...(typeof p.layout?.fits === 'boolean' && { fits: p.layout.fits }),
      },
    };
  });
  return {
    type: slides.length > 1 ? 'carousel' : 'post',
    ...(slides.length > 1 ? { slides } : { text: join([slides[0].kicker, slides[0].title, slides[0].body, ...(slides[0].items ?? [])]) }),
    ...(caption && { caption }),
    topic: doc.brief ?? undefined,
    meta: { designId: doc.id, format: doc.intent?.format, brandId: doc.brandId ?? undefined, platform: doc.intent?.platform, source: 'studio-design' },
  };
}

// Reel plan → scenes with their planned seconds (on-screen text, not speech).
export function fromReelPlan(plan, { caption } = {}) {
  if (plan?.kind !== 'reel-plan') throw new Error('not a reel plan');
  return {
    type: 'reel',
    scenes: plan.scenes.map((s) => ({ text: s.text.map((t) => text(t.text)).filter(Boolean).join('\n'), durationSec: s.seconds, visualChange: true, role: s.role })),
    spoken: false,
    ...(caption && { caption }),
    topic: plan.title,
    meta: { designId: plan.sourceDoc ?? undefined, source: 'reel-plan' },
  };
}

// Any accepted input → a validated ContentInput.
export function toContentInput(input, { type } = {}) {
  if (typeof input === 'string') return fromText(input, type ?? 'post');
  if (input?.schemaVersion === 2) return fromDesign(input);
  if (input?.kind === 'reel-plan') return fromReelPlan(input);
  const out = { ...input };
  if (type && !out.type) out.type = type;
  if (!out.type) out.type = out.slides ? 'carousel' : out.scenes ? 'reel' : out.thread ? 'thread' : 'post';
  if (out.type === 'thread' && !out.thread && typeof out.text === 'string') out.thread = splitThread(out.text);
  const problems = validateContentInput(out);
  if (problems.length) {
    const err = new Error(`invalid content: ${problems.map((p) => `${p.path} ${p.message}`).join('; ')}`);
    err.problems = problems;
    throw err;
  }
  return out;
}

// The parts of a content input that affect analysis, in a stable order: the
// cache key for features and semantic results. Layout metadata is included
// (it changes density), ids and timestamps are not.
export function contentKey(input) {
  const { type, text: t, caption, slides, scenes, thread, spoken } = input;
  return hashOf({ type, text: t ?? null, caption: caption ?? null, slides: slides ?? null, scenes: scenes ?? null, thread: thread ?? null, spoken: spoken ?? null });
}

// All text of an input, in reading order.
export function allText(input) {
  if (input.type === 'carousel') return input.slides.map((s) => join([s.kicker, s.title, s.body, ...(s.items ?? [])])).filter(Boolean).join('\n\n');
  if (input.type === 'reel' && input.scenes) return input.scenes.map((s) => s.text).join('\n');
  if (input.type === 'thread') return (input.thread ?? []).join('\n\n');
  return String(input.text ?? '');
}
