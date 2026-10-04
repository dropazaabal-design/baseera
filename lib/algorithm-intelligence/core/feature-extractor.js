import { extractConcepts } from '../../studio/concepts.js';
import { normalizeArabic } from '../../studio/arabic.js';
import { DEFAULT_CONFIG, FEATURES_VERSION } from '../config.js';
import { allText, contentKey, toContentInput } from './content-input.js';
import { hits } from './lexicon.js';
import { band, clamp01, lowerIsBetter, round, saturate } from './normalization.js';
import { carouselFeatures, reelFeatures, threadFeatures } from './structure-features.js';
import { clean, cues, lines, sentences, startsWithNumber, textStats, tokenize } from './text-stats.js';
import { audienceFeatures } from './audience.js';
import { lexicalSemantic } from './semantic.js';

// The local, deterministic analyzer: every measurable property of the
// content, computed without any AI call. Semantic judgements (intent,
// curiosity, novelty, usefulness, CTA quality) get a lexical first pass
// here, labelled heuristic; an AI semantic pass can replace exactly that
// block later (core/semantic.js) without recomputing anything else.

// The opening a reader sees first, by content type.
export function hookTextOf(input) {
  if (input.type === 'carousel') {
    // The cover's title, with its first subtitle line when both fit in one
    // glance (≤ 14 words): «6 أعداء تدمّر دماغك يوميًا …وأنت لا تشعر».
    const cover = input.slides[0] ?? {};
    const title = String(cover.title ?? '').trim();
    const sub = String(cover.body ?? '').split('\n')[0].trim();
    return sub && tokenize(`${title} ${sub}`).length <= 14 ? `${title} ${sub}` : title;
  }
  if (input.type === 'reel' && input.scenes?.length) return input.scenes[0].text;
  if (input.type === 'thread') return sentences(input.thread?.[0] ?? '')[0] ?? '';
  const raw = String(input.text ?? '');
  const first = lines(raw)[0] ?? '';
  return tokenize(first).length >= 2 ? first : sentences(raw)[0] ?? first;
}

export function hookFeatures(hookText, config = DEFAULT_CONFIG) {
  const t = clean(hookText);
  const stats = textStats(t);
  const c = cues(t);
  // A question mark, or a question word that opens the line («لماذا…»), not
  // one in the middle of a statement («…كيف يمكن…»).
  const first = tokenize(t)[0] ?? '';
  const question = stats.questions > 0 || (first && cues(first).question > 0);
  const number = startsWithNumber(t) || stats.numbers > 0;
  const types = [];
  if (startsWithNumber(t) || (number && tokenize(t).slice(0, 3).some((w) => /[0-9٠-٩]/.test(w)))) types.push('list');
  if (question) types.push('question');
  if (c.myth) types.push('myth');
  if (c.warning) types.push('warning');
  if (c.tutorial) types.push('how-to');
  if (c.curiosity || stats.ellipses) types.push('curiosity');
  const type = types[0] ?? 'statement';
  const lengthFit = band(stats.words, config.thresholds.hookWords) ?? 0;
  const curiosity = clamp01(saturate(c.curiosity + stats.ellipses, 1) * 0.7 + (question ? 0.3 : 0));
  const tension = clamp01((c.warning ? 0.5 : 0) + (question ? 0.3 : 0) + (c.contrast ? 0.2 : 0));
  // A heuristic composite; each part is reported so the score can be explained.
  const parts = {
    lengthFit: round(lengthFit),
    curiosity: round(curiosity),
    specificity: round(number ? Math.max(0.6, stats.specificity) : stats.specificity),
    directAddress: round(saturate(stats.directAddress, 1)),
    tension: round(tension),
    clarity: round(lowerIsBetter(stats.longWordRatio, 0.2, 0.5) ?? 1),
  };
  const strength = hookStrengthOf(parts);
  return { text: t, words: stats.words, chars: stats.chars, type, types, question, number, startsWithNumber: startsWithNumber(t), warning: c.warning > 0, curiosityCues: c.curiosity, directAddress: stats.directAddress, emotionalIntensity: stats.emotionalIntensity, parts, strength: round(strength) };
}

// Heuristic weights of the hook composite (each part 0..1).
export const HOOK_MIX = { lengthFit: 0.25, curiosity: 0.2, specificity: 0.2, directAddress: 0.15, tension: 0.1, clarity: 0.1 };
export const hookStrengthOf = (parts) => round(Object.entries(HOOK_MIX).reduce((s, [k, w]) => s + w * (parts[k] ?? 0), 0));

// The call to action: where it is, what it asks, and whether it is specific.
export function ctaFeatures(input) {
  let candidates;
  if (input.type === 'carousel') candidates = [{ text: [input.slides.at(-1)?.title, input.slides.at(-1)?.body, ...(input.slides.at(-1)?.items ?? [])].filter(Boolean).join('\n'), where: 'end' }, ...(input.caption ? [{ text: lines(input.caption).slice(-2).join('\n'), where: 'caption' }] : [])];
  else if (input.type === 'reel' && input.scenes?.length) candidates = [{ text: input.scenes.at(-1).text, where: 'end' }, ...input.scenes.slice(0, 2).map((s) => ({ text: s.text, where: 'early' })), ...(input.caption ? [{ text: input.caption, where: 'caption' }] : [])];
  else {
    const raw = input.type === 'thread' ? (input.thread ?? []).at(-1) ?? '' : String(input.text ?? '');
    const ls = lines(raw);
    candidates = [{ text: ls.slice(-2).join('\n'), where: 'end' }, { text: ls.slice(0, 1).join('\n'), where: 'start' }];
  }
  for (const cand of candidates) {
    const tokens = tokenize(cand.text);
    const normalized = normalizeArabic(clean(cand.text));
    const kinds = ['ctaComment', 'ctaSave', 'ctaShare', 'ctaFollow', 'ctaClick'].map((k) => [k, hits(k, tokens, normalized).n]).filter(([, n]) => n > 0);
    const question = /[?؟]/.test(cand.text);
    if (!kinds.length && !question) continue;
    const kind = kinds.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ctaComment';
    // The CTA itself: the last sentence or line that asks or names an action.
    const parts = sentences(cand.text).concat(lines(cand.text)).filter((x) => /[?؟]/.test(x) || ['ctaComment', 'ctaSave', 'ctaShare', 'ctaFollow', 'ctaClick'].some((k) => hits(k, tokenize(x), normalizeArabic(clean(x))).n));
    const ctaText = clean(parts.sort((a, b) => cand.text.lastIndexOf(b) - cand.text.lastIndexOf(a))[0] ?? cand.text);
    const type = { ctaComment: 'comment', ctaSave: 'save', ctaShare: 'share', ctaFollow: 'follow', ctaClick: 'click' }[kind];
    const generic = hits('genericCta', tokens, normalized).n > 0;
    const bait = hits('bait', tokens, normalized).n > 0;
    // Specific: a question that limits the answer (which / how many / a number).
    const specific = !generic && question && (/(^|\s)(أي|اي|أيهما|ايهما|كم)(\s|$)/.test(cand.text) || /رقم|اختر|كلمة/.test(normalized));
    return { present: true, type, where: cand.where, text: ctaText, question, generic, specific, bait, words: tokenize(ctaText).length };
  }
  return { present: false, type: null, where: null, text: '', question: false, generic: false, specific: false, bait: false, words: 0 };
}

// Intent scores from surface cues (heuristic; an AI pass may replace them).
export function intentScores(text, { hook, carousel } = {}) {
  const c = cues(text);
  const s = textStats(text);
  const sat = (n) => saturate(n, 1);
  const scores = {
    list: clamp01((hook?.startsWithNumber ? 0.6 : 0) + (s.numberedList ? 0.4 : 0) + (carousel?.progression?.sequential ? 0.4 : 0)),
    tutorial: sat(c.tutorial) * 0.9,
    education: clamp01(sat(c.education) * 0.7 + sat(c.research) * 0.3),
    warning: sat(c.warning),
    'myth-busting': sat(c.myth),
    comparison: sat(c.comparison) * 0.8,
    motivation: sat(c.motivation),
    story: sat(c.story) * 0.8,
    opinion: sat(c.opinion),
    news: sat(c.news) * 0.7,
    entertainment: sat(c.entertainment),
    controversy: sat(c.controversy),
    'personal-insight': clamp01(sat(c.personal) + 0.5 * sat(c.maxim)),
  };
  for (const k of Object.keys(scores)) scores[k] = round(scores[k]);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { scores, primary: ranked[0][1] > 0.2 ? ranked[0][0] : 'education', secondary: ranked.slice(1).filter(([, v]) => v >= 0.5).map(([k]) => k) };
}

// Full feature set of one content input. `semantic` (optional) replaces the
// lexical semantic block, e.g. a cached AI result for the same content key.
export function extractFeatures(rawInput, { config = DEFAULT_CONFIG, semantic } = {}) {
  const input = toContentInput(rawInput);
  const text = allText(input);
  const body = textStats(text);
  const hook = hookFeatures(hookTextOf(input), config);
  const cta = ctaFeatures(input);
  const carousel = input.type === 'carousel' ? carouselFeatures(input, config) : null;
  const reel = input.type === 'reel' ? reelFeatures(input, config) : null;
  const thread = input.type === 'thread' ? threadFeatures(input, config) : null;
  const caption = input.caption ? textStats(input.caption) : null;
  const intent = intentScores(text, { hook, carousel });
  // Topics from what the piece is about (topic, titles), not every word on
  // every slide, so a CTA's «اكتب في التعليقات» does not make it «marketing».
  const topics = extractConcepts(input.type === 'carousel' ? `${input.topic ?? ''} ${input.slides.map((s) => `${s.kicker ?? ''} ${s.title ?? ''}`).join(' ')}` : `${input.topic ?? ''} ${text}`);
  const sem = semantic ?? lexicalSemantic({ text, body, hook, cta, intent, carousel });
  const features = {
    version: FEATURES_VERSION,
    key: contentKey(input),
    type: input.type,
    text: body,
    hook,
    cta,
    intent: semantic?.intent ? { ...intent, ...semantic.intent, provenance: semantic.provenance } : { ...intent, provenance: 'heuristic' },
    topics: semantic?.topics?.length ? semantic.topics : topics,
    semantic: sem,
    caption,
    carousel,
    reel,
    thread,
    meta: input.meta ?? {},
  };
  features.audience = audienceFeatures(features);
  return features;
}

// Numeric view of the features for datasets and ML predictors: flat keys,
// numbers only (booleans as 0/1), missing parts omitted.
export function featureVector(features) {
  const out = {};
  const put = (prefix, obj) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
      else if (typeof v === 'boolean') out[key] = v ? 1 : 0;
    }
  };
  put('text', features.text);
  put('hook', features.hook);
  put('hook.parts', features.hook.parts);
  put('cta', features.cta);
  put('intent', features.intent.scores);
  put('semantic', features.semantic);
  put('audience', features.audience);
  if (features.carousel) put('carousel', features.carousel);
  if (features.reel) put('reel', features.reel);
  if (features.thread) put('thread', features.thread);
  out[`type.${features.type}`] = 1;
  return out;
}
