import React from "react";
import { C, Frame, Label, Line, Bed, useSeconds } from "../design";
import { Stickman } from "../Stickman";
export const Sleep: React.FC<{ beats: number[] }> = ({
  beats = [4, 6, 9, 14],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  const jerk = Math.max(0, 1 - Math.abs((t % 4) - 2.25) / 0.22);
  return (
    <Frame
      part={1}
      chapter="4 • النفضة عند بداية النوم"
      title={"قربت تنام…\nوجسمك نطّ؟"}
      note={
        stage === 4
          ? "إذا عطّلت نومك أو كانت شديدة، استشر طبيبًا."
          : stage === 2
            ? "سببها الدقيق لم يُحسم بعد."
            : stage === 3
              ? "الإرهاق وقلة الراحة قد يزيدانها."
              : "نفضة نومية شائعة عند بدء النوم."
      }
      accent={C.blue}
      warning={stage === 4}
    >
      <path
        d="M760 100A63 63 0 1 1 693 186A66 66 0 0 0 760 100"
        fill={C.bluePale}
        stroke={C.blue}
        strokeWidth={4}
      />
      <Bed x={145} y={550} />
      <g transform={`translate(${-jerk * 8} ${-jerk * 15})`}>
        <g transform="translate(320 390) rotate(-86)">
          <Stickman
            x={0}
            y={0}
            s={1.08}
            pose="sleep"
            face={jerk > 0.2 ? "surprised" : "sleepy"}
            shirt={C.blue}
          />
        </g>
      </g>
      <g opacity={jerk}>
        <Line
          d="M280 275L260 241M340 270L348 228M395 302L430 276"
          color={C.blue}
          width={5}
        />
      </g>
      <Label x={480} y={685} size={45} color={stage === 2 ? C.purple : C.blue}>
        {stage === 2
          ? "تفسيرات محتملة ≠ سبب محسوم"
          : stage === 3
            ? "الراحة تساعد"
            : stage === 4
              ? "راقب شدّتها وتأثيرها"
              : "بين اليقظة والنوم"}
      </Label>
      <Line d="M180 745H780" width={3} color={C.line} />
    </Frame>
  );
};
