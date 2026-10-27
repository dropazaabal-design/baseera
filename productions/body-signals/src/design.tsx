import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
  Img,
  Easing,
  getStaticFiles,
} from "remotion";
import { loadFont } from "@remotion/fonts";

loadFont({
  family: "Alexandria",
  url: staticFile("fonts/Alexandria-Bold.ttf"),
  weight: "700",
});
loadFont({
  family: "Alexandria",
  url: staticFile("fonts/Alexandria-Medium.ttf"),
  weight: "500",
});
loadFont({
  family: "Cairo",
  url: staticFile("fonts/Cairo-SemiBold.ttf"),
  weight: "600",
});

export const C = {
  ink: "#19323A",
  paper: "#F4F6F2",
  teal: "#137F80",
  tealPale: "#D8EAE5",
  blue: "#4676A0",
  bluePale: "#E0EAF1",
  purple: "#6B5B95",
  purplePale: "#E8E2EF",
  red: "#B74E5B",
  redPale: "#F0DFE0",
  muted: "#667D81",
  line: "#D5DEDA",
  white: "#FFFFFF",
};
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const ramp = (t: number, start: number, end: number) =>
  interpolate(t, [start, end], [0, 1], clamp);
export const ease = (t: number, start: number, end: number) =>
  interpolate(t, [start, end], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
export function useSeconds() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
}

export const Label: React.FC<{
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  color?: string;
  anchor?: "middle" | "start" | "end";
  weight?: number;
}> = ({
  x,
  y,
  children,
  size = 38,
  color = C.ink,
  anchor = "middle",
  weight = 600,
}) => (
  <text
    x={x}
    y={y}
    textAnchor={anchor}
    direction="rtl"
    unicodeBidi="plaintext"
    fontFamily="Cairo"
    fontSize={size}
    fontWeight={weight}
    fill={color}
  >
    {children}
  </text>
);

export const Line: React.FC<{
  d: string;
  color?: string;
  width?: number;
  progress?: number;
  dash?: string;
  opacity?: number;
}> = ({ d, color = C.ink, width = 7, progress = 1, dash, opacity = 1 }) => (
  <path
    d={d}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    pathLength={1}
    strokeDasharray={dash ?? 1}
    strokeDashoffset={dash ? 0 : 1 - progress}
    opacity={opacity}
  />
);

export const Arrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  progress?: number;
  width?: number;
}> = ({ x1, y1, x2, y2, color = C.teal, progress = 1, width = 7 }) => {
  const x = x1 + (x2 - x1) * progress;
  const y = y1 + (y2 - y1) * progress;
  const a = Math.atan2(y2 - y1, x2 - x1);
  return (
    <g opacity={progress > 0 ? 1 : 0}>
      <Line d={`M${x1} ${y1}L${x} ${y}`} color={color} width={width} />
      <path
        d={`M${x - 20 * Math.cos(a - 0.55)} ${y - 20 * Math.sin(a - 0.55)}L${x} ${y}L${x - 20 * Math.cos(a + 0.55)} ${y - 20 * Math.sin(a + 0.55)}`}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};

export const Check: React.FC<{
  x: number;
  y: number;
  s?: number;
  color?: string;
}> = ({ x, y, s = 1, color = C.teal }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r={32} fill={C.tealPale} />
    <Line d="M-16 0L-4 13L19 -14" color={color} width={7} />
  </g>
);
export const Cross: React.FC<{ x: number; y: number; s?: number }> = ({
  x,
  y,
  s = 1,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r={31} fill={C.redPale} />
    <Line d="M-12 -12L12 12M12 -12L-12 12" color={C.red} width={7} />
  </g>
);

export const Frame: React.FC<{
  part: 1 | 2 | 3;
  chapter: string;
  title: string;
  note: string;
  accent?: string;
  children: React.ReactNode;
  warning?: boolean;
}> = ({
  part,
  chapter,
  title,
  note,
  accent = C.teal,
  children,
  warning = false,
}) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = ease(f, 0, 0.45 * fps);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.paper,
        color: C.ink,
        fontFamily: "Alexandria",
        direction: "rtl",
        overflow: "hidden",
      }}
    >
      <svg
        width="1080"
        height="1920"
        style={{ position: "absolute", inset: 0 }}
      >
        <path d="M80 125H1000M80 1684H1000" stroke={C.line} strokeWidth={2} />
        {Array.from({ length: 18 }, (_, i) => (
          <g key={i} opacity={0.25}>
            <circle cx={45} cy={190 + i * 80} r={2} fill={C.muted} />
            <circle cx={1035} cy={190 + i * 80} r={2} fill={C.muted} />
          </g>
        ))}
        <path d="M82 132V168H150" stroke={accent} strokeWidth={5} fill="none" />
        <path
          d="M998 1605V1640H932"
          stroke={accent}
          strokeWidth={5}
          fill="none"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 63,
          right: 84,
          fontSize: 30,
          fontWeight: 500,
          color: C.muted,
        }}
      >
        جسمك يسوي كذا… ليش؟
      </div>
      <div
        dir="ltr"
        style={{
          position: "absolute",
          top: 63,
          left: 84,
          fontSize: 30,
          fontWeight: 500,
          color: accent,
        }}
      >
        {part} / 3
      </div>
      <div
        style={{
          position: "absolute",
          top: 186,
          right: 84,
          left: 84,
          fontSize: 33,
          fontWeight: 500,
          color: accent,
          textAlign: "right",
          opacity: enter,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        {chapter.split(" • ").map((item, i) => (
          <span
            key={i}
            style={{ direction: /^[0-9]+$/.test(item) ? "ltr" : "rtl" }}
          >
            {item}
            {i === 0 && chapter.includes(" • ") ? " • " : ""}
          </span>
        ))}
      </div>
      <div
        data-safe="headline"
        style={{
          position: "absolute",
          top: 253,
          right: 84,
          left: 84,
          fontSize: 84,
          fontWeight: 700,
          lineHeight: 1.36,
          whiteSpace: "pre-line",
          textAlign: "right",
          translate: `0 ${(1 - enter) * 18}px`,
          opacity: enter,
        }}
      >
        {title}
      </div>
      <svg
        viewBox="0 0 960 820"
        width={960}
        height={820}
        style={{
          position: "absolute",
          left: 60,
          top: 558,
          overflow: "visible",
        }}
      >
        {children}
      </svg>
      <div
        data-safe="takeaway"
        style={{
          position: "absolute",
          top: 1410,
          right: 90,
          left: 90,
          borderRight: `6px solid ${warning ? C.red : accent}`,
          paddingRight: 25,
          fontFamily: "Cairo",
          fontSize: 48,
          fontWeight: 600,
          lineHeight: 1.42,
          color: warning ? C.red : C.ink,
          whiteSpace: "pre-line",
          textAlign: "right",
        }}
      >
        {note}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 162,
          right: 90,
          fontFamily: "Cairo",
          fontSize: 28,
          fontWeight: 600,
          color: C.muted,
        }}
      >
        تثقيف صحي • لا يشخّص حالتك
      </div>
      <div
        dir="ltr"
        style={{
          position: "absolute",
          bottom: 106,
          left: 90,
          fontSize: 28,
          fontWeight: 500,
          color: C.muted,
        }}
      >
        @kitabwbs
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 119,
          right: 90,
          display: "flex",
          flexDirection: "row",
          gap: 12,
        }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 5,
              width: i === part ? 120 : 42,
              backgroundColor: i === part ? accent : C.line,
              borderRadius: 5,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          height: 5,
          width: `${Math.min(100, Math.max(0, (f / durationInFrames) * 100))}%`,
          backgroundColor: accent,
          opacity: 0.4,
        }}
      />
    </AbsoluteFill>
  );
};

export const PulseOverlay: React.FC<{ from?: number }> = ({ from = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = f - Math.round(from * fps);
  if (n < 0 || n >= 120) return null;
  if (
    !getStaticFiles().some(
      (file) => file.name === "fx/pulse-v1/pulse_00000.png",
    )
  ) {
    const t = n / fps;
    return (
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <circle
          cx={540}
          cy={945}
          r={110 + 154 * (t / 2)}
          fill="none"
          stroke={C.teal}
          strokeWidth={5}
          opacity={t < 0.2 ? (t / 0.2) * 0.3 : (1 - (t - 0.2) / 1.8) * 0.3}
        />
      </svg>
    );
  }
  return (
    <Img
      src={staticFile(`fx/pulse-v1/pulse_${String(n).padStart(5, "0")}.png`)}
      style={{
        position: "absolute",
        inset: 0,
        width: 1080,
        height: 1920,
        pointerEvents: "none",
      }}
    />
  );
};

export const Callout: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  children: React.ReactNode;
  color?: string;
  fill?: string;
  size?: number;
}> = ({
  x,
  y,
  w = 340,
  h = 78,
  children,
  color = C.ink,
  fill = C.white,
  size = 38,
}) => (
  <g>
    <rect
      x={x - w / 2}
      y={y - h / 2}
      width={w}
      height={h}
      rx={18}
      fill={fill}
      stroke={color}
      strokeWidth={2}
    />
    <Label x={x} y={y + 12} size={size} color={color}>
      {children}
    </Label>
  </g>
);

export const Bed: React.FC<{ x?: number; y?: number }> = ({
  x = 140,
  y = 590,
}) => (
  <g transform={`translate(${x} ${y})`}>
    <path
      d="M0 0V-110M0 -10H660V-68Q660 -98 630 -98H30Q0 -98 0 -68M655 -12V32M15 -12V32"
      fill={C.bluePale}
      stroke={C.ink}
      strokeWidth={8}
      strokeLinecap="round"
    />
    <rect
      x={28}
      y={-136}
      width={150}
      height={62}
      rx={18}
      fill={C.white}
      stroke={C.ink}
      strokeWidth={6}
    />
  </g>
);

export const Cup: React.FC<{
  x: number;
  y: number;
  s?: number;
  color?: string;
}> = ({ x, y, s = 1, color = C.teal }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path
      d="M-38 -45H37L30 32Q0 52 -30 32Z"
      fill={C.white}
      stroke={C.ink}
      strokeWidth={6}
    />
    <path
      d="M37 -30C82 -35 82 17 36 10"
      fill="none"
      stroke={C.ink}
      strokeWidth={6}
    />
    <path d="M-27 -24H26L22 20Q0 31 -22 20Z" fill={color} opacity={0.65} />
  </g>
);
