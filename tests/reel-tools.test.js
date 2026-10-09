import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseLoudness } from '../lib/reel-review/detectors.js';
import { buildReview } from '../lib/reel-review/report.js';
import { normalizeWord, readWords, alignScript, chunkCaptions, buildCaptions, captionSrt } from '../lib/reel-review/caption-builder.js';
import { parseRanges, measureEdge, reviewCuts } from '../lib/reel-review/cuts.js';
import { runTool } from '../lib/reel-review/process.js';

const base = (evidence = {}, extra = {}) => buildReview({
  source: { name: 't.mp4', sha256: 's' }, metadata: { duration: 10, width: 1080, height: 1920, fps: 60, audioStreams: 1 },
  evidence: { shots: [], peakDb: -3, blackIntervals: [], quietIntervals: [], freezeIntervals: [], ...evidence },
  artifacts: { frames: [], contactSheet: 'sheet.jpg' }, ...extra,
});
const SUMMARY = '[Parsed_ebur128_0 @ 0x1] t: 9.9 M: -20 S: -20 I: -30.0 LUFS\n[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -20.4 LUFS\n    Threshold: -30.5 LUFS\n\n  Loudness range:\n    LRA:         6.1 LU\n\n  True peak:\n    Peak:        -0.4 dBFS\n';

test('EBU R128 summary is parsed from the end of the log, not from per-frame lines', () => {
  assert.deepEqual({ ...parseLoudness(SUMMARY), standard: undefined }, { integratedLufs: -20.4, lraLu: 6.1, truePeakDbtp: -0.4, measurable: true, standard: undefined });
  assert.equal(parseLoudness('no summary here'), null);
  assert.equal(parseLoudness(SUMMARY.replace('-20.4 LUFS', '-70.0 LUFS')).measurable, false);
});

test('loudness: quiet mixes warn, loud ones inform, true peak over -1 dBTP warns, target is configurable', () => {
  const quiet = base({ loudness: parseLoudness(SUMMARY) });
  assert.equal(quiet.findings.find((f) => f.code === 'audio.loudness').severity, 'warning');
  assert.equal(quiet.findings.find((f) => f.code === 'audio.true-peak').severity, 'warning');
  const loud = base({ loudness: { integratedLufs: -9.5, lraLu: 3, truePeakDbtp: -1.2, measurable: true } });
  assert.equal(loud.findings.find((f) => f.code === 'audio.loudness').severity, 'info');
  assert.equal(loud.findings.some((f) => f.code === 'audio.true-peak'), false);
  const onTarget = base({ loudness: { integratedLufs: -14.2, lraLu: 7, truePeakDbtp: -1.4, measurable: true } });
  assert.equal(onTarget.findings.some((f) => f.code.startsWith('audio.')), false);
  const custom = base({ loudness: { integratedLufs: -20.4, lraLu: 6, truePeakDbtp: -2, measurable: true } }, { expectations: { lufs: -20 } });
  assert.equal(custom.findings.some((f) => f.code === 'audio.loudness'), false);
  const silent = base({ loudness: { integratedLufs: -70, lraLu: 0, truePeakDbtp: null, measurable: false } });
  assert.equal(silent.findings.some((f) => f.code === 'audio.loudness'), false);
});

test('captions: letters per second (harakat ignored) and text longer than two comfortable lines', () => {
  // 2 words in 1 s pass the word rate but 26 letters/s fail the letter rate.
  const fast = base({}, { captions: [{ start: 0, end: 1, text: 'الاستراتيجيات المستقبليةُ' }] });
  const finding = fast.findings.find((f) => f.code === 'captions.fast');
  assert.ok(finding && finding.evidence.lettersPerSecond > 17 && finding.evidence.wordsPerSecond <= 3.5);
  const calm = base({}, { captions: [{ start: 0, end: 2, text: 'كلامٌ عربيٌّ واضح' }] });
  assert.equal(calm.findings.some((f) => f.code === 'captions.fast'), false);
  const long = 'هذه جملة طويلة جدا تمتد على أكثر من سطرين مريحين للقراءة على شاشة الهاتف العمودية ولا تنتهي';
  const report = base({}, { captions: [{ start: 0, end: 9, text: long }, { start: 9, end: 10, text: 'أ ب', lines: ['أ', 'ب', 'ج'] }] });
  assert.deepEqual(report.findings.filter((f) => f.code === 'captions.long-text').map((f) => f.evidence.cue), [1, 2]);
  assert.ok(report.manualChecks.some((check) => check.id === 'standalone'));
});

test('Arabic matching form: harakat, alef forms, ta marbuta, alef maqsura, digits', () => {
  assert.equal(normalizeWord('أَذْكى'), normalizeWord('اذكي'));
  assert.equal(normalizeWord('المتغافلُ،'), 'المتغافل');
  assert.equal(normalizeWord('محمودة'), normalizeWord('محموده'));
  assert.equal(normalizeWord('٣٠'), '30');
});

test('ASR words: shapes accepted, a lone conjunction joined to its word', () => {
  const words = readWords({ segments: [{ words: [{ word: ' و', start: 0, end: 0.2 }, { word: 'تغافل', start: 0.2, end: 0.9 }, { word: 'الناس', start: 1, end: 1.5 }] }] });
  assert.deepEqual(words.map((w) => [w.text, w.start, w.end]), [['وتغافل', 0, 0.9], ['الناس', 1, 1.5]]);
  assert.throws(() => readWords([{ w: 'كلمة', s: 2, e: 1 }]));
});

test('script alignment keeps the script spelling, times misheard words between matched neighbours', () => {
  const asr = [{ text: 'سؤيل', start: 0, end: 0.5 }, { text: 'اعرابي', start: 0.5, end: 1.0 }, { text: 'من', start: 1.2, end: 1.4 }, { text: 'اذكى', start: 1.4, end: 1.8 }, { text: 'الناس', start: 1.8, end: 2.3 }];
  const { words, alignment } = alignScript('سُئل أعرابي: من أذكى الناس؟', asr);
  assert.deepEqual(words.map((w) => w.text), ['سُئل', 'أعرابي:', 'من', 'أذكى', 'الناس؟']);
  assert.equal(words[0].matched, false);
  assert.equal(words[0].start, 0);
  assert.equal(words[1].start, 0.5);
  assert.equal(alignment.matched, 4);
  assert.throws(() => alignScript('نص مختلف تماما عن الكلام المسموع هنا', asr), /check that they belong together/);
});

test('captions: one cue per sentence, long sentences split in balanced parts, no orphan last word', () => {
  const sentence = 'هذا نص طويل يتكون من كلمات كثيرة متتابعة دون أي ترقيم في الوسط حتى النهاية';
  const words = sentence.split(' ').map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  const { cues, warnings } = chunkCaptions(words, { maxWords: 8, maxChars: 42 });
  assert.ok(cues.length >= 2 && cues.every((cue) => cue.words >= 2), 'no one-word cue');
  assert.ok(cues.every((cue) => cue.text.replace('\n', ' ').length <= 42));
  assert.deepEqual(warnings, []);
  const punctuated = chunkCaptions([{ text: 'من', start: 0, end: 0.3 }, { text: 'أذكى؟', start: 0.3, end: 0.8 }, { text: 'الفطن', start: 0.85, end: 1.3 }, { text: 'المتغافل.', start: 1.3, end: 2 }]).cues;
  assert.deepEqual(punctuated.map((cue) => cue.text), ['من أذكى؟', 'الفطن المتغافل.']);
  assert.equal(punctuated[0].end, punctuated[1].start, 'held until the next cue across a short gap');
  const lineBreak = buildCaptions([{ w: 'هذا', s: 0, e: 0.4 }, { w: 'سطر', s: 0.4, e: 0.9 }, { w: 'وهذا', s: 0.9, e: 1.3 }, { w: 'آخر', s: 1.3, e: 1.8 }], { script: 'هذا سطر\nوهذا آخر' });
  assert.deepEqual(lineBreak.cues.map((cue) => cue.text), ['هذا سطر', 'وهذا آخر']);
  assert.match(captionSrt(lineBreak.cues), /^1\n00:00:00,000 --> 00:00:00,900\nهذا سطر\n/);
});

test('captions: a cue too fast to read gets the free time after it, then a neighbour', () => {
  const words = [{ text: 'الاستراتيجيات', start: 0, end: 0.3 }, { text: 'المستقبلية.', start: 0.3, end: 0.6 }, { text: 'نعم', start: 3, end: 3.4 }];
  const { cues, warnings } = chunkCaptions(words);
  assert.ok(cues[0].end - cues[0].start >= 23 / 17 - 1e-6, 'extended to the letter-rate minimum (23 letters at 17 per second)');
  assert.deepEqual(warnings, []);
});

test('cut list shapes: pairs, objects, {ranges}, timeline {edl}', () => {
  const expected = [{ start: 1, end: 2 }];
  for (const data of [[[1, 2]], [{ start: 1, end: 2 }], [{ in: 1, out: 2 }], { ranges: [[1, 2]] }, { edl: [{ src: [1, 2], out: [0, 1] }] }])
    assert.deepEqual(parseRanges(data), expected);
  assert.throws(() => parseRanges([[2, 1]]));
  assert.throws(() => parseRanges([]));
});

test('edge measurement: sound at the cut, sound across it, a tight margin, a clear pause', () => {
  const SR = 24000;
  // floor noise everywhere, a tone from 1.00 to 2.00 s, inside a 3 s window starting at 0
  const samples = Float32Array.from({ length: 3 * SR }, (_, n) => ((n * 7919) % 101 - 50) / 50 * 0.001 + (n >= SR && n < 2 * SR ? 0.3 * Math.sin(n / 4) : 0));
  assert.equal(measureEdge(samples, 0, 1.5, 'in').verdict, 'sound-at-cut');
  assert.equal(measureEdge(samples, 0, 0.95, 'in').verdict, 'tight');
  assert.equal(measureEdge(samples, 0, 0.5, 'in').verdict, 'clear');
  assert.equal(measureEdge(samples, 0, 0.92, 'out').verdict, 'sound-across-cut');
  assert.equal(measureEdge(samples, 0, 2.05, 'out').verdict, 'tight');
  assert.equal(measureEdge(samples, 0, 2.5, 'out').verdict, 'clear');
});

const mediaAvailable = ['ffmpeg', 'ffprobe'].every((binary) => spawnSync(binary, ['-version'], { stdio: 'ignore' }).status === 0);
if (!mediaAvailable && process.env.BASEERA_REQUIRE_MEDIA_TESTS === '1') throw new Error('FFmpeg/FFprobe required in CI');

test('review-cuts on a real file and through the bundled CLI; captions-build writes SRT', { skip: !mediaAvailable }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baseera-cuts-'));
  try {
    const audio = path.join(directory, 'كلام.wav');
    await runTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      "aevalsrc='0.002*(random(0)-0.5)+0.4*sin(2*PI*440*t)*between(t\\,1\\,2)+0.4*sin(2*PI*440*t)*between(t\\,3\\,4)':s=48000:d=5", audio]);
    const cuts = path.join(directory, 'cuts.json');
    fs.writeFileSync(cuts, JSON.stringify([[0.3, 0.7], [0.95, 2.05], [3.0, 3.5], [4.2, 4.9]]));
    const report = await reviewCuts(audio, { cutsData: JSON.parse(fs.readFileSync(cuts, 'utf8')) });
    assert.deepEqual(report.edges.map((edge) => `${edge.kind}@${edge.time}:${edge.verdict}`),
      ['in@0.3:clear', 'out@0.7:clear', 'in@0.95:tight', 'out@2.05:tight', 'in@3:sound-at-cut', 'out@3.5:sound-at-cut', 'in@4.2:clear', 'out@4.9:clear']);
    assert.equal(report.privacy.originalModified, false);
    const cli = path.resolve('claude-plugin/skills/arabic-carousel/scripts/studio.mjs');
    const shipped = spawnSync(process.execPath, [cli, 'review-cuts', audio, '--cuts', cuts, '--home', directory], { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.equal(shipped.status, 0, shipped.stderr);
    assert.equal(JSON.parse(shipped.stdout).summary.soundAtCut, 2);
    const words = path.join(directory, 'words.json'), srt = path.join(directory, 'out.srt');
    fs.writeFileSync(words, JSON.stringify([{ word: 'من', start: 1, end: 1.3 }, { word: 'أذكى', start: 1.3, end: 1.8 }, { word: 'الناس؟', start: 1.8, end: 2.4 }]));
    const built = spawnSync(process.execPath, [cli, 'captions-build', words, '--out', srt, '--home', directory], { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr);
    assert.match(fs.readFileSync(srt, 'utf8'), /من أذكى الناس؟/);
    assert.ok(fs.existsSync(path.resolve('claude-plugin/skills/arabic-carousel/scripts/licenses/purffle-shorts.LICENSE')), 'MIT notice ships with the bundle');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
