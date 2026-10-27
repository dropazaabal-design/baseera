import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { gsap } from "gsap";
export type CameraKeyframe = {
  frame: number;
  x: number;
  y: number;
  zoom: number;
  rotation?: number;
};
export type CameraConfig = {
  keys: CameraKeyframe[];
  shake?: number;
  seed?: number;
};
export type LayerConfig = {
  id: string;
  src?: string;
  depth: number;
  x?: number;
  y?: number;
  scale?: number;
  reveal?: { start: number; duration: number };
  velocity?: [number, number];
};
export function CameraKeyframes(frame: number, keys: CameraKeyframe[]) {
  if (!keys.length) throw new Error("Camera requires keyframes");
  for (let i = 0; i < keys.length; i++)
    if (keys[i].zoom <= 0 || (i && keys[i].frame <= keys[i - 1].frame))
      throw new Error("Invalid camera keys");
  const a = [...keys].reverse().find((k) => k.frame <= frame) ?? keys[0];
  const b = keys.find((k) => k.frame > frame) ?? a;
  const t =
    a === b
      ? 0
      : gsap.parseEase("power2.inOut")(
          Math.min(1, Math.max(0, (frame - a.frame) / (b.frame - a.frame))),
        );
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    zoom: a.zoom + (b.zoom - a.zoom) * t,
    rotation: (a.rotation ?? 0) + ((b.rotation ?? 0) - (a.rotation ?? 0)) * t,
  };
}
export function CameraShake(frame: number, amplitude = 0, seed = 1) {
  return {
    x: Math.sin(frame * 1.731 + seed) * amplitude,
    y: Math.sin(frame * 2.317 + seed * 3) * amplitude,
  };
}
export function SmoothCameraFollow(
  frame: number,
  keys: CameraKeyframe[],
  lagFrames = 12,
) {
  return CameraKeyframes(Math.max(0, frame - lagFrames), keys);
}
export function FocusTarget(
  frame: number,
  target: { x: number; y: number },
  zoom = 1,
): CameraKeyframe {
  return { frame, ...target, zoom };
}
export function layerTransform(
  frame: number,
  config: CameraConfig,
  layer: LayerConfig,
) {
  const c = CameraKeyframes(frame, config.keys),
    s = CameraShake(frame, config.shake, config.seed);
  const factor = 1 + layer.depth * 0.18;
  return {
    x:
      540 -
      (c.x - 800) * c.zoom * factor +
      (layer.x ?? 0) +
      (layer.velocity?.[0] ?? 0) * frame +
      s.x,
    y:
      960 -
      (c.y - 1100) * c.zoom * factor +
      (layer.y ?? 0) +
      (layer.velocity?.[1] ?? 0) * frame +
      s.y,
    scale: c.zoom * (layer.scale ?? 1) * (1 + layer.depth * 0.035),
    rotation: c.rotation,
  };
}
export const CinematicCamera: React.FC<{
  config: CameraConfig;
  children: React.ReactNode;
}> = ({ children }) => (
  <AbsoluteFill style={{ overflow: "hidden", background: "#091525" }}>
    {children}
  </AbsoluteFill>
);
export const ParallaxLayer: React.FC<{
  camera: CameraConfig;
  layer: LayerConfig;
  children?: React.ReactNode;
}> = ({ camera, layer, children }) => {
  const f = useCurrentFrame();
  const t = layerTransform(f, camera, layer);
  return (
    <div
      data-layer={layer.id}
      style={{
        position: "absolute",
        width: 1600,
        height: 2200,
        left: t.x - 800,
        top: t.y - 1100,
        transformOrigin: "800px 1100px",
        transform: `rotate(${t.rotation}deg) scale(${t.scale})`,
      }}
    >
      {layer.src ? (
        <Img
          src={staticFile(layer.src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: layer.reveal
              ? Math.max(
                  0,
                  Math.min(1, (f - layer.reveal.start) / layer.reveal.duration),
                )
              : 1,
          }}
        />
      ) : (
        children
      )}
    </div>
  );
};
export const ParallaxScene: React.FC<{
  camera: CameraConfig;
  layers: LayerConfig[];
}> = ({ camera, layers }) => (
  <CinematicCamera config={camera}>
    {[...layers]
      .sort((a, b) => a.depth - b.depth)
      .map((layer) => (
        <ParallaxLayer key={layer.id} camera={camera} layer={layer} />
      ))}
  </CinematicCamera>
);
export const CinematicCameraEngine = ParallaxScene;
export const CharacterAnimator: React.FC<{
  enter?: number;
  exit?: number;
  children: React.ReactNode;
}> = ({ enter = 0, exit = Infinity, children }) => {
  const f = useCurrentFrame();
  const p = Math.max(0, Math.min(1, (f - enter) / 30, (exit - f) / 30));
  return (
    <div style={{ opacity: p, translate: `${(1 - p) * 100}px 0px` }}>
      {children}
    </div>
  );
};
export const DoorReveal: React.FC<{
  start: number;
  duration?: number;
  children: React.ReactNode;
}> = ({ start, duration = 90, children }) => {
  const f = useCurrentFrame();
  const p = Math.max(0, Math.min(1, (f - start) / duration));
  return (
    <div
      style={{
        transformOrigin: "left center",
        transform: `perspective(1000px) rotateY(${-75 * p}deg)`,
      }}
    >
      {children}
    </div>
  );
};
export const LightTransition: React.FC<{
  start: number;
  duration: number;
  color?: string;
}> = ({ start, duration, color = "#74DFF1" }) => {
  const f = useCurrentFrame();
  const p = (f - start) / duration;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: color,
        opacity: p > 0 && p < 1 ? Math.sin(p * Math.PI) * 0.12 : 0,
      }}
    />
  );
};
export const SceneTransition: React.FC<{
  start: number;
  duration: number;
  children: React.ReactNode;
}> = ({ start, duration, children }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ opacity: Math.max(0, Math.min(1, (f - start) / duration)) }}>
      {children}
    </div>
  );
};
export const SceneDirector: React.FC<{
  camera: CameraConfig;
  layers: LayerConfig[];
}> = (props) => {
  const { fps } = useVideoConfig();
  return (
    <>
      <ParallaxScene {...props} />
      <LightTransition start={5 * fps} duration={fps} />
    </>
  );
};

export const CameraMoves = {
  pan: (frame: number, x: number, y: number, zoom = 1): CameraKeyframe => ({
    frame,
    x,
    y,
    zoom,
  }),
  tilt: FocusTarget,
  dolly: FocusTarget,
  push: FocusTarget,
};
