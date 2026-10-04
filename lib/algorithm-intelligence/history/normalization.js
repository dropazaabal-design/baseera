// Robust statistics for account history. Social metrics are heavy-tailed:
// one viral post can triple a mean, so baselines use medians, MADs and
// percentiles, comparisons use ratios to a median and robust z-scores, and
// group differences use rank tests (Mann–Whitney U) and rank correlation
// (Spearman). No dependency; numbers only, nulls skipped.

const nums = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

export function quantile(xs, q) {
  const a = nums(xs).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

export const median = (xs) => quantile(xs, 0.5);

// Median absolute deviation (raw; × 1.4826 ≈ σ for normal data).
export function mad(xs) {
  const m = median(xs);
  if (m === null) return null;
  return median(nums(xs).map((x) => Math.abs(x - m)));
}

export function summary(xs) {
  const a = nums(xs);
  if (!a.length) return { n: 0, median: null, mad: null, p25: null, p75: null, p90: null, min: null, max: null };
  return { n: a.length, median: median(a), mad: mad(a), p25: quantile(a, 0.25), p75: quantile(a, 0.75), p90: quantile(a, 0.9), min: Math.min(...a), max: Math.max(...a) };
}

// Robust z of x against a sample summary; on a log scale for counts, so a
// post with 10× the median reach is not "30 sigma".
export function robustZ(x, s, { log = false } = {}) {
  if (typeof x !== 'number' || !s?.n || s.median === null) return null;
  const f = log ? (v) => Math.log1p(Math.max(0, v)) : (v) => v;
  const m = f(s.median);
  const spread = log ? Math.max(0.05, Math.abs(f(s.p75) - f(s.p25)) / 1.349) : Math.max(1e-9, 1.4826 * s.mad);
  return (f(x) - m) / spread;
}

export const ratio = (x, base) => (typeof x === 'number' && typeof base === 'number' && base > 0 ? x / base : null);
export const per1k = (count, exposure) => (typeof count === 'number' && typeof exposure === 'number' && exposure > 0 ? (1000 * count) / exposure : null);

export function percentileRank(x, xs) {
  const a = nums(xs);
  if (!a.length || typeof x !== 'number') return null;
  return a.filter((v) => v < x).length / a.length + a.filter((v) => v === x).length / (2 * a.length);
}

// Rolling medians over windows of `size` consecutive values (oldest first).
export function rollingMedian(xs, size = 10) {
  const a = nums(xs);
  const out = [];
  for (let i = size - 1; i < a.length; i++) out.push(median(a.slice(i - size + 1, i + 1)));
  return out;
}

const ranks = (xs) => {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
};

// Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf).
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Two-sided Mann–Whitney U test (normal approximation with tie correction)
// and the common-language effect size P(group > rest).
export function mannWhitney(a, b) {
  const x = nums(a);
  const y = nums(b);
  const n1 = x.length;
  const n2 = y.length;
  if (!n1 || !n2) return { u: null, z: null, p: 1, superiority: null };
  const all = [...x, ...y];
  const r = ranks(all);
  const r1 = r.slice(0, n1).reduce((s, v) => s + v, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const counts = new Map();
  for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ties = [...counts.values()].reduce((s, t) => s + (t ** 3 - t), 0);
  const n = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - ties / (n * (n - 1))));
  const z = sigma ? (u1 - (n1 * n2) / 2) / sigma : 0;
  return { u: u1, z, p: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))), superiority: u1 / (n1 * n2) };
}

export function spearman(a, b) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;
  if (n < 3) return { rho: null, n };
  const rx = ranks(pairs.map((p) => p[0]));
  const ry = ranks(pairs.map((p) => p[1]));
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return { rho: dx && dy ? num / Math.sqrt(dx * dy) : 0, n };
}
