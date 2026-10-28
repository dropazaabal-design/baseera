import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const input = process.argv[2] ?? "src/projects/law31-first-reel.json",
  id = process.argv[3] ?? "Law31-First-Cinematic-Reel";
const output =
  process.argv[4] ??
  "projects/law31-first-reel/renders/Law31-Visual-Review-1080x1920-60fps.mp4";
const props = "out/law31-props.json";
mkdirSync("out", { recursive: true });
mkdirSync(dirname(output), { recursive: true });
let r = spawnSync(
  process.execPath,
  [
    "scripts/workflow/prepare-project.cjs",
    input,
    "--no-register",
    `--props=${props}`,
  ],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
const args = [
  "--require",
  "./scripts/runtime.cjs",
  "node_modules/@remotion/cli/remotion-cli.js",
  "render",
  "src/index.ts",
  id,
  output,
  `--props=${props}`,
  "--codec=h264",
  "--crf=16",
  "--x264-preset=slow",
  "--pixel-format=yuv420p",
  "--color-space=bt709",
  "--image-format=png",
  "--concurrency=4",
];
if (process.env.REMOTION_CHROME)
  args.push(`--browser-executable=${process.env.REMOTION_CHROME}`);
r = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
