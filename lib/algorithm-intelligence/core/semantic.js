import { INTENTS } from '../types.js';
import { allText } from './content-input.js';
import { clamp01, round, saturate } from './normalization.js';
import { cues, sentences, textStats } from './text-stats.js';

// The semantic layer: the only part of an analysis that may use an AI
// model. It judges curiosity, emotional framing, novelty, perceived
// usefulness, CTA quality, quotability, intent and topics. Everything
// countable (words, density, punctuation, numbers) stays local.
//
// Two analyzers share one result shape:
//   lexicalSemantic        local word lists, free, provenance "heuristic"
//   an AI analyzer         { id, version, analyze(request) → JSON }, whose
//                          result is validated and cached by content key,
//                          provenance "derived" (a model judgement)
// Results are cached in the studio cache under kind "semantic", keyed by
// the content key and the analyzer, so unchanged content never triggers a
// second call. Every AI call is recorded in the ledger as "ai.semantic".

export const SEMANTIC_VERSION = 1;
export const SEMANTIC_FIELDS = ['curiosity', 'emotion', 'novelty', 'usefulness', 'ctaQuality', 'quotability'];

export function lexicalSemantic({ text, body, hook, cta, intent }) {
  const c = cues(text);
  const quotable = sentences(text).filter((s) => {
    const st = textStats(s);
    const sc = cues(s);
    // A short sentence that stands alone: a contrast, a strong word, or a
    // two-clause maxim («كلما … ، …»).
    const twoClauses = /[،,]/.test(s) && sc.maxim > 0;
    return st.words >= 5 && st.words <= 14 && (sc.contrast > 0 || st.emotionalCues > 0 || sc.warning > 0 || twoClauses);
  }).length;
  const best = (...ks) => Math.max(...ks.map((k) => intent.scores[k] ?? 0));
  return {
    curiosity: round(clamp01(0.6 * hook.parts.curiosity + 0.2 * (hook.number ? 1 : 0) + 0.2 * saturate(body.curiosityCues, 2))),
    emotion: round(Math.max(body.emotionalIntensity * 0.7, hook.emotionalIntensity)),
    novelty: round(clamp01(0.5 * saturate(c.myth, 1) + 0.3 * saturate(c.contrast, 2) + 0.2 * saturate(c.research, 1))),
    usefulness: round(clamp01(0.35 * best('education', 'tutorial', 'list') + 0.25 * saturate(body.imperatives, 1) + 0.2 * body.specificity + 0.2 * (intent.scores.warning ?? 0))),
    ctaQuality: round(!cta.present ? 0.2 : cta.bait ? 0.1 : cta.specific ? 0.95 : cta.generic ? 0.35 : 0.6),
    quotability: round(saturate(quotable, 1)),
    provenance: 'heuristic',
    source: 'local-lexicon',
    version: SEMANTIC_VERSION,
  };
}

// What an AI analyzer is asked. The content is sent once, compactly; the
// answer must be JSON with the listed fields, each 0..1.
export function semanticRequest(input, features) {
  return {
    version: SEMANTIC_VERSION,
    instructions:
      'Judge this Arabic social-media content. Return JSON only: {"curiosity":0..1,"emotion":0..1,"novelty":0..1,"usefulness":0..1,' +
      '"ctaQuality":0..1,"quotability":0..1,"intent":{"primary":"<one of the intents>","secondary":["…"]},"topics":["…"],"notes":"<one sentence>"}. ' +
      'curiosity = an open question the reader wants answered; emotion = emotional framing strength; novelty = how unexpected the claim is ' +
      'for a general Arabic audience; usefulness = practical value to keep or apply; ctaQuality = how specific and natural the call to ' +
      'action is (0.2 if none); quotability = a line worth quoting alone. Do not judge length, density or formatting: those are measured locally.',
    intents: INTENTS,
    content: { type: features.type, hook: features.hook.text, cta: features.cta.text, text: allText(input).slice(0, 6000) },
  };
}

export function parseSemantic(answer, { analyzerId = 'ai', model = null } = {}) {
  const data = typeof answer === 'string' ? JSON.parse(answer.replace(/^```(?:json)?|```$/g, '').trim()) : answer;
  const out = {};
  for (const f of SEMANTIC_FIELDS) {
    const v = Number(data?.[f]);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`semantic result: ${f} must be a number 0..1`);
    out[f] = round(v);
  }
  const primary = INTENTS.includes(data?.intent?.primary) ? data.intent.primary : null;
  return {
    ...out,
    ...(primary && { intent: { primary, secondary: (data.intent.secondary ?? []).filter((x) => INTENTS.includes(x)) } }),
    topics: Array.isArray(data?.topics) ? data.topics.filter((t) => typeof t === 'string').slice(0, 8) : [],
    notes: typeof data?.notes === 'string' ? data.notes.slice(0, 300) : '',
    provenance: 'derived',
    source: `ai:${analyzerId}${model ? `/${model}` : ''}`,
    version: SEMANTIC_VERSION,
  };
}

// Cached semantic result for a content key, or null. `studio` is an open
// studio (lib/studio/studio.js): its cache and ledger are reused.
export function cachedSemantic(studio, contentKeyHash, analyzerId) {
  if (!studio?.cache) return null;
  const key = studio.cache.key('semantic', { content: contentKeyHash, analyzer: analyzerId }, { version: SEMANTIC_VERSION });
  return studio.cache.get('semantic', key);
}

export function storeSemantic(studio, contentKeyHash, analyzerId, result, { tokens = null, costUsd = null, durationMs = null, tool = null } = {}) {
  if (!studio?.cache) return result;
  const key = studio.cache.key('semantic', { content: contentKeyHash, analyzer: analyzerId }, { version: SEMANTIC_VERSION });
  studio.cache.set('semantic', key, result, { deps: { analyzer: analyzerId } });
  studio.ledger?.record({ kind: 'ai.semantic', tool: tool ?? analyzerId, tokens, costUsd, durationMs, note: contentKeyHash.slice(0, 12) });
  return result;
}

// Runs an AI analyzer once per content key; later calls hit the cache.
export async function semanticWithCache(studio, input, features, analyzer) {
  if (!analyzer) return null;
  const hit = cachedSemantic(studio, features.key, analyzer.id);
  if (hit) return hit;
  const t0 = Date.now();
  const raw = await analyzer.analyze(semanticRequest(input, features));
  const result = parseSemantic(raw.answer ?? raw, { analyzerId: analyzer.id, model: raw.model ?? analyzer.model ?? null });
  return storeSemantic(studio, features.key, analyzer.id, result, { tokens: raw.tokens ?? null, costUsd: raw.costUsd ?? null, durationMs: Date.now() - t0 });
}
