import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  CanvasImage,
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
  bg: "#080F1D",
  panel: "#11243A",
  line: "#2B4560",
  white: "#F8FAFC",
  muted: "#A8BBCD",
  blue: "#5DA6F0",
  green: "#32D6A1",
  red: "#F18AA4",
  black: "#03070D",
};
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const ramp = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], clamp);
export const ease = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
export const useS = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
};
export const Line: React.FC<{
  d: string;
  color?: string;
  width?: number;
  p?: number;
  opacity?: number;
}> = ({ d, color = C.white, width = 7, p = 1, opacity = 1 }) => (
  <path
    d={d}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    pathLength={1}
    strokeDasharray="1"
    strokeDashoffset={1 - p}
    opacity={opacity}
  />
);
export const Label: React.FC<{
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
}> = ({ x, y, children, size = 48, color = C.white, weight = 600 }) => (
  <text
    x={x}
    y={y}
    textAnchor="middle"
    direction="rtl"
    unicodeBidi="plaintext"
    fill={color}
    fontFamily="Cairo"
    fontSize={size}
    fontWeight={weight}
  >
    {children}
  </text>
);
export const Frame: React.FC<{
  title: string;
  kicker?: string;
  accent?: string;
  children: React.ReactNode;
}> = ({
  title,
  kicker = "48 قانونًا للسلطة · قراءة أخلاقية",
  accent = C.blue,
  children,
}) => {
  const t = useS();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        color: C.white,
        fontFamily: "Alexandria",
        overflow: "hidden",
        direction: "rtl",
      }}
    >
      <svg
        width="1080"
        height="1920"
        style={{ position: "absolute", inset: 0 }}
        viewBox="0 0 1080 1920"
      >
        <defs>
          <linearGradient id="stageShade" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#142B46" />
            <stop offset="1" stopColor={C.bg} />
          </linearGradient>
        </defs>
        <path
          d="M110 450Q540 355 970 450V1455Q540 1560 110 1455Z"
          fill="url(#stageShade)"
          opacity=".44"
        />
        <circle
          cx="1065"
          cy="960"
          r={530 + 6 * Math.sin(t * 0.6)}
          fill="none"
          stroke={C.line}
          strokeWidth="1.5"
          opacity=".35"
        />
        <circle
          cx="1065"
          cy="960"
          r={570 + 6 * Math.sin(t * 0.6)}
          fill="none"
          stroke={C.line}
          strokeWidth="1"
          opacity=".25"
        />
        <path d="M90 1360H990" stroke={C.line} strokeWidth="2" />
        <circle cx="90" cy="1360" r="5" fill={accent} />
        <circle cx="990" cy="1360" r="5" fill={accent} />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 145,
          left: 90,
          right: 90,
          fontSize: 32,
          fontWeight: 500,
          color: C.muted,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          position: "absolute",
          top: 218,
          left: 85,
          right: 85,
          fontSize: 88,
          fontWeight: 700,
          lineHeight: 1.4,
          whiteSpace: "pre-line",
          textAlign: "right",
          opacity: interpolate(t, [0, 0.35], [0.5, 1], clamp),
          translate: interpolate(t, [0, 0.6], ["0px 12px", "0px 0px"], {
            ...clamp,
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
        }}
      >
        {title}
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          top: 1635,
          bottom: 0,
          left: 0,
          right: 0,
          background: C.black,
          borderTop: "1px solid #1D2D40",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 1710,
          left: 90,
          right: 90,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          direction: "ltr",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 500, color: C.muted }}>
          @kitabwbs
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 500,
            color: C.muted,
            direction: "rtl",
          }}
        >
          كتاب وبس
        </div>
      </div>
    </AbsoluteFill>
  );
};
export const World: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <svg
    width="1080"
    height="1920"
    viewBox="0 0 1080 1920"
    style={{ position: "absolute", inset: 0, overflow: "hidden" }}
  >
    {children}
  </svg>
);
export const Door: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  open?: number;
  number?: string;
  opacity?: number;
}> = ({
  x,
  y,
  w = 200,
  h = 370,
  color = C.blue,
  open = 0,
  number,
  opacity = 1,
}) => (
  <g opacity={opacity}>
    <path
      d={`M${x - w / 2 - 12} ${y + h}V${y - 12}H${x + w / 2 + 12}V${y + h}`}
      fill="none"
      stroke={color}
      strokeWidth="9"
    />
    <rect x={x - w / 2} y={y} width={w} height={h} fill={C.panel} />
    <path
      d={`M${x - w / 2} ${y}L${x + w / 2 - w * 0.76 * open} ${y + 30 * open}V${y + h - 25 * open}L${x - w / 2} ${y + h}Z`}
      fill="#172D47"
      stroke={color}
      strokeWidth="4"
    />
    {number && (
      <Label x={x - w * 0.4 * open} y={y + h * 0.48} size={66} color={color}>
        {number}
      </Label>
    )}
    <circle
      cx={x + w * 0.31 - w * 0.6 * open}
      cy={y + h * 0.63}
      r="7"
      fill={color}
    />
    <path
      d={`M${x - w / 2} ${y + h}L${x - w / 2 - 42} ${y + h + 32}H${x + w / 2 + 42}L${x + w / 2} ${y + h}`}
      fill={color}
      opacity=".13"
    />
  </g>
);
export const Book: React.FC<{ x: number; y: number; s?: number }> = ({
  x,
  y,
  s = 1,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path
      d="M-156-240L112-220V210L-156 190Z"
      fill="#193958"
      stroke={C.blue}
      strokeWidth="5"
    />
    <path d="M112-220L145-237V192L112 210Z" fill="#D2DFE9" />
    <path d="M-156-240L-122-257L145-237L112-220Z" fill="#ECF3F9" />
    <path d="M-125-238V191" stroke={C.line} strokeWidth="6" />
    <Label x={-8} y={-125} size={100} color={C.white}>
      48
    </Label>
    <Label x={-8} y={-32} size={43}>
      قانونًا
    </Label>
    <Label x={-8} y={28} size={43}>
      للسلطة
    </Label>
    <path d="M-89 82H66" stroke={C.green} strokeWidth="5" />
    <Label x={-8} y={140} size={32} color={C.muted}>
      روبرت غرين
    </Label>
  </g>
);
export const Stop: React.FC<{
  x: number;
  y: number;
  r?: number;
  color?: string;
}> = ({ x, y, r = 90, color = C.red }) => (
  <g transform={`translate(${x} ${y}) scale(${r / 90})`}>
    <circle r="88" fill={C.bg} stroke={color} strokeWidth="7" />
    <path
      d="M-30 32V-15Q-30-25-22-25Q-14-25-14-15V3V-43Q-14-53-6-53Q2-53 2-43V-4V-53Q2-63 10-63Q18-63 18-53V-3V-37Q18-47 26-47Q34-47 34-37V23Q34 66-2 66Q-20 66-33 49L-53 23Q-60 11-48 7Q-40 5-30 21"
      fill="none"
      stroke={color}
      strokeWidth="7"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </g>
);
export const GateOverlay: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const i = Math.floor(f - at * fps);
  if (i < 0 || i >= 120) return null;
  const exists = getStaticFiles().some(
    (x) => x.name === "fx/choice-gate-v1/gate_00000.png",
  );
  return exists ? (
    <CanvasImage
      src={staticFile(
        `fx/choice-gate-v1/gate_${String(i).padStart(5, "0")}.png`,
      )}
      premountFor={fps}
      style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }}
    />
  ) : (
    <World>
      <rect
        x="400"
        y="835"
        width="280"
        height="410"
        fill="none"
        stroke={C.green}
        strokeWidth="8"
        opacity={Math.sin((i / 120) * Math.PI) * 0.45}
      />
    </World>
  );
};
