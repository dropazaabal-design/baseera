import { bundle } from "@remotion/bundler";
import { getCompositions, openBrowser, renderStill } from "@remotion/renderer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = path.resolve("."),
  qa = path.join(root, "projects/law31-first-reel/qa");
const browserExecutable = process.env.REMOTION_CHROME;
if (!browserExecutable) throw Error("Set REMOTION_CHROME");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/index.ts"),
  outDir: path.join(root, "out/law31-qa-bundle"),
  rspack: true,
  enableCaching: true,
});
const browser = await openBrowser("chrome", { browserExecutable });
try {
  const comps = await getCompositions(serveUrl, { puppeteerInstance: browser });
  writeFileSync(
    path.join(qa, "compositions.json"),
    JSON.stringify(
      comps.map((c) => ({
        id: c.id,
        width: c.width,
        height: c.height,
        fps: c.fps,
        durationInFrames: c.durationInFrames,
      })),
      null,
      2,
    ),
  );
  const composition = comps.find((c) => c.id === "Law31-First-Cinematic-Reel");
  if (!composition) throw Error("Missing composition");
  const p = JSON.parse(
    readFileSync("src/projects/law31-first-reel.json", "utf8"),
  );
  let from = 0;
  const samples = [],
    repeated = [],
    errors = [];
  mkdirSync(path.join(qa, "frames"), { recursive: true });
  mkdirSync(path.join(qa, "repeat"), { recursive: true });
  for (const scene of p.scenes) {
    const n = Math.round(scene.duration * 60);
    const shots = [
      ["start", 0],
      ["middle", Math.floor(n / 2)],
      ["end", n - 1],
    ];
    if (scene.transition?.type === "crossfade") shots.push(["transition", 9]);
    for (const [label, f] of shots) {
      const item = {
        scene: scene.id,
        label,
        frame: from + f,
        file: `frames/${scene.id}-${label}.png`,
      };
      await renderStill({
        serveUrl,
        composition,
        frame: item.frame,
        output: path.join(qa, item.file),
        imageFormat: "png",
        puppeteerInstance: browser,
        overwrite: true,
        onBrowserLog: (l) => {
          if (l.type === "error") errors.push(l.text);
        },
      });
      samples.push(item);
      console.log(item.scene, label, item.frame);
    }
    from += n;
  }
  for (const id of ["scene-01", "scene-03", "scene-05", "scene-11"]) {
    const a = samples.find((s) => s.scene === id && s.label === "middle");
    const repeat = `repeat/${id}.png`;
    await renderStill({
      serveUrl,
      composition,
      frame: a.frame,
      output: path.join(qa, repeat),
      imageFormat: "png",
      puppeteerInstance: browser,
      overwrite: true,
    });
    repeated.push({ ...a, repeat });
  }
  for (const [id, frame] of [
    ["CinematicDemo", 360],
    ["Power31-Cinematic", 300],
    ["Power31", 300],
  ]) {
    await renderStill({
      serveUrl,
      composition: comps.find((c) => c.id === id),
      frame,
      output: path.join(qa, `legacy-${id}.png`),
      imageFormat: "png",
      puppeteerInstance: browser,
      overwrite: true,
    });
  }
  writeFileSync(
    path.join(qa, "frame-samples.json"),
    JSON.stringify({ samples, repeated, browserErrors: errors }, null, 2),
  );
  if (errors.length) throw Error("Browser image errors");
} finally {
  await browser.close({ silent: true });
}
