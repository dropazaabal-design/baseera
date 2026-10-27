import React from "react";
import {
  C,
  Shell,
  Phone,
  Label,
  Arrow,
  Bubble,
  useSeconds,
  ease,
} from "../design";
import { Stickman } from "../Stickman";
export const Triggers: React.FC<{ beats: number[] }> = ({
  beats = [2.5, 4.3, 5.7, 7.7, 10],
}) => {
  const t = useSeconds();
  const [b0, b1, b2, b3, b4] = beats;
  const observe = t >= b3;
  return (
    <Shell
      step={1}
      kicker="1 • راقب اللحظة التي تسبق الفتح"
      heading={observe ? "وش صار قبل\nما تمسك الجوال؟" : "وش اللي\nيسحب يدك؟"}
      line={
        observe
          ? "سجّل الموقف مرة واحدة اليوم، دون جلد للذات."
          : "ملل؟ توتر؟ إشعار؟ لاحظ المحفّز أولًا."
      }
    >
      <Phone x={720} y={1110} s={0.8} t={t} feed={!observe} />
      <Stickman
        x={300}
        y={1050}
        s={0.95}
        pose={observe ? "point" : "phone"}
        face={observe ? "confused" : "calm"}
        shirt={C.teal}
      />
      {[
        { x: 220, y: 690, l: "ملل", at: b0, c: C.teal },
        { x: 540, y: 690, l: "توتر", at: b1, c: C.blue },
        { x: 850, y: 690, l: "إشعار", at: b2, c: C.purple },
      ].map(({ x, y, l, at, c }) => (
        <g key={l} opacity={ease(t, at, at + 0.3)}>
          <Bubble x={x} y={y} w={250} color={c}>
            {l}
          </Bubble>
          <path
            d={`M${x} 750Q${x} 830 690 865`}
            fill="none"
            stroke={c}
            strokeWidth={5}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - ease(t, at + 0.1, at + 0.9)}
          />
          <circle
            cx={x}
            cy={750 + Math.max(0, Math.min(1, ((t - at) % 1.4) / 1.4)) * 85}
            r={7}
            fill={c}
            opacity={observe ? 0 : 0.8}
          />
        </g>
      ))}
      {observe ? (
        <g opacity={ease(t, b3, b3 + 0.35)}>
          <rect
            x={120}
            y={1460}
            width={840}
            height={83}
            rx={17}
            fill={C.white}
            stroke={C.ink}
            strokeWidth={3}
          />
          <Label x={780} y={1513} size={39}>
            قبل الفتح
          </Label>
          <Arrow x1={645} y1={1505} x2={470} y2={1505} />
          <Label x={315} y={1513} size={39} color={C.teal}>
            {t >= b4 ? "لاحظت السبب" : "ماذا حدث؟"}
          </Label>
        </g>
      ) : (
        <Label x={540} y={1490} size={43}>
          الموقف يسبق التمريرة.
        </Label>
      )}
    </Shell>
  );
};
