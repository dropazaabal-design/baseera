import type { CameraConfig, LayerConfig } from "./CinematicCameraEngine";
export const camera: CameraConfig = {
  keys: [
    { frame: 0, x: 800, y: 1530, zoom: 0.92 },
    { frame: 180, x: 820, y: 1510, zoom: 1 },
    { frame: 420, x: 750, y: 650, zoom: 0.92 },
    { frame: 719, x: 800, y: 1100, zoom: 0.64 },
  ],
};
export const layers: LayerConfig[] = [
  { id: "background", src: "cinematic/background.svg", depth: -2 },
  {
    id: "castle-and-roads",
    reveal: { start: 420, duration: 120 },
    src: "cinematic/roads.svg",
    depth: -1,
  },
  { id: "controller", src: "cinematic/controller.svg", depth: 0 },
  { id: "doors", src: "cinematic/doors.svg", depth: 1 },
  { id: "character", src: "cinematic/character.svg", depth: 2 },
  { id: "foreground", src: "cinematic/foreground.svg", depth: 3 },
];
