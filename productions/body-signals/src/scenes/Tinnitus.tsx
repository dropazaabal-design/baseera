import React from "react";
import { C, Frame, Label, Callout, useSeconds } from "../design";
import { Stickman } from "../Stickman";
export const Tinnitus: React.FC<{ beats: number[] }> = ({
  beats = [4, 8, 13, 17, 20],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4, b5] = beats;
  const stage =
    t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : t < b5 ? 4 : 5;
  return (
    <Frame
      part={2}
      chapter="8 • طنين الأذن"
      title={"الغرفة ساكتة…\nوالصفير شغّال؟"}
      note={
        stage === 5
          ? "طنين مع فقدان سمع مفاجئ:\nاطلب مساعدة طبية عاجلة."
          : stage === 4
            ? "إذا استمر أو أزعجك، افحصه."
            : stage === 3
              ? "خفف الأصوات العالية، ولا تدخل أدوات للأذن."
              : "إحساس بصوت من دون مصدر خارجي."
      }
      accent={C.purple}
      warning={stage >= 4}
    >
      {stage === 0 ? (
        <>
          <Stickman
            x={480}
            y={250}
            s={1.15}
            pose="ear"
            face="confused"
            shirt={C.purple}
          />
          <path
            d="M680 220Q750 310 680 400M730 190Q840 310 730 430"
            fill="none"
            stroke={C.purple}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.5 + 0.5 * Math.sin(t * 4) ** 2}
          />
          <Callout x={250} y={125} w={310} color={C.purple}>
            من وين الصوت؟
          </Callout>
        </>
      ) : (
        <>
          <ellipse cx={470} cy={340} rx={258} ry={268} fill={C.purplePale} />
          <path
            d="M370 150C545 80 650 275 540 400C490 460 520 550 430 553C365 555 370 505 338 470M392 220C512 145 585 288 492 351Q428 382 441 436M392 330Q460 272 489 323"
            fill="none"
            stroke={C.ink}
            strokeWidth={11}
            strokeLinecap="round"
          />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${650 + i * 35} ${260 - i * 20}Q${720 + i * 35} 340 ${650 + i * 35} ${420 + i * 20}`}
              fill="none"
              stroke={stage === 5 ? C.red : C.purple}
              strokeWidth={5}
              opacity={0.3 + 0.5 * ((t + i * 0.4) % 1)}
            />
          ))}
          <Label
            x={470}
            y={662}
            size={43}
            color={stage >= 4 ? C.red : C.purple}
          >
            {stage === 2
              ? "أسباب مختلفة تحتاج سياقًا"
              : stage === 3
                ? "احمِ سمعك"
                : stage === 4
                  ? "مستمر أو مزعج؟ افحصه"
                  : stage === 5
                    ? "فقدان السمع المفاجئ يستدعي العجلة"
                    : "الصوت محسوس… بلا مصدر خارجي"}
          </Label>
          {stage === 2 ? (
            <>
              <Label x={250} y={755} size={32}>
                السمع
              </Label>
              <Label x={480} y={755} size={32}>
                الضجيج
              </Label>
              <Label x={710} y={755} size={32}>
                شمع أو أدوية
              </Label>
            </>
          ) : null}
        </>
      )}
    </Frame>
  );
};
