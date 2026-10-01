import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REEL, buildTimeline, countWords, layerMotion, sceneIndexAt, sceneZoom } from '../lib/timeline.js';

const scenes = (layers, words = 5) => layers.map((n) => ({ layers: n, words }));
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('default reel is exactly 14 s with a 2 s hook and a 2.5 s CTA', () => {
  const tl = buildTimeline(scenes([3, 5, 3, 4, 6]));
  assert.equal(tl.duration, REEL.duration);
  assert.equal(tl.scenes[0].role, 'hook');
  assert.equal(tl.scenes[0].end - tl.scenes[0].start, 2);
  assert.ok(close(tl.scenes.at(-1).end - tl.scenes.at(-1).start, 2.5));
  assert.equal(tl.scenes.at(-1).end, 14);
  for (let i = 1; i < tl.scenes.length; i++) assert.equal(tl.scenes[i].start, tl.scenes[i - 1].end);
  assert.deepEqual(tl.scenes.map((s) => s.role), ['hook', 'content', 'content', 'content', 'cta']);
});

test('the hook lands within the first second', () => {
  const [hook] = buildTimeline(scenes([4, 3, 3])).scenes;
  const lastIn = Math.max(...hook.layers.map((l) => l.start + l.length));
  assert.ok(lastIn <= 1, `hook elements finish at ${lastIn}s`);
  assert.equal(hook.layers[0].start, 0);
});

test('every element enters within the first 40% of its scene', () => {
  for (const s of buildTimeline(scenes([2, 9, 6, 3]), { duration: 10 }).scenes) {
    for (const l of s.layers) assert.ok(l.start - s.start <= 0.4 * (s.end - s.start) + 1e-9);
  }
});

test('one slide fills the whole duration; two slides split hook and CTA', () => {
  assert.deepEqual(buildTimeline(scenes([3])).scenes.map((s) => [s.role, s.start, s.end]), [['hook', 0, 14]]);
  assert.deepEqual(buildTimeline(scenes([3, 3])).scenes.map((s) => [s.role, s.start, s.end]), [['hook', 0, 2], ['cta', 2, 14]]);
});

test('scenes too short to read are flagged', () => {
  const tl = buildTimeline([{ layers: 2, words: 4 }, { layers: 4, words: 20 }, { layers: 2, words: 4 }]);
  assert.deepEqual(tl.scenes.map((s) => s.tooFast), [false, false, false]);
  const crowded = buildTimeline(Array.from({ length: 8 }, () => ({ layers: 3, words: 30 })));
  assert.ok(crowded.scenes.some((s) => s.tooFast));
});

test('content scenes get time in proportion to their reading time', () => {
  const tl = buildTimeline([{ layers: 2, words: 5 }, { layers: 4, words: 30 }, { layers: 2, words: 6 }, { layers: 2, words: 5 }]);
  const [, wordy, short] = tl.scenes.map((s) => s.end - s.start);
  assert.ok(wordy > short * 2, `${wordy} vs ${short}`);
  assert.ok(short >= 1.5);
  assert.equal(tl.scenes.at(-1).end, 14);
});

test('the hook and the CTA are never flagged as too fast', () => {
  const tl = buildTimeline([{ layers: 3, words: 40 }, { layers: 2, words: 2 }, { layers: 3, words: 40 }]);
  assert.deepEqual(tl.scenes.map((s) => s.tooFast), [false, false, false]);
});

test('sceneIndexAt maps times to scenes, clamping past the end', () => {
  const tl = buildTimeline(scenes([2, 2, 2]));
  assert.equal(sceneIndexAt(tl, 0), 0);
  assert.equal(sceneIndexAt(tl, 1.99), 0);
  assert.equal(sceneIndexAt(tl, 2), 1);
  assert.equal(sceneIndexAt(tl, 99), 2);
});

test('motion starts hidden and ends at rest for every effect', () => {
  const timing = { start: 1, length: 0.5 };
  for (const effect of ['rise', 'fade', 'pop']) {
    assert.equal(layerMotion(effect, timing, 0.9).opacity, 0, effect);
    assert.deepEqual(layerMotion(effect, timing, 2), { opacity: 1, dy: 0, scale: 1 }, effect);
  }
  assert.ok(layerMotion('rise', timing, 1.1).dy > 0);
  assert.ok(sceneZoom({ role: 'hook', start: 0 }, 0) > sceneZoom({ role: 'content', start: 0 }, 0));
  assert.equal(sceneZoom({ role: 'hook', start: 0 }, 1), 1);
});

test('countWords ignores accent markers and image data', () => {
  assert.equal(countWords({ title: 'خمس *عادات* تضاعف', items: ['واحد اثنان', ''], photo: 'data:image/png;base64,AAAA', start: 1 }), 5);
});
