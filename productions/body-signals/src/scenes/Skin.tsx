import React from "react";
import {
  C,
  Frame,
  Label,
  Line,
  Arrow,
  Cross,
  useSeconds,
  ease,
} from "../design";
import { Stickman } from "../Stickman";
export const Skin: React.FC<{ beats: number[] }> = ({
  beats = [5, 11, 15, 18],
}) => {
  const t = useSeconds();
  const [b1, b2, b3] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : 3;
  const p = ease(t, b1, b1 + 1.5);
  return (
    <Frame
      part={2}
      chapter="7 • القشعريرة"
      title={"جلدك يتنقّط…\nوالشعر يوقف؟"}
      note={
        stage === 3
          ? "ليست مقياسًا لشخصيتك أو تفوّق دماغك."
          : "عضلات دقيقة عند بصيلات الشعر تنقبض."
      }
      accent={C.purple}
    >
      {stage === 0 ? (
        <>
          <Stickman
            x={480}
            y={240}
            s={1.15}
            pose="chest"
            face="surprised"
            shirt={C.purple}
          />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${195 + i * 285} 130)`}>
              <path
                d="M-23 0H23M0 -23V23M-16 -16L16 16M16 -16L-16 16"
                stroke={C.blue}
                strokeWidth={4}
                strokeLinecap="round"
              />
            </g>
          ))}
          <Label x={480} y={735} size={43}>
            برد، خوف، أو تأثر.
          </Label>
        </>
      ) : (
        <>
          <path d="M110 415H850V650H110Z" fill={C.purplePale} />
          <path
            d={`M110 415Q175 ${415 - 38 * p} 230 415T360 415T490 415T620 415T750 415T850 415`}
            fill="none"
            stroke={C.ink}
            strokeWidth={7}
          />
          {[210, 470, 730].map((x, i) => (
            <g key={i}>
              <ellipse
                cx={x}
                cy={545}
                rx={24}
                ry={39}
                fill={C.white}
                stroke={C.ink}
                strokeWidth={5}
              />
              <Line
                d={`M${x} 540Q${x - 10} 480 ${x} 400`}
                color={C.ink}
                width={9}
              />
              <g transform={`translate(${x} 400) rotate(${-52 * (1 - p)})`}>
                <Line d="M0 0V-180" width={9} />
              </g>
              <path
                d={`M${x - 15} 530L${x + 75 - 35 * p} ${430 - 25 * p}`}
                stroke={C.purple}
                strokeWidth={14}
                strokeLinecap="round"
              />
            </g>
          ))}
          <Label x={480} y={205} size={45} color={C.purple}>
            انقباض صغير… أثر ظاهر
          </Label>
          <Arrow
            x1={800}
            y1={315}
            x2={770}
            y2={450}
            color={C.purple}
            progress={p}
          />
          <Label x={480} y={730} size={38}>
            {stage === 3
              ? "رد فعل جسدي، وليس اختبارًا للشخصية."
              : "مقطع توضيحي في الجلد"}
          </Label>
          {stage === 3 ? <Cross x={850} y={722} s={0.8} /> : null}
        </>
      )}
    </Frame>
  );
};
