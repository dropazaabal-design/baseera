// Basira Social Algorithm Intelligence — public API (browser-safe except
// ingestion/providers.js, which reads server-side credentials).
//
// Basira does not claim access to private platform ranking algorithms.
// Scores are estimates generated from public platform information, content
// features and account-specific historical performance.

export { createEngine, ENGINES } from './engine.js';
export { DEFAULT_CONFIG, ENGINE_VERSION, FEATURES_VERSION, mergeConfig, modelVersions } from './config.js';
export { PLATFORMS, PROVENANCE, CONTENT_TYPES, SCORE_TYPES, INTENTS, confidenceLabel, validateContentInput, validateSignal } from './types.js';
export { toContentInput, fromText, fromDesign, fromReelPlan, contentKey, allText } from './core/content-input.js';
export { extractFeatures, featureVector } from './core/feature-extractor.js';
export { textStats } from './core/text-stats.js';
export { lexicalSemantic, semanticRequest, parseSemantic, semanticWithCache, cachedSemantic, storeSemantic } from './core/semantic.js';
export { SignalRegistry, checkRegistry } from './core/signal-registry.js';
export { SIGNAL_CATALOG } from './research/signal-catalog.js';
export { SOURCES, X_PUBLIC_WEIGHTS, cite } from './research/provenance.js';
export { DISCLAIMER, explainPlatform } from './explainability/score-explanation.js';
export { formatReport } from './explainability/report-text.js';
export { PerformanceStore, AnalysisRuns, accountSlug } from './history/performance-store.js';
export { buildProfile, loadProfile, historyRows } from './history/account-profile.js';
export { METRICS, OUTCOMES, PRIMARY_OUTCOME, normalizeRecord } from './history/post-history.js';
export { median, mad, quantile, summary, robustZ, mannWhitney, spearman } from './history/normalization.js';
export { discoverPatterns, learnWeights, loadAdaptiveWeights } from './learning/adaptive-weights.js';
export { buildDataset, toCsv as datasetToCsv, toJsonl as datasetToJsonl } from './learning/feature-dataset.js';
export { trainAndEvaluate, trainLogistic, evaluate, saveModel, loadModel, validateModel } from './learning/training-interface.js';
export { parseInstagram } from './ingestion/instagram-insights.js';
export { parseFacebook } from './ingestion/facebook-insights.js';
export { parseX } from './ingestion/x-metrics.js';
export { reasonLines, effectLine } from './explainability/recommendation-reason.js';
export { HeuristicPredictor, AccountAdaptivePredictor, MLPredictor } from './learning/predictor.js';
