// Checks the demo reel's MP4 against the frames the engine drew:
//
//   FFMPEG=/path/to/ffmpeg node scripts/arabic-text-video-check.mjs [docs/arabic-text/reel]
//
// ffmpeg is an outside inspection tool here (not a project dependency):
// it reads the container (codec, size, frame count, duration), decodes each
// keyframe listed in reel.json out of the file, and compares it with the PNG
// drawFrame produced for the same frame number (SSIM; 1 = identical; lossy
// compression keeps it a little under 1). A mismatched frame index or a
// missing/shifted text shows as a clear drop. Without ffmpeg the check is
// reported as not run, never as passed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.resolve(root, process.argv[2] ?? 'docs/arabic-text/reel');
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'reel.json'), 'utf8'));
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
// ffmpeg reports on stderr; keep both streams whatever the exit code.
const runErr = (args) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', ...args], { encoding: 'utf8' });
  if (r.error) throw r.error;
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
};
const run = runErr;

let version = null;
try {
  version = run(['-version']).split('\n')[0];
} catch {
  const out = { run: false, reason: `ffmpeg not found (${ffmpeg}): the MP4 was not inspected` };
  fs.writeFileSync(path.join(dir, 'video-check.json'), `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(out));
  process.exit(0);
}

const file = path.join(dir, meta.file);
const info = runErr(['-i', file]);
const stream = /Stream #0:0.*Video: ([^,]+).*?, (\d+)x(\d+).*?, ([\d.]+) fps/.exec(info);
const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
const decoded = runErr(['-i', file, '-f', 'null', '-']);
const frames = Number([...decoded.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'at-video-'));
const keyframes = meta.keyframes.map((k) => {
  const out = path.join(tmp, `${k.scene}-${k.name}.png`);
  runErr(['-y', '-i', file, '-vf', `select=eq(n\\,${k.frame})`, '-vsync', '0', '-frames:v', '1', out]);
  const s = runErr(['-i', out, '-i', path.join(dir, k.file), '-lavfi', 'ssim', '-f', 'null', '-']);
  const all = Number(/All:([\d.]+)/.exec(s)?.[1]);
  return { scene: k.scene + 1, name: k.name, frame: k.frame, ssim: all };
});
fs.rmSync(tmp, { recursive: true, force: true });
const minSsim = Math.min(...keyframes.map((k) => k.ssim));
const out = {
  run: true,
  tool: version,
  container: path.extname(meta.file).slice(1),
  codec: stream?.[1]?.trim(),
  size: stream ? `${stream[2]}×${stream[3]}` : null,
  fps: stream ? Number(stream[4]) : null,
  frames,
  expectedFrames: meta.frames,
  duration: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
  keyframes,
  minSsim,
  ok: frames === meta.frames && stream?.[2] === '1080' && stream?.[3] === '1920' && minSsim > 0.995,
};
fs.writeFileSync(path.join(dir, 'video-check.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify({ ...out, keyframes: undefined, worst: keyframes.sort((a, b) => a.ssim - b.ssim).slice(0, 3) }, null, 1));
