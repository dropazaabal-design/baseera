import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.resolve("out", stamp);
await mkdir(output, { recursive: true });
const args = [
  "--require",
  path.resolve("scripts/runtime.cjs"),
  path.resolve("node_modules/@remotion/cli/remotion-cli.js"),
  "render",
  "src/index.ts",
  "AttentionReel",
  path.join(output, "Attention_Reel.mp4"),
  "--codec=h264",
  "--crf=15",
  "--x264-preset=slow",
  "--pixel-format=yuv420p",
  "--color-space=bt709",
  "--audio-bitrate=192k",
  "--image-format=png",
  "--concurrency=4",
];
if (process.env.ATTENTION_CHROME)
  args.push(`--browser-executable=${process.env.ATTENTION_CHROME}`);
const code = await new Promise((resolve) =>
  spawn(process.execPath, args, { stdio: "inherit" }).on("exit", resolve),
);
if (code !== 0) process.exit(Number(code) || 1);
console.log(output);
