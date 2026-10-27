import React from "react";
import { C, Frame, Label, Line, Arrow, Check, useSeconds } from "../design";
import { Stickman } from "../Stickman";

export const Tingles: React.FC<{ beats: number[] }> = ({
  beats = [5, 9, 12, 18],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  return (
    <Frame
      part={1}
      chapter="2 • التنميل بعد الضغط"
      title={"رجلك «نامت»…\nوالدبابيس صحيت؟"}
      note={
        stage === 4
          ? "تنميل مفاجئ مع ضعف أو صعوبة كلام:\nاطلب المساعدة الطارئة."
          : stage === 3
            ? "تنميل مستمر أو بلا سبب واضح؟ افحصه."
            : stage === 2
              ? "غيّر الوضعية وتحرك بلطف."
              : "الضغط قد يعطّل إشارات العصب مؤقتًا."
      }
      warning={stage >= 3}
    >
      {stage < 3 ? (
        <>
          <ellipse cx={260} cy={604} rx={180} ry={32} fill={C.bluePale} />
          <Stickman
            x={260}
            y={240}
            s={1.08}
            pose={stage < 2 ? "sit" : "stand"}
            face={stage === 0 ? "surprised" : "calm"}
            shirt={C.blue}
          />
          <g opacity={stage === 0 ? 1 : 0}>
            {Array.from({ length: 8 }, (_, i) => (
              <Line
                key={i}
                d={`M${195 + i * 19} ${570 + Math.sin(i) * 20}l-5 -20`}
                width={3}
                color={C.red}
              />
            ))}
          </g>
          <g transform="translate(555 200)">
            <rect
              width={285}
              height={330}
              rx={35}
              fill={C.white}
              stroke={C.line}
              strokeWidth={3}
            />
            <Line
              d="M145 30C90 80 190 115 145 175S100 260 145 300"
              color={stage === 1 ? C.red : C.teal}
              width={12}
            />
            {stage === 1 ? (
              <>
                <Arrow x1={32} y1={165} x2={116} y2={165} color={C.ink} />
                <Arrow x1={255} y1={165} x2={173} y2={165} color={C.ink} />
              </>
            ) : null}
            {Array.from({ length: 4 }, (_, i) => (
              <circle
                key={i}
                cx={145 + Math.sin((t * 90 + i * 70) / 60) * 13}
                cy={30 + ((t * 105 + i * 73) % 270)}
                r={8}
                fill={stage === 1 ? C.red : C.teal}
                opacity={stage === 1 ? 0.3 : 1}
              />
            ))}
          </g>
          <Label x={695} y={600} size={40}>
            {stage === 1 ? "ضغط على العصب" : "الإشارات تعود"}
          </Label>
          {stage === 2 ? <Check x={700} y={690} /> : null}
        </>
      ) : (
        <>
          <Stickman
            x={230}
            y={205}
            s={1.06}
            pose="worry"
            face="worried"
            shirt={C.blue}
          />
          <g>
            <rect
              x={470}
              y={190}
              width={380}
              height={370}
              rx={24}
              fill={C.white}
              stroke={C.red}
              strokeWidth={4}
            />
            <Label x={660} y={275} size={44} color={C.red}>
              {stage === 4 ? "بشكل مفاجئ" : "بشكل مستمر"}
            </Label>
            <Line d="M530 318H790" color={C.line} width={3} />
            <Label x={660} y={382} size={38}>
              {stage === 4 ? "ضعف بجهة واحدة" : "يتكرر بلا ضغط"}
            </Label>
            <Label x={660} y={464} size={38}>
              {stage === 4 ? "أو صعوبة في الكلام" : "أو لا يزول"}
            </Label>
            <Label x={660} y={650} size={43} color={C.red}>
              {stage === 4 ? "لا تنتظر" : "تقييم طبي"}
            </Label>
          </g>
        </>
      )}
      <Label x={480} y={770} size={38}>
        مدة الإحساس والأعراض المصاحبة تهمّ.
      </Label>
    </Frame>
  );
};
