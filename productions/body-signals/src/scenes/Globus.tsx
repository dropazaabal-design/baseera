import React from "react";
import { C, Frame, Label, Arrow, Cup, Callout, useSeconds } from "../design";
import { Stickman } from "../Stickman";
export const Globus: React.FC<{ beats: number[] }> = ({
  beats = [6, 12, 14, 17],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  return (
    <Frame
      part={3}
      chapter="10 • إحساس الكتلة في الحلق"
      title={"تحسّ فيه شيء…\nوالبلع طبيعي؟"}
      note={
        stage === 4
          ? "صعوبة أو ألم في البلع، أو كتلة في الرقبة؟\nلا تفسرها بالتوتر وحده."
          : stage === 3
            ? "رشفات ماء بدل التنحنح المتكرر."
            : stage === 2
              ? "التوتر قد يزيد الإحساس."
              : "قد يرتبط بشدّ العضلات أو تهيج الحلق والارتجاع."
      }
      accent={C.purple}
      warning={stage === 4}
    >
      <Stickman
        x={230}
        y={250}
        s={0.97}
        pose="worry"
        face={stage < 3 ? "confused" : "calm"}
        shirt={C.purple}
      />
      <g transform="translate(650 335)">
        <rect
          x={-155}
          y={-215}
          width={310}
          height={470}
          rx={88}
          fill={C.white}
          stroke={C.line}
          strokeWidth={4}
        />
        <path
          d="M-45 -165Q-60 -80 -45 0T-45 188M45 -165Q60 -80 45 0T45 188"
          fill="none"
          stroke={C.ink}
          strokeWidth={8}
        />
        <ellipse cy={22} rx={88} ry={53} fill={C.purplePale} opacity={0.65} />
        <ellipse
          cy={22}
          rx={80}
          ry={47}
          fill="none"
          stroke={stage === 4 ? C.red : C.purple}
          strokeWidth={5}
          strokeDasharray="7 10"
        />
        {stage === 0 || stage === 3 ? (
          <circle cx={0} cy={-155 + ((t * 105) % 330)} r={13} fill={C.blue} />
        ) : null}
        {stage === 1 || stage === 2 ? (
          <>
            <Arrow x1={-132} y1={20} x2={-62} y2={20} color={C.purple} />
            <Arrow x1={132} y1={20} x2={62} y2={20} color={C.purple} />
          </>
        ) : null}
      </g>
      <Label x={650} y={135} size={40} color={C.purple}>
        {stage === 4 ? "علامات تستحق التقييم" : "إحساس، لا يثبت وجود انسداد"}
      </Label>
      {stage === 3 ? (
        <Cup x={270} y={710} s={1.25} color={C.blue} />
      ) : (
        <Callout
          x={480}
          y={713}
          w={650}
          color={stage === 4 ? C.red : C.teal}
          size={37}
        >
          {stage === 4
            ? "صعوبة البلع الفعلية حالة مختلفة"
            : "الأكل والماء يمران بلا ألم"}
        </Callout>
      )}
    </Frame>
  );
};
