// Reel timeline: scene timing, staggered element entrances, and per-frame
// motion values. Pure functions only, so the preview player and the
// encoder compute exactly the same frame for the same time.

export const REEL = {
  duration: 14,
  fps: 30,
  hook: 2, // the first scene is short and fast: the hook must land in 1–2 s
  cta: 2.5,
  wordsPerSecond: 3.3, // skim speed for short Arabic social copy
};

// Entrance pacing per scene role. Every element must be in by 40% of the
// scene so most of it is spent readable, not animating.
const PACE = {
  hook: { lead: 0, stagger: 0.1, length: 0.35 },
  content: { lead: 0.15, stagger: 0.2, length: 0.45 },
  cta: { lead: 0.15, stagger: 0.18, length: 0.4 },
};

const readTime = (words) => 0.6 + words / REEL.wordsPerSecond;
const MIN_SCENE = 1.5;

// scenes: [{ layers: number of animated elements, words: word count }]
export function buildTimeline(scenes, { duration = REEL.duration } = {}) {
  const n = scenes.length;
  const hook = n === 1 ? duration : Math.min(REEL.hook, duration / n);
  const cta = n === 2 ? duration - hook : n > 2 ? Math.min(REEL.cta, (duration - hook) / (n - 1)) : 0;

  // Content scenes share the remaining time in proportion to how long they
  // take to read, on top of a floor that keeps every cut watchable.
  const content = scenes.slice(1, -1).map((s) => readTime(s.words));
  const available = duration - hook - cta;
  const floor = content.length ? Math.min(MIN_SCENE, available / content.length) : 0;
  const weight = content.reduce((a, b) => a + b, 0);
  const lengths = [hook, ...content.map((w) => floor + ((available - floor * content.length) * w) / weight), cta];

  let start = 0;
  return {
    duration,
    scenes: scenes.map((scene, i) => {
      const role = i === 0 ? 'hook' : i === n - 1 ? 'cta' : 'content';
      const length = n === 1 ? duration : lengths[i === n - 1 ? lengths.length - 1 : i];
      const end = i === n - 1 ? duration : start + length;
      const pace = PACE[role];
      const stagger = scene.layers > 1 ? Math.max(0, Math.min(pace.stagger, (length * 0.4 - pace.lead) / (scene.layers - 1))) : 0;
      const layers = Array.from({ length: scene.layers }, (_, j) => ({ start: start + pace.lead + j * stagger, length: pace.length }));
      // Only content scenes are held to reading time: the hook and the CTA
      // are glance scenes with fixed, deliberately short lengths.
      const needed = readTime(scene.words);
      const result = { role, start, end, layers, readTime: needed, tooFast: role === 'content' && end - start < needed - 1e-9 };
      start = end;
      return result;
    }),
  };
}

export function sceneIndexAt(timeline, t) {
  const i = timeline.scenes.findIndex((s) => t < s.end);
  return i === -1 ? timeline.scenes.length - 1 : i;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const easeOut = (x) => 1 - (1 - x) ** 3;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

// Whole elements only: Arabic letters join their neighbours, so text is
// never animated letter by letter.
export function layerMotion(effect, timing, t) {
  const p = clamp01((t - timing.start) / timing.length);
  const e = easeOut(p);
  if (effect === 'pop') return { opacity: easeOut(clamp01(p * 2)), dy: 0, scale: 0.8 + 0.2 * easeOutBack(p) };
  if (effect === 'fade') return { opacity: e, dy: 0, scale: 1 };
  return { opacity: e, dy: (1 - e) * 64, scale: 1 }; // rise
}

// A short push-in on every cut keeps the frame moving; stronger on the hook.
export function sceneZoom(scene, t) {
  const p = clamp01((t - scene.start) / 0.6);
  return 1 + (scene.role === 'hook' ? 0.08 : 0.03) * (1 - easeOut(p));
}

export function countWords(data) {
  return Object.values(data ?? {})
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => typeof v === 'string' && !v.startsWith('data:'))
    .reduce((sum, text) => sum + text.replace(/\*/g, '').split(/\s+/).filter(Boolean).length, 0);
}
