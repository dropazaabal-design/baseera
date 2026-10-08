import { spawn } from 'node:child_process';
import path from 'node:path';

// Never interpolate paths into a shell. Bound runtime and log memory, and do
// not pass the host's API tokens to media tools or the optional Python engine.
export function runTool(binary, args, { timeoutMs = 120000, maxBytes = 16 * 1024 * 1024 } = {}) {
  if (['ffmpeg', 'ffprobe'].includes(path.basename(binary).replace(/\.exe$/i, '')) && !args.includes('-version'))
    args = ['-protocol_whitelist', 'file,pipe', ...args];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(PATH|SystemRoot|WINDIR|TMP|TEMP|TMPDIR|LANG|LC_ALL|PYTHONPATH|VIRTUAL_ENV)$/i.test(key)));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const terminate = () => {
      try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); }
      catch { /* Process may already have exited. */ }
    };
    let stdout = '', stderr = '', bytes = 0, failure = null;
    const timer = setTimeout(() => { failure = new Error(`${binary}: analysis timed out`); terminate(); }, timeoutMs);
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) { failure = new Error(`${binary}: output limit exceeded`); terminate(); return; }
      if (target === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`${binary}: ${error.code ?? error.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${binary} exited ${code}: ${stderr.slice(-2400)}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function doctor({ ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', python = 'python3', engine = 'ffmpeg' } = {}) {
  if (!['ffmpeg', 'upstream'].includes(engine)) throw new Error('engine must be ffmpeg or upstream');
  const checks = await Promise.all([ffmpeg, ffprobe].map(async (binary) => {
    try { const result = await runTool(binary, ['-version'], { timeoutMs: 10000 }); return { binary, available: true, version: result.stdout.split('\n')[0] }; }
    catch (error) { return { binary, available: false, reason: error.message }; }
  }));
  if (engine === 'upstream') {
    try {
      await runTool(python, ['-c', 'import sys, cv2, librosa, numpy, soundfile; assert sys.version_info >= (3, 11)'], { timeoutMs: 30000 });
      checks.push({ binary: python, available: true, dependencies: ['opencv-python-headless', 'librosa', 'numpy', 'soundfile'] });
    } catch (error) { checks.push({ binary: python, available: false, reason: error.message }); }
  }
  return { kind: 'reel-review-capabilities', ok: checks.every((check) => check.available), engine, network: false, checks };
}
