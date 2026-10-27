import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Easing,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Img,
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
  paper: "#F2F3ED",
  ink: "#12343B",
  teal: "#248D80",
  tealPale: "#D6E9DE",
  blue: "#467987",
  bluePale: "#DCE9EE",
  purple: "#6D6692",
  purplePale: "#E6E2EE",
  red: "#AD5363",
  redPale: "#F0DFE1",
  muted: "#657E7C",
  line: "#CDDBD4",
  white: "#FFFFFF",
};
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const ease = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
export const ramp = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], clamp);
export const useSeconds = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
};
export const Label: React.FC<{
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  color?: string;
  anchor?: "start" | "end" | "middle";
}> = ({ x, y, children, size = 43, color = C.ink, anchor = "middle" }) => (
  <text
    x={x}
    y={y}
    fill={color}
    textAnchor={anchor}
    fontFamily="Cairo"
    fontSize={size}
    fontWeight={600}
    direction="rtl"
    unicodeBidi="plaintext"
  >
    {children}
  </text>
);
export const Line: React.FC<{
  d: string;
  color?: string;
  width?: number;
  p?: number;
  opacity?: number;
}> = ({ d, color = C.ink, width = 7, p = 1, opacity = 1 }) => (
  <path
    d={d}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    pathLength={1}
    strokeDasharray={1}
    strokeDashoffset={1 - p}
    opacity={opacity}
  />
);
export const Arrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  p?: number;
}> = ({ x1, y1, x2, y2, color = C.teal, p = 1 }) => {
  const x = x1 + (x2 - x1) * p,
    y = y1 + (y2 - y1) * p,
    a = Math.atan2(y2 - y1, x2 - x1);
  return (
    <g opacity={p > 0 ? 1 : 0}>
      <Line d={`M${x1} ${y1}L${x} ${y}`} color={color} />
      <path
        d={`M${x - 21 * Math.cos(a - 0.55)} ${y - 21 * Math.sin(a - 0.55)}L${x} ${y}L${x - 21 * Math.cos(a + 0.55)} ${y - 21 * Math.sin(a + 0.55)}`}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};
export const Check: React.FC<{ x: number; y: number; s?: number }> = ({
  x,
  y,
  s = 1,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r={30} fill={C.tealPale} />
    <Line d="M-15 0L-3 12L18 -14" color={C.teal} width={7} />
  </g>
);
export const Bubble: React.FC<{
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  children: React.ReactNode;
  size?: number;
}> = ({ x, y, w = 300, h = 86, color = C.ink, children, size = 42 }) => (
  <g>
    <rect
      x={x - w / 2}
      y={y - h / 2}
      width={w}
      height={h}
      rx={19}
      fill={C.white}
      stroke={color}
      strokeWidth={2.5}
    />
    <Label x={x} y={y + 13} size={size} color={color}>
      {children}
    </Label>
  </g>
);
export const Shell: React.FC<{
  heading: string;
  kicker: string;
  line: string;
  step?: number;
  color?: string;
  children: React.ReactNode;
}> = ({ heading, kicker, line, step, color = C.teal, children }) => {
  const t = useSeconds();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.paper,
        fontFamily: "Alexandria",
        color: C.ink,
        direction: "rtl",
        overflow: "hidden",
      }}
    >
      <svg
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0 }}
      >
        <path d="M86 124H994M86 1774H994" stroke={C.line} strokeWidth={2} />
        <rect x={986} y={260} width={8} height={140} rx={4} fill={color} />
        {Array.from({ length: 21 }, (_, i) => (
          <g key={i} opacity={0.25}>
            <circle cx={44} cy={230 + i * 70} r={2} fill={C.muted} />
            <circle cx={1036} cy={230 + i * 70} r={2} fill={C.muted} />
          </g>
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          top: 66,
          right: 87,
          fontSize: 30,
          fontWeight: 500,
          color: C.muted,
        }}
      >
        خارج دوّامة الهاتف
      </div>
      <div
        style={{
          position: "absolute",
          top: 175,
          right: 88,
          left: 88,
          fontSize: 34,
          fontWeight: 500,
          color,
          display: "flex",
          gap: 12,
        }}
      >
        {kicker.split(" • ").map((item, i) => (
          <span
            key={i}
            style={{ direction: /^[0-9]+$/.test(item) ? "ltr" : "rtl" }}
          >
            {item}
            {i === 0 && kicker.includes(" • ") ? " • " : ""}
          </span>
        ))}
      </div>
      <div
        data-safe="headline"
        style={{
          position: "absolute",
          top: 263,
          right: 88,
          left: 88,
          fontSize: 88,
          fontWeight: 700,
          lineHeight: 1.32,
          whiteSpace: "pre-line",
          translate: `0 ${(1 - ease(t, 0, 0.32)) * 12}px`,
        }}
      >
        {heading}
      </div>
      <svg
        viewBox="0 0 1080 1920"
        width={1080}
        height={1920}
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      >
        {children}
      </svg>
      <div
        data-safe="takeaway"
        style={{
          position: "absolute",
          top: 1605,
          right: 90,
          left: 90,
          fontFamily: "Cairo",
          fontSize: 47,
          lineHeight: 1.42,
          fontWeight: 600,
          whiteSpace: "pre-line",
          textAlign: "right",
          paddingRight: 23,
          borderRight: `5px solid ${color}`,
        }}
      >
        {line}
      </div>
      <div
        dir="ltr"
        style={{
          position: "absolute",
          bottom: 79,
          left: 88,
          fontWeight: 500,
          fontSize: 29,
          color: C.muted,
        }}
      >
        @kitabwbs
      </div>
      {step ? (
        <div
          style={{
            position: "absolute",
            right: 88,
            bottom: 84,
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: i === step ? color : "transparent",
                border: `2px solid ${i === step ? color : C.line}`,
                color: i === step ? C.white : C.muted,
                fontFamily: "Cairo",
                fontSize: 27,
              }}
            >
              {i}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            right: 88,
            bottom: 83,
            width: 140,
            height: 5,
            borderRadius: 5,
            background: color,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const Phone: React.FC<{
  x: number;
  y: number;
  s?: number;
  t?: number;
  muted?: boolean;
  feed?: boolean;
  opacity?: number;
}> = ({ x, y, s = 1, t = 0, muted = false, feed = true, opacity = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
    <defs>
      <clipPath id={`feed-${x}-${y}`}>
        <rect x={-132} y={-222} width={264} height={444} rx={24} />
      </clipPath>
    </defs>
    <rect x={-150} y={-260} width={300} height={520} rx={40} fill={C.ink} />
    <rect
      x={-132}
      y={-222}
      width={264}
      height={444}
      rx={24}
      fill={C.bluePale}
    />
    <g clipPath={`url(#feed-${x}-${y})`}>
      {[0, 1, 2, 3].map((i) => {
        const cy =
          -240 + ((((i * 160 - (feed ? t * 85 : 0)) % 640) + 640) % 640);
        return (
          <g key={i} transform={`translate(0 ${cy})`}>
            <rect
              x={-112}
              y={0}
              width={224}
              height={136}
              rx={14}
              fill={[C.tealPale, C.purplePale, C.white, C.bluePale][i]}
            />
            <path d="M-22 26L24 54L-22 82Z" fill={i % 2 ? C.purple : C.teal} />
            <path
              d="M-80 108H80"
              stroke={C.ink}
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.2}
            />
          </g>
        );
      })}
    </g>
    <path
      d="M-26 -242H26M-37 241H37"
      stroke={C.white}
      strokeWidth={6}
      strokeLinecap="round"
    />
    {muted ? (
      <g>
        <rect
          x={-108}
          y={-170}
          width={216}
          height={340}
          rx={15}
          fill={C.white}
          opacity={0.97}
        />
        <Line
          d="M-38 -28L-5 -56V12L-38 -16H-58V-28ZM20 -25L61 17M61 -25L20 17"
          color={C.teal}
          width={7}
        />
        <Label x={0} y={100} size={33} color={C.teal}>
          وقت للمهمة
        </Label>
      </g>
    ) : null}
  </g>
);

export const Notebook: React.FC<{
  x: number;
  y: number;
  s?: number;
  p?: number;
  label?: string;
  lines?: number;
}> = ({ x, y, s = 1, p = 0, label = "المهمة", lines = 4 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect
      x={-160}
      y={-200}
      width={320}
      height={400}
      rx={22}
      fill={C.white}
      stroke={C.ink}
      strokeWidth={7}
    />
    <rect
      x={-69}
      y={-222}
      width={138}
      height={44}
      rx={12}
      fill={C.tealPale}
      stroke={C.ink}
      strokeWidth={5}
    />
    <Label x={0} y={-112} size={43}>
      {label}
    </Label>
    {Array.from({ length: lines }, (_, i) => (
      <g key={i}>
        <path
          d={`M-107 ${-40 + i * 57}H107`}
          stroke={C.line}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Line
          d={`M107 ${-40 + i * 57}H-107`}
          color={C.teal}
          width={7}
          p={Math.max(0, Math.min(1, p * lines - i))}
        />
      </g>
    ))}
  </g>
);

export const BoundaryOverlay: React.FC<{ from: number }> = ({ from }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = f - Math.round(from * fps);
  if (n < 0 || n >= 120) return null;
  const exists = getStaticFiles().some(
    (x) => x.name === "fx/boundary-v1/boundary_00000.png",
  );
  return exists ? (
    <Img
      src={staticFile(
        `fx/boundary-v1/boundary_${String(n).padStart(5, "0")}.png`,
      )}
      style={{
        position: "absolute",
        inset: 0,
        width: 1080,
        height: 1920,
        pointerEvents: "none",
      }}
    />
  ) : (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
      <rect
        x={260 - n * 0.35}
        y={800 - n * 0.35}
        width={560 + n * 0.7}
        height={500 + n * 0.7}
        rx={30}
        fill="none"
        stroke={C.teal}
        strokeWidth={5}
        opacity={0.3 * Math.sin((Math.PI * n) / 120)}
      />
    </svg>
  );
};
