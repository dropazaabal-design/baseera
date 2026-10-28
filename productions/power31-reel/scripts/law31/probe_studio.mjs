import { spawn } from "node:child_process";
import { openSync, closeSync, writeFileSync } from "node:fs";
const out = openSync("projects/law31-first-reel/qa/studio-probe.log", "w");
const child = spawn(
  process.execPath,
  [
    "--require",
    "./scripts/runtime.cjs",
    "node_modules/@remotion/cli/remotion-cli.js",
    "studio",
    "src/index.ts",
    "--port=3005",
  ],
  { stdio: ["ignore", out, out] },
);
try {
  let ok = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:3005");
      if (r.ok) {
        const text = await r.text();
        writeFileSync(
          "projects/law31-first-reel/qa/studio-http.json",
          JSON.stringify(
            {
              status: "PASS",
              httpStatus: r.status,
              bytes: text.length,
              scope:
                "Studio start and HTTP response inside isolated probe process. GUI controls were not automated.",
            },
            null,
            2,
          ),
        );
        ok = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ok) throw Error("Studio HTTP probe failed");
} finally {
  child.kill("SIGTERM");
  closeSync(out);
}
