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
  ease,
} from "../design";
import { Stickman } from "../Stickman";
export const Stretch: React.FC<{ beats: number[] }> = ({
  beats = [4, 8, 11, 16],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b2 ? 0 : t < b3 ? 1 : t < b4 ? 2 : 3;
  const lift = 0.5 - 0.5 * Math.cos(Math.min(t / 4, 1) * Math.PI);
  return (
    <Frame
      part={1}
      chapter="3 • التمغّط"
      title={"تمغّطت…\nوبعدها ارتحت؟"}
      note={
        stage === 2
          ? "لا نجزم بأنه يعيد برمجة كل الأعصاب."
          : stage === 3
            ? "تحرك براحتك، من غير شد مؤلم."
            : "سلوك تلقائي قد يرافق التثاؤب والاستيقاظ."
      }
    >
      <ellipse cx={480} cy={470} rx={280} ry={280} fill={C.tealPale} />
      <Stickman
        x={480}
        y={205}
        s={1.2}
        pose="stand"
        toPose="stretch"
        mix={stage === 3 ? 0.5 : lift}
        face={stage === 0 ? "sleepy" : "happy"}
        shirt={C.teal}
      />
      <g opacity={ease(t, b1, b1 + 0.4)}>
        <Line
          d="M268 250Q205 158 270 87M690 250Q755 158 690 87"
          width={5}
          color={C.teal}
        />
        <Label x={480} y={80} size={43} color={C.teal}>
          {stage === 1 ? "انقباض… ثم استرخاء" : "حركة تلقائية"}
        </Label>
      </g>
      {stage === 2 ? (
        <g>
          <Callout x={480} y={735} w={650} color={C.red}>
            إعادة برمجة كل الأعصاب؟
          </Callout>
          <Cross x={835} y={735} s={0.8} />
        </g>
      ) : stage === 3 ? (
        <>
          <Callout x={480} y={735} w={420} color={C.teal}>
            بدون ألم
          </Callout>
          <Check x={742} y={735} />
        </>
      ) : (
        <Label x={480} y={770} size={41}>
          عند الانتقال من النوم إلى اليقظة.
        </Label>
      )}
    </Frame>
  );
};
