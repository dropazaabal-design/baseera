import type {
  CameraConfig,
  CameraKeyframe,
  LayerConfig,
} from "../cinematic/CinematicCameraEngine";
export const presets = [
  "slowPush",
  "pullBack",
  "panLeft",
  "driftRight",
  "tiltReveal",
] as const;
export type Preset = (typeof presets)[number];
export type Cue = { start: number; end: number; text: string };
export type SceneConfig = {
  id: string;
  title: string;
  duration: number;
  layers: LayerConfig[];
  preset: Preset;
  parallax?: number;
  narration?: string;
  transition?: { type: "cut" | "crossfade"; duration: number };
  camera?: {
    from?: { x: number; y: number; zoom: number };
    to?: { x: number; y: number; zoom: number };
    keys?: CameraKeyframe[];
  };
};
export type Presentation = {
  showSceneTitle?: boolean;
  compactBrand?: boolean;
  reviewLabel?: string;
  captionFontSize?: number;
  captionBottom?: number;
};
export type Project = {
  name: string;
  audio?: string;
  srt?: string;
  audioOffset?: number;
  presentation?: Presentation;
  scenes: SceneConfig[];
};
export function validateProject(p: Project) {
  if (!p || !Array.isArray(p.scenes) || !p.scenes.length)
    throw new Error("Project requires scenes");
  if (
    p.audioOffset !== undefined &&
    (!Number.isFinite(p.audioOffset) || p.audioOffset < 0)
  )
    throw new Error("audioOffset must be nonnegative");
  const ids = new Set();
  for (const n of [
    p.presentation?.captionFontSize,
    p.presentation?.captionBottom,
  ])
    if (n !== undefined && (!Number.isFinite(n) || n < 0))
      throw new Error("Invalid caption presentation");
  for (const s of p.scenes) {
    if (!/^[A-Za-z0-9-]+$/.test(s.id) || ids.has(s.id))
      throw new Error("Scene ids must be unique");
    ids.add(s.id);
    if (!Number.isFinite(s.duration) || s.duration <= 0)
      throw new Error("Duration must be positive");
    if (!presets.includes(s.preset)) throw new Error("Unknown motion preset");
    if (!Array.isArray(s.layers) || !s.layers.length)
      throw new Error("Scene requires layers");
    const layerIds = new Set<string>();
    for (const l of s.layers) {
      if (!l.id || layerIds.has(l.id))
        throw new Error("Duplicate or missing layer id");
      layerIds.add(l.id);
      if (
        !l.src ||
        l.src.includes("..") ||
        /^[a-z]+:/i.test(l.src) ||
        l.src.startsWith("/")
      )
        throw new Error("Assets must be relative public paths");
      if (!Number.isFinite(l.depth) || Math.abs(l.depth) > 10)
        throw new Error("Depth outside supported range");
      if (
        [l.x, l.y].some((n) => n !== undefined && !Number.isFinite(n)) ||
        (l.scale !== undefined &&
          (!Number.isFinite(l.scale) || l.scale <= 0)) ||
        (l.velocity &&
          (l.velocity.length !== 2 || !l.velocity.every(Number.isFinite))) ||
        (l.reveal &&
          (!Number.isFinite(l.reveal.start) ||
            l.reveal.start < 0 ||
            !Number.isFinite(l.reveal.duration) ||
            l.reveal.duration <= 0))
      )
        throw new Error("Invalid layer transform");
    }
    for (const k of [s.camera?.from, s.camera?.to])
      if (
        k &&
        (!Number.isFinite(k.x) ||
          !Number.isFinite(k.y) ||
          !Number.isFinite(k.zoom) ||
          k.zoom <= 0)
      )
        throw new Error("Invalid camera");
    if (s.camera?.keys) {
      if (s.camera.keys.length < 2) throw new Error("Camera requires two keys");
      s.camera.keys.forEach((k, i, keys) => {
        if (
          ![k.frame, k.x, k.y, k.zoom, k.rotation ?? 0].every(
            Number.isFinite,
          ) ||
          !Number.isInteger(k.frame) ||
          k.frame < 0 ||
          k.frame >= Math.round(s.duration * 60) ||
          k.zoom <= 0 ||
          (i > 0 && k.frame <= keys[i - 1].frame)
        )
          throw new Error("Invalid camera keyframes");
      });
    }
    if (
      s.transition &&
      (!["cut", "crossfade"].includes(s.transition.type) ||
        !Number.isFinite(s.transition.duration) ||
        s.transition.duration < 0 ||
        s.transition.duration > s.duration / 2)
    )
      throw new Error("Invalid scene transition");
    if (
      s.parallax !== undefined &&
      (!Number.isFinite(s.parallax) || s.parallax < 0 || s.parallax > 2)
    )
      throw new Error("Parallax must be 0..2");
  }
  return p;
}
export function timeline(p: Project) {
  validateProject(p);
  let from = 0;
  return p.scenes.map((s) => {
    const durationInFrames = Math.max(1, Math.round(s.duration * 60));
    const item = { scene: s, from, durationInFrames };
    from += durationInFrames;
    return item;
  });
}
export function presetCamera(scene: SceneConfig): CameraConfig {
  if (scene.camera?.keys) return { keys: scene.camera.keys };
  const n = Math.max(1, Math.round(scene.duration * 60) - 1);
  let a = { x: 800, y: 1530, zoom: 0.92 },
    b = { x: 820, y: 1510, zoom: 1 };
  switch (scene.preset) {
    case "pullBack":
      a = { x: 800, y: 1100, zoom: 0.9 };
      b = { x: 800, y: 1100, zoom: 0.64 };
      break;
    case "panLeft":
      a = { x: 830, y: 1200, zoom: 0.78 };
      b = { x: 750, y: 1200, zoom: 0.78 };
      break;
    case "driftRight":
      a = { x: 750, y: 1100, zoom: 0.72 };
      b = { x: 830, y: 1100, zoom: 0.78 };
      break;
    case "tiltReveal":
      a = { x: 800, y: 1500, zoom: 0.9 };
      b = { x: 800, y: 650, zoom: 0.85 };
      break;
  }
  return {
    keys: [
      { frame: 0, ...a, ...scene.camera?.from },
      { frame: n, ...b, ...scene.camera?.to },
    ],
  };
}
export function parseSrt(text: string): Cue[] {
  return text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) throw new Error("Invalid SRT block");
      const parts = lines[i].split("-->").map((s) => s.trim());
      const time = (s: string) => {
        const m = s.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
        if (!m) throw new Error("Invalid SRT timestamp");
        return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
      };
      const start = time(parts[0]),
        end = time(parts[1]);
      if (end <= start) throw new Error("Invalid SRT interval");
      return { start, end, text: lines.slice(i + 1).join("\n") };
    });
}
