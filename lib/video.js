import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { release, renderStable, snapshotOptions } from './exportEngine.js';
import { REEL, layerMotion, sceneIndexAt, sceneZoom } from './timeline.js';
import { captureTextLayer, drawTextLayer } from './arabic-text/video.js';

// Reel engine: render once, composite many.
//
// Each slide is rendered by the same DOM pipeline as the PNG export, once
// as a base frame (animated elements hidden) and once per element marked
// `data-anim` (everything else hidden, transparent background). Frames then
// only composite those bitmaps with opacity, offset and scale. Arabic text
// is never re-shaped per frame, so letter joining, bidi isolation and font
// weights are identical in every frame by construction, and frames are cheap
// enough to encode faster than real time.

const LAYER_MARGIN = 48;
const VIDEO_BITRATE = 8_000_000; // room for diacritics, rings and shadows outside the element box

const abortError = () => new DOMException('أُلغي التصدير', 'AbortError');

function elementRect(root, el, width, height) {
  const R = root.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const k = root.offsetWidth / R.width; // undo any preview scaling
  const x = Math.max(0, Math.floor((r.left - R.left) * k - LAYER_MARGIN));
  const y = Math.max(0, Math.floor((r.top - R.top) * k - LAYER_MARGIN));
  const right = Math.min(width, Math.ceil((r.right - R.left) * k + LAYER_MARGIN));
  const bottom = Math.min(height, Math.ceil((r.bottom - R.top) * k + LAYER_MARGIN));
  return { x, y, width: right - x, height: bottom - y };
}

function crop(source, { x, y, width, height }) {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d').drawImage(source, x, y, width, height, 0, 0, width, height);
  return out;
}

// The attribute is read by CSS in app/globals.css while html-to-image
// clones the node, and removed right after.
async function snapshotWith(node, attrs, options) {
  attrs.forEach(([el, name]) => el.setAttribute(name, ''));
  try {
    return await renderStable(node, options);
  } finally {
    attrs.forEach(([el, name]) => el.removeAttribute(name));
  }
}

export async function captureScene(node, options) {
  const base = { ...(await snapshotOptions(node, options)), pixelRatio: 1 };
  const solo = { ...base, backgroundColor: undefined, style: { ...base.style, background: 'transparent' } };
  const frame = await snapshotWith(node, [[node, 'data-video-base']], base);
  const layers = [];
  for (const el of node.querySelectorAll('[data-anim]')) {
    const rect = elementRect(node, el, options.width, options.height);
    // Arabic text with its own motion (word, line, reveal, highlight): the
    // shaped paragraph is measured here, once; frames move pieces of the
    // layer (lib/arabic-text/video.js). A highlight motion draws its own
    // bands, so the static marker is left out of the layer.
    const text = captureTextLayer(el, node, rect);
    if (text?.error) throw new Error(text.error);
    const attrs = [[node, 'data-video-solo'], [el, 'data-video-show'], ...(text?.highlightOnly ? [[el, 'data-video-nomarks']] : [])];
    const full = await snapshotWith(node, attrs, solo);
    layers.push({ effect: el.dataset.anim, canvas: crop(full, rect), ...rect, ...(text && { text }) });
    release(full);
  }
  return { base: frame, layers };
}

export async function captureReel(nodes, options, onProgress, signal) {
  const scenes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (signal?.aborted) throw abortError();
    onProgress?.(i, nodes.length);
    scenes.push(await captureScene(nodes[i], options));
  }
  return scenes;
}

export function releaseReel(scenes) {
  for (const s of scenes) {
    release(s.base);
    s.layers.forEach((l) => release(l.canvas));
  }
}

// Frames are numbered: the player and the encoder both draw frame
// round(t × fps), so a preview frame is the exported frame.
export function drawFrame(ctx, scenes, timeline, time, { accent, insetTop, fps = REEL.fps, highlight }) {
  const { width, height } = ctx.canvas;
  const frame = Math.round(time * fps);
  const t = frame / fps;
  const i = sceneIndexAt(timeline, t);
  const scene = scenes[i];
  const timing = timeline.scenes[i];

  ctx.save();
  const zoom = sceneZoom(timing, t);
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-width / 2, -height / 2);
  ctx.drawImage(scene.base, 0, 0);
  scene.layers.forEach((layer, j) => {
    if (layer.text) {
      drawTextLayer(ctx, layer, frame - Math.round(timing.layers[j].start * fps), { highlight });
      return;
    }
    const m = layerMotion(layer.effect, timing.layers[j], t);
    if (m.opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = m.opacity;
    ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2 + m.dy);
    ctx.scale(m.scale, m.scale);
    ctx.drawImage(layer.canvas, -layer.width / 2, -layer.height / 2);
    ctx.restore();
  });
  ctx.restore();

  // Watch-progress bar, filling from the right like the RTL pagination bar.
  const filled = Math.round(width * Math.min(1, t / timeline.duration));
  ctx.fillStyle = accent;
  ctx.fillRect(width - filled, insetTop, filled, 10);
}

// Frame-perfect path: WebCodecs encoding with explicit timestamps, so the
// file is exactly `duration` long however slow the device renders. MP4/H.264
// first (what Instagram and Facebook ingest best), WebM where the browser
// has no H.264 encoder (e.g. open-source Chromium builds).
// container "mp4" keeps an MP4 file even without an H.264 encoder (VP9 or
// AV1 in MP4); by default, as before, a non-H.264 codec goes into WebM.
async function encodeWebCodecs(canvas, frames, fps, draw, onProgress, signal, container = 'auto', bitrate = VIDEO_BITRATE) {
  const codec = await getFirstEncodableVideoCodec(container === 'mp4' ? ['avc', 'vp9', 'av1'] : ['avc', 'vp9', 'vp8'], { width: canvas.width, height: canvas.height });
  if (!codec) return null;
  const format = codec === 'avc' || container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
  const output = new Output({ format, target: new BufferTarget() });
  // Text on flat colour needs bits more than a generic quality preset gives
  // it: at ~0.3 Mb/s the encoder left ghosts of moving Arabic text (marks
  // below the baseline) for seconds. An explicit bitrate, the same as the
  // MediaRecorder path, a key frame every second and a text content hint.
  const source = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate }), keyFrameInterval: 1, contentHint: 'text' });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  for (let f = 0; f < frames; f++) {
    if (signal?.aborted) {
      await output.cancel();
      throw abortError();
    }
    draw(f);
    await source.add(f / fps, 1 / fps); // awaits encoder backpressure
    onProgress?.(f + 1, frames);
  }
  await output.finalize();
  return { blob: new Blob([output.target.buffer], { type: format.mimeType }), extension: format.fileExtension.slice(1), codec };
}

const waitUntil = (time) => new Promise((resolve) => setTimeout(resolve, Math.max(0, time - performance.now())));

// Fallback for browsers without WebCodecs: MediaRecorder records in real
// time, so frames are paced by the clock and the tab must stay visible.
async function recordRealtime(canvas, frames, fps, draw, onProgress, signal) {
  const mimeType = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const stream = canvas.captureStream(0);
  const [track] = stream.getVideoTracks();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITRATE });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start();
  const t0 = performance.now();
  for (let f = 0; f < frames && !signal?.aborted; f++) {
    await waitUntil(t0 + (f * 1000) / fps);
    draw(f);
    track.requestFrame();
    onProgress?.(f + 1, frames);
  }
  await waitUntil(t0 + (frames * 1000) / fps);
  recorder.stop();
  await stopped;
  track.stop();
  if (signal?.aborted) throw abortError();
  return { blob: new Blob(chunks, { type: mimeType }), extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm', codec: 'MediaRecorder' };
}

export async function encodeReel(scenes, timeline, { width, height, accent, insetTop, highlight, fps = REEL.fps, container = 'auto', onProgress, signal }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const frames = Math.round(timeline.duration * fps);
  const draw = (f) => drawFrame(ctx, scenes, timeline, f / fps, { accent, insetTop, fps, highlight });
  try {
    const encoded = typeof VideoEncoder === 'undefined' ? null : await encodeWebCodecs(canvas, frames, fps, draw, onProgress, signal, container);
    return encoded ?? (await recordRealtime(canvas, frames, fps, draw, onProgress, signal));
  } finally {
    release(canvas);
  }
}
