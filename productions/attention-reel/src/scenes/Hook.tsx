import React from "react";
import {
  C,
  Shell,
  Phone,
  Notebook,
  Label,
  Line,
  Arrow,
  Bubble,
  useSeconds,
  ramp,
  ease,
} from "../design";
import { Stickman } from "../Stickman";
export const Hook: React.FC<{ beats: number[] }> = ({
  beats = [2.5, 7, 9.5],
}) => {
  const t = useSeconds();
  const [b0, b1, b2] = beats;
  const a = ramp(t, b0, b0 + 2.2) * Math.PI * 1.9;
  const loop = t >= b2;
  return (
    <Shell
      kicker="الراحة التي تؤجّل البداية"
      heading={loop ? "شفت الدائرة؟" : "فتحت الجوال\nعشان ترتاح؟"}
      line={
        loop
          ? "ضيق ← تمرير ← تأجيل… ثم ضيق من جديد."
          : "الوقت يمشي، والمهمة ما زالت تنتظر."
      }
    >
      <ellipse cx={760} cy={1070} rx={220} ry={310} fill={C.bluePale} />
      <Stickman
        x={330}
        y={870}
        s={1.15}
        pose="phone"
        face={t < b1 ? "calm" : "worried"}
        shirt={C.blue}
      />
      <Phone x={760} y={1050} s={1.05} t={t} />
      <g transform="translate(270 670)">
        <circle r={87} fill={C.white} stroke={C.ink} strokeWidth={7} />
        {[0, 1, 2, 3].map((i) => (
          <Line
            key={i}
            d={`M${Math.sin((i * Math.PI) / 2) * 68} ${-Math.cos((i * Math.PI) / 2) * 68}L${Math.sin((i * Math.PI) / 2) * 75} ${-Math.cos((i * Math.PI) / 2) * 75}`}
            width={5}
          />
        ))}
        <Line
          d={`M0 0L${Math.sin(a) * 53} ${-Math.cos(a) * 53}`}
          color={C.red}
          width={6}
        />
        <Line d="M0 0L-26 -25" width={7} />
        <circle r={7} fill={C.ink} />
      </g>
      <Label x={270} y={798} size={40} color={C.red}>
        {t >= b0 ? "30 دقيقة راحت" : "«بس دقيقة»"}
      </Label>
      <g opacity={ease(t, b1, b1 + 0.4)}>
        <Notebook x={295} y={1410} s={0.53} p={0} label="المهمة" lines={3} />
        <Label x={300} y={1560} size={39}>
          لسّه ما بدأت
        </Label>
      </g>
      {loop ? (
        <>
          <Line
            d="M558 1290Q700 1530 437 1460M200 1345Q105 1030 226 914"
            color={C.red}
            width={5}
            p={ease(t, b2, b2 + 0.7)}
          />
          <Arrow x1={437} y1={1460} x2={414} y2={1440} color={C.red} />
          <Bubble x={740} y={1440} w={285} color={C.red}>
            مقطع أخير!
          </Bubble>
        </>
      ) : null}
    </Shell>
  );
};
