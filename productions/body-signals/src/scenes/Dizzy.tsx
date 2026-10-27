import React from "react";
import {
  C,
  Frame,
  Label,
  Line,
  Arrow,
  Callout,
  Cup,
  Check,
  useSeconds,
  ease,
  ramp,
} from "../design";
import { Stickman } from "../Stickman";

export const Dizzy: React.FC<{ beats: number[] }> = ({
  beats = [4, 9, 12, 17],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stand = ease(t, 0.5, 1.8);
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  return (
    <Frame
      part={1}
      chapter="1 • الدوخة عند الوقوف"
      title={"ليش تدور الدنيا\nلما تقوم؟"}
      note={
        stage === 4
          ? "تكرار الدوخة أو الإغماء يحتاج تقييمًا."
          : stage === 3
            ? "قم على مهل، وانتبه لشرب الماء."
            : stage === 1
              ? "الجاذبية تغيّر توزيع الدم عند الوقوف."
              : "الجسم يعدّل الضغط؛ أحيانًا يتأخر التعديل."
      }
      warning={stage === 4}
    >
      <path
        d="M130 570V345Q130 320 155 320H335V570M115 570H350M155 430H335"
        fill={C.tealPale}
        stroke={C.ink}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <Stickman
        x={360}
        y={300 - 150 * stand}
        s={1.2}
        pose="sit"
        toPose="stand"
        mix={stand}
        face={stage < 3 ? "confused" : "calm"}
        shirt={C.teal}
        tilt={stage === 2 ? Math.sin(t * 3) * 3 : 0}
      />
      {stage >= 1 && stage <= 2 ? (
        <g opacity={ease(t, b1, b1 + 0.4)}>
          <path
            d="M640 200V555M720 215V555"
            stroke={C.redPale}
            strokeWidth={42}
            strokeLinecap="round"
          />
          {[0, 1, 2, 3].map((i) => (
            <circle
              key={i}
              cx={680}
              cy={220 + ((t * 95 + i * 89) % 350)}
              r={13}
              fill={C.red}
            />
          ))}
          <Arrow x1={680} y1={300} x2={680} y2={555} color={C.red} />
          <Label x={700} y={645} size={38}>
            تجمّع الدم أسفلًا
          </Label>
          <g opacity={stage === 2 ? 1 : 0}>
            <Arrow
              x1={585}
              y1={540}
              x2={585}
              y2={170}
              color={C.teal}
              progress={ramp(t, b2, b2 + 1.8)}
            />
            <Label x={760} y={135} size={40} color={C.teal}>
              تعديل الضغط
            </Label>
          </g>
        </g>
      ) : null}
      {stage === 0 ? (
        <>
          <path
            d="M420 160C510 105 520 225 430 200C370 180 450 135 460 180"
            stroke={C.blue}
            fill="none"
            strokeWidth={5}
          />
          <Callout x={703} y={320} w={320} color={C.blue}>
            وش صار للصورة؟
          </Callout>
        </>
      ) : null}
      {stage === 3 ? (
        <>
          <Cup x={740} y={320} s={1.7} color={C.blue} />
          <Check x={740} y={490} s={1.1} />
          <Label x={705} y={610} size={41}>
            على مهل
          </Label>
        </>
      ) : null}
      {stage === 4 ? (
        <>
          <rect
            x={580}
            y={210}
            width={250}
            height={300}
            rx={25}
            fill={C.white}
            stroke={C.red}
            strokeWidth={5}
          />
          <path
            d="M650 340H760M705 286V394"
            stroke={C.red}
            strokeWidth={18}
            strokeLinecap="round"
          />
          <Label x={705} y={575} color={C.red} size={38}>
            راجع السبب
          </Label>
        </>
      ) : null}
      <Line d="M90 660H870" width={3} color={C.line} />
      <Label x={480} y={750} size={40}>
        قلة الماء احتمال، وليست التفسير الوحيد.
      </Label>
    </Frame>
  );
};
