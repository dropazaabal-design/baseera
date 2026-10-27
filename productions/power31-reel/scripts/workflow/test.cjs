const assert = require("assert"),
  fs = require("fs");
const api = require("./prepare-project.cjs")();
const project = JSON.parse(
  fs.readFileSync("src/projects/current.json", "utf8"),
);
assert.equal(api.timeline(project).length, 3);
assert.equal(api.timeline(project)[2].from, 1592);
assert.equal(
  api.timeline(project).reduce((n, s) => n + s.durationInFrames, 0),
  2682,
);
for (const preset of api.presets) {
  const c = api.presetCamera({ ...project.scenes[0], preset });
  assert(
    c.keys.every(
      (k) => Number.isFinite(k.x) && Number.isFinite(k.y) && k.zoom > 0,
    ),
  );
  assert.notDeepStrictEqual(c.keys[0], c.keys[1]);
}
assert.equal(
  api.parseSrt("1\r\n00:00:01,250 --> 00:00:02,500\r\nمرحبا\r\nبك")[0].text,
  "مرحبا\nبك",
);
assert.throws(() => api.parseSrt("1\n00:00:03,000 --> 00:00:02,000\nX"));
assert.throws(() =>
  api.validateProject({
    ...project,
    scenes: [{ ...project.scenes[0], duration: 0 }],
  }),
);
assert.throws(() =>
  api.validateProject({
    ...project,
    scenes: [{ ...project.scenes[0], preset: "bad" }],
  }),
);
assert.throws(() =>
  api.validateProject({
    ...project,
    scenes: [
      {
        ...project.scenes[0],
        layers: [{ id: "x", src: "../secret", depth: 0 }],
      },
    ],
  }),
);
console.log(
  JSON.stringify({
    timeline: true,
    presets: 5,
    srtCRLF: true,
    invalidSrtRejected: true,
    invalidDurationRejected: true,
    unknownPresetRejected: true,
    pathTraversalRejected: true,
  }),
);
