import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { openStudio } from '../studio.js';
import { FsStore, defaultHome } from './fsStore.js';

// Node context for the Canva tools (CLI and MCP server): the studio store
// (~/.baseera), file access, and only the one environment variable the
// tools read (a Connect API token, never written anywhere).
export function nodeContext({ home = defaultHome(), env = process.env } = {}) {
  const store = new FsStore(home);
  return {
    store,
    studio: openStudio(store, { session: env.BASEERA_SESSION ?? null }),
    env: { CANVA_ACCESS_TOKEN: env.CANVA_ACCESS_TOKEN || undefined },
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    inflateRaw: zlib.inflateRawSync,
    tmpDir: path.join(os.tmpdir(), 'baseera-canva'),
    join: path.join,
    detectSceneCuts,
    readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
    readBytes: (p) => new Uint8Array(fs.readFileSync(p)),
    writeFile: (p, bytes) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, bytes);
    },
  };
}

// Scene cuts in a video, by ffmpeg's scene score, when ffmpeg is installed.
// Returns null without ffmpeg (per-scene timing then stays unverified).
export function detectSceneCuts(file, { threshold = 0.3 } = {}) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-filter:v', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { encoding: 'utf8', timeout: 120000 });
  if (run.error || run.status !== 0) return null;
  const cuts = [...run.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  return { cuts, source: `ffmpeg scene>${threshold}` };
}
