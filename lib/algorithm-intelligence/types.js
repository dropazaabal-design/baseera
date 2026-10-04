// The engine's vocabulary and data shapes. The repository is plain ESM
// JavaScript, so shapes are JSDoc typedefs plus small runtime validators in
// the style of lib/studio/contracts.js (problems as { path, message }).

export const PLATFORMS = ['x', 'instagram', 'facebook'];

// What a signal's value rests on. A signal also records why it matters to a
// platform (`relevance`), which can have a different provenance: "X ranks
// on predicted replies" is public source code, while Basira's estimate of a
// post's reply potential is derived from its features.
export const PROVENANCE = ['official', 'public-source-code', 'research', 'historical', 'derived', 'heuristic'];

export const CONTENT_TYPES = ['post', 'carousel', 'reel', 'thread', 'caption', 'hook', 'article-summary'];

export const SCORE_TYPES = ['contentQuality', 'hook', 'retention', 'conversation', 'share', 'save', 'click', 'negativeRisk', 'platformFit', 'historicalFit'];

export const INTENTS = ['education', 'entertainment', 'controversy', 'motivation', 'story', 'opinion', 'news', 'list', 'tutorial', 'comparison', 'warning', 'myth-busting', 'personal-insight'];

export const PRIORITIES = ['high', 'medium', 'low'];

/**
 * @typedef {'x'|'instagram'|'facebook'} Platform
 * @typedef {'official'|'public-source-code'|'research'|'historical'|'derived'|'heuristic'} SignalProvenance
 *
 * @typedef {object} Slide
 * @property {string} [title]
 * @property {string} [body]
 * @property {'cover'|'body'|'cta'} [role]
 * @property {{ elements?: number, images?: number, scale?: number, fits?: boolean }} [visual]  metadata from a Basira design
 *
 * @typedef {object} Scene
 * @property {string} text            what is said or shown
 * @property {number} [durationSec]
 * @property {boolean} [visualChange]
 *
 * @typedef {object} ContentInput
 * @property {'post'|'carousel'|'reel'|'thread'|'caption'|'hook'|'article-summary'} type
 * @property {string} [text]          body of a post, caption, hook or summary
 * @property {string} [caption]       caption accompanying a carousel or reel
 * @property {Slide[]} [slides]
 * @property {Scene[]} [scenes]
 * @property {string[]} [thread]
 * @property {string} [topic]
 * @property {{ designId?: string, format?: string, brandId?: string, source?: string }} [meta]
 *
 * @typedef {object} Signal
 * @property {string} id              e.g. "x.reply_potential"
 * @property {number|null} value      0..1, null when the data does not exist
 * @property {number} confidence      0..1
 * @property {SignalProvenance} provenance
 * @property {string[]} [evidence]    feature ids the value was computed from
 * @property {string} [note]
 *
 * @typedef {object} ScoreContribution
 * @property {string} signalId
 * @property {number} contribution    points above (+) or below (−) the neutral 50
 * @property {string} explanation
 * @property {SignalProvenance} provenance
 *
 * @typedef {object} ScoreResult
 * @property {string} type            one of SCORE_TYPES
 * @property {number|null} score      0..100, null when no signal had data
 * @property {ScoreContribution[]} contributions
 *
 * @typedef {object} Recommendation
 * @property {string} id
 * @property {Platform|'all'} platform
 * @property {string} issue
 * @property {'high'|'medium'|'low'} priority
 * @property {string} reason
 * @property {string} suggestedFix
 * @property {{ scoreType: string, deltaPoints: number, basis: string }|null} expectedEffect
 * @property {number} confidence
 * @property {{ feature: string, value: any, target?: any, provenance: SignalProvenance }[]} evidence
 *
 * @typedef {object} PostRecord
 * @property {string} id              "<platform>:<postId>"
 * @property {Platform} platform
 * @property {string} postId
 * @property {string|null} postedAt   ISO
 * @property {string} contentType
 * @property {string|null} designId   Basira design, when the post came from the studio
 * @property {string|null} text
 * @property {Object<string, number|null>} metrics   only what the platform reports; null otherwise
 * @property {object|null} features   the feature vector of the published content
 * @property {string} source          'instagram-graph' | 'facebook-graph' | 'x-api' | 'csv' | 'manual' | 'legacy'
 *
 * @typedef {object} Prediction
 * @property {Platform} platform
 * @property {number} score
 * @property {number} confidence
 * @property {string} modelVersion
 *
 * @typedef {object} Predictor
 * @property {string} id
 * @property {(input: object) => Promise<Prediction>} predict
 *
 * @typedef {object} MetricsProvider
 * @property {string} id
 * @property {Platform} platform
 * @property {() => boolean} available     credentials present (never exposes them)
 * @property {(opts?: object) => Promise<PostRecord[]>} fetchPosts
 */

const problem = (path, message) => ({ path, message });

export function validateContentInput(input) {
  const out = [];
  if (!input || typeof input !== 'object') return [problem('content', 'must be an object')];
  if (!CONTENT_TYPES.includes(input.type)) out.push(problem('type', `must be one of ${CONTENT_TYPES.join(', ')}`));
  const texts = [input.text, input.caption, ...(input.thread ?? []), ...(input.slides ?? []).flatMap((s) => [s?.title, s?.body]), ...(input.scenes ?? []).map((s) => s?.text)];
  if (!texts.some((t) => typeof t === 'string' && t.trim())) out.push(problem('content', 'has no text to analyze'));
  if (input.type === 'carousel' && !Array.isArray(input.slides)) out.push(problem('slides', 'a carousel needs slides'));
  if (input.type === 'reel' && !Array.isArray(input.scenes) && typeof input.text !== 'string') out.push(problem('scenes', 'a reel needs scenes or a script'));
  if (input.type === 'thread' && input.thread && !input.thread.every((t) => typeof t === 'string')) out.push(problem('thread', 'must be strings'));
  for (const [i, s] of (input.slides ?? []).entries()) if (!s || typeof s !== 'object') out.push(problem(`slides[${i}]`, 'must be an object'));
  return out;
}

export function validateSignal(sig, path = 'signal') {
  const out = [];
  if (typeof sig?.id !== 'string') out.push(problem(`${path}.id`, 'required'));
  if (sig?.value !== null && !(typeof sig?.value === 'number' && sig.value >= 0 && sig.value <= 1)) out.push(problem(`${path}.value`, 'must be 0..1 or null'));
  if (!(typeof sig?.confidence === 'number' && sig.confidence >= 0 && sig.confidence <= 1)) out.push(problem(`${path}.confidence`, 'must be 0..1'));
  if (!PROVENANCE.includes(sig?.provenance)) out.push(problem(`${path}.provenance`, `must be one of ${PROVENANCE.join(', ')}`));
  return out;
}

export function confidenceLabel(c) {
  if (c >= 0.7) return 'high';
  if (c >= 0.45) return 'medium';
  return 'low';
}
