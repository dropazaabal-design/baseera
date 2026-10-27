import React from "react";
import {
  C,
  Frame,
  Label,
  Line,
  Arrow,
  Callout,
  useSeconds,
  ease,
  ramp,
} from "../design";
import { Stickman } from "../Stickman";

export const Opening: React.FC<{ part: 1 | 2 | 3 }> = ({ part }) => {
  const t = useSeconds();
  const e = ease(t, 2, 2.7);
  return (
    <Frame
      part={part}
      chapter={`الجزء ${part} • ${part === 1 ? "الحركة والنوم" : part === 2 ? "العين والسمع" : "الحلق والمعدة والصدر"}`}
      title={
        part === 1
          ? "حركة صغيرة…\nوقلق كبير؟"
          : part === 2
            ? "الصوت موجود…\nوالمصدر غايب؟"
            : "متى ما ينفع\nتقول: عادي؟"
      }
      note={
        part === 1
          ? "4 إشارات نفهمها من سياقها."
          : part === 2
            ? "الإحساس حقيقي، والتفسير يحتاج سياقًا."
            : "نفهم السبب المحتمل، وننتبه للعلامات."
      }
      accent={part === 1 ? C.teal : part === 2 ? C.purple : C.red}
    >
      <ellipse
        cx={480}
        cy={445}
        rx={320}
        ry={300}
        fill={part === 1 ? C.tealPale : part === 2 ? C.purplePale : C.redPale}
      />
      <Stickman
        x={480}
        y={240}
        s={1.15}
        pose={part === 1 ? "dizzy" : part === 2 ? "ear" : "chest"}
        face={t < 3 ? "worried" : "confused"}
        shirt={part === 1 ? C.teal : part === 2 ? C.purple : C.blue}
        toPose={part === 1 ? "point" : "stand"}
        mix={e}
      />
      {part === 1 ? (
        <>
          <Callout x={220} y={140} w={250} fill={C.white} color={C.red}>
            طوارئ؟
          </Callout>
          <g opacity={e}>
            <Line d="M120 140L315 140" color={C.red} width={5} />
            <Callout x={745} y={145} w={250} color={C.teal}>
              نفهم أولًا
            </Callout>
            <Arrow x1={320} y1={178} x2={400} y2={230} progress={e} />
          </g>
          <Label x={480} y={745} size={43}>
            متى بدأ؟ كم يستمر؟
          </Label>
        </>
      ) : part === 2 ? (
        <>
          <g opacity={0.5 + 0.5 * Math.sin(t * 3) ** 2}>
            <path
              d="M655 310Q710 365 655 420M685 280Q780 365 685 450"
              fill="none"
              stroke={C.purple}
              strokeWidth={7}
              strokeLinecap="round"
            />
          </g>
          <Callout x={235} y={150} w={300} color={C.purple}>
            مين شغّل الصوت؟
          </Callout>
          <Label x={480} y={745} size={43}>
            رفّة، صداع، قشعريرة، طنين.
          </Label>
        </>
      ) : (
        <>
          <g transform={`translate(220 130) rotate(${-8 + Math.sin(t) * 2})`}>
            <rect
              x={-120}
              y={-58}
              width={240}
              height={120}
              rx={18}
              fill={C.white}
              stroke={C.ink}
              strokeWidth={4}
            />
            <Label x={0} y={21} size={65}>
              عادي
            </Label>
            <Line
              d="M-95 40L95 -38"
              color={C.red}
              width={7}
              progress={ramp(t, 3, 3.5)}
            />
          </g>
          <Label x={480} y={745} size={43}>
            الوصف وحده لا يكفي.
          </Label>
        </>
      )}
    </Frame>
  );
};
