import { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import { Audio } from "@remotion/media";
import { ParallaxScene } from "../cinematic/CinematicCameraEngine";
import {
  parseSrt,
  presetCamera,
  timeline,
  type Project,
  type SceneConfig,
  type Cue,
} from "./config";
import "../design";
export const ProductionScene = ({ scene }: { scene: SceneConfig }) => (
  <AbsoluteFill>
    <ParallaxScene
      camera={presetCamera(scene)}
      layers={scene.layers.map((l) => ({
        ...l,
        depth: l.depth * (scene.parallax ?? 1),
      }))}
    />
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 420,
        background: "linear-gradient(#091525,transparent)",
      }}
    />
    <div
      dir="rtl"
      style={{
        position: "absolute",
        top: 110,
        right: 80,
        left: 80,
        fontFamily: "Alexandria",
        fontSize: 62,
        lineHeight: 1.5,
        color: "#F8FAFC",
      }}
    >
      {scene.title}
    </div>
    <div
      dir="rtl"
      style={{
        position: "absolute",
        bottom: 90,
        right: 80,
        left: 80,
        fontFamily: "Cairo",
        fontSize: 32,
        color: "#B5DDD9",
      }}
    >
      القانون 31 · لفهم التلاعب لا لممارسته ·{" "}
      <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
        @kitabwbs
      </span>
    </div>
  </AbsoluteFill>
);
const Subtitles = ({ cues }: { cues: Cue[] }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = cues.find((c) => f / fps >= c.start && f / fps < c.end);
  return c ? (
    <div
      dir="rtl"
      style={{
        position: "absolute",
        bottom: 200,
        left: 90,
        right: 90,
        textAlign: "center",
        fontFamily: "Cairo",
        fontSize: 49,
        lineHeight: 1.45,
        color: "white",
        background: "rgba(3,7,13,.9)",
        padding: "16px 24px",
        borderRadius: 12,
        whiteSpace: "pre-line",
      }}
    >
      {c.text}
    </div>
  ) : null;
};
export const Production = ({ project }: { project: Project }) => {
  const items = timeline(project);
  const { fps } = useVideoConfig();
  const handle = useMemo(() => delayRender("Load SRT: " + (project.srt ?? "none")), [project.srt]);
  const [cues, setCues] = useState<Cue[]>([]);
  useEffect(() => {
    let active = true;
    if (!project.srt) {
      continueRender(handle);
      return;
    }
    fetch(staticFile(project.srt))
      .then((r) => {
        if (!r.ok) throw new Error("SRT missing");
        return r.text();
      })
      .then((t) => {
        if (active) {
          setCues(parseSrt(t));
          continueRender(handle);
        }
      })
      .catch(cancelRender);
    return () => {
      active = false;
      continueRender(handle);
    };
  }, [project.srt, handle]);
  return (
    <AbsoluteFill style={{ background: "#091525" }}>
      {items.map(({ scene, from, durationInFrames }) => (
        <Sequence
          key={scene.id}
          name={scene.id}
          from={from}
          durationInFrames={durationInFrames}
          premountFor={fps}
        >
          <ProductionScene scene={scene} />
        </Sequence>
      ))}
      {project.audio && (
        <Audio
          src={staticFile(project.audio)}
          trimBefore={Math.round((project.audioOffset ?? 0) * fps)}
          premountFor={fps}
        />
      )}
      <Subtitles
        cues={cues.map((c) => ({
          ...c,
          start: c.start - (project.audioOffset ?? 0),
          end: c.end - (project.audioOffset ?? 0),
        }))}
      />
    </AbsoluteFill>
  );
};

export const ScenePreview = ({
  project,
  index,
}: {
  project: Project;
  index: number;
}) => {
  const items = timeline(project);
  const item = items[index];
  if (!item) throw new Error("Scene index out of range");
  return (
    <Sequence
      from={-item.from}
      durationInFrames={items.reduce((n, s) => n + s.durationInFrames, 0)}
    >
      <Production project={project} />
    </Sequence>
  );
};
