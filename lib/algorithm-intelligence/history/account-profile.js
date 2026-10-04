import { Library } from '../../studio/library.js';
import { DEFAULT_CONFIG, FEATURES_VERSION } from '../config.js';
import { fromDesign } from '../core/content-input.js';
import { extractFeatures } from '../core/feature-extractor.js';
import { sampleConfidence } from '../core/confidence.js';
import { discoverPatterns, learnWeights, livePatterns, patternFitOf, saveAdaptiveWeights } from '../learning/adaptive-weights.js';
import { buildBaselines } from './baseline-builder.js';
import { median, quantile, ratio } from './normalization.js';
import { OUTCOMES, PRIMARY_OUTCOME, outcomesOf } from './post-history.js';
import { PerformanceStore, accountSlug } from './performance-store.js';

// The AccountPerformanceProfile: everything the engine knows about how this
// account's posts do on one platform. Built from the performance store and
// Basira's own design library (a post linked to a design is analyzed from
// the design itself), and rebuilt only when the posts change.
//
//   content generated → published → metrics imported → profile updated →
//   the next analysis is scored against this account's own results

const PROFILE = (account, platform) => `analytics/${account}/profile.${platform}.json`;

// Features of a published post: from its Basira design when linked and
// still in the library, else from its text. Null when neither exists.
export function featuresForRecord(record, { library, config }) {
  if (record.features?.version === FEATURES_VERSION) return record.features;
  try {
    if (record.designId && library) {
      const doc = library.get(record.designId);
      if (doc) return extractFeatures(fromDesign(doc, { caption: record.text ?? undefined }), { config });
    }
    if (record.text && record.text.trim()) {
      const type = ['post', 'thread', 'caption'].includes(record.contentType) ? record.contentType : record.contentType === 'reel' ? 'reel' : 'caption';
      return extractFeatures({ type, text: record.text }, { config });
    }
  } catch {
    return null;
  }
  return null;
}

function rowsFor(posts, { library, config, perf }) {
  return posts.map((record) => {
    let features = featuresForRecord(record, { library, config });
    if (features && features !== record.features && perf) perf.setFeatures(record.id, features);
    return { record, features, outcomes: outcomesOf(record) };
  });
}

function withRatios(rows, baselines, platform) {
  for (const r of rows) {
    r.ratios = {};
    for (const m of OUTCOMES[platform]) {
      const fmt = baselines.byFormat[r.record.contentType]?.[m];
      const base = fmt?.n >= 5 ? fmt.median : baselines.account[m]?.median;
      r.ratios[m] = ratio(r.outcomes[m], base);
    }
  }
  return rows;
}

// Interquartile range of a feature among the account's best posts (top
// quartile by the primary outcome). Needs at least 20 posts with features.
export function topRangeOf(rows, path, metric) {
  const get = (f) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), f);
  const usable = rows.filter((r) => r.features && typeof r.ratios[metric] === 'number' && typeof get(r.features) === 'number');
  if (usable.length < 20) return null;
  const cut = quantile(usable.map((r) => r.ratios[metric]), 0.75);
  const top = usable.filter((r) => r.ratios[metric] >= cut);
  const vals = top.map((r) => get(r.features));
  const dates = top.map((r) => r.record.postedAt).filter(Boolean).sort();
  return { feature: path, metric, lo: Math.round(quantile(vals, 0.25)), hi: Math.round(quantile(vals, 0.75)), median: median(vals), n: top.length, of: usable.length, confidence: sampleConfidence(top.length, 20), dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null };
}

const TOP_FEATURES = ['text.firstSentenceWords', 'hook.words', 'text.words', 'carousel.slideCount', 'carousel.avgWords', 'reel.durationSec'];

// The account's posts on one platform with their features, outcomes and
// outcome ratios to the format baseline (shared by the profile, the
// dataset export and the learners).
export function historyRows({ store, account = 'default', platform, config = DEFAULT_CONFIG }) {
  const slug = accountSlug(account);
  const perf = new PerformanceStore(store, slug);
  const rows = rowsFor(perf.list({ platform }), { library: new Library(store), config, perf });
  const baselines = buildBaselines(rows, platform, config);
  withRatios(rows, baselines, platform);
  return { rows, baselines, slug, perf };
}

export function buildProfile({ store, account = 'default', platform, config = DEFAULT_CONFIG, engines = null, registry = null }) {
  const { rows, baselines, slug, perf } = historyRows({ store, account, platform, config });
  const metric = PRIMARY_OUTCOME[platform];
  const patterns = discoverPatterns(rows, platform, OUTCOMES[platform], config);
  let adaptive = null;
  if (engines && registry) {
    const scoreRow = (features) => engines[platform].score({ features, config, registry, history: null });
    const learned = learnWeights(rows, platform, config, { scoreRow, metric });
    if (learned) adaptive = saveAdaptiveWeights(store, slug, platform, learned);
  }
  const profile = {
    kind: 'account-performance-profile',
    account: slug,
    platform,
    featuresVersion: FEATURES_VERSION,
    sourceUpdatedAt: store.readJson(perf.path)?.updatedAt ?? null,
    n: rows.length,
    withFeatures: rows.filter((r) => r.features).length,
    lastAt: baselines.dateRange?.to ?? null,
    baselines,
    primaryOutcome: metric,
    patterns,
    topRanges: Object.fromEntries(TOP_FEATURES.map((p) => [p, topRangeOf(rows, p, metric)]).filter(([, v]) => v)),
    topics: Object.fromEntries(Object.entries(baselines.byTopic).map(([t, b]) => [t, { n: b.n, median: b[metric]?.median ?? null }])),
    weightsVersion: adaptive?.version ?? null,
  };
  store.writeJson(PROFILE(slug, platform), profile);
  return profile;
}

// The profile, rebuilt only when the posts changed since it was built.
export function loadProfile(store, account, platform, opts = {}) {
  const slug = accountSlug(account);
  const posts = store.readJson(`analytics/${slug}/posts.json`);
  if (!posts?.posts?.some((p) => p.platform === platform)) return null;
  const cached = store.readJson(PROFILE(slug, platform));
  if (cached && cached.sourceUpdatedAt === posts.updatedAt && cached.featuresVersion === FEATURES_VERSION) return cached;
  return buildProfile({ store, account: slug, platform, ...opts });
}

// What platform signals and rules ask of the history (see x-signals.js and
// common-recommendations.js). Null when the account has no posts there.
export function historyContext(profile) {
  if (!profile?.n) return null;
  const metric = profile.primaryOutcome;
  const patterns = livePatterns(profile.patterns ?? []);
  const account = profile.baselines.account;
  return {
    platform: profile.platform,
    n: profile.n,
    lastAt: profile.lastAt,
    patterns,
    comparable: (f) => profile.baselines.byFormat[f.type === 'caption' || f.type === 'hook' || f.type === 'article-summary' ? 'post' : f.type]?.[metric]?.n ?? 0,
    medianOf: (m) => account[m]?.median ?? profile.baselines.byFormat.post?.[m]?.median ?? null,
    topRange: (path) => profile.topRanges?.[path] ?? null,
    topicAffinity: (f) => {
      const topic = f.topics?.[0];
      const t = topic ? profile.topics?.[topic] : null;
      const base = account[metric]?.median;
      if (!t || t.n < 5 || !base || typeof t.median !== 'number') return null;
      const r = t.median / base;
      // Twice the account's median → 1, half → 0.
      return { value: Math.max(0, Math.min(1, 0.5 + 0.5 * Math.log2(r))), n: t.n, ratio: Math.round(r * 100) / 100, confidence: sampleConfidence(t.n) };
    },
    patternFit: (f) => patternFitOf(patterns, f),
  };
}

export function loadHistoryContext(store, account, platform, opts = {}) {
  return historyContext(loadProfile(store, account, platform, opts));
}
