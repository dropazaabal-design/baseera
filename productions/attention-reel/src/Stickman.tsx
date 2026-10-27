import React from "react";
import { C, useSeconds } from "./design";

type Point = [number, number];
type Pose =
  | "stand"
  | "point"
  | "sit"
  | "stretch"
  | "sleep"
  | "dizzy"
  | "worry"
  | "chest"
  | "wave"
  | "ear"
  | "work"
  | "walk"
  | "phone"
  | "breathe";
type Face =
  | "calm"
  | "happy"
  | "worried"
  | "surprised"
  | "sleepy"
  | "confused"
  | "pain";
const poses: Record<Pose, Point[]> = {
  work: [
    [-58, 145],
    [-20, 190],
    [91, 150],
    [129, 195],
    [-45, 280],
    [-48, 365],
    [45, 280],
    [48, 365],
  ],
  walk: [
    [-60, 143],
    [-70, 205],
    [60, 143],
    [70, 205],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  phone: [
    [-62, 145],
    [-50, 210],
    [85, 100],
    [100, 45],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  breathe: [
    [-70, 130],
    [-20, 165],
    [70, 130],
    [20, 165],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  stand: [
    [-65, 145],
    [-73, 213],
    [65, 145],
    [73, 213],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  point: [
    [-65, 145],
    [-73, 213],
    [91, 70],
    [161, 26],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  sit: [
    [-62, 143],
    [-24, 196],
    [62, 143],
    [25, 196],
    [-87, 216],
    [-82, 315],
    [87, 216],
    [90, 315],
  ],
  stretch: [
    [-67, 16],
    [-101, -60],
    [67, 16],
    [101, -60],
    [-38, 294],
    [-48, 369],
    [38, 294],
    [48, 369],
  ],
  sleep: [
    [-65, 130],
    [-121, 108],
    [62, 125],
    [112, 91],
    [-32, 290],
    [-53, 363],
    [35, 292],
    [47, 365],
  ],
  dizzy: [
    [-75, 97],
    [-73, 21],
    [96, 111],
    [157, 85],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  worry: [
    [-58, 120],
    [-25, 37],
    [65, 145],
    [23, 195],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  chest: [
    [-65, 145],
    [-13, 122],
    [65, 145],
    [10, 130],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  wave: [
    [-65, 145],
    [-73, 213],
    [85, 33],
    [65, -44],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
  ear: [
    [-62, 143],
    [-15, 190],
    [68, 84],
    [58, 5],
    [-35, 290],
    [-46, 365],
    [35, 290],
    [46, 365],
  ],
};

export const Stickman: React.FC<{
  x: number;
  y: number;
  s?: number;
  pose?: Pose;
  face?: Face;
  shirt?: string;
  tilt?: number;
  energy?: number;
  toPose?: Pose;
  mix?: number;
}> = ({
  x,
  y,
  s = 1,
  pose = "stand",
  face = "calm",
  shirt = C.teal,
  tilt = 0,
  energy = 1,
  toPose,
  mix = 0,
}) => {
  const t = useSeconds();
  const breathe = Math.sin(t * 2.3) * 1.8 * energy;
  const a = poses[pose];
  const b = toPose ? poses[toPose] : a;
  const p = a.map((v, i) => [
    v[0] + (b[i][0] - v[0]) * mix,
    v[1] + (b[i][1] - v[1]) * mix,
  ]);
  if (pose === "walk") {
    const swing = Math.sin(t * 7.5) * 27;
    p[4][0] -= swing * 0.7;
    p[5][0] -= swing;
    p[6][0] += swing * 0.7;
    p[7][0] += swing;
    p[0][0] += swing * 0.5;
    p[1][0] += swing * 0.8;
    p[2][0] -= swing * 0.5;
    p[3][0] -= swing * 0.8;
  }
  const blink = t % 4.4 > 4.29;
  const eyesClosed = face === "sleepy" || blink;
  const eyeY = face === "worried" ? 0 : 2;
  const limb = (start: Point, el: number, end: number) => (
    <g>
      <path
        d={`M${start[0]} ${start[1]}L${p[el][0]} ${p[el][1]}L${p[end][0]} ${p[end][1]}`}
        fill="none"
        stroke={C.ink}
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={p[el][0]}
        cy={p[el][1]}
        r={6}
        fill={C.white}
        stroke={C.ink}
        strokeWidth={3}
      />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${tilt})`}>
      <ellipse
        cx={0}
        cy={pose === "sit" ? 334 : 382}
        rx={91}
        ry={10}
        fill={C.ink}
        opacity={0.07}
      />
      <g transform={`translate(0 ${breathe})`}>
        {limb([-20, 206], 4, 5)}
        {limb([20, 206], 6, 7)}
        <path
          d="M-36 79Q0 62 36 79L29 208Q0 221 -29 208Z"
          fill={shirt}
          stroke={C.ink}
          strokeWidth={7}
          strokeLinejoin="round"
        />
        <path
          d="M0 83V155"
          stroke={C.white}
          strokeWidth={4}
          opacity={0.6}
          strokeLinecap="round"
        />
        <rect
          x={-14}
          y={164}
          width={28}
          height={20}
          rx={5}
          fill={C.white}
          opacity={0.75}
        />
        {limb([-36, 88], 0, 1)}
        {limb([36, 88], 2, 3)}
        <circle
          cx={p[1][0]}
          cy={p[1][1]}
          r={10}
          fill={C.white}
          stroke={C.ink}
          strokeWidth={4}
        />
        <circle
          cx={p[3][0]}
          cy={p[3][1]}
          r={10}
          fill={C.white}
          stroke={C.ink}
          strokeWidth={4}
        />
        <path d="M-10 58V75M10 58V75" stroke={C.ink} strokeWidth={6} />
        <circle cy={0} r={57} fill={C.white} stroke={C.ink} strokeWidth={8} />
        <path
          d="M-41 -37Q-16 -61 11 -51"
          fill="none"
          stroke={C.ink}
          strokeWidth={8}
          strokeLinecap="round"
        />
        {eyesClosed ? (
          <path
            d="M-27 4Q-17 12 -8 4M8 4Q18 12 28 4"
            fill="none"
            stroke={C.ink}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ) : (
          <>
            <ellipse
              cx={-18}
              cy={eyeY}
              rx={face === "surprised" ? 6 : 4.5}
              ry={face === "surprised" ? 10 : 8}
              fill={C.ink}
            />
            <ellipse
              cx={18}
              cy={eyeY}
              rx={face === "surprised" ? 6 : 4.5}
              ry={face === "surprised" ? 10 : 8}
              fill={C.ink}
            />
          </>
        )}
        {face === "worried" || face === "pain" ? (
          <path
            d="M-29 -17L-9 -23M9 -23L29 -17"
            fill="none"
            stroke={C.ink}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ) : face === "confused" ? (
          <path
            d="M-29 -21L-9 -20M8 -28L29 -16"
            fill="none"
            stroke={C.ink}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M-29 -20L-9 -22M9 -22L29 -20"
            fill="none"
            stroke={C.ink}
            strokeWidth={4}
            strokeLinecap="round"
          />
        )}
        {face === "surprised" ? (
          <ellipse cy={28} rx={9} ry={12} fill={C.ink} />
        ) : (
          <path
            d={
              face === "happy"
                ? "M-19 22Q0 44 20 22"
                : face === "worried" || face === "pain"
                  ? "M-17 34Q0 17 18 34"
                  : face === "confused"
                    ? "M-15 31L18 25"
                    : "M-12 29Q0 33 13 29"
            }
            fill="none"
            stroke={C.ink}
            strokeWidth={5}
            strokeLinecap="round"
          />
        )}
      </g>
      <path
        d={`M${p[5][0] - 12} ${p[5][1] + 1}h25M${p[7][0] - 12} ${p[7][1] + 1}h25`}
        stroke={C.ink}
        strokeWidth={17}
        strokeLinecap="round"
      />
    </g>
  );
};
