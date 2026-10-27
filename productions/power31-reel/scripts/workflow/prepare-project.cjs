const fs = require("fs"),
  path = require("path"),
  ts = require("typescript"),
  Module = require("module"),
  cp = require("child_process");
function configModule() {
  const filename = path.resolve("workflow-config.cjs");
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = module.paths;
  m._compile(
    ts.transpileModule(fs.readFileSync("src/workflow/config.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    filename,
  );
  return m.exports;
}
module.exports = configModule;
if (require.main === module) {
  const input = process.argv[2];
  if (!input)
    throw new Error(
      "Usage: node scripts/workflow/prepare-project.cjs project.json",
    );
  const p = JSON.parse(fs.readFileSync(input, "utf8"));
  const api = configModule();
  const asset = (s) => {
    if (s.includes("..") || s.startsWith("/") || /^[a-z]+:/i.test(s))
      throw new Error("Only relative public assets");
    const f = path.join("public", s);
    if (!fs.existsSync(f)) throw new Error("Missing asset " + s);
    return f;
  };
  let cues = [];
  if (p.srt) cues = api.parseSrt(fs.readFileSync(asset(p.srt), "utf8"));
  for (const [i, s] of p.scenes.entries()) {
    if (s.endCue !== undefined) {
      const end = cues[s.endCue - 1];
      if (!end) throw new Error("endCue out of range");
      const start = p.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0);
      s.duration = end.end - (p.audioOffset ?? 0) - start;
    }
    for (const l of s.layers) asset(l.src);
  }
  api.validateProject(p);
  const total =
    api.timeline(p).reduce((n, s) => n + s.durationInFrames, 0) / 60;
  if (p.audio) {
    const f = asset(p.audio);
    const duration = +cp.execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        f,
      ],
      { encoding: "utf8" },
    );
    if (duration - (p.audioOffset ?? 0) + 0.1 < total)
      throw new Error("Narration is shorter than timeline");
  }
  fs.writeFileSync(
    "src/projects/current.json",
    JSON.stringify(p, null, 2) + "\n",
  );
  fs.mkdirSync("out", { recursive: true });
  fs.writeFileSync(
    "out/project-props.json",
    JSON.stringify({ project: p }, null, 2),
  );
  console.log(
    JSON.stringify({
      scenes: p.scenes.length,
      duration: total,
      frames: Math.round(total * 60),
      assets: "validated",
      audio: !!p.audio,
      srtCues: cues.filter((c) => c.start < total).length,
    }),
  );
}
