import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../lib/studio/store.js';
import { openStudio } from '../lib/studio/studio.js';
import { createDesign } from '../lib/studio/document.js';
import {
  createEngine,
  extractFeatures,
  textStats,
  contentKey,
  toContentInput,
  fromDesign,
  checkRegistry,
  SignalRegistry,
  SIGNAL_CATALOG,
  X_PUBLIC_WEIGHTS,
  DEFAULT_CONFIG,
  PROVENANCE,
  PerformanceStore,
  buildProfile,
  parseInstagram,
  parseFacebook,
  parseX,
  median,
  summary,
  robustZ,
  mannWhitney,
  discoverPatterns,
  ENGINES,
  storeSemantic,
  cachedSemantic,
  parseSemantic,
  trainAndEvaluate,
  MLPredictor,
  validateModel,
  formatReport,
} from '../lib/algorithm-intelligence/index.js';
import { parseCsv } from '../lib/algorithm-intelligence/ingestion/csv.js';
import { InstagramProvider, XProvider, redact } from '../lib/algorithm-intelligence/ingestion/providers.js';
import { normalizeRecord } from '../lib/algorithm-intelligence/history/post-history.js';
import { syntheticInstagram, syntheticX } from './fixtures/algorithm/synthetic-history.js';
import { LIST_POST, APHORISM, PUNCTUATION, MIXED_NUMBERS, SHORT_HOOK, LONG_HOOK, GENERIC_CTA_POST, BAIT_POST, CAROUSEL, EMPTY_SLIDE_CAROUSEL, REEL, THREAD } from './fixtures/algorithm/content-ar.js';

const BIDI = /[‎‏‪-‮⁦-⁩]/;
const withHistory = () => {
  const store = new MemoryStore();
  const studio = openStudio(store);
  const perf = new PerformanceStore(store, '@kitabwbs');
  perf.upsert(parseInstagram(syntheticInstagram()));
  perf.upsert(parseX(syntheticX()));
  return { store, studio, perf };
};
const stripTime = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'createdAt' ? undefined : v)));

// ---------------------------------------------------------------- features

test('Arabic RTL text: words, sentences and readability are measured on the logical text without adding bidi controls', () => {
  const s = textStats(LIST_POST);
  assert.equal(s.lines, 8);
  assert.equal(s.numberedList, true);
  assert.ok(s.words >= 50 && s.words <= 60, `words ${s.words}`);
  assert.ok(s.arabicRatio > 0.95);
  assert.ok(s.readability > 50 && s.readability <= 100);
  const f = extractFeatures({ type: 'post', text: LIST_POST });
  assert.equal(f.hook.text, '6 أخطاء تجعلك أقل احترامًا دون أن تشعر');
  assert.equal(f.hook.type, 'list');
  assert.ok(!BIDI.test(JSON.stringify(f)), 'no bidi controls in features');
  // Diacritics and tatweel do not split words.
  assert.equal(textStats('قُوَّةُ التَّرْكِيـــزِ').words, 2);
});

test('Arabic punctuation: ؟ counts as a question, guillemets and ellipsis do not break words', () => {
  const s = textStats(PUNCTUATION);
  assert.equal(s.questions, 1);
  assert.equal(s.ellipses, 1);
  assert.equal(s.exclamations, 1);
  assert.ok(s.sentences >= 3);
  assert.ok(s.punctuationDensity > 0.3);
  // A question word inside a statement is not a question hook.
  assert.equal(extractFeatures({ type: 'post', text: LONG_HOOK }).hook.question, false);
  assert.equal(extractFeatures({ type: 'post', text: 'لماذا تنسى ما تقرؤه بعد أسبوع' }).hook.question, true);
});

test('mixed Arabic and numbers: Western and Arabic-Indic digits, percent and units raise specificity', () => {
  const s = textStats(MIXED_NUMBERS);
  assert.ok(s.numbers >= 4, `numbers ${s.numbers}`);
  assert.ok(s.digits.latn > 0 && s.digits.arab > 0);
  assert.ok(s.units >= 3);
  assert.ok(s.specificity >= 0.6, `specificity ${s.specificity}`);
  assert.ok(textStats(APHORISM).specificity < 0.3);
});

test('short and long hooks: length fit, strength and hook type follow the measured opening', () => {
  const short = extractFeatures({ type: 'hook', text: SHORT_HOOK });
  const long = extractFeatures({ type: 'post', text: LONG_HOOK });
  assert.equal(short.hook.words, 6);
  assert.equal(short.hook.parts.lengthFit, 1);
  assert.ok(long.hook.words > 30);
  assert.equal(long.hook.parts.lengthFit, 0);
  assert.ok(short.hook.strength > long.hook.strength);
  assert.equal(long.cta.generic, true);
  assert.equal(long.cta.text, 'تابعنا للمزيد');
});

test('carousel slide density: per-slide diagnostics flag the overloaded slide with the exact reduction', () => {
  const f = extractFeatures(CAROUSEL);
  const s4 = f.carousel.slides[3];
  assert.equal(s4.slide, 4);
  assert.equal(s4.warning, 'too_dense');
  assert.equal(s4.words, 65); // kicker 2 + title 4 + body 59
  assert.equal(s4.recommendedWordReduction, s4.words - DEFAULT_CONFIG.thresholds.carousel.density.body.ideal);
  assert.ok(s4.densityScore > 100);
  assert.deepEqual(f.carousel.overloaded, [4]);
  assert.equal(f.carousel.promise.count, 6);
  assert.equal(f.carousel.promise.matches, true);
  assert.equal(f.carousel.progression.sequential, true);
  assert.equal(f.carousel.slides[0].ordinal, null, 'the cover number is a promise, not an ordinal');
  assert.equal(f.cta.generic, true);
  const e = extractFeatures(EMPTY_SLIDE_CAROUSEL);
  assert.deepEqual(e.carousel.empty, [3]);
  assert.equal(e.carousel.finalCta, true);
});

test('reel features: estimated duration, a promise in the first seconds, open loop and payoff', () => {
  const f = extractFeatures(REEL);
  assert.equal(f.reel.sceneCount, 7);
  assert.equal(f.reel.durationSource, 'estimated-speech');
  assert.ok(f.reel.durationSec > 10 && f.reel.durationSec < 25, `duration ${f.reel.durationSec}`);
  assert.equal(f.reel.firstSecondsHasPromise, true);
  assert.ok(f.reel.openLoops >= 1);
  assert.equal(f.reel.payoff, true);
  assert.equal(f.reel.ctaPlacement, 'end');
});

test('threads split on "1/" marks and are measured against the X limit', () => {
  const f = extractFeatures({ type: 'thread', text: THREAD });
  assert.equal(f.thread.posts, 4);
  assert.equal(f.thread.numbered, true);
  assert.equal(f.thread.overLimit, 0);
});

test('content keys: equal content hashes equally, any text change changes the key', () => {
  const a = contentKey(toContentInput({ type: 'post', text: APHORISM }));
  const b = contentKey(toContentInput({ type: 'post', text: APHORISM }));
  const c = contentKey(toContentInput({ type: 'post', text: `${APHORISM} ` + 'جدًا' }));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('a studio design converts to slides with kicker, items, roles and layout metadata', () => {
  const doc = createDesign({
    intent: { mode: 'carousel', format: 'portrait', pages: 3 },
    pages: [
      { composition: 'hero', content: { title: '3 عادات *للقراءة*' } },
      { composition: 'list', content: { title: 'العادات', items: ['اقرأ صباحًا', 'دوّن فكرة', 'شارك ما قرأت'] } },
      { composition: 'outro', content: { title: 'احفظه وارجع إليه' } },
    ],
  });
  const input = fromDesign(doc);
  assert.equal(input.type, 'carousel');
  assert.equal(input.slides[0].title, '3 عادات للقراءة', 'marker stars removed');
  assert.equal(input.slides[0].role, 'cover');
  assert.deepEqual(input.slides[1].items, ['اقرأ صباحًا', 'دوّن فكرة', 'شارك ما قرأت']);
  assert.equal(input.slides[2].role, 'cta');
  assert.equal(input.meta.designId, doc.id);
  const f = extractFeatures(doc);
  assert.equal(f.carousel.promise.delivered, 3);
  assert.equal(f.carousel.promise.matches, true);
});

// ----------------------------------------------------------------- scoring

test('scores are stable: the same content gives the same report', () => {
  const e = createEngine();
  assert.deepEqual(stripTime(e.analyze(CAROUSEL)), stripTime(e.analyze(CAROUSEL)));
});

test('every score decomposes into its contributions around the neutral 50', () => {
  const r = createEngine().analyze({ type: 'post', text: LIST_POST });
  for (const rep of Object.values(r.platforms)) {
    for (const s of Object.values(rep.scores)) {
      if (typeof s.score !== 'number') continue;
      const sum = 50 + s.contributions.reduce((a, c) => a + c.contribution, 0);
      assert.ok(Math.abs(sum - s.score) <= 1 + s.contributions.length * 0.05, `${rep.platform}.${s.type}: ${sum} vs ${s.score}`);
    }
    if (!rep.overall.clamped) {
      const sum = 50 + rep.overall.contributions.reduce((a, c) => a + c.contribution, 0);
      assert.ok(Math.abs(sum - rep.overall.score) <= 1 + rep.overall.contributions.length * 0.05, `${rep.platform}: ${sum} vs ${rep.overall.score}`);
    }
  }
});

test('weights live in configuration: changing one moves the score in the expected direction', () => {
  const content = { type: 'post', text: LIST_POST };
  const base = createEngine().analyze(content, { platforms: ['x'] }).platforms.x;
  const replyValue = base.signals['x.reply_potential'].value;
  assert.ok(replyValue > 0.5);
  const heavier = createEngine({ config: { platforms: { x: { blend: { positive: { 'x.reply_potential': 10 } } } } } }).analyze(content, { platforms: ['x'] }).platforms.x;
  assert.ok(heavier.overall.parts.positive > base.overall.parts.positive, 'a high signal weighted more raises the positive blend');
  assert.equal(heavier.modelVersion, 'basira-x-v1');
});

test('a disabled signal leaves the score and the explanation', () => {
  const content = { type: 'post', text: LIST_POST };
  const on = createEngine().analyze(content, { platforms: ['x'] }).platforms.x;
  const off = createEngine({ config: { signals: { 'x.reply_potential': { enabled: false } } } }).analyze(content, { platforms: ['x'] }).platforms.x;
  assert.ok(on.overall.contributions.some((c) => c.signalId === 'x.reply_potential'));
  assert.ok(!off.overall.contributions.some((c) => c.signalId === 'x.reply_potential'));
  assert.ok(!off.scores.conversation.contributions.some((c) => c.signalId === 'x.reply_potential'));
  assert.notEqual(on.overall.score, off.overall.score);
});

test('confidence without history is low and says why; with history it rises', () => {
  const lone = createEngine().analyze(CAROUSEL, { platforms: ['instagram'] }).platforms.instagram;
  assert.ok(lone.confidence.confidence <= DEFAULT_CONFIG.confidence.genericCap);
  assert.equal(lone.confidence.confidenceLabel, 'low');
  assert.ok(lone.confidence.reasons.some((r) => r.code === 'no-history'));
  assert.equal(lone.scores.historicalFit.score, null);
  assert.equal(lone.overall.parts.historicalShift, 0);
  const { studio } = withHistory();
  const hist = createEngine({ studio, accountId: '@kitabwbs' }).analyze(CAROUSEL, { platforms: ['instagram'] }).platforms.instagram;
  assert.ok(hist.confidence.confidence > lone.confidence.confidence);
  assert.ok(hist.confidence.reasons.some((r) => r.code === 'history'));
});

test('missing data stays missing: unavailable signals are null with a note, never zero', () => {
  const x = createEngine().analyze({ type: 'post', text: APHORISM }, { platforms: ['x'] }).platforms.x;
  assert.equal(x.signals['x.network_relevance'].value, null);
  assert.match(x.signals['x.network_relevance'].note, /does not expose/);
  assert.equal(x.signals['x.click_potential'].value, null, 'no link, no click potential');
  assert.ok(!x.overall.contributions.some((c) => c.signalId === 'x.click_potential'));
  const fb = createEngine().analyze({ type: 'post', text: APHORISM }, { platforms: ['facebook'] }).platforms.facebook;
  assert.equal(fb.scores.save.score, null, 'Facebook has no save score');
});

test('signal registry: every signal has provenance and existing sources; the public X weights agree in sign', () => {
  assert.deepEqual(checkRegistry(), []);
  for (const s of SIGNAL_CATALOG) {
    assert.ok(PROVENANCE.includes(s.provenance), s.id);
    assert.ok(s.relevance.sources.length, s.id);
  }
  // Negative actions are negative in X's code and in Basira's negative blend.
  for (const k of ['not_interested', 'block_author', 'mute_author', 'report']) assert.ok(X_PUBLIC_WEIGHTS.weights[k] < 0);
  for (const k of ['favorite', 'reply', 'retweet', 'quote', 'share']) assert.ok(X_PUBLIC_WEIGHTS.weights[k] > 0);
  assert.ok('x.negative_feedback_risk' in DEFAULT_CONFIG.platforms.x.blend.negative);
  assert.ok(Object.values(DEFAULT_CONFIG.platforms.x.blend.positive).every((w) => w > 0));
});

test('platform profiles are independent: Facebook does not reuse Instagram weights', () => {
  const ig = DEFAULT_CONFIG.platforms.instagram;
  const fb = DEFAULT_CONFIG.platforms.facebook;
  assert.notDeepEqual(ig.blend, fb.blend);
  assert.ok(Object.keys(fb.blend.positive).every((k) => k.startsWith('facebook.')));
  assert.ok(Object.keys(ig.blend.positive).every((k) => k.startsWith('instagram.')));
});

test('no fake precision: reports carry a disclaimer and never a probability without a calibrated model', () => {
  const r = createEngine().analyze(CAROUSEL);
  assert.match(r.disclaimer, /لا تدّعي بصيرة/);
  assert.ok(!/probab/i.test(JSON.stringify({ ...r, disclaimer: '' })));
  const en = createEngine().analyze(CAROUSEL, { lang: 'en' });
  assert.match(en.disclaimer, /does not claim access to private platform ranking algorithms/);
  assert.match(formatReport(en, { lang: 'en' }), /Platform Fit: \d+\/100/);
});

// ----------------------------------------------------------------- history

test('baselines use medians: a viral post barely moves the median and is flagged as an outlier', () => {
  const reach = [2100, 2300, 2400, 2500, 2600, 2200, 2450, 60000];
  const s = summary(reach);
  assert.ok(s.median < 2600);
  const mean = reach.reduce((a, b) => a + b, 0) / reach.length;
  assert.ok(mean > 9000, 'the mean is distorted');
  assert.ok(robustZ(60000, s, { log: true }) > 3.5);
  const { store } = withHistory();
  const p = buildProfile({ store, account: '@kitabwbs', platform: 'instagram', config: DEFAULT_CONFIG });
  assert.ok(p.baselines.account.reach.median < 3000, 'median reach unaffected by the planted viral post');
  assert.ok(p.baselines.account.reach.max > 30000);
});

test('normalized outcomes: rates per 1,000 reach make posts with different reach comparable', () => {
  const rec = normalizeRecord({ platform: 'instagram', postId: '1', metrics: { reach: 2000, shares: 20, saves: 30 } });
  const { store } = withHistory();
  const perf = new PerformanceStore(store, 'z');
  perf.upsert([rec]);
  const rows = perf.list({ platform: 'instagram' });
  assert.equal(rows.length, 1);
  assert.equal(median([1, 2, 3, 100]), 2.5);
});

test('small samples say nothing: no patterns, no top ranges, a small-sample reason', () => {
  const store = new MemoryStore();
  const perf = new PerformanceStore(store, 'tiny');
  perf.upsert(parseInstagram(syntheticInstagram({ n: 6 })));
  const p = buildProfile({ store, account: 'tiny', platform: 'instagram', config: DEFAULT_CONFIG });
  assert.equal(p.patterns.length, 0);
  assert.deepEqual(p.topRanges, {});
  const r = createEngine({ store, accountId: 'tiny' }).analyze(CAROUSEL, { platforms: ['instagram'] }).platforms.instagram;
  assert.ok(r.confidence.reasons.some((x) => x.code === 'small-sample'));
});

test('patterns recover a planted effect with sample size, confidence and date range', () => {
  const { store } = withHistory();
  const ig = buildProfile({ store, account: '@kitabwbs', platform: 'instagram', config: DEFAULT_CONFIG });
  const list = ig.patterns.find((p) => p.id === 'hookType:list:sharesPer1k');
  assert.ok(list, 'list-hook pattern found');
  assert.ok(list.effect > 0.15 && list.effect < 0.6, `effect ${list.effect}`);
  assert.ok(list.sampleSize >= DEFAULT_CONFIG.history.minSample);
  assert.ok(list.pValue <= DEFAULT_CONFIG.history.maxP);
  assert.ok(list.dateRange.from < list.dateRange.to);
  assert.match(list.statement.en, /numbered-list hooks have produced \+\d+% median shares per 1k reach/);
  const x = buildProfile({ store, account: '@kitabwbs', platform: 'x', config: DEFAULT_CONFIG });
  assert.ok(x.patterns.some((p) => p.id === 'hookLength:short:repliesPer1k' && p.effect > 0.25));
  // Nothing is claimed when outcomes do not vary.
  const flat = [...Array(30)].map((_, i) => ({ record: { id: `r${i}`, postedAt: null }, features: { type: 'post', hook: { type: i % 2 ? 'list' : 'statement', words: 5 + i, question: false }, cta: {}, intent: { primary: 'education' }, text: { words: 20 } }, ratios: { sharesPer1k: 1 } }));
  assert.deepEqual(discoverPatterns(flat, 'instagram', ['sharesPer1k'], DEFAULT_CONFIG), []);
});

test('adaptive weights stay bounded, need enough posts, and are versioned only when they change', () => {
  const { store } = withHistory();
  const p = buildProfile({ store, account: '@kitabwbs', platform: 'x', config: DEFAULT_CONFIG, engines: ENGINES, registry: new SignalRegistry() });
  assert.equal(p.weightsVersion, 'kitabwbs-x-w1');
  const file = store.readJson('algorithm/weights/kitabwbs/x.json');
  const { maxShift } = DEFAULT_CONFIG.history.adaptive;
  for (const f of Object.values(file.versions[0].factors)) assert.ok(f >= 1 - maxShift && f <= 1 + maxShift);
  buildProfile({ store, account: '@kitabwbs', platform: 'x', config: DEFAULT_CONFIG, engines: ENGINES, registry: new SignalRegistry() });
  assert.equal(store.readJson('algorithm/weights/kitabwbs/x.json').versions.length, 1, 'same data, same version');
  const small = new MemoryStore();
  new PerformanceStore(small, 's').upsert(parseX(syntheticX({ n: 10 })));
  assert.equal(buildProfile({ store: small, account: 's', platform: 'x', config: DEFAULT_CONFIG, engines: ENGINES, registry: new SignalRegistry() }).weightsVersion, null);
});

test('Mann–Whitney separates shifted groups and not identical ones', () => {
  assert.ok(mannWhitney([5, 6, 7, 8, 9, 10, 11, 12], [1, 2, 3, 4, 5, 6, 2, 3]).p < 0.05);
  assert.ok(mannWhitney([1, 2, 3, 4], [1, 2, 3, 4]).p > 0.5);
});

// ----------------------------------------------------------- ingestion

test('Instagram Graph media map to records: saved → saves, watch time ms → s, only Instagram metrics', () => {
  const [rec] = parseInstagram({ data: [{ id: '9', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-09-01T18:00:00+0000', caption: 'ريل', insights: { data: [{ name: 'reach', values: [{ value: 1000 }] }, { name: 'saved', values: [{ value: 40 }] }, { name: 'ig_reels_avg_watch_time', values: [{ value: 5300 }] }] } }] });
  const r = normalizeRecord(rec);
  assert.equal(r.contentType, 'reel');
  assert.equal(r.metrics.saves, 40);
  assert.equal(r.metrics.averageWatchTime, 5.3);
  assert.equal(r.metrics.shares, null, 'reported metrics only; missing ones are null');
  assert.ok(!('replies' in r.metrics), 'no X metrics on an Instagram record');
});

test('Facebook posts map current and legacy insight names; X prefers non-public impressions', () => {
  const [fb] = parseFacebook({ data: [{ id: 'p1', message: 'منشور', created_time: '2026-09-01T10:00:00+0000', shares: { count: 4 }, comments: { summary: { total_count: 7 } }, insights: { data: [{ name: 'post_impressions', values: [{ value: 900 }] }, { name: 'post_reactions_by_type_total', values: [{ value: { like: 10, love: 3 } }] }] } }] });
  assert.equal(fb.metrics.views, 900);
  assert.equal(fb.metrics.likes, 13);
  assert.equal(fb.metrics.shares, 4);
  assert.equal(fb.metrics.comments, 7);
  const [x] = parseX({ data: [{ id: 't1', text: 'نص', public_metrics: { impression_count: 10, reply_count: 2, like_count: 5, retweet_count: 1, quote_count: 0, bookmark_count: 1 }, non_public_metrics: { impression_count: 1200, user_profile_clicks: 6 } }] });
  assert.equal(x.metrics.impressions, 1200);
  assert.equal(x.metrics.profileVisits, 6);
  assert.ok(!('saves' in normalizeRecord(x).metrics));
});

test('CSV exports with quoted Arabic captions (commas and line breaks) parse correctly', () => {
  const csv = 'Post ID,Description,Publish time,Post type,Reach,Shares,Saves\n1,"قائمة، مفيدة\nجدًا",2026-09-01T10:00:00+04:00,Carousel,1500,12,30\n2,"«اقتباس» قصير",2026-09-02T10:00:00+04:00,Image,900,3,4\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Description, 'قائمة، مفيدة\nجدًا');
  const recs = parseInstagram(csv, { filename: 'export.csv' }).map((r) => normalizeRecord(r));
  assert.equal(recs[0].contentType, 'carousel');
  assert.equal(recs[0].metrics.reach, 1500);
  assert.equal(recs[0].postedHour, 10);
});

test('re-importing a post keeps earlier values the new snapshot lacks', () => {
  const store = new MemoryStore();
  const perf = new PerformanceStore(store, 'a');
  perf.upsert([{ platform: 'x', postId: '1', metrics: { impressions: 1000, replies: 5 } }]);
  const res = perf.upsert([{ platform: 'x', postId: '1', metrics: { impressions: 1500 } }]);
  assert.equal(res.updated, 1);
  const [rec] = perf.list();
  assert.equal(rec.metrics.impressions, 1500);
  assert.equal(rec.metrics.replies, 5);
  assert.equal(rec.snapshots.length, 1);
});

test('providers: no credentials, no call; errors never contain the token', async () => {
  const none = new InstagramProvider({ token: null, userId: null, fetch: () => assert.fail('must not fetch') });
  assert.equal(none.available(), false);
  await assert.rejects(none.fetchPosts(), /credentials missing.*studio analytics import/);
  const token = 'EAAG-secret-token-123456';
  const failing = new XProvider({ userToken: token, userId: '42', fetch: async () => ({ ok: false, status: 401, text: async () => `invalid token ${token}` }) });
  await assert.rejects(failing.fetchPosts(), (err) => !err.message.includes(token) && /\[redacted\]/.test(err.message));
  assert.equal(redact(`https://x?access_token=${token}`, [token]), 'https://x?access_token=[redacted]');
  const calls = [];
  const ig = new InstagramProvider({
    token,
    userId: '7',
    fetch: async (url, init) => {
      calls.push([url, init.headers.Authorization]);
      const body = url.includes('/media?') ? { data: [{ id: 'm1', media_type: 'CAROUSEL_ALBUM', caption: '6 عادات', timestamp: '2026-09-01T10:00:00+0000' }] } : { data: [{ name: 'reach', values: [{ value: 800 }] }] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    },
  });
  const posts = await ig.fetchPosts();
  assert.equal(posts[0].metrics.reach, 800);
  assert.ok(calls.every(([url]) => !url.includes(token)), 'token sent as a header, not in the URL');
});

// ----------------------------------------------------- recommendations

test('a recommendation names the measured weakness, the target and the expected effect', () => {
  const r = createEngine().analyze(CAROUSEL, { platforms: ['instagram'], lang: 'en' });
  const rec = r.recommendations.find((x) => x.rule === 'slide_overloaded');
  assert.ok(rec, 'overloaded slide recommended');
  assert.equal(rec.evidence[0].value, 65);
  assert.equal(rec.evidence[0].target, 30);
  assert.match(rec.suggestedFix, /Reduce slide 4 from 65 words to ≤ 30/);
  assert.ok(rec.effects.instagram.overallDelta >= 1, 'fixing it raises the score under the model');
  assert.equal(rec.effects.instagram.basis, 'model-counterfactual');
  const generic = r.recommendations.find((x) => x.rule === 'generic_cta');
  assert.ok(generic && generic.evidence[0].feature === 'cta.generic');
  for (const x of r.recommendations) assert.ok(x.evidence.length > 0, `${x.id} has evidence`);
});

test('no unsupported recommendations: clean content gets none of the rules it does not break', () => {
  const r = createEngine().analyze({ type: 'post', text: LIST_POST }, { lang: 'en' });
  const rules = new Set(r.recommendations.map((x) => x.rule));
  for (const rule of ['slide_overloaded', 'generic_cta', 'missing_cta', 'engagement_bait', 'long_opening_sentence', 'x_over_limit']) assert.ok(!rules.has(rule), rule);
  // Rules of thumb never rank "high" without account evidence.
  const weak = createEngine().analyze({ type: 'post', text: GENERIC_CTA_POST });
  for (const x of weak.recommendations) if (x.basis === 'heuristic' && !x.accountEvidence) assert.notEqual(x.priority, 'high', x.id);
  const bait = createEngine().analyze({ type: 'post', text: BAIT_POST }, { lang: 'en' });
  const b = bait.recommendations.find((x) => x.rule === 'engagement_bait');
  assert.ok(b, 'bait detected');
  assert.ok(bait.platforms.x.signals['x.negative_feedback_risk'].value >= 0.6);
});

test('account history adds evidence: a missed pattern becomes a recommendation with its sample', () => {
  const { studio } = withHistory();
  const r = createEngine({ studio, accountId: '@kitabwbs' }).analyze({ type: 'post', text: LONG_HOOK }, { platforms: ['x'], lang: 'en' });
  const rec = r.recommendations.find((x) => x.accountEvidence);
  assert.ok(rec, 'history-backed recommendation');
  assert.ok(rec.accountEvidence.sampleSize >= DEFAULT_CONFIG.history.minSample);
  assert.ok(rec.accountEvidence.dateRange);
  const opening = r.recommendations.filter((x) => x.topic === 'opening-length');
  assert.equal(opening.length, 1, 'one recommendation per fix');
  const matched = createEngine({ studio, accountId: '@kitabwbs' }).analyze(CAROUSEL, { platforms: ['instagram'], lang: 'en' }).platforms.instagram;
  assert.ok(matched.accountEvidence.some((e) => e.id === 'hookType:list:sharesPer1k'));
});

// ---------------------------------------------------- semantic, CLI, ML

test('semantic results are cached by content key: one AI call, then cache hits', () => {
  const studio = openStudio(new MemoryStore());
  const e = createEngine({ studio });
  const f = e.features({ type: 'post', text: APHORISM });
  assert.equal(cachedSemantic(studio, f.key, 'assistant'), null);
  const sem = parseSemantic('{"curiosity":0.3,"emotion":0.5,"novelty":0.4,"usefulness":0.3,"ctaQuality":0.2,"quotability":0.9}', { analyzerId: 'assistant' });
  storeSemantic(studio, f.key, 'assistant', sem);
  assert.deepEqual(cachedSemantic(studio, f.key, 'assistant'), sem);
  const local = e.analyze({ type: 'post', text: APHORISM }).platforms.x.overall.score;
  const ai = e.analyze({ type: 'post', text: APHORISM }, { analyzerId: 'assistant' });
  assert.equal(ai.semantic.source, 'ai:assistant');
  assert.ok(ai.platforms.x.overall.score > local, 'a quotable maxim scores higher with the semantic judgement');
  assert.equal(studio.ledger.report().aiByKind['ai.semantic'], 1);
  assert.throws(() => parseSemantic('{"curiosity":2}'), /0\.\.1/);
});

test('CLI: analyze-post, analytics import and profile work on a store directory', async () => {
  const { main } = await import('../scripts/studio-cli.js');
  const { withDefaults } = await import('../scripts/basira-cli.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'basira-ai-'));
  const post = path.join(home, 'post.txt');
  fs.writeFileSync(post, LIST_POST);
  const outs = [];
  const out = (x) => outs.push(x);
  await main(['analyze-post', post, '--platform', 'x', '--home', home], out);
  assert.equal(typeof outs[0].platforms.x.score, 'number');
  assert.ok(!('features' in outs[0]), 'compact JSON by default');
  const media = path.join(home, 'ig.json');
  fs.writeFileSync(media, JSON.stringify(syntheticInstagram()));
  await main(['analytics', 'import', 'instagram', media, '--account', '@kitabwbs', '--home', home], out);
  assert.equal(outs[1].added, 48);
  await main(['analytics', 'profile', '--platform', 'instagram', '--account', '@kitabwbs', '--format', 'text', '--home', home], out);
  assert.match(outs[2], /Top-performing content patterns/);
  assert.match(outs[2], /numbered-list hooks/);
  assert.deepEqual(withDefaults(['analyze-post', 'a.txt']).slice(-4), ['--format', 'text', '--lang', 'en']);
  fs.rmSync(home, { recursive: true, force: true });
});

test('optional ML: a model is used only after a holdout test, and probabilities only when calibrated', () => {
  const rows = [...Array(30)].map((_, i) => ({ postedAt: `2026-01-${String(i + 1).padStart(2, '0')}`, x: { a: i % 2, b: i }, label: i % 2 }));
  const small = trainAndEvaluate(rows, { platform: 'x', metric: 'repliesPer1k' });
  assert.equal(small.accepted, false, 'fewer than 60 posts');
  assert.throws(() => new MLPredictor({ model: small.model }), /holdout/);
  assert.deepEqual(validateModel(small.model), []);
});
