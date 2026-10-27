import React from "react";
import {
  C,
  Frame,
  Label,
  Line,
  Callout,
  Check,
  Cross,
  useSeconds,
} from "../design";
import { Stickman } from "../Stickman";
const Plate: React.FC<{ x: number; y: number; small?: boolean }> = ({
  x,
  y,
  small = false,
}) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse
      rx={small ? 85 : 145}
      ry={small ? 32 : 45}
      fill={C.white}
      stroke={C.ink}
      strokeWidth={6}
    />
    <ellipse
      cy={-8}
      rx={small ? 58 : 110}
      ry={small ? 20 : 28}
      fill={C.tealPale}
    />
    {[0, 1, 2, 3, 4].slice(0, small ? 3 : 5).map((i) => (
      <circle
        key={i}
        cx={-60 + i * 30}
        cy={-20 - Math.sin(i) * 20}
        r={small ? 14 : 22}
        fill={i % 2 ? C.teal : C.purple}
        stroke={C.ink}
        strokeWidth={3}
      />
    ))}
  </g>
);
export const Fullness: React.FC<{ beats: number[] }> = ({
  beats = [6, 9, 13, 19],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  return (
    <Frame
      part={3}
      chapter="11 • الثقل بعد الوجبة"
      title={"شبعت بسرعة…\nوالثقل ما راح؟"}
      note={
        stage === 4
          ? "أعراض مستمرة، أو قيء دموي، أو براز أسود؟\nاطلب تقييمًا طبيًا سريعًا."
          : stage === 3
            ? "الإحساس بالثقل لا يكشف كمية حمض المعدة."
            : stage === 2
              ? "وجبة أصغر، وأكل بهدوء، وملاحظة المحفزات."
              : "قد يكون ضمن عسر الهضم، وله أسباب مختلفة."
      }
      accent={C.teal}
      warning={stage === 4}
    >
      <Stickman
        x={480}
        y={240}
        s={1.12}
        pose="chest"
        face={stage === 2 ? "happy" : "worried"}
        shirt={C.teal}
      />
      {stage < 3 ? (
        <>
          <Plate x={215} y={530} small={stage === 2} />
          <Plate x={770} y={530} small={stage === 2} />
          <Line d="M95 620H860" color={C.ink} width={6} />
          <Label x={480} y={120} size={44} color={C.teal}>
            {stage === 2 ? "خفّف الحجم… واهدأ" : "شبع مبكر أو امتلاء مزعج"}
          </Label>
          {stage === 2 ? (
            <Check x={480} y={720} />
          ) : (
            <Label x={480} y={742} size={40}>
              انتبه للنمط المتكرر.
            </Label>
          )}
        </>
      ) : stage === 3 ? (
        <>
          <g transform="translate(780 350)">
            <path
              d="M-30 -115H30V-52L55 90Q0 125 -55 90L-30 -52Z"
              fill={C.white}
              stroke={C.ink}
              strokeWidth={5}
            />
            <path d="M-40 40H42L53 88Q0 118 -53 88Z" fill={C.redPale} />
            <Cross x={0} y={142} s={0.8} />
          </g>
          <Label x={755} y={575} size={37} color={C.red}>
            ليس مبررًا للخل
          </Label>
          <Callout x={480} y={735} w={620} color={C.ink}>
            العرض لا يقيس الحمض
          </Callout>
        </>
      ) : (
        <>
          <rect
            x={100}
            y={650}
            width={760}
            height={110}
            rx={24}
            fill={C.redPale}
          />
          <Label x={480} y={720} size={44} color={C.red}>
            علامات تحتاج مراجعة سريعة
          </Label>
        </>
      )}
    </Frame>
  );
};
