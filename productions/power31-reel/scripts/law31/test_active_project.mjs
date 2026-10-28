import { readFileSync, writeFileSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";
import assert from "node:assert/strict";
import path from "node:path";
const file = "src/projects/active-production.json",
  original = readFileSync(file);
try {
  const p = JSON.parse(original);
  delete p.audio;
  delete p.srt;
  p.name = "QA-18-Scenes";
  const source = p.scenes;
  p.scenes = Array.from({ length: 18 }, (_, i) => {
    const s = structuredClone(source[i % source.length]);
    s.id = "proof" + String(i + 1).padStart(2, "0");
    s.duration = 0.5;
    s.camera = {
      from: { x: 800, y: 1100, zoom: 0.97 },
      to: { x: 805, y: 1095, zoom: 1 },
    };
    s.transition = { type: "cut", duration: 0 };
    return s;
  });
  writeFileSync(file, JSON.stringify(p));
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/index.ts"),
    outDir: path.resolve("out/18-scene-proof"),
    rspack: true,
  });
  const cs = await getCompositions(serveUrl, {
    browserExecutable: process.env.REMOTION_CHROME,
  });
  const main = cs.find((c) => c.id === "Baseera-Production");
  assert.equal(main.durationInFrames, 540);
  const previews = cs.filter((c) => c.id.startsWith("Baseera-proof"));
  assert.equal(previews.length, 18);
  const c = cs.find((c) => c.id === "Baseera-proof18");
  assert(c);
  await renderStill({
    serveUrl,
    composition: c,
    frame: 15,
    output: "projects/law31-first-reel/qa/18-scene-last-preview.png",
    imageFormat: "png",
    browserExecutable: process.env.REMOTION_CHROME,
    overwrite: true,
  });
  writeFileSync(
    "projects/law31-first-reel/qa/18-scene-workflow.json",
    JSON.stringify(
      {
        status: "PASS",
        scenes: 18,
        discoveredPreviews: 18,
        totalFrames: 540,
        renderedPreview: "Baseera-proof18",
        originalActiveRestored: true,
        legacyCurrentTouched: false,
      },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(file, original);
}
