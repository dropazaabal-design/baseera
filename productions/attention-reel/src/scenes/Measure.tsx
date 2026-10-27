import React from "react";
import { C, Shell, Label, Line, Check, useSeconds, ease } from "../design";
import { Stickman } from "../Stickman";
export const Measure: React.FC<{ beats: number[] }> = ({
  beats = [2, 5, 6.5, 8.2],
}) => {
  const t = useSeconds();
  const [b0, b1, b2, b3] = beats;
  const observe = t >= b1;
  return (
    <Shell
      kicker="قِس السلوك الذي تغيّر"
      heading={
        observe ? "قِس اللي تغيّر…\nفي يومك." : "مو وعدًا\nبـ«إعادة ضبط»."
      }
      line={
        observe
          ? "هل قلّ الفتح التلقائي؟ وهل بدأت المهمة؟"
          : "لا تحتاج حرمان نفسك من كل متعة، ولا موعدًا سحريًا."
      }
    >
      {!observe ? (
        <>
          <Stickman
            x={300}
            y={1010}
            s={1.05}
            pose="worry"
            face="confused"
            shirt={C.blue}
          />
          <g transform="translate(750 1030)">
            <rect
              x={-160}
              y={-180}
              width={320}
              height={360}
              rx={22}
              fill={C.white}
              stroke={C.ink}
              strokeWidth={6}
            />
            <path
              d="M-156 -92H156M-85 -202V-149M85 -202V-149"
              stroke={C.ink}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <Label x={0} y={-20} size={37}>
              إعادة ضبط
            </Label>
            <Label x={0} y={90} size={64} color={C.red}>
              14 يومًا؟
            </Label>
            <Line
              d="M-134 151L134 -25"
              color={C.red}
              width={7}
              p={ease(t, b0, b0 + 0.65)}
            />
          </g>
          <Label x={540} y={1480} size={43}>
            غيّر الاستجابة… وراقب أثرها.
          </Label>
        </>
      ) : (
        <>
          <Stickman
            x={270}
            y={1020}
            s={0.9}
            pose="point"
            face="calm"
            shirt={C.teal}
          />
          <g transform="translate(690 1060)">
            <rect
              x={-205}
              y={-310}
              width={410}
              height={620}
              rx={25}
              fill={C.white}
              stroke={C.ink}
              strokeWidth={5}
            />
            <Label x={0} y={-220} size={44}>
              ماذا تغيّر؟
            </Label>
            <path d="M-165 -175H165" stroke={C.line} strokeWidth={3} />
            <g opacity={ease(t, b2, b2 + 0.3)}>
              <Label x={0} y={-75} size={40}>
                فتح أقل تلقائية؟
              </Label>
              <Check x={0} y={-3} s={0.8} />
            </g>
            <g opacity={ease(t, b3, b3 + 0.3)}>
              <Label x={0} y={125} size={40}>
                بدأت المهمة؟
              </Label>
              <Check x={0} y={197} s={0.8} />
            </g>
          </g>
          <Label x={540} y={1480} size={42} color={C.teal}>
            المقياس هو السلوك، لا «تنظيف الدماغ».
          </Label>
        </>
      )}
    </Shell>
  );
};
