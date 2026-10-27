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
  ease,
  ramp,
} from "../design";
import { Stickman } from "../Stickman";
export const Rest: React.FC<{ beats: number[] }> = ({
  beats = [2, 4.8, 6.5, 9],
}) => {
  const t = useSeconds();
  const [b0, b1, b2, b3] = beats;
  const mode = t < b0 ? 0 : t < b1 ? 1 : t < b2 ? 2 : t < b3 ? 3 : 4;
  const breath = 0.5 - 0.5 * Math.cos(((t - b1) * Math.PI) / 2.5);
  return (
    <Shell
      step={3}
      kicker="3 • بدّل شكل الاستراحة"
      heading={
        mode === 0
          ? "كل استراحة\nتصير شاشة ثانية؟"
          : mode === 1
            ? "امشِ قليلًا."
            : mode === 2
              ? "تنفّس بهدوء."
              : mode === 3
                ? "اكتب اللي يقلقك."
                : "راحة تساعدك\nترجع للمهمة."
      }
      line={
        mode === 0
          ? "اختَر راحة تناسبك خارج التمرير التلقائي."
          : "حركة، تنفّس، أو كتابة… جرّب ما يناسبك."
      }
    >
      {mode === 0 ? (
        <>
          <Stickman
            x={300}
            y={1000}
            s={1.05}
            pose="phone"
            face="confused"
            shirt={C.blue}
          />
          <Phone x={760} y={1080} s={0.83} t={t} />
          <Bubble x={540} y={740} w={560} color={C.red}>
            استراحة من شاشة… بشاشة؟
          </Bubble>
        </>
      ) : mode === 1 ? (
        <>
          <Line
            d="M125 1390Q350 1365 520 1390T950 1390"
            color={C.line}
            width={5}
          />
          <Stickman
            x={320 + ease(t, b0, b1) * 350}
            y={950}
            s={1.15}
            pose="walk"
            face="calm"
            shirt={C.teal}
          />
          <Arrow
            x1={250}
            y1={1460}
            x2={820}
            y2={1460}
            p={ease(t, b0, b0 + 1.3)}
          />
          <Label x={540} y={740} size={48} color={C.teal}>
            خطوات قليلة… بعيدًا عن الشاشة
          </Label>
        </>
      ) : mode === 2 ? (
        <>
          <circle
            cx={540}
            cy={1060}
            r={220 + 36 * breath}
            fill={C.tealPale}
            opacity={0.8}
          />
          <circle
            cx={540}
            cy={1060}
            r={248 + 36 * breath}
            fill="none"
            stroke={C.teal}
            strokeWidth={4}
            opacity={0.5}
          />
          <Stickman
            x={540}
            y={910}
            s={1.15}
            pose="breathe"
            face="calm"
            shirt={C.teal}
          />
          <Label x={540} y={1450} size={47} color={C.teal}>
            لحظة هدوء
          </Label>
        </>
      ) : mode === 3 ? (
        <>
          <Stickman
            x={330}
            y={1000}
            s={1}
            pose="work"
            face="calm"
            shirt={C.teal}
          />
          <Notebook
            x={760}
            y={1100}
            s={1.02}
            p={ramp(t, b2, b3)}
            label="ما يشغلني"
            lines={4}
          />
          <Line
            d={`M850 ${1010 + ramp(t, b2, b3) * 160}L895 ${970 + ramp(t, b2, b3) * 160}`}
            color={C.blue}
            width={9}
          />
        </>
      ) : (
        <>
          <Phone x={190} y={1090} s={0.45} muted feed={false} />
          <Stickman
            x={470 + ease(t, b3, b3 + 1) * 30}
            y={1000}
            s={1}
            pose="work"
            face="happy"
            shirt={C.teal}
          />
          <Notebook
            x={800}
            y={1100}
            s={0.87}
            p={ramp(t, b3, b3 + 2) * 0.25}
            label="المهمة"
            lines={4}
          />
          <Arrow
            x1={330}
            y1={1450}
            x2={840}
            y2={1450}
            p={ease(t, b3, b3 + 1.1)}
          />
        </>
      )}
    </Shell>
  );
};
