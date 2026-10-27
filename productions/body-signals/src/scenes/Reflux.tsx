import React from "react";
import {
  C,
  Frame,
  Label,
  Arrow,
  Callout,
  Check,
  useSeconds,
  ease,
} from "../design";

export const Stomach: React.FC<{
  x?: number;
  y?: number;
  s?: number;
  reflux?: number;
  t?: number;
}> = ({ x = 430, y = 300, s = 1, reflux = 0, t = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path
      d="M-38 -210V-60Q-38 8 -90 37C-208 110 -149 302 31 294C185 287 235 171 183 63C163 23 116 5 94 -5Q49 -22 38 -63V-210"
      fill={C.white}
      stroke={C.ink}
      strokeWidth={9}
      strokeLinejoin="round"
    />
    <path
      d="M-132 151Q-30 112 165 144C176 216 126 268 26 268C-65 272 -118 228 -132 151Z"
      fill={C.redPale}
    />
    <path
      d="M-130 151Q-30 112 165 144"
      fill="none"
      stroke={C.red}
      strokeWidth={5}
    />
    <path
      d="M-34 -44L34 -44"
      stroke={C.purple}
      strokeWidth={12}
      strokeLinecap="round"
    />
    <g opacity={reflux}>
      {[0, 1, 2, 3].map((i) => (
        <circle
          key={i}
          cx={Math.sin((i + t) * 2) * 7}
          cy={115 - ((t * 95 + i * 60) % 300)}
          r={10}
          fill={C.red}
        />
      ))}
      <Arrow
        x1={0}
        y1={80}
        x2={0}
        y2={-180}
        color={C.red}
        progress={reflux}
        width={5}
      />
    </g>
  </g>
);

export const Reflux: React.FC<{ beats: number[] }> = ({
  beats = [2, 7, 12, 18],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  return (
    <Frame
      part={3}
      chapter="9 • الحرقان بعد الأكل"
      title={"الأكل خلص…\nوالحرقان بدأ؟"}
      note={
        stage >= 3
          ? "حرقان أغلب الأيام أو أكل يعلق أو نزول وزن؟\nراجع طبيبًا."
          : stage === 2
            ? "وجبات أصغر، وتجنب محفزاتك،\nواترك وقتًا قبل النوم."
            : "محتويات المعدة قد تعود نحو المريء."
      }
      accent={C.red}
      warning={stage >= 3}
    >
      <Stomach
        x={410}
        y={325}
        s={1.05}
        reflux={stage === 1 ? ease(t, b1, b1 + 1) : 0}
        t={t}
      />
      <Label x={715} y={170} size={40} color={C.red}>
        المريء
      </Label>
      <Arrow x1={655} y1={189} x2={464} y2={188} color={C.red} progress={1} />
      <Label x={710} y={555} size={40}>
        المعدة
      </Label>
      <Arrow x1={650} y1={536} x2={577} y2={510} color={C.ink} />
      {stage === 2 ? (
        <>
          <Check x={755} y={345} />
          <Label x={755} y={425} size={38}>
            غيّر العادات
          </Label>
        </>
      ) : stage >= 3 ? (
        <>
          <rect
            x={620}
            y={280}
            width={255}
            height={160}
            rx={22}
            fill={C.redPale}
          />
          <Label x={748} y={340} size={36} color={C.red}>
            الأعراض تتكرر؟
          </Label>
          <Label x={748} y={399} size={36} color={C.red}>
            لا تتجاهلها
          </Label>
        </>
      ) : null}
      <Callout
        x={480}
        y={748}
        w={710}
        color={stage === 4 ? C.red : C.ink}
        size={37}
      >
        {stage === 4
          ? "ليس كل ألم في الصدر حموضة"
          : "رسم توضيحي مبسّط لاتجاه الارتجاع"}
      </Callout>
    </Frame>
  );
};
