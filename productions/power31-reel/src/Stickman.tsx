import React from "react";
import { C, Line, useS } from "./design";
type Props = {
  x: number;
  y: number;
  s?: number;
  color?: string;
  pose?: "stand" | "think" | "stop" | "point" | "hold" | "walk";
  facing?: number;
};
export const Stickman: React.FC<Props> = ({
  x,
  y,
  s = 1,
  color = C.blue,
  pose = "stand",
  facing = 1,
}) => {
  const t = useS();
  const breath = 2.5 * Math.sin(t * 2.2);
  const gait = pose === "walk" ? Math.sin(t * 6) * 27 : 0;
  const left =
    pose === "stop"
      ? "M-22-169Q-65-155-65-206"
      : pose === "hold"
        ? "M-22-169L-53-112L-7-128"
        : pose === "walk"
          ? `M-22-169L${-45 - gait}-116L${-56 - gait}-80`
          : "M-22-169Q-48-141-49-99";
  const right =
    pose === "think"
      ? "M22-169L57-126L34-212"
      : pose === "point"
        ? "M22-169L66-182L112-206"
        : pose === "hold"
          ? "M22-169L54-114L7-128"
          : pose === "walk"
            ? `M22-169L${45 + gait}-116L${56 + gait}-80`
            : "M22-169Q48-141 49-99";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="9" rx="72" ry="13" fill="#02070D" opacity=".5" />
      <g transform={`scale(${facing} 1) translate(0 ${breath})`}>
        <Line d={`M-14-89L${-27 + gait}-43L${-43 + gait * 1.4} 0`} width={13} />
        <Line d={`M14-89L${29 - gait}-43L${48 - gait * 1.4} 0`} width={13} />
        <Line d="M0-195V-86" width={14} />
        <path
          d="M-25-181Q0-189 25-181L23-102Q0-89-23-102Z"
          fill={color}
          stroke={C.white}
          strokeWidth="3"
        />
        <Line d={left} width={12} />
        <Line d={right} width={12} />
        {pose === "stop" && (
          <path
            d="M-75-218V-204M-67-224V-204M-59-220V-204M-51-213V-200"
            fill="none"
            stroke={C.white}
            strokeWidth="6"
            strokeLinecap="round"
          />
        )}
        <circle
          cx="0"
          cy="-237"
          r="43"
          fill={C.white}
          stroke={C.bg}
          strokeWidth="5"
        />
        <path
          d={
            pose === "think"
              ? "M-18-249L-7-252M9-251L21-246"
              : "M-18-251H-7M9-251H20"
          }
          fill="none"
          stroke={C.bg}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <ellipse
          cx="-11"
          cy="-237"
          rx="3.3"
          ry={Math.sin(t * 1.7) > 0.985 ? 0.7 : 4.2}
          fill={C.bg}
        />
        <ellipse
          cx="14"
          cy="-237"
          rx="3.3"
          ry={Math.sin(t * 1.7) > 0.985 ? 0.7 : 4.2}
          fill={C.bg}
        />
        <path
          d={pose === "think" ? "M-7-219Q2-224 10-220" : "M-7-220Q2-215 10-220"}
          fill="none"
          stroke={C.bg}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
};
