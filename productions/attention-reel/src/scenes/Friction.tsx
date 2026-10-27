import React from "react";
import {
  C,
  Shell,
  Phone,
  Notebook,
  Label,
  Line,
  Bubble,
  Check,
  useSeconds,
  ease,
  ramp,
} from "../design";
import { Stickman } from "../Stickman";
export const Friction: React.FC<{ beats: number[] }> = ({
  beats = [4, 6, 9, 11.5, 14.5],
}) => {
  const t = useSeconds();
  const [b0, b1, b2, b3, b4] = beats;
  const moved = ease(t, b1, b1 + 1);
  const start = t >= b3;
  const progress = ramp(t, b3, b3 + 3);
  return (
    <Shell
      step={2}
      kicker="2 • صعّب المقاطعة وسهّل البداية"
      heading={
        start
          ? "ابدأ بـ5 دقائق…\nوبعدها قرّر."
          : "خلّ الجوال أبعد…\nوالمهمة أقرب."
      }
      line={
        start
          ? "بداية صغيرة تختارها، ثم تقرر إن كنت ستكمل."
          : "أطفئ غير الضروري من الإشعارات، وأبعد الهاتف."
      }
    >
      {!start ? (
        <>
          <g opacity={1 - ease(t, b2, b2 + 0.4)}>
            <Phone
              x={660 - 400 * moved}
              y={1050}
              s={0.85 - 0.25 * moved}
              t={t}
              muted={t >= b0}
              feed={t < b0}
            />
            <Stickman
              x={275 + 165 * moved}
              y={1030}
              s={0.9}
              pose={t < b1 ? "phone" : "walk"}
              face="calm"
              shirt={C.blue}
            />
            {t < b0 ? (
              [0, 1, 2].map((i) => (
                <g
                  key={i}
                  transform={`translate(${700 + i * 32} ${720 - i * 63 - ((t * 25) % 65)})`}
                >
                  <circle r={31} fill={C.red} />
                  <Label x={0} y={11} size={30} color={C.white}>
                    !
                  </Label>
                </g>
              ))
            ) : (
              <Check x={785} y={800} />
            )}
          </g>
          <g opacity={moved}>
            <Notebook x={760} y={1100} s={0.9} p={0} label="المهمة" lines={4} />
            <Label x={270} y={1445} size={41} color={C.muted}>
              بعيد عن يدك
            </Label>
          </g>
        </>
      ) : (
        <>
          <Phone x={200} y={1160} s={0.48} muted feed={false} />
          <Stickman
            x={435}
            y={1020}
            s={0.9}
            pose="work"
            face="calm"
            shirt={C.teal}
          />
          <Notebook
            x={755}
            y={1110}
            s={0.95}
            p={progress * 0.25}
            label="أول خطوة"
            lines={4}
          />
          <g transform="translate(300 760)">
            <circle r={92} fill={C.white} stroke={C.teal} strokeWidth={5} />
            <circle r={77} fill="none" stroke={C.tealPale} strokeWidth={12} />
            <circle
              r={77}
              fill="none"
              stroke={C.teal}
              strokeWidth={12}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress * 0.3}
              transform="rotate(-90)"
            />
            <Label x={0} y={22} size={67} color={C.teal}>
              5
            </Label>
          </g>
          <Label x={300} y={895} size={39} color={C.teal}>
            دقائق للبداية
          </Label>
          <Bubble x={640} y={1480} w={470} color={C.teal}>
            {t >= b4 ? "بعدها أختار إذا أكمل" : "بدأت… بدل التأجيل"}
          </Bubble>
        </>
      )}
      {t >= b2 && !start ? (
        <g>
          <Bubble x={650} y={780} w={510} color={C.red}>
            لازم أخلص كل شيء!
          </Bubble>
          <Line
            d="M420 806L881 750"
            color={C.red}
            p={ease(t, b2, b2 + 0.4)}
            width={6}
          />
        </g>
      ) : null}
    </Shell>
  );
};
