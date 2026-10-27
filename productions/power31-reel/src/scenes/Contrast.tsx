import { CaptionLayer } from "../Captions";
import { C, Door, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Contrast = () => {
  const t = useS();
  const bad = ease(t, 4.2, 5.1);
  return (
    <Frame
      title={"تنظيم الخيارات\nأم إخفاء البدائل؟"}
      kicker="الفرق في الوضوح وحرية الاختيار"
      accent={bad > 0.5 ? C.red : C.green}
    >
      <World>
        <g opacity={1 - bad}>
          <Door
            x={300}
            y={760}
            w={170}
            h={320}
            number="1"
            color={C.green}
            open={0.4}
          />
          <Door
            x={780}
            y={760}
            w={170}
            h={320}
            number="2"
            color={C.green}
            open={0.4}
          />
          <Line d="M435 890H645" color={C.green} p={ease(t, 0.7, 1.5)} />
          <Label x={540} y={650} size={52} color={C.green}>
            يمكنك اقتراح موعد آخر
          </Label>
          <Label x={540} y={1240} size={56} color={C.green}>
            ترتيب واضح
          </Label>
        </g>
        <g opacity={bad}>
          <Door x={300} y={760} w={170} h={320} number="1" color={C.red} />
          <Door x={780} y={760} w={170} h={320} number="2" color={C.red} />
          <Line
            d="M300 1100Q300 1180 540 1180M780 1100Q780 1180 540 1180"
            color={C.red}
            p={ease(t, 4.8, 6.8)}
          />
          <Label x={540} y={650} size={49} color={C.red}>
            إخفاء البدائل لخدمة طرف واحد
          </Label>
          <Label x={540} y={1250} size={55} color={C.red}>
            تلاعب
          </Label>
        </g>
        <Stickman
          x={945}
          y={1360}
          s={0.58}
          pose="think"
          color={bad > 0.5 ? C.red : C.green}
        />
      </World>
      <CaptionLayer
        captions={[
          {
            text: " اقتراح",
            startMs: 0,
            endMs: 360,
            timestampMs: 180,
            confidence: null,
          },
          {
            text: " موعدين",
            startMs: 440,
            endMs: 920,
            timestampMs: 680,
            confidence: null,
          },
          {
            text: " مناسبين،",
            startMs: 1160,
            endMs: 1880,
            timestampMs: 1520,
            confidence: null,
          },
          {
            text: " مع",
            startMs: 1960,
            endMs: 2040,
            timestampMs: 2000,
            confidence: null,
          },
          {
            text: " قبول",
            startMs: 2120,
            endMs: 2440,
            timestampMs: 2280,
            confidence: null,
          },
          {
            text: " اقتراح",
            startMs: 2560,
            endMs: 2920,
            timestampMs: 2740,
            confidence: null,
          },
          {
            text: " آخر،",
            startMs: 3080,
            endMs: 3640,
            timestampMs: 3360,
            confidence: null,
          },
          {
            text: " ترتيب.",
            startMs: 3920,
            endMs: 4440,
            timestampMs: 4180,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " أما",
            startMs: 4560,
            endMs: 4680,
            timestampMs: 4620,
            confidence: null,
          },
          {
            text: " إخفاء",
            startMs: 4720,
            endMs: 5080,
            timestampMs: 4900,
            confidence: null,
          },
          {
            text: " البدائل",
            startMs: 5160,
            endMs: 5720,
            timestampMs: 5440,
            confidence: null,
          },
          {
            text: " حتى",
            startMs: 5800,
            endMs: 6040,
            timestampMs: 5920,
            confidence: null,
          },
          {
            text: " ينتصر",
            startMs: 6120,
            endMs: 6520,
            timestampMs: 6320,
            confidence: null,
          },
          {
            text: " طلبك",
            startMs: 6600,
            endMs: 7080,
            timestampMs: 6840,
            confidence: null,
          },
          {
            text: " في",
            startMs: 7160,
            endMs: 7240,
            timestampMs: 7200,
            confidence: null,
          },
          {
            text: " كل",
            startMs: 7360,
            endMs: 7480,
            timestampMs: 7420,
            confidence: null,
          },
          {
            text: " الحالات...",
            startMs: 7520,
            endMs: 8360,
            timestampMs: 7940,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " فتلاعب.",
            startMs: 8480,
            endMs: 9320,
            timestampMs: 8900,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
