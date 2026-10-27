import React from "react";
import {
  C,
  Shell,
  Label,
  Line,
  Arrow,
  Bubble,
  useSeconds,
  ease,
} from "../design";
export const Science: React.FC<{ beats: number[] }> = ({ beats = [4, 7] }) => {
  const t = useSeconds();
  const [b0, b1] = beats;
  return (
    <Shell
      kicker="الدوبامين والتحفيز"
      heading={t < b0 ? "دماغك «محترق»؟" : "الدوبامين جزء\nمن نظام التعلّم."}
      line={
        t < b1
          ? "التعب أو التشتت وحدهما لا يشخّصان خللًا."
          : "المفيد هو تنظيم السلوك الذي يسرق وقتك."
      }
    >
      <g transform="translate(540 1020)">
        <ellipse rx={360} ry={290} fill={C.tealPale} />
        <path
          d="M0 -120C-48 -183 -133 -147 -131 -94C-212 -105 -245 -23 -204 18C-255 93 -190 159 -124 139C-100 199 -24 177 0 135C24 177 100 199 124 139C190 159 255 93 204 18C245 -23 212 -105 131 -94C133 -147 48 -183 0 -120Z"
          fill={C.white}
          stroke={C.ink}
          strokeWidth={9}
        />
        <Line
          d="M0 -115V135M-130 -90Q-60 -105 -68 -42Q-145 -54 -158 15M-199 20Q-98 14 -85 85Q-20 80 -7 34M-122 133Q-129 62 -188 72M130 -90Q60 -105 68 -42Q145 -54 158 15M199 20Q98 14 85 85Q20 80 7 34M122 133Q129 62 188 72"
          color={C.blue}
          width={6}
        />
        {[
          [-113, -35],
          [93, -55],
          [-66, 84],
          [104, 84],
          [0, 10],
        ].map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={9 + 3 * Math.sin(t * 2.3 + i)}
            fill={C.teal}
            opacity={0.65 + 0.35 * Math.sin(t * 2 + i) ** 2}
          />
        ))}
      </g>
      {t >= b0 ? (
        <g opacity={ease(t, b0, b0 + 0.4)}>
          <Bubble x={280} y={700} w={260} color={C.teal}>
            تعلّم
          </Bubble>
          <Bubble x={800} y={700} w={260} color={C.blue}>
            تحفيز
          </Bubble>
          <Arrow
            x1={360}
            y1={752}
            x2={410}
            y2={862}
            p={ease(t, b0, b0 + 0.8)}
          />
          <Arrow
            x1={720}
            y1={752}
            x2={670}
            y2={862}
            color={C.blue}
            p={ease(t, b0 + 0.3, b0 + 1)}
          />
        </g>
      ) : (
        <g>
          <Bubble x={540} y={700} w={520} color={C.red}>
            «محترق من الدوبامين»
          </Bubble>
          <Line
            d="M300 730L780 667"
            color={C.red}
            p={ease(t, 0.8, 1.3)}
            width={6}
          />
        </g>
      )}
      <Label x={540} y={1420} size={46} color={t >= b1 ? C.teal : C.ink}>
        {t >= b1
          ? "تنظيم العادات… ليس تنظيف الدماغ"
          : "رسم مفاهيمي، وليس فحصًا للدماغ"}
      </Label>
    </Shell>
  );
};
