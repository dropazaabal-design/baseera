import { REEL_LIMITS } from '../studio/canva/reel.js';
import { clone, isObject } from '../studio/util.js';

// Every number the engine scores with lives here, so platform knowledge
// can change without touching the engine. Three groups:
//
//   thresholds   measurement → 0..1 curves (heuristic unless noted)
//   platforms    per platform: which signals feed each score type, and how
//                the overall Platform Fit Score blends positive actions,
//                negative actions, content quality and account history
//   confidence   how much each provenance and amount of history is trusted
//
// Platform profiles are independent: Facebook does not reuse Instagram's
// weights. Weights are Basira's own choices (provenance "heuristic"); the
// public X weights live in research/provenance.js for reference only.
// Bump a platform's modelVersion whenever its weights or signals change, so
// stored scores stay comparable only within a version.

export const ENGINE_VERSION = 'basira-ai-engine-1';
export const FEATURES_VERSION = 1;

export const DEFAULT_CONFIG = {
  thresholds: {
    // [hardLow, low, high, hardHigh] bands: full marks inside [low, high].
    hookWords: [2, 4, 12, 18],
    openingSentence: { good: 18, bad: 35 },
    sentenceWords: { good: 18, bad: 32 },
    postWords: [3, 12, 120, 320],
    carousel: {
      slides: [2, 5, 10, 15],
      // Words a slide can carry and still read on a phone (1080 px wide).
      density: { cover: { ideal: 12, max: 20 }, body: { ideal: 30, max: 45 }, cta: { ideal: 18, max: 30 } },
      strongestLateFrom: 4,
    },
    reel: {
      wordsPerSecond: 2.5,
      hookWords: REEL_LIMITS.hookWords,
      firstSeconds: 3,
      duration: [5, 10, 35, 60],
      minScene: REEL_LIMITS.minScene,
    },
    x: { maxLength: 280 },
    instagram: { captionPreviewChars: 125 },
    facebook: { showMoreChars: 250 },
    hashtagsMany: 6,
  },

  // Where each threshold comes from, for explanations.
  thresholdProvenance: {
    'x.maxLength': { provenance: 'official', note: 'X: 280 characters per post without a subscription' },
    'reel.hookWords': { provenance: 'heuristic', note: 'Basira reel planner limit (lib/studio/canva/reel.js)' },
    default: { provenance: 'heuristic', note: "Basira's phone-reading rules of thumb" },
  },

  platforms: {
    x: {
      modelVersion: 'basira-x-v1',
      scoreTypes: {
        hook: { 'x.hook_strength': 2, 'x.opening_fit': 1 },
        retention: { 'x.dwell_potential': 1 },
        conversation: { 'x.reply_potential': 2, 'x.quote_potential': 1 },
        share: { 'x.repost_potential': 1, 'x.share_potential': 1 },
        save: { 'x.bookmark_potential': 1 },
        click: { 'x.profile_click_potential': 1, 'x.follow_potential': 1, 'x.click_potential': 1 },
        contentQuality: { 'x.clarity': 1, 'x.specificity': 1, 'x.novelty': 1 },
        negativeRisk: { 'x.negative_feedback_risk': 1 },
        platformFit: { 'x.length_fit': 2, 'x.opening_fit': 1 },
      },
      // Score = weighted positive actions − weighted negative actions
      //       + content-quality modifier + historical account modifier.
      blend: {
        positive: {
          'x.like_potential': 1,
          'x.reply_potential': 2.5,
          'x.repost_potential': 1.5,
          'x.quote_potential': 1.5,
          'x.share_potential': 1.5,
          'x.bookmark_potential': 1,
          'x.profile_click_potential': 1,
          'x.follow_potential': 1,
          'x.dwell_potential': 1,
          'x.click_potential': 0.5,
        },
        negative: { 'x.negative_feedback_risk': 1 },
        negativeScale: 0.6,
        qualityScale: 0.2,
        fitScale: 0.1,
        historicalMaxShift: 10,
      },
    },
    instagram: {
      modelVersion: 'basira-instagram-v1',
      scoreTypes: {
        hook: { 'instagram.hook_strength': 2, 'instagram.reel_hook': 2 },
        retention: { 'instagram.carousel_completion': 2, 'instagram.time_spent_potential': 1, 'instagram.reel_completion': 2 },
        conversation: { 'instagram.comment_potential': 1 },
        share: { 'instagram.share_potential': 1 },
        save: { 'instagram.save_potential': 1 },
        click: { 'instagram.profile_visit_potential': 1 },
        contentQuality: { 'instagram.content_clarity': 1, 'instagram.specificity': 1, 'instagram.visual_density': 1 },
        negativeRisk: { 'instagram.skip_risk': 1, 'instagram.negative_feedback_risk': 1 },
        platformFit: { 'instagram.format_fit': 2, 'instagram.visual_density': 1, 'instagram.caption_fit': 1 },
      },
      blend: {
        positive: {
          'instagram.share_potential': 2,
          'instagram.save_potential': 1.5,
          'instagram.comment_potential': 1,
          'instagram.profile_visit_potential': 1,
          'instagram.carousel_completion': 1.5,
          'instagram.time_spent_potential': 1,
          'instagram.reel_completion': 1.5,
          'instagram.hook_strength': 1,
          'instagram.reel_hook': 1,
        },
        negative: { 'instagram.skip_risk': 1, 'instagram.negative_feedback_risk': 1 },
        negativeScale: 0.5,
        qualityScale: 0.2,
        fitScale: 0.1,
        historicalMaxShift: 10,
      },
    },
    facebook: {
      modelVersion: 'basira-facebook-v1',
      scoreTypes: {
        hook: { 'facebook.hook_strength': 2 },
        retention: { 'facebook.watch_retention': 2, 'facebook.show_more_potential': 1 },
        conversation: { 'facebook.meaningful_comment_potential': 2, 'facebook.conversation_potential': 1 },
        share: { 'facebook.share_potential': 1 },
        save: {},
        click: { 'facebook.click_potential': 1 },
        contentQuality: { 'facebook.caption_readability': 1, 'facebook.specificity': 1 },
        negativeRisk: { 'facebook.scroll_past_risk': 1, 'facebook.negative_feedback_risk': 1.5 },
        platformFit: { 'facebook.format_fit': 1, 'facebook.caption_readability': 1 },
      },
      blend: {
        positive: {
          'facebook.meaningful_comment_potential': 2,
          'facebook.share_potential': 2,
          'facebook.conversation_potential': 1,
          'facebook.show_more_potential': 0.5,
          'facebook.click_potential': 0.5,
          'facebook.watch_retention': 1.5,
          'facebook.hook_strength': 1,
        },
        negative: { 'facebook.scroll_past_risk': 1, 'facebook.negative_feedback_risk': 1.5 },
        negativeScale: 0.5,
        qualityScale: 0.2,
        fitScale: 0.1,
        historicalMaxShift: 10,
      },
    },
  },

  // Signal on/off switches and weight overrides, by signal id:
  // { "x.quote_potential": { enabled: false } } or { weight: 2 }.
  signals: {},

  confidence: {
    // Trust in a value by where it comes from (before history).
    provenance: { official: 0.6, 'public-source-code': 0.55, research: 0.5, historical: 0.7, derived: 0.6, heuristic: 0.35 },
    // Without account history a platform score never reads above this.
    genericCap: 0.44,
    historyFullAt: 40,
    recencyHalfLifeDays: 120,
  },

  history: {
    minSample: 8,
    minEffect: 0.1,
    // A pattern is reported only when a Mann–Whitney test supports it.
    maxP: 0.1,
    recentDays: 45,
    recentPosts: 20,
    adaptive: { minSample: 20, maxShift: 0.3, shrinkK: 30 },
  },
};

// Deep merge of an override into the defaults (arrays replace).
export function mergeConfig(base = DEFAULT_CONFIG, override = {}) {
  const out = clone(base);
  const walk = (dst, src) => {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (isObject(v) && isObject(dst[k])) walk(dst[k], v);
      else dst[k] = clone(v);
    }
  };
  walk(out, override);
  return out;
}

export function modelVersions(config = DEFAULT_CONFIG) {
  return Object.fromEntries(Object.entries(config.platforms).map(([p, c]) => [p, c.modelVersion]));
}
