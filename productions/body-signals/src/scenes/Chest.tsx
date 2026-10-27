import React from "react";
import { C, Frame, Label, Line, Callout, useSeconds } from "../design";
import { Stickman } from "../Stickman";
export const Chest: React.FC<{ beats: number[] }> = ({
  beats = [2, 4.5, 8, 13.5, 15],
}) => {
  const t = useSeconds();
  const [, b2, b3, b4, b5] = beats;
  const stage = t < b2 ? 0 : t < b3 ? 1 : t < b4 ? 2 : t < b5 ? 3 : 4;
  return (
    <Frame
      part={3}
      chapter="12 • نغزة الصدر"
      title={"اسمها «نغزة»…\nبس ما يكفي!"}
      note={
        stage >= 2 && stage <= 3
          ? "ألم مفاجئ مستمر، أو ضيق نفس أو تعرّق،\nأو امتداد للذراع أو الفك: اطلب الإسعاف فورًا."
          : stage === 4
            ? "والألم الذي يأتي ويذهب يستحق مراجعة أيضًا."
            : "وصف الألم وحده لا يحدد سببه."
      }
      accent={C.red}
      warning={stage >= 2}
    >
      <Stickman
        x={250}
        y={225}
        s={1.17}
        pose="chest"
        face="worried"
        shirt={C.blue}
      />
      <g transform="translate(250 365)">
        <circle r={35} fill={C.redPale} stroke={C.red} strokeWidth={4} />
        <path d="M-12 -12L0 0L-9 15L17 -4L3 -4L10 -20" fill={C.red} />
      </g>
      {stage <= 1 ? (
        <>
          <Callout x={665} y={230} w={380} color={C.ink}>
            أسباب متعددة
          </Callout>
          <Label x={665} y={360} size={39}>
            قد يكون من العضلات
          </Label>
          <Line d="M505 406H825" color={C.line} width={3} />
          <Label x={665} y={474} size={39} color={C.red}>
            لكن الوصف لا يشخّص
          </Label>
          <Label x={480} y={742} size={42}>
            لا تختبر السبب بنفسك.
          </Label>
        </>
      ) : (
        <>
          <rect
            x={470}
            y={133}
            width={410}
            height={490}
            rx={24}
            fill={C.redPale}
            stroke={C.red}
            strokeWidth={3}
          />
          <Label x={675} y={220} size={44} color={C.red}>
            {stage === 4 ? "حتى لو يروح ويرجع" : "انتبه لهذه العلامات"}
          </Label>
          <Line d="M510 259H840" color={C.red} width={2} />
          <Label x={675} y={326} size={37}>
            ألم مفاجئ لا يزول
          </Label>
          <Label x={675} y={412} size={37}>
            ضيق نفس أو تعرّق
          </Label>
          <Label x={675} y={498} size={37}>
            امتداد للذراع أو الفك
          </Label>
          <Label x={675} y={578} size={38} color={C.red}>
            {stage === 4 ? "مراجعة طبية" : "اطلب الإسعاف فورًا"}
          </Label>
          <Callout x={480} y={739} w={700} color={C.red} size={40}>
            {stage === 4 ? "التكرار يستحق التقييم" : "لا تنتظر بقية الفيديو"}
          </Callout>
        </>
      )}
    </Frame>
  );
};
