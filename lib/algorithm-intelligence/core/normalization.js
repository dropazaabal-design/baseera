// Small numeric helpers that map measurements to 0..1 values. Every curve is
// monotone and piecewise linear so a contribution can be explained in one
// sentence ("the opening sentence is 29 words; full marks up to 18").

export const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
export const round = (x, digits = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** digits) / 10 ** digits : x);

// 1 at or below `good`, 0 at or above `bad` (good < bad): "shorter is better".
export function lowerIsBetter(x, good, bad) {
  if (!Number.isFinite(x)) return null;
  if (x <= good) return 1;
  if (x >= bad) return 0;
  return 1 - (x - good) / (bad - good);
}

// 0 at or below `low`, 1 at or above `high`: "more is better".
export function higherIsBetter(x, low, high) {
  if (!Number.isFinite(x)) return null;
  if (x <= low) return 0;
  if (x >= high) return 1;
  return (x - low) / (high - low);
}

// 1 inside [lo, hi], falling to 0 at hardLo / hardHi.
export function band(x, [hardLo, lo, hi, hardHi]) {
  if (!Number.isFinite(x)) return null;
  if (x >= lo && x <= hi) return 1;
  if (x < lo) return x <= hardLo ? 0 : (x - hardLo) / (lo - hardLo);
  return x >= hardHi ? 0 : 1 - (x - hi) / (hardHi - hi);
}

// Saturating count: 0 → 0, n → 1 - 1/(1 + n/k).
export const saturate = (n, k = 1) => (Number.isFinite(n) && n > 0 ? 1 - 1 / (1 + n / k) : 0);

// Weighted mean over entries whose value is a number; null when none are.
export function weightedMean(pairs) {
  let s = 0;
  let w = 0;
  for (const [v, wt] of pairs) {
    if (typeof v !== 'number' || !Number.isFinite(v) || !wt) continue;
    s += v * wt;
    w += wt;
  }
  return w ? s / w : null;
}
