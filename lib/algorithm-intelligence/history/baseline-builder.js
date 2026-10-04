import { OUTCOMES, outcomesOf } from './post-history.js';
import { percentileRank, ratio, robustZ, rollingMedian, summary } from './normalization.js';

// Account baselines from the account's own posts: medians, MADs and
// percentiles of each outcome, overall and by format, topic, the recent
// window and the long term, plus rolling medians for trends. A new post is
// compared with the baseline of its own format first, then the account.

const DAY = 86400000;

export function recentSlice(rows, { recentDays, recentPosts }, nowIso) {
  const cutoff = Date.parse(nowIso) - recentDays * DAY;
  const byDate = rows.filter((r) => r.record.postedAt && Date.parse(r.record.postedAt) >= cutoff);
  return byDate.length >= recentPosts ? byDate : rows.slice(-recentPosts);
}

function block(rows, metrics) {
  return Object.fromEntries(metrics.map((m) => [m, summary(rows.map((r) => r.outcomes[m]))]));
}

export function buildBaselines(rows, platform, config, nowIso = new Date().toISOString()) {
  const metrics = OUTCOMES[platform];
  const byFormat = {};
  for (const t of new Set(rows.map((r) => r.record.contentType))) byFormat[t] = block(rows.filter((r) => r.record.contentType === t), metrics);
  const byTopic = {};
  for (const r of rows) for (const t of (r.features?.topics ?? []).slice(0, 1)) (byTopic[t] ??= []).push(r);
  const dates = rows.map((r) => r.record.postedAt).filter(Boolean).sort();
  return {
    platform,
    n: rows.length,
    dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
    account: block(rows, metrics),
    byFormat,
    byTopic: Object.fromEntries(Object.entries(byTopic).map(([t, rs]) => [t, { n: rs.length, ...block(rs, metrics) }])),
    recent: block(recentSlice(rows, config.history, nowIso), metrics),
    longTerm: block(rows, metrics),
    rolling: Object.fromEntries(metrics.map((m) => [m, rollingMedian(rows.map((r) => r.outcomes[m]), 10)])),
  };
}

// How one post did against its format's baseline (falling back to the
// account's), per outcome: ratio to the median, robust z, percentile rank,
// and whether it is an outlier (|z| > 3.5 on the log scale for volumes).
export function compareToBaseline(record, baselines, rows = []) {
  const outcomes = outcomesOf(record);
  const fmt = baselines.byFormat[record.contentType];
  const out = {};
  for (const [m, v] of Object.entries(outcomes)) {
    const base = fmt?.[m]?.n >= 5 ? fmt[m] : baselines.account[m];
    const isVolume = !m.endsWith('Per1k');
    const z = robustZ(v, base, { log: isVolume });
    out[m] = {
      value: v,
      median: base?.median ?? null,
      baseline: fmt?.[m]?.n >= 5 ? 'format' : 'account',
      ratio: ratio(v, base?.median),
      robustZ: z === null ? null : Math.round(z * 100) / 100,
      percentile: percentileRank(v, rows.map((r) => r.outcomes[m])),
      outlier: z !== null && Math.abs(z) > 3.5,
    };
  }
  return out;
}
