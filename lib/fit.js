// Largest integer size in [min, max] for which fits(size) is true, else min.
// fits() must be monotonic: if a size fits, every smaller size fits too.
export function findFitSize(fits, min, max) {
  let lo = min;
  let hi = max;
  let best = min;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
