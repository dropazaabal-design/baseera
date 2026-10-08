// Adapted from gitethanwoo/video-editing at the commit recorded in
// vendor/provenance.json (MIT, license retained). Measurements remain separate
// from the Baseera editorial policy. Unlike the optional upstream engine,
// this path needs only Node + FFmpeg, and detects terminal silence/freeze too.
import fs from 'node:fs';
import path from 'node:path';
import { runTool } from './process.js';

export const rational = (value) => {
  const parts = String(value ?? '').split('/').map(Number);
  const result = parts.length === 2 ? parts[0] / parts[1] : parts[0];
  return Number.isFinite(result) && result > 0 ? result : null;
};
const numberPattern = '(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';

export function parseIntervals(log, kind, duration) {
  const intervals = [];
  let start = null;
  const pattern = new RegExp(`${kind}_(start|end):\\s*${numberPattern}`, 'g');
  for (const match of log.matchAll(pattern)) {
    const time = Math.max(0, Math.min(duration, Number(match[2])));
    if (match[1] === 'start') start = time;
    else if (start !== null) {
      if (time > start) intervals.push({ start, end: time, duration: time - start });
      start = null;
    }
  }
  if (start !== null && start < duration) intervals.push({ start, end: duration, duration: duration - start });
  return intervals;
}

export function parseSceneChanges(log) {
  const times = [...log.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number(match[1]));
  const scores = [...log.matchAll(/lavfi\.scene_score=([\d.]+)/g)].map((match) => Number(match[1]));
  const out = [];
  for (let i = 0; i < Math.min(times.length, scores.length); i++) {
    const candidate = { time: times[i], score: scores[i] };
    if (out.length && candidate.time - out.at(-1).time < 0.2) {
      if (candidate.score > out.at(-1).score) out[out.length - 1] = candidate;
    } else out.push(candidate);
  }
  return out;
}

export function shotsFromChanges(duration, changes) {
  const boundaries = [0, ...changes.map((change) => change.time).filter((time) => time > 0 && time < duration), duration];
  return boundaries.slice(0, -1).map((start, i) => ({ index: i + 1, start, end: boundaries[i + 1], duration: boundaries[i + 1] - start }));
}

export async function probeVideo(source, { ffprobe = 'ffprobe' } = {}) {
  const { stdout } = await runTool(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', source]);
  const probe = JSON.parse(stdout);
  const video = probe.streams?.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  const audio = probe.streams?.filter((stream) => stream.codec_type === 'audio') ?? [];
  const duration = Number(probe.format?.duration ?? video?.duration);
  if (!video || !(duration > 0) || !Number.isFinite(duration)) throw new Error('file needs a video stream with finite duration');
  const rotation = Number(video.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  const metadata = {
    duration, width: rotated ? video.height : video.width, height: rotated ? video.width : video.height,
    encodedWidth: video.width, encodedHeight: video.height, rotation,
    fps: rational(video.avg_frame_rate), nominalFps: rational(video.r_frame_rate), codec: video.codec_name,
    pixelFormat: video.pix_fmt, audioStreams: audio.length, audioSampleRate: audio[0] ? Number(audio[0].sample_rate) : null,
    videoStreamIndex: video.index, audioStreamIndex: audio[0]?.index ?? null,
  };
  return { probe, metadata };
}

export async function scanFfmpeg(source, metadata, directory, { ffmpeg = 'ffmpeg', threshold = 0.2, timeoutMs = 120000 } = {}) {
  const raw = path.join(directory, 'raw');
  fs.mkdirSync(raw, { recursive: true });
  // No sampling in time: every frame is decoded. Scale controls detector cost;
  // scene scores/freeze labels are candidates, not proof of narrative changes.
  const video = await runTool(ffmpeg, ['-hide_banner', '-nostats', '-threads', '2', '-i', source,
    '-map', `0:${metadata.videoStreamIndex}`, '-an', '-vf', `scale=320:-2,blackdetect=d=0.1:pix_th=0.1,freezedetect=n=-50dB:d=2,select='gt(scene,${threshold})',metadata=print`, '-f', 'null', '-'], { timeoutMs });
  fs.writeFileSync(path.join(raw, 'video.log'), video.stderr);
  const sceneChanges = parseSceneChanges(video.stderr);
  let audioLevels = [], quietIntervals = [], peakDb = null, meanDb = null;
  if (metadata.audioStreams) {
    const audio = await runTool(ffmpeg, ['-hide_banner', '-nostats', '-threads', '2', '-i', source,
      '-map', `0:${metadata.audioStreamIndex}`, '-vn', '-af', 'silencedetect=n=-38dB:d=0.2,aresample=48000,asetnsamples=n=24000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level,volumedetect', '-f', 'null', '-'], { timeoutMs });
    fs.writeFileSync(path.join(raw, 'audio.log'), audio.stderr);
    quietIntervals = parseIntervals(audio.stderr, 'silence', metadata.duration);
    const times = [...audio.stderr.matchAll(/pts_time:([\d.]+)/g)].map((match) => Number(match[1]));
    const levels = [...audio.stderr.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?(?:inf|[\d.]+))/g)].map((match) => match[1] === '-inf' ? null : Number(match[1]));
    audioLevels = times.slice(0, levels.length).map((time, i) => ({ time, rms_db: levels[i] }));
    peakDb = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(audio.stderr)?.[1] ?? NaN);
    meanDb = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(audio.stderr)?.[1] ?? NaN);
    if (!Number.isFinite(peakDb)) peakDb = null;
    if (!Number.isFinite(meanDb)) meanDb = null;
  }
  return {
    engine: 'ffmpeg', sceneChanges, shots: shotsFromChanges(metadata.duration, sceneChanges),
    blackIntervals: parseIntervals(video.stderr, 'black', metadata.duration),
    freezeIntervals: parseIntervals(video.stderr, 'freeze', metadata.duration), quietIntervals,
    audioLevels, peakDb, meanDb, beatAnalysis: null, motionEstimates: null,
  };
}

const MAX_EXTRA_FRAMES = 24;

// Opening, hook and ending frames always; then up to MAX_EXTRA_FRAMES requested
// times (finding midpoints, then scene changes), in the caller's priority order.
export function frameTimes(duration, extra = []) {
  const last = Math.max(0, duration - Math.min(0.1, duration / 10));
  const chosen = [];
  const take = (time, reason) => {
    const t = Math.round(Math.max(0, Math.min(last, time)) * 1000) / 1000;
    if (chosen.some((frame) => Math.abs(frame.time - t) < 0.25)) return false;
    chosen.push({ time: t, reason });
    return true;
  };
  take(0, 'opening'); take(Math.min(1, duration / 3), 'hook'); take(Math.min(2, duration / 2), 'hook'); take(last, 'ending');
  let added = 0;
  for (const item of extra) {
    if (added >= MAX_EXTRA_FRAMES) break;
    if (Number.isFinite(item?.time) && take(item.time, item.reason ?? 'finding')) added++;
  }
  return chosen.sort((x, y) => x.time - y.time);
}

export async function reviewFrames(source, duration, directory, { ffmpeg = 'ffmpeg', timeoutMs = 120000, videoStreamIndex = 0, extra = [] } = {}) {
  const frameCount = Math.max(1, Math.min(24, Math.ceil(duration)));
  const columns = Math.min(6, frameCount), rows = Math.ceil(frameCount / columns);
  await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-y', '-i', source,
    '-map', `0:${videoStreamIndex}`, '-vf', `fps=${frameCount / duration},scale=320:-2,tile=${columns}x${rows}:nb_frames=${frameCount}`,
    '-frames:v', '1', path.join(directory, 'contact-sheet.jpg')], { timeoutMs });
  const times = frameTimes(duration, extra);
  fs.rmSync(path.join(directory, 'frames'), { recursive: true, force: true });
  fs.mkdirSync(path.join(directory, 'frames'), { recursive: true });
  const frames = [];
  for (let i = 0; i < times.length; i++) {
    const file = `frames/review-${String(i + 1).padStart(2, '0')}.jpg`;
    await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-y', '-ss', String(times[i].time), '-i', source, '-map', `0:${videoStreamIndex}`, '-frames:v', '1', '-vf', 'scale=640:-2', path.join(directory, file)], { timeoutMs });
    if (!fs.existsSync(path.join(directory, file))) throw new Error(`frame extraction produced no image at ${times[i].time}`);
    frames.push({ time: times[i].time, reason: times[i].reason, file });
  }
  return { contactSheet: 'contact-sheet.jpg', frames };
}
