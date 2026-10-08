import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runTool, doctor } from './process.js';
import { probeVideo, scanFfmpeg, reviewFrames } from './detectors.js';
import { parseCaptions, captionVtt } from './captions.js';
import { buildReview, reviewMarkdown, editorialRequest, REVIEW_VERSION, planScenes } from './report.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => file ? fs.readFileSync(localFile(file), 'utf8') : null;
function localFile(file) {
  if (typeof file !== 'string' || /^[a-z][a-z0-9+.-]*:\/\//i.test(file)) throw new Error('supply a local file, not a URL');
  const full = fs.realpathSync(path.resolve(file));
  if (!fs.statSync(full).isFile()) throw new Error('input must be a regular file');
  return full;
}
export function fileSha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
const writeJson = (file, data) => {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

function checkOutputPaths(directory) {
  const check = (file) => {
    if (!fs.existsSync(file) && !fs.lstatSync(file, { throwIfNoEntry: false })) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('review output paths must not be symbolic links');
    if (stat.isDirectory()) for (const name of fs.readdirSync(file)) check(path.join(file, name));
  };
  for (const name of ['raw', 'frames', 'upstream', 'review.json', 'review.md', 'repair-plan.json', 'editorial-request.json', 'captions.vtt', 'contact-sheet.jpg']) check(path.join(directory, name));
}

// Identical pinned engine in source or in the self-contained plugin.
function upstreamDirectory() {
  const candidates = [path.join(here, 'vendor'), path.resolve(here, '../../arabic-reels/scripts/review-engine')];
  const directory = candidates.find((dir) => fs.existsSync(path.join(dir, 'provenance.json')));
  if (!directory) throw new Error('pinned upstream engine missing; rebuild the plugin');
  return directory;
}

async function scanUpstream(source, directory, captions, options) {
  const vendor = upstreamDirectory();
  const provenance = JSON.parse(fs.readFileSync(path.join(vendor, 'provenance.json'), 'utf8'));
  const analyzer = path.join(vendor, 'video_analyzer.py');
  if (await fileSha256(analyzer) !== provenance.sha256) throw new Error('upstream engine checksum mismatch');
  const output = path.join(directory, 'upstream');
  fs.mkdirSync(output, { recursive: true });
  const args = [analyzer, 'analyze', source, '--work-dir', output, '--scene-threshold', String(options.threshold), '--contact-frames', '24'];
  if (captions.length) {
    const subtitles = path.join(directory, 'captions.vtt');
    fs.writeFileSync(subtitles, captionVtt(captions));
    args.push('--subtitles', subtitles);
  }
  const run = await runTool(options.python, args, { timeoutMs: options.timeoutMs });
  fs.writeFileSync(path.join(output, 'engine.log'), run.stdout + run.stderr);
  const data = JSON.parse(fs.readFileSync(path.join(output, 'analysis.json'), 'utf8'));
  if (!Array.isArray(data.shots) || !data.media) throw new Error('unexpected upstream analysis schema');
  return {
    engine: 'upstream', provenance, sceneChanges: data.scene_changes, shots: data.shots,
    blackIntervals: data.black_intervals, quietIntervals: data.quiet_intervals, freezeIntervals: [],
    audioLevels: data.audio_levels, beatAnalysis: data.beat_analysis, peakDb: null, meanDb: null,
    motionEstimates: data.shots.map((shot) => ({ index: shot.index, start: shot.start, end: shot.end, ...shot.motion })),
  };
}

export async function reviewReel(file, {
  home, outDir, engine = 'ffmpeg', ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', python = 'python3',
  planFile, captionsFile, scriptFile, expectations = {}, threshold = 0.2, timeoutMs = 120000,
  noCache = false, semanticRequest = false,
} = {}) {
  const sourceFile = localFile(file);
  if (!['ffmpeg', 'upstream'].includes(engine)) throw new Error('engine must be ffmpeg or upstream');
  if (engine === 'upstream' && (ffmpeg !== 'ffmpeg' || ffprobe !== 'ffprobe')) throw new Error('upstream engine uses ffmpeg/ffprobe from PATH; custom binary options are for the ffmpeg engine');
  for (const [key, value] of Object.entries(expectations))
    if (!['width', 'height', 'fps', 'duration'].includes(key) || typeof value !== 'number' || !(value > 0) || !Number.isFinite(value)) throw new Error(`invalid expected ${key}`);
  if (!(threshold > 0 && threshold < 1)) throw new Error('scene threshold must be between 0 and 1');
  if (!(timeoutMs >= 1000 && timeoutMs <= 1800000)) throw new Error('timeout must be between 1000 and 1800000 milliseconds');
  const planText = read(planFile), captionText = read(captionsFile), script = read(scriptFile);
  const plan = planText === null ? null : JSON.parse(planText);
  planScenes(plan);
  const captions = captionText === null ? [] : parseCaptions(captionText, { json: path.extname(captionsFile).toLowerCase() === '.json' });
  const capabilities = await doctor({ ffmpeg, ffprobe, python, engine });
  if (!capabilities.ok) throw new Error(`review prerequisites missing: ${capabilities.checks.filter((check) => !check.available).map((check) => check.reason).join('; ')}`);
  const source = { name: path.basename(sourceFile), sha256: await fileSha256(sourceFile) };
  const vendor = engine === 'upstream' ? JSON.parse(fs.readFileSync(path.join(upstreamDirectory(), 'provenance.json'), 'utf8')) : null;
  const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ version: REVIEW_VERSION, source, plan, captions, script, expectations, engine, threshold, capabilities, vendor })).digest('hex');
  const directory = path.resolve(outDir ?? path.join(home ?? path.dirname(sourceFile), 'reel-reviews', cacheKey.slice(0, 24)));
  fs.mkdirSync(directory, { recursive: true });
  const realDirectory = fs.realpathSync(directory);
  for (const input of [sourceFile, planFile, captionsFile, scriptFile].filter(Boolean).map(localFile)) {
    if (input.startsWith(realDirectory + path.sep)) throw new Error('output directory must not contain an input file');
  }
  checkOutputPaths(directory);
  const reportFile = path.join(directory, 'review.json');
  if (!noCache && fs.existsSync(reportFile)) {
    let cached;
    try { cached = JSON.parse(fs.readFileSync(reportFile, 'utf8')); } catch { /* rebuild incomplete reports */ }
    if (cached?.cacheKey === cacheKey && cached.kind === 'baseera-reel-review' &&
      ['review.md', 'repair-plan.json', 'contact-sheet.jpg', ...(cached.artifacts?.frames ?? []).map((frame) => frame.file)].every((name) =>
        typeof name === 'string' && !path.isAbsolute(name) && !name.split(/[\\/]/).includes('..') && fs.existsSync(path.join(directory, name)))) {
      if (semanticRequest) writeJson(path.join(directory, 'editorial-request.json'), editorialRequest(cached));
      return { ...cached, cacheHit: true, directory };
    }
  }
  const { probe, metadata } = await probeVideo(sourceFile, { ffprobe });
  if (metadata.duration > 600) throw new Error('reel review accepts videos up to 600 seconds; split longer references');
  // Some damage is recoverable with exit code 0; fail decode on errors.
  await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-threads', '2', '-i', sourceFile, '-map', `0:${metadata.videoStreamIndex}`, '-map', '0:a?', '-f', 'null', '-'], { timeoutMs });
  fs.mkdirSync(path.join(directory, 'raw'), { recursive: true });
  writeJson(path.join(directory, 'raw', 'ffprobe.json'), probe);
  const options = { ffmpeg, ffprobe, python, threshold, timeoutMs };
  let evidence = await scanFfmpeg(sourceFile, metadata, directory, options);
  if (engine === 'upstream') {
    const advanced = await scanUpstream(sourceFile, directory, captions, options);
    evidence = { ...evidence, engine: 'upstream', provenance: advanced.provenance,
      upstreamShots: advanced.shots, beatAnalysis: advanced.beatAnalysis, motionEstimates: advanced.motionEstimates };
  }
  // Frames where the evidence is: each short finding's midpoint, then just after each detected cut.
  const draft = buildReview({ source, metadata, evidence, artifacts: { contactSheet: 'contact-sheet.jpg', frames: [] }, expectations, captions, plan, script });
  const extra = [
    ...draft.findings.filter((finding) => finding.range.end - finding.range.start < metadata.duration / 2)
      .map((finding) => ({ time: (finding.range.start + finding.range.end) / 2, reason: 'finding' })),
    ...(evidence.sceneChanges ?? []).map((change) => ({ time: change.time + 0.1, reason: 'scene-change' })),
  ];
  const artifacts = await reviewFrames(sourceFile, metadata.duration, directory, { ...options, videoStreamIndex: metadata.videoStreamIndex, extra });
  if (await fileSha256(sourceFile) !== source.sha256) throw new Error('source changed during analysis; rerun on a stable file');
  const report = { ...buildReview({ source, metadata, evidence, artifacts, expectations, captions, plan, script }), cacheKey, engineVersions: capabilities.checks };
  fs.writeFileSync(path.join(directory, 'review.md'), reviewMarkdown(report));
  writeJson(path.join(directory, 'repair-plan.json'), report.repairPlan);
  if (semanticRequest) writeJson(path.join(directory, 'editorial-request.json'), editorialRequest(report));
  writeJson(reportFile, report); // Publish the complete cache entry last.
  return { ...report, cacheHit: false, directory };
}

export { doctor, reviewMarkdown };
