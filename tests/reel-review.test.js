import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseCaptions } from '../lib/reel-review/captions.js';
import { parseIntervals, frameTimes } from '../lib/reel-review/detectors.js';
import { buildReview, planScenes, scriptDifferences } from '../lib/reel-review/report.js';
import { reviewReel, fileSha256, doctor } from '../lib/reel-review/index.js';
import { runTool } from '../lib/reel-review/process.js';

test('subtitles handle short VTT clocks, SRT commas and explicit Remotion milliseconds', () => {
  assert.deepEqual(parseCaptions('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nكلام عربي\n'), [{ start: 1, end: 2.5, text: 'كلام عربي', lines: ['كلام عربي'] }]);
  assert.deepEqual(parseCaptions('1\n00:00:01,000 --> 00:00:02,000\nسطر أول\nسطر ثان\n')[0].lines, ['سطر أول', 'سطر ثان']);
  assert.equal(parseCaptions('1\n00:00:01,000 --> 00:00:02,000\nنص\n')[0].end, 2);
  assert.equal(parseCaptions(JSON.stringify([{ startMs: 500, endMs: 1200, text: 'نص' }]), { json: true })[0].start, 0.5);
  for (const row of [{ start: 0, end: 0, text: 'نص' }, { start: -1, end: 2, text: 'نص' }, { start: 0, end: 1, text: '' }])
    assert.throws(() => parseCaptions(JSON.stringify([row]), { json: true }));
  assert.throws(() => parseCaptions('plain text without timestamps'));
});

test('terminal silence is closed at media end, not silently dropped', () => {
  assert.deepEqual(parseIntervals('silence_start: 2.5\n', 'silence', 5), [{ start: 2.5, end: 5, duration: 2.5 }]);
  assert.deepEqual(parseIntervals('freeze_start: 0\nfreeze_end: 2\nfreeze_start: 3', 'freeze', 5), [{ start: 0, end: 2, duration: 2 }, { start: 3, end: 5, duration: 2 }]);
});

test('plan scene ids remain attached; explicit frame timings require an fps', () => {
  assert.deepEqual(planScenes({ fps: 60, scenes: [{ id: 'hook', from: 0, durationInFrames: 120 }, { id: 'story', from: 120, durationInFrames: 180 }] }).map((scene) => [scene.id, scene.start, scene.end]), [['hook', 0, 2], ['story', 2, 5]]);
  assert.throws(() => planScenes({ scenes: [{ from: 0, durationInFrames: 120 }] }));
  assert.throws(() => planScenes({ scenes: [{ start: 0, end: 2 }, { start: 1, end: 3 }] }));
});

test('reports cannot turn captions or technical checks into proof of listening/Arabic rendering', () => {
  const report = buildReview({
    source: { name: 'test.mp4', sha256: 'source' }, metadata: { duration: 5, width: 1920, height: 1080, fps: 60, audioStreams: 1 },
    evidence: { shots: [], peakDb: -0.1, blackIntervals: [], quietIntervals: [], freezeIntervals: [] }, artifacts: { frames: [], contactSheet: 'sheet.jpg' },
    captions: [{ start: 0, end: 0.2, text: 'كلام عربي واضح' }], script: 'كلام عربي واضح',
    expectations: { fps: 30 },
  });
  assert.equal(report.technical.passed, false);
  assert.equal(report.status, 'needs-review');
  assert.equal(report.evidence.scriptCheck.status, 'matched');
  assert.equal(report.manualChecks.find((check) => check.id === 'voice-naturalness').status, 'pending');
  assert.equal(report.manualChecks.find((check) => check.id === 'arabic-render').status, 'pending');
  assert.ok(report.findings.some((finding) => finding.code === 'captions.fast' && finding.evidenceClass === 'heuristic'));
  assert.equal(report.repairPlan.automatic, false);
});

test('a finding spanning several plan scenes is not pinned to the first; frames link to findings', () => {
  const report = buildReview({
    source: { name: 'test.mp4', sha256: 'source' }, metadata: { duration: 6, width: 1920, height: 1080, fps: 60, audioStreams: 1 },
    evidence: { shots: [], peakDb: -6, blackIntervals: [{ start: 1.5, end: 2.5, duration: 1 }], quietIntervals: [], freezeIntervals: [] },
    artifacts: { contactSheet: 'sheet.jpg', frames: [{ time: 0, file: 'frames/a.jpg' }, { time: 2, file: 'frames/b.jpg' }] },
    plan: { scenes: [{ id: 'hook', seconds: 2 }, { id: 'story', seconds: 4 }] }, expectations: { fps: 30 },
  });
  const black = report.findings.find((finding) => finding.code === 'timeline.black');
  assert.equal(black.sceneId, null);
  assert.deepEqual(black.sceneIds, ['hook', 'story']);
  assert.equal(black.frame, 'frames/b.jpg');
  const fps = report.findings.find((finding) => finding.code === 'technical.fps');
  assert.deepEqual(fps.sceneIds, ['hook', 'story']);
  assert.equal(fps.frame, null);
  assert.equal(report.repairPlan.items.find((item) => item.findingId === black.id).target, 'review the listed project scenes');
});

test('script differences name the words, after the same normalization as the equality check', () => {
  const diff = scriptDifferences('كلامٌ عربيّ، واضح جدًا.', 'كلام عربي جميل');
  assert.deepEqual(diff.items.map((item) => [item.op, item.words]), [['extra-in-captions', 'جميل'], ['missing-from-captions', 'واضح جدا']]);
  assert.deepEqual(scriptDifferences('نص واحد', 'نص واحد').items, []);
});

test('review frames: opening, hook and ending always; extras deduplicated, capped and sorted', () => {
  const times = frameTimes(90, [{ time: 40, reason: 'finding' }, { time: 40.1, reason: 'scene-change' }, { time: 200, reason: 'finding' }]);
  assert.deepEqual(times.map((frame) => [frame.time, frame.reason]), [[0, 'opening'], [1, 'hook'], [2, 'hook'], [40, 'finding'], [89.9, 'ending']]);
  assert.equal(frameTimes(90, Array.from({ length: 60 }, (_, i) => ({ time: 3 + i }))).length, 4 + 24);
});

test('media child processes receive no API credentials, bounded logs and bounded time', async () => {
  const prior = process.env.BASEERA_TEST_SECRET;
  process.env.BASEERA_TEST_SECRET = 'not-for-child';
  try {
    const result = await runTool(process.execPath, ['-e', 'process.stdout.write(String(process.env.BASEERA_TEST_SECRET))']);
    assert.equal(result.stdout, 'undefined');
    await assert.rejects(runTool(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], { timeoutMs: 100 }), /timed out/);
    await assert.rejects(runTool(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { maxBytes: 10 }), /output limit/);
  } finally { if (prior === undefined) delete process.env.BASEERA_TEST_SECRET; else process.env.BASEERA_TEST_SECRET = prior; }
});

const mediaAvailable = ['ffmpeg', 'ffprobe'].every((binary) => spawnSync(binary, ['-version'], { stdio: 'ignore' }).status === 0);
if (!mediaAvailable && process.env.BASEERA_REQUIRE_MEDIA_TESTS === '1') throw new Error('FFmpeg/FFprobe required in CI');

test('real 60fps video: measured cuts, black/silence, safe paths, cache invalidation and portable CLI', { skip: !mediaAvailable }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baseera-reel-review-'));
  try {
    const video = path.join(directory, 'فيديو space;$literal.mp4');
    await runTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=60:d=2',
      '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=60:d=2',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=60:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=5',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]volume=enable=gte(t\\,3):volume=0[a]',
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
    const plan = path.join(directory, 'plan.json'), captions = path.join(directory, 'captions.json');
    fs.writeFileSync(plan, JSON.stringify({ fps: 60, format: { width: 320, height: 180 }, scenes: [{ id: 'hook', seconds: 2 }, { id: 'story', seconds: 3 }] }));
    fs.writeFileSync(captions, JSON.stringify([{ startMs: 0, endMs: 200, text: 'كلام عربي واضح' }]));
    const originalHash = await fileSha256(video);
    const options = { home: directory, planFile: plan, captionsFile: captions, semanticRequest: true };
    const report = await reviewReel(video, options);
    assert.equal(report.technical.passed, true);
    assert.equal(report.metadata.fps, 60);
    assert.equal(report.evidence.sceneChanges.length, 2);
    assert.ok(Math.abs(report.evidence.sceneChanges[0].time - 2) < 0.03);
    assert.ok(report.evidence.blackIntervals.some((interval) => Math.abs(interval.start - 4) < 0.03));
    assert.ok(report.evidence.quietIntervals.some((interval) => Math.abs(interval.start - 3) < 0.1 && interval.end === 5));
    assert.ok(report.evidence.audioLevels.length >= 10);
    assert.ok(Number.isFinite(report.evidence.loudness.integratedLufs) && Number.isFinite(report.evidence.loudness.truePeakDbtp), 'EBU R128 loudness and true peak measured');
    const blackFinding = report.findings.find((finding) => finding.code === 'timeline.black');
    assert.equal(blackFinding.sceneId, 'story');
    assert.ok(blackFinding.frame && fs.existsSync(path.join(report.directory, blackFinding.frame)), 'black finding links an extracted frame');
    for (const change of report.evidence.sceneChanges)
      assert.ok(report.artifacts.frames.some((frame) => Math.abs(frame.time - (change.time + 0.1)) < 0.25), `a frame near the cut at ${change.time}`);
    assert.equal(report.findings.find((finding) => finding.code === 'captions.fast').sceneId, 'hook');
    for (const name of ['review.json', 'review.md', 'repair-plan.json', 'editorial-request.json', 'contact-sheet.jpg']) assert.ok(fs.existsSync(path.join(report.directory, name)), name);
    assert.equal((await reviewReel(video, options)).cacheHit, true);
    fs.writeFileSync(captions, JSON.stringify([{ startMs: 0, endMs: 2000, text: 'كلام عربي واضح' }]));
    const changed = await reviewReel(video, options);
    assert.equal(changed.cacheHit, false);
    assert.notEqual(changed.cacheKey, report.cacheKey);
    assert.equal(await fileSha256(video), originalHash);
    await assert.rejects(reviewReel(video, { outDir: directory }), /must not contain an input/);
    const unsafe = path.join(directory, 'unsafe-output');
    fs.mkdirSync(unsafe);
    fs.symlinkSync(video, path.join(unsafe, 'review.md'));
    await assert.rejects(reviewReel(video, { outDir: unsafe }), /symbolic links/);
    assert.equal(await fileSha256(video), originalHash);
    await assert.rejects(reviewReel('https://example.org/file.mp4'), /local file/);
    await assert.rejects(reviewReel(video, { threshold: NaN }), /threshold/);
    const cli = spawnSync(process.execPath, [path.resolve('claude-plugin/skills/arabic-carousel/scripts/studio.mjs'), 'review-reel', video, '--home', directory, '--expect-fps', '30'], { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    const portable = JSON.parse(cli.stdout);
    assert.equal(portable.technical.passed, false);
    assert.ok(portable.findings.some((finding) => finding.code === 'technical.fps'));
    if (process.env.BASEERA_REVIEW_TEST_PYTHON) {
      const advanced = await reviewReel(video, { home: directory, engine: 'upstream', python: process.env.BASEERA_REVIEW_TEST_PYTHON, timeoutMs: 120000 });
      assert.equal(advanced.evidence.engine, 'upstream');
      assert.ok(advanced.evidence.motionEstimates.length);
      assert.ok(advanced.evidence.beatAnalysis);
      const shipped = spawnSync(process.execPath, [path.resolve('claude-plugin/skills/arabic-carousel/scripts/studio.mjs'), 'review-reel', video, '--home', directory, '--engine', 'upstream', '--python', process.env.BASEERA_REVIEW_TEST_PYTHON, '--timeout-ms', '120000'], { cwd: os.tmpdir(), encoding: 'utf8' });
      assert.equal(shipped.status, 0, shipped.stderr);
      assert.equal(JSON.parse(shipped.stdout).evidence.engine, 'upstream');
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('silent video is supported, corrupt files fail, and missing prerequisites are reported', { skip: !mediaAvailable }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baseera-reel-silent-'));
  try {
    const video = path.join(directory, 'silent.mp4');
    await runTool('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
    const report = await reviewReel(video, { home: directory });
    assert.equal(report.metadata.audioStreams, 0);
    assert.deepEqual(report.evidence.quietIntervals, []);
    assert.equal(report.evidence.peakDb, null);
    assert.equal(report.findings.find((finding) => finding.code === 'audio.absent').severity, 'info');
    const broken = path.join(directory, 'broken.mp4');
    fs.writeFileSync(broken, 'not video');
    await assert.rejects(reviewReel(broken, { home: directory }), /ffprobe/);
    assert.equal((await doctor({ ffmpeg: path.join(directory, 'missing') })).ok, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('both plugin packages preserve upstream license, provenance, and executable checksum', async () => {
  const source = 'lib/reel-review/vendor';
  const packaged = 'claude-plugin/skills/arabic-reels/scripts/review-engine';
  const provenance = JSON.parse(fs.readFileSync(path.join(source, 'provenance.json'), 'utf8'));
  assert.equal(await fileSha256(path.join(source, 'video_analyzer.py')), provenance.sha256);
  assert.equal(await fileSha256(path.join(packaged, 'video_analyzer.py')), provenance.sha256);
  const { packageFiles } = await import('../scripts/plugin-packages.mjs');
  for (const platform of ['claude', 'chatgpt']) {
    const files = await packageFiles('claude-plugin', platform);
    for (const name of ['video_analyzer.py', 'LICENSE', 'provenance.json']) assert.ok(files.includes(`skills/arabic-reels/scripts/review-engine/${name}`));
  }
  assert.match(fs.readFileSync(path.join(packaged, 'LICENSE'), 'utf8'), /Copyright \(c\) 2026 Ethan Woo/);
});
