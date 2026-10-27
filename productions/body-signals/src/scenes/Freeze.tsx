import React from "react";
import {
  C,
  Frame,
  Label,
  Line,
  Arrow,
  Cup,
  Callout,
  useSeconds,
  ease,
  ramp,
} from "../design";
import { Stickman } from "../Stickman";
export const Freeze: React.FC<{ beats: number[] }> = ({
  beats = [5, 9, 13, 17],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  return (
    <Frame
      part={2}
      chapter="6 • صداع المثلجات"
      title={"البارد في فمك…\nوالألم في جبهتك؟"}
      note={
        stage >= 3
          ? "توقف عن البارد ودفّئ سقف فمك بلسانك."
          : stage === 2
            ? "ألم مُحال: مكان البداية يختلف عن الإحساس."
            : "البرودة تلامس سقف الفم؛ الألم يُحسّ في الرأس."
      }
      accent={C.blue}
    >
      {stage === 0 ? (
        <>
          <Stickman
            x={380}
            y={230}
            s={1.15}
            pose="worry"
            face="pain"
            shirt={C.blue}
          />
          <Cup x={650} y={425} s={2} color={C.blue} />
          <g opacity={0.3 + 0.7 * Math.sin(t * 6) ** 2}>
            <Line
              d="M330 130L307 90M370 120L366 73M415 130L438 89"
              color={C.blue}
              width={6}
            />
          </g>
          <Label x={480} y={745} size={43}>
            رشفة كبيرة… وصداع قصير.
          </Label>
        </>
      ) : (
        <>
          <g transform="translate(370 310)">
            <path
              d="M-75 215V128Q-150 85 -160 -25Q-170 -173 -50 -195Q73 -219 105 -115L122 -68L155 -22L119 -6L119 65Q105 98 45 93L34 215"
              fill={C.white}
              stroke={C.ink}
              strokeWidth={8}
              strokeLinejoin="round"
            />
            <path
              d="M40 33H118"
              stroke={stage >= 3 ? C.teal : C.blue}
              strokeWidth={12}
              strokeLinecap="round"
            />
            <circle
              cx={64}
              cy={-101}
              r={36}
              fill={C.redPale}
              stroke={C.red}
              strokeWidth={4}
            />
            <circle cx={82} cy={-44} r={5} fill={C.ink} />
            <Line d="M111 12L72 11" width={4} />
            <path
              d="M50 32C5 17 3 -70 65 -102"
              stroke={C.purple}
              strokeWidth={6}
              fill="none"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - ramp(t, b1, b1 + 1.3)}
            />
          </g>
          <Arrow
            x1={660}
            y1={350}
            x2={507}
            y2={347}
            color={C.blue}
            progress={ease(t, b1, b1 + 0.8)}
          />
          <Label x={720} y={328} size={39} color={C.blue}>
            سقف الفم
          </Label>
          <Arrow
            x1={655}
            y1={175}
            x2={482}
            y2={206}
            color={C.red}
            progress={ease(t, b1 + 0.7, b1 + 1.3)}
          />
          <Label x={720} y={142} size={39} color={C.red}>
            موضع الألم
          </Label>
          <Callout
            x={480}
            y={650}
            w={540}
            color={stage >= 3 ? C.teal : C.purple}
          >
            {stage >= 3
              ? "توقف… ثم رشفات أصغر"
              : "الإشارة تنتقل، والإحساس يختلف"}
          </Callout>
          <Label x={480} y={760} size={36}>
            رسم توضيحي مبسّط
          </Label>
        </>
      )}
    </Frame>
  );
};
