import { now } from '../studio/util.js';
import { DEFAULT_CONFIG, ENGINE_VERSION, mergeConfig, modelVersions } from './config.js';
import { toContentInput } from './core/content-input.js';
import { extractFeatures } from './core/feature-extractor.js';
import { mergeRecommendations, platformRecommendations } from './core/recommendation-engine.js';
import { cachedSemantic, semanticWithCache } from './core/semantic.js';
import { SignalRegistry } from './core/signal-registry.js';
import { DISCLAIMER, explainPlatform } from './explainability/score-explanation.js';
import { loadHistoryContext } from './history/account-profile.js';
import { AnalysisRuns, accountSlug } from './history/performance-store.js';
import { loadAdaptiveWeights } from './learning/adaptive-weights.js';
import { facebookEngine } from './platforms/facebook/facebook-engine.js';
import { instagramEngine } from './platforms/instagram/instagram-engine.js';
import { xEngine } from './platforms/x/x-engine.js';
import { PLATFORMS } from './types.js';
import { round } from './core/normalization.js';

// The Algorithm Intelligence engine: content in, per-platform scores,
// reasons and recommendations out.
//
//   content → features (local, deterministic; semantic block optionally from
//             a cached AI judgement)
//           → per platform: signals → score types → Platform Fit Score
//             (+ account history and adaptive weights when the store has them)
//           → explanations and recommendations with counterfactual effects
//
// Works without a store (no history, nothing persisted) and without any
// credentials or network access.

export const ENGINES = { x: xEngine, instagram: instagramEngine, facebook: facebookEngine };

export function createEngine({ store = null, studio = null, config: override = {}, accountId = 'default' } = {}) {
  const config = mergeConfig(DEFAULT_CONFIG, override);
  const baseRegistry = new SignalRegistry({ config });
  const backing = store ?? studio?.store ?? null;

  // History first (rebuilding the profile, and learning new weight factors
  // with the default weights, only when the account's posts changed), then
  // the account's latest adaptive weights for this platform.
  function contextFor(platform, account) {
    if (!backing) return { history: null, registry: baseRegistry };
    const slug = accountSlug(account);
    const history = loadHistoryContext(backing, slug, platform, { config, registry: baseRegistry, engines: ENGINES });
    const adaptive = history ? loadAdaptiveWeights(backing, slug, platform) : null;
    return { history, registry: adaptive ? baseRegistry.withAdaptive(adaptive) : baseRegistry };
  }

  function scorePlatform(platform, features, ctx) {
    const engine = ENGINES[platform];
    return engine.score({ features, config, registry: ctx.registry, history: ctx.history });
  }

  function analyzeFeatures(features, { platforms = PLATFORMS, account = accountId, lang = 'ar', recommend = true } = {}) {
    const out = {};
    const recLists = [];
    for (const platform of platforms) {
      if (!ENGINES[platform]) throw new Error(`unknown platform "${platform}" (one of ${PLATFORMS.join(', ')})`);
      const ctx = contextFor(platform, account);
      const report = scorePlatform(platform, features, ctx);
      const engine = { rescore: (edited) => scorePlatform(platform, edited, ctx) };
      const recs = recommend ? platformRecommendations({ features, report, engine, rules: ENGINES[platform].rules, config, history: ctx.history, lang }) : [];
      recLists.push(recs);
      out[platform] = { ...report, explanation: explainPlatform(report, ctx.registry, { lang }), recommendations: recs, notes: report.notes.map((n) => ({ code: n.code, provenance: n.provenance, text: n[lang] ?? n.en })) };
    }
    const scored = Object.values(out).map((r) => r.overall.score);
    const conf = Object.values(out).map((r) => r.confidence.confidence);
    return {
      engineVersion: ENGINE_VERSION,
      modelVersions: Object.fromEntries(platforms.map((p) => [p, config.platforms[p].modelVersion])),
      createdAt: now(),
      account,
      content: { type: features.type, key: features.key, meta: features.meta },
      overall: {
        // Mean of the analyzed platforms' Platform Fit Scores: a summary, not
        // a separate model.
        score: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
        label: lang === 'ar' ? 'إمكانات المحتوى إجمالًا' : 'Overall content potential',
        confidence: conf.length ? round(Math.min(...conf)) : null,
      },
      platforms: out,
      recommendations: mergeRecommendations(recLists),
      perSlide: features.carousel ? features.carousel.slides.map((s) => ({ slide: s.slide, role: s.role, words: s.words, densityScore: s.densityScore, warning: s.warning, recommendedWordReduction: s.recommendedWordReduction })) : null,
      semantic: { source: features.semantic.source, provenance: features.semantic.provenance },
      features,
      disclaimer: DISCLAIMER[lang],
    };
  }

  // Synchronous analysis with local features (and a cached AI semantic
  // result for the same content, if one exists in the store).
  function analyze(content, { type, platforms, account = accountId, lang = 'ar', semantic, analyzerId, persist = false, caption } = {}) {
    const input = toContentInput(content, { type });
    if (caption && !input.caption) input.caption = caption;
    let sem = semantic ?? null;
    if (!sem && analyzerId && studio) {
      const probe = extractFeatures(input, { config });
      sem = cachedSemantic(studio, probe.key, analyzerId);
    }
    const features = extractFeatures(input, { config, semantic: sem ?? undefined });
    const report = analyzeFeatures(features, { platforms, account, lang });
    if (persist && backing) report.run = new AnalysisRuns(backing, account).save(report);
    return report;
  }

  // Same, running an AI semantic analyzer first (once per content key).
  async function analyzeAsync(content, { analyzer, ...opts } = {}) {
    const input = toContentInput(content, { type: opts.type });
    let semantic;
    if (analyzer) {
      const features = extractFeatures(input, { config });
      semantic = await semanticWithCache(studio, input, features, analyzer);
    }
    return analyze(input, { ...opts, semantic });
  }

  return { config, registry: baseRegistry, versions: modelVersions(config), features: (c, o = {}) => extractFeatures(toContentInput(c, { type: o.type }), { config, semantic: o.semantic }), analyze, analyzeAsync, analyzeFeatures, scorePlatform: (platform, features, account = accountId) => scorePlatform(platform, features, contextFor(platform, account)) };
}
