import { band } from '../core/normalization.js';
import { counterfactual } from '../core/counterfactual.js';
import { mannWhitney, median, spearman } from '../history/normalization.js';
import { OUTCOME_LABEL } from '../history/post-history.js';
import { now } from '../../studio/util.js';

// How the creator's own history shapes the engine, in two transparent ways:
//
// 1. Patterns. Posts are grouped by observable features (hook type, opening
//    length, slide count, length, CTA, publish hour…). A group becomes a
//    pattern only when both it and the comparison group have at least
//    config.history.minSample posts, the median difference is at least
//    config.history.minEffect, and a Mann–Whitney test supports it. Each
//    pattern states its effect, sample size, confidence and date range:
//    "On this account, list-format carousel covers have produced +32%
//    median shares per reach over the last 25 comparable posts."
//
// 2. Adaptive weights. With at least config.history.adaptive.minSample
//    scored posts, each blend signal's weight is multiplied by a factor
//    from its rank correlation with the account's outcomes, shrunk toward 1
//    for small samples and bounded by maxShift. Every set of factors is a
//    numbered version stored with its data range.

const T = (ar, en) => ({ ar, en });

const words = (f) => f.hook?.words ?? null;

// Observable features and their buckets. `apply` edits a feature set into
// the bucket (for the expected effect of following a pattern); features a
// content edit cannot change (publish hour, topic) have no apply.
export const PATTERN_FEATURES = [
  {
    id: 'hookType',
    feature: 'hook.type',
    value: (f) => f.hook?.type ?? null,
    bucket: (f) => (f.hook?.type ? (['list', 'question', 'warning', 'curiosity', 'how-to', 'myth'].includes(f.hook.type) ? f.hook.type : 'statement') : null),
    labels: {
      list: T('افتتاحيات القوائم المرقّمة', 'numbered-list hooks'),
      question: T('افتتاحيات السؤال', 'question hooks'),
      warning: T('افتتاحيات التحذير', 'warning hooks'),
      curiosity: T('افتتاحيات الفضول', 'curiosity hooks'),
      'how-to': T('افتتاحيات «كيف»', 'how-to hooks'),
      myth: T('افتتاحيات تصحيح الخرافات', 'myth-busting hooks'),
      statement: T('افتتاحيات العبارة المباشرة', 'plain-statement hooks'),
    },
    apply: (f, b) => (b === 'list' ? counterfactual.hookParts({ ...f, hook: { ...f.hook, type: 'list', number: true, startsWithNumber: true } }, { specificity: 0.6 }) : b === 'question' ? counterfactual.question(f) : null),
    fix: {
      list: T('افتح بعدد ما ستقدّمه («6 …»).', 'Open with the number of items you deliver ("6 …").'),
      question: T('افتح بسؤال يمس القارئ مباشرة.', 'Open with a question that concerns the reader directly.'),
    },
  },
  {
    id: 'hookLength',
    feature: 'hook.words',
    value: words,
    bucket: (f) => (words(f) === null ? null : words(f) <= 8 ? 'short' : words(f) <= 14 ? 'medium' : 'long'),
    labels: { short: T('افتتاحيات من 8 كلمات أو أقل', 'openings of 8 words or fewer'), medium: T('افتتاحيات من 9 إلى 14 كلمة', 'openings of 9–14 words'), long: T('افتتاحيات من 15 كلمة فأكثر', 'openings of 15+ words') },
    apply: (f, b) => (b === 'short' ? counterfactual.openingSentence(counterfactual.hookParts(f, { lengthFit: 1 }), 8) : null),
    fix: { short: T('اختصر الافتتاحية إلى 8 كلمات أو أقل.', 'Cut the opening to 8 words or fewer.') },
  },
  {
    id: 'slideCount',
    feature: 'carousel.slideCount',
    types: ['carousel'],
    value: (f) => f.carousel?.slideCount ?? null,
    bucket: (f) => (!f.carousel ? null : f.carousel.slideCount <= 4 ? 'few' : f.carousel.slideCount <= 7 ? 'mid' : f.carousel.slideCount <= 10 ? 'many' : 'max'),
    labels: { few: T('كاروسيلات من 4 شرائح أو أقل', 'carousels of ≤ 4 slides'), mid: T('كاروسيلات من 5 إلى 7 شرائح', '5–7 slide carousels'), many: T('كاروسيلات من 8 إلى 10 شرائح', '8–10 slide carousels'), max: T('كاروسيلات من 11 شريحة فأكثر', '11+ slide carousels') },
    apply: (f, b, config) => {
      if (!f.carousel) return null;
      const n = { few: 4, mid: 6, many: 9, max: 12 }[b];
      return { ...f, carousel: { ...f.carousel, slideCount: n, slideCountFit: band(n, config.thresholds.carousel.slides) ?? 0 } };
    },
    fix: { few: T('اجمع الفكرة في 4 شرائح أو أقل.', 'Fit the idea in 4 slides or fewer.'), mid: T('اجعل الكاروسيل بين 5 و7 شرائح.', 'Keep the carousel to 5–7 slides.'), many: T('اجعل الكاروسيل بين 8 و10 شرائح.', 'Use 8–10 slides.') },
  },
  {
    id: 'postLength',
    feature: 'text.words',
    types: ['post', 'caption', 'hook', 'article-summary', 'thread'],
    value: (f) => f.text?.words ?? null,
    bucket: (f) => (!f.text ? null : f.text.words <= 40 ? 'short' : f.text.words <= 120 ? 'medium' : 'long'),
    labels: { short: T('منشورات من 40 كلمة أو أقل', 'posts of ≤ 40 words'), medium: T('منشورات من 41 إلى 120 كلمة', 'posts of 41–120 words'), long: T('منشورات من 121 كلمة فأكثر', 'posts of 121+ words') },
    fix: { short: T('اختصر المنشور إلى 40 كلمة أو أقل.', 'Keep the post to 40 words or fewer.'), medium: T('اجعل المنشور بين 41 و120 كلمة.', 'Keep the post to 41–120 words.') },
  },
  {
    id: 'question',
    feature: 'cta.question',
    value: (f) => Boolean(f.hook?.question || f.cta?.question),
    bucket: (f) => (f.hook ? (f.hook.question || f.cta?.question ? 'yes' : 'no') : null),
    labels: { yes: T('منشورات فيها سؤال للقارئ', 'posts that ask the reader a question'), no: T('منشورات بلا سؤال', 'posts without a question') },
    apply: (f, b) => (b === 'yes' ? counterfactual.question(f) : null),
    fix: { yes: T('اطرح سؤالًا محددًا على القارئ.', 'Ask the reader one specific question.') },
  },
  {
    id: 'ctaSpecific',
    feature: 'cta.specific',
    value: (f) => Boolean(f.cta?.specific),
    bucket: (f) => (f.cta ? (f.cta.specific ? 'yes' : 'no') : null),
    labels: { yes: T('دعوات تفاعل محددة', 'specific calls to action'), no: T('دعوات عامة أو غائبة', 'generic or missing calls to action') },
    apply: (f, b, config) => (b === 'yes' ? counterfactual.specificCta(f, { type: 'comment' }, config) : null),
    fix: { yes: T('اختم بسؤال يحدد الإجابة (رقم أو اختيار).', 'End with a question that bounds the answer (a number or a choice).') },
  },
  {
    id: 'intent',
    feature: 'intent.primary',
    value: (f) => f.intent?.primary ?? null,
    bucket: (f) => f.intent?.primary ?? null,
    labels: {},
    labelOf: (b) => T(`محتوى من نوع «${b}»`, `${b} content`),
    fix: {},
  },
  {
    id: 'publishHour',
    feature: 'postedHour',
    scope: 'scheduling',
    value: (f, r) => r?.postedHour ?? null,
    bucket: (f, r) => (typeof r?.postedHour !== 'number' ? null : r.postedHour >= 5 && r.postedHour < 12 ? 'morning' : r.postedHour < 17 ? 'afternoon' : r.postedHour < 22 ? 'evening' : 'night'),
    labels: { morning: T('النشر صباحًا (5–11)', 'posting in the morning (5–11)'), afternoon: T('النشر ظهرًا (12–16)', 'posting in the afternoon (12–16)'), evening: T('النشر مساءً (17–21)', 'posting in the evening (17–21)'), night: T('النشر ليلًا (22–4)', 'posting at night (22–4)') },
    fix: {},
  },
];

const labelOf = (pf, b) => pf.labels[b] ?? pf.labelOf?.(b) ?? T(b, b);
const pct = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;

// rows: [{ record, features, outcomes, ratios }] where ratios[metric] is the
// post's outcome divided by its format baseline median.
export function discoverPatterns(rows, platform, metrics, config) {
  const { minSample, minEffect } = config.history;
  const out = [];
  for (const pf of PATTERN_FEATURES) {
    const applicable = rows.filter((r) => r.features && (!pf.types || pf.types.includes(r.features.type)));
    const buckets = new Map();
    for (const r of applicable) {
      const b = pf.bucket(r.features, r.record);
      if (b === null || b === undefined) continue;
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push(r);
    }
    if (buckets.size < 2) continue;
    for (const [b, group] of buckets) {
      const rest = applicable.filter((r) => !group.includes(r) && pf.bucket(r.features, r.record) !== null);
      for (const metric of metrics) {
        const g = group.map((r) => r.ratios[metric]).filter((x) => typeof x === 'number');
        const h = rest.map((r) => r.ratios[metric]).filter((x) => typeof x === 'number');
        if (g.length < minSample || h.length < minSample) continue;
        const mg = median(g);
        const mh = median(h);
        if (!mh) continue;
        const effect = mg / mh - 1;
        if (Math.abs(effect) < minEffect) continue;
        const test = mannWhitney(g, h);
        if (test.p > (config.history.maxP ?? 0.1)) continue;
        const size = Math.min(g.length, h.length);
        const confidence = Math.round(Math.min(0.95, (1 - test.p) * (size / (size + 8)) * 1.1) * 100) / 100;
        if (confidence < 0.3) continue;
        const dates = group.map((r) => r.record.postedAt).filter(Boolean).sort();
        const label = labelOf(pf, b);
        const metricLabel = OUTCOME_LABEL[metric] ?? T(metric, metric);
        out.push({
          id: `${pf.id}:${b}:${metric}`,
          members: group.map((r) => r.record.id).sort().join(','),
          feature: pf.feature,
          patternFeature: pf.id,
          bucket: b,
          bucketLabel: label,
          label,
          metric,
          effect: Math.round(effect * 1000) / 1000,
          sampleSize: g.length,
          comparisonSize: h.length,
          pValue: Math.round(test.p * 1000) / 1000,
          superiority: test.superiority === null ? null : Math.round(test.superiority * 100) / 100,
          confidence,
          dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
          scope: pf.scope ?? 'content',
          statement: {
            ar: `على هذا الحساب، حققت ${label.ar} ${pct(effect)} في وسيط ${metricLabel.ar} مقارنة ببقية المنشورات المماثلة، عبر ${g.length} منشورًا (مقابل ${h.length})${dates.length ? ` بين ${dates[0].slice(0, 10)} و${dates.at(-1).slice(0, 10)}` : ''}.`,
            en: `On this account, ${label.en} have produced ${pct(effect)} median ${metricLabel.en} versus comparable posts, over the last ${g.length} posts (vs ${h.length})${dates.length ? ` from ${dates[0].slice(0, 10)} to ${dates.at(-1).slice(0, 10)}` : ''}.`,
          },
          fix: pf.fix[b] ?? T(`اقترب من: ${label.ar}.`, `Move toward ${label.en}.`),
        });
      }
    }
  }
  // Strongest first; one entry per feature bucket (its best-supported
  // metric); one entry per set of posts (a list hook and list intent that
  // describe the same posts are one finding); and of the two sides of a
  // yes/no feature, only the one that helps.
  const best = new Map();
  const seenMembers = new Set();
  const seenFeature = new Set();
  for (const p of out.sort((a, b) => b.confidence * Math.abs(b.effect) - a.confidence * Math.abs(a.effect))) {
    const k = `${p.patternFeature}:${p.bucket}`;
    const binary = ['question', 'ctaSpecific'].includes(p.patternFeature);
    if (best.has(k) || seenMembers.has(`${p.metric}|${p.members}`) || (binary && seenFeature.has(`${p.patternFeature}|${p.metric}`))) continue;
    best.set(k, p);
    seenMembers.add(`${p.metric}|${p.members}`);
    if (binary) seenFeature.add(`${p.patternFeature}|${p.metric}`);
  }
  return [...best.values()].map(({ members, ...p }) => p);
}

// Patterns with the functions the engine needs (matching, applying).
export function livePatterns(patterns) {
  return patterns
    .filter((p) => p.scope === 'content')
    .map((p) => {
      const pf = PATTERN_FEATURES.find((x) => x.id === p.patternFeature);
      return {
        ...p,
        appliesTo: (f) => !pf.types || pf.types.includes(f.type),
        matches: (f) => pf.bucket(f) === p.bucket,
        valueOf: (f) => pf.value(f),
        apply: (f, config) => pf.apply?.(f, p.bucket, config) ?? null,
      };
    });
}

// Historical fit of one content against the account's patterns: matching
// a positive pattern raises it, missing one lowers it by half as much.
export function patternFitOf(patterns, f) {
  const relevant = patterns.filter((p) => p.appliesTo(f) && p.confidence >= 0.3);
  if (!relevant.length) return null;
  let s = 0;
  let w = 0;
  const matches = [];
  for (const p of relevant) {
    const e = Math.max(-1, Math.min(1, p.effect));
    const hit = p.matches(f);
    s += p.confidence * (hit ? e : -0.5 * e);
    w += p.confidence;
    if (hit) matches.push({ id: p.id, effect: p.effect, statement: p.statement });
  }
  const z = w ? s / w : 0;
  return { score: Math.round(50 + 50 * Math.tanh(2 * z)), confidence: Math.round(Math.min(0.9, w / relevant.length) * 100) / 100, matches, considered: relevant.length };
}

// Adaptive weights from rank correlation between each blend signal and the
// account's primary outcome ratio. `scoreRow(features)` returns the
// platform report for a historical post's features (default weights).
export function learnWeights(rows, platform, config, { scoreRow, metric }) {
  const { minSample, maxShift, shrinkK } = config.history.adaptive;
  const usable = rows.filter((r) => r.features && typeof r.ratios[metric] === 'number');
  if (usable.length < minSample) return null;
  const reports = usable.map((r) => scoreRow(r.features));
  const blend = { ...config.platforms[platform].blend.positive, ...config.platforms[platform].blend.negative };
  const factors = {};
  const correlations = {};
  for (const id of Object.keys(blend)) {
    const xs = reports.map((rep) => rep.signals[id]?.value ?? null);
    const { rho, n } = spearman(xs, usable.map((r) => r.ratios[metric]));
    if (rho === null || n < minSample) continue;
    const negative = id in config.platforms[platform].blend.negative;
    // A risk signal that correlates with good outcomes is trusted less, and
    // vice versa; positive signals move with their correlation.
    const signed = negative ? -rho : rho;
    const factor = 1 + Math.max(-maxShift, Math.min(maxShift, signed)) * (n / (n + shrinkK));
    factors[id] = Math.round(factor * 1000) / 1000;
    correlations[id] = { rho: Math.round(rho * 1000) / 1000, n };
  }
  const dates = usable.map((r) => r.record.postedAt).filter(Boolean).sort();
  return { platform, metric, factors, correlations, n: usable.length, dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null, createdAt: now() };
}

const WEIGHTS = (account, platform) => `algorithm/weights/${account}/${platform}.json`;

export function saveAdaptiveWeights(store, account, platform, learned) {
  const file = store.readJson(WEIGHTS(account, platform)) ?? { versions: [] };
  const last = file.versions.at(-1);
  const same = last && JSON.stringify(last.factors) === JSON.stringify(learned.factors);
  if (same) return last;
  const version = { ...learned, version: `${account}-${platform}-w${file.versions.length + 1}` };
  file.versions.push(version);
  store.writeJson(WEIGHTS(account, platform), file);
  return version;
}

export function loadAdaptiveWeights(store, account, platform) {
  return store?.readJson(WEIGHTS(account, platform))?.versions.at(-1) ?? null;
}
