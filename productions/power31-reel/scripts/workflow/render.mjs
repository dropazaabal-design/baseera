import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const input = process.argv[2] ?? "src/projects/current.json";
let r = spawnSync(
  process.execPath,
  ["scripts/workflow/prepare-project.cjs", input],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
const folder = "out/project-" + new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(folder, { recursive: true });
const args = [
  "--require",
  "./scripts/runtime.cjs",
  "node_modules/@remotion/cli/remotion-cli.js",
  "render",
  "src/index.ts",
  "Power31-Cinematic",
  folder + "/video.mp4",
  "--codec=h264",
  "--crf=15",
  "--pixel-format=yuv420p",
  "--audio-bitrate=192k",
];
if (process.env.REMOTION_CHROME)
  args.push("--browser-executable=" + process.env.REMOTION_CHROME);
r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
