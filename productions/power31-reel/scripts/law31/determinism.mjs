import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill, openBrowser } from "@remotion/renderer";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const qa = "projects/law31-first-reel/qa";
const rows = JSON.parse(
  readFileSync(qa + "/frame-samples.json", "utf8"),
).repeated;
const url = await bundle({
  entryPoint: path.resolve("src/index.ts"),
  outDir: path.resolve("out/final-determinism-bundle"),
  rspack: true,
});
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.REMOTION_CHROME,
});
try {
  const c = (await getCompositions(url, { puppeteerInstance: browser })).find(
    (c) => c.id === "Law31-First-Cinematic-Reel",
  );
  const result = [];
  mkdirSync(qa + "/determinism-final", { recursive: true });
  for (const row of rows) {
    const files = [];
    for (const pass of ["a", "b"]) {
      const file = qa + `/determinism-final/${row.scene}-${pass}.png`;
      await renderStill({
        serveUrl: url,
        composition: c,
        frame: row.frame,
        output: file,
        imageFormat: "png",
        puppeteerInstance: browser,
        overwrite: true,
      });
      files.push(file);
    }
    const hashes = files.map((f) =>
      createHash("sha256").update(readFileSync(f)).digest("hex"),
    );
    if (hashes[0] !== hashes[1])
      throw Error("Nonidentical repeated PNG " + row.scene);
    result.push({
      scene: row.scene,
      frame: row.frame,
      files,
      sha256A: hashes[0],
      sha256B: hashes[1],
      fileHashesEqual: true,
    });
  }
  writeFileSync(
    qa + "/determinism-final.json",
    JSON.stringify(
      {
        status: "PASS_FILE_HASHES",
        samples: result,
        scope:
          "Same final source, assets, browser and runtime; AI regeneration not tested",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close({ silent: true });
}
