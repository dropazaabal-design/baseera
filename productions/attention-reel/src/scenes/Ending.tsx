import React from "react";
import {
  C,
  Shell,
  Phone,
  Label,
  Line,
  Bubble,
  Check,
  useSeconds,
  ease,
  ramp,
} from "../design";
import { Stickman } from "../Stickman";
export const Ending: React.FC<{ beats: number[] }> = ({
  beats = [1.3, 2.5, 4.3, 6],
}) => {
  const t = useSeconds();
  const [b0, b1, b2, b3] = beats;
  const open = ease(t, b1, b1 + 0.9);
  return (
    <Shell
      kicker="ابدأ الآن بخطوة واحدة"
      heading={"أول صفحة…\nقبل أول تمريرة."}
      line="اختر مهمة واحدة، وأبعد الهاتف، وافتح البداية."
    >
      <Phone x={230} y={1130} s={0.42} muted={t >= b0} feed={false} />
      <g opacity={ease(t, b0, b0 + 0.4)}>
        <path
          d="M130 890H330M130 1370H330"
          stroke={C.teal}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Label x={230} y={1440} size={39} color={C.muted}>
          بعيد
        </Label>
      </g>
      <Stickman
        x={480}
        y={1010}
        s={1.05}
        pose="work"
        face={t >= b2 ? "happy" : "calm"}
        shirt={C.teal}
      />
      <g transform="translate(790 1120)">
        <g transform={`translate(0 0)`}>
          <path
            d={`M0 -152Q${-66 * open} -187 ${-150 * open - 8} -150V172Q${-60 * open} 134 0 178Z`}
            fill={C.white}
            stroke={C.ink}
            strokeWidth={6}
          />
          {[0, 1, 2].map((i) => (
            <Line
              key={i}
              d={`M-23 ${-63 + i * 62}H${-132 * open - 3}`}
              color={C.line}
              width={5}
              p={open}
            />
          ))}
        </g>
        <path
          d="M0 -152Q65 -186 157 -150V172Q61 135 0 178Z"
          fill={C.white}
          stroke={C.ink}
          strokeWidth={6}
        />
        <path d="M0 -152V178" stroke={C.ink} strokeWidth={5} />
        <Label x={78} y={-80} size={34}>
          البداية
        </Label>
        {[0, 1, 2].map((i) => (
          <Line
            key={i}
            d={`M25 ${-11 + i * 57}H134`}
            color={i === 0 ? C.teal : C.line}
            width={6}
            p={i === 0 ? ramp(t, b2, b2 + 1) : 1}
          />
        ))}
      </g>
      {t >= b2 ? (
        <g opacity={ease(t, b2, b2 + 0.35)}>
          <Bubble x={660} y={780} w={380} color={C.teal}>
            {t >= b3 ? "قبل أول تمريرة" : "بدأت فعلًا"}
          </Bubble>
          <Check x={896} y={780} />
        </g>
      ) : (
        <Label x={650} y={780} size={47} color={C.teal}>
          مهمة واحدة
        </Label>
      )}
    </Shell>
  );
};
