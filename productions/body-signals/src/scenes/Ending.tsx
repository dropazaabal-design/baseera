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
} from "../design";
import { Stickman } from "../Stickman";
export const Ending: React.FC<{ part: 1 | 2 | 3; teaserAt?: number }> = ({
  part,
  teaserAt = 5,
}) => {
  const t = useSeconds();
  const teaser = t >= teaserAt;
  const a = part === 1 ? C.teal : part === 2 ? C.purple : C.blue;
  return (
    <Frame
      part={part}
      chapter={part < 3 ? "قبل ما نكمل…" : "اكتملت الأجزاء الثلاثة"}
      title={
        teaser
          ? part === 1
            ? "في الجزء 2:\nالعين والسمع"
            : part === 2
              ? "في الجزء 3:\nالحلق والمعدة والصدر"
              : "افهم الإشارة…\nوالسياق يغيّر القرار"
          : "راقب الإحساس…\nوافهم سياقه."
      }
      note={
        part === 1
          ? "التالي: رفّة الجفن، صداع المثلجات،\nالقشعريرة، وطنين الأذن."
          : part === 2
            ? "التالي: الحرقان، إحساس الكتلة،\nالثقل بعد الوجبة، ونغزة الصدر."
            : "شاهدها من البداية: الحركة والنوم،\nثم العين والسمع، ثم الحلق والمعدة والصدر."
      }
      accent={a}
    >
      {!teaser ? (
        <>
          <Stickman
            x={210}
            y={280}
            s={0.88}
            pose="point"
            face="calm"
            shirt={a}
          />
          {["متى بدأ؟", "كم استمر؟", "ماذا صاحبه؟"].map((l, i) => (
            <g key={l} opacity={ease(t, i * 0.8, i * 0.8 + 0.4)}>
              <circle cx={560} cy={180 + i * 190} r={33} fill={a} />
              <Label x={560} y={192 + i * 190} size={32} color={C.white}>
                {i + 1}
              </Label>
              <Label x={720} y={192 + i * 190} size={44}>
                {l}
              </Label>
              {i < 2 ? (
                <Line
                  d={`M560 ${221 + i * 190}V${325 + i * 190}`}
                  color={C.line}
                  width={5}
                />
              ) : null}
            </g>
          ))}
        </>
      ) : (
        <>
          <ellipse
            cx={480}
            cy={420}
            rx={330}
            ry={280}
            fill={
              part === 1 ? C.purplePale : part === 2 ? C.redPale : C.tealPale
            }
          />
          <Stickman
            x={480}
            y={230}
            s={1.08}
            pose={part === 1 ? "ear" : part === 2 ? "chest" : "point"}
            face="calm"
            shirt={part === 1 ? C.purple : part === 2 ? C.blue : C.teal}
          />
          <Callout x={480} y={110} w={620} color={a} size={42}>
            {part === 1
              ? "ليش تسمع صوتًا بلا مصدر؟"
              : part === 2
                ? "متى لازم تتصرف فورًا؟"
                : "لا تهويل… ولا تجاهل"}
          </Callout>
          <Arrow
            x1={760}
            y1={735}
            x2={220}
            y2={735}
            color={a}
            progress={ease(t, teaserAt, teaserAt + 0.65)}
          />
        </>
      )}
    </Frame>
  );
};
