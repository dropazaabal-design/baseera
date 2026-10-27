import React from "react";
import {
  C,
  Frame,
  Label,
  Line,
  Cup,
  Check,
  Cross,
  useSeconds,
  ease,
} from "../design";
import { Stickman } from "../Stickman";
export const Eye: React.FC<{ beats: number[] }> = ({
  beats = [5, 10, 13, 18],
}) => {
  const t = useSeconds();
  const [b1, b2, b3, b4] = beats;
  const stage = t < b1 ? 0 : t < b2 ? 1 : t < b3 ? 2 : t < b4 ? 3 : 4;
  const twitch = stage < 2 ? Math.sin(t * 32) * 4 : 0;
  return (
    <Frame
      part={2}
      chapter="5 • رفّة الجفن"
      title={"عينك تتحرك…\nمن غير إذنك؟"}
      note={
        stage === 3
          ? "الرفّة وحدها لا تشخّص نقص المغنيسيوم."
          : stage === 4
            ? "أكثر من أسبوعين، أو ضعف، أو أماكن متعددة؟\nراجع طبيبًا."
            : stage === 2
              ? "راحة أكثر، وكافيين أقل."
              : "تقلصات صغيرة لا إرادية، لها محفزات شائعة."
      }
      accent={C.purple}
      warning={stage === 4}
    >
      <g transform="translate(480 290)">
        <ellipse
          rx={305}
          ry={190}
          fill={C.white}
          stroke={C.line}
          strokeWidth={3}
        />
        <path
          d="M-262 0Q0 -194 262 0Q0 185 -262 0Z"
          fill={C.white}
          stroke={C.ink}
          strokeWidth={9}
        />
        <circle r={82} fill={C.bluePale} stroke={C.blue} strokeWidth={7} />
        <circle r={36} fill={C.ink} />
        <circle cx={21} cy={-21} r={12} fill={C.white} />
        <path
          d={`M-250 0Q0 ${-182 + twitch} 250 0`}
          stroke={C.purple}
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M62 125Q105 ${140 + twitch * 2} 151 114`}
          stroke={C.purple}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />
        {stage < 2 ? (
          <g opacity={0.4 + 0.6 * Math.sin(t * 15) ** 2}>
            <Line
              d="M115 155L124 182M160 144L181 164M73 159L74 187"
              color={C.purple}
              width={4}
            />
          </g>
        ) : null}
      </g>
      {stage <= 1 ? (
        <g opacity={ease(t, b1, b1 + 0.5)}>
          <Cup x={200} y={620} s={1.1} color={C.purple} />
          <Label x={200} y={735} size={35}>
            الكافيين
          </Label>
          <g transform="translate(480 620)">
            <circle r={44} fill={C.purplePale} />
            <Line
              d="M-12 -19L10 0L-12 19M10 -19L-10 0L10 19"
              color={C.purple}
              width={4}
            />
          </g>
          <Label x={480} y={735} size={35}>
            التوتر
          </Label>
          <Stickman
            x={760}
            y={560}
            s={0.36}
            pose="stand"
            face="sleepy"
            shirt={C.purple}
          />
          <Label x={760} y={735} size={35}>
            التعب
          </Label>
        </g>
      ) : stage === 2 ? (
        <>
          <Check x={480} y={620} s={1.15} />
          <Label x={480} y={735} size={43} color={C.teal}>
            خفف المحفزات
          </Label>
        </>
      ) : stage === 3 ? (
        <>
          <Label x={450} y={650} size={48} color={C.purple}>
            مغنيسيوم؟
          </Label>
          <Cross x={680} y={636} />
          <Label x={480} y={750} size={36}>
            لا تستنتج النقص من عرض واحد.
          </Label>
        </>
      ) : (
        <>
          <Label x={480} y={650} size={50} color={C.red}>
            أكثر من أسبوعين
          </Label>
          <Line d="M240 685H720" color={C.red} width={5} />
        </>
      )}
    </Frame>
  );
};
