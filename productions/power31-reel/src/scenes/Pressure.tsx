import { CaptionLayer } from "../Captions";
import { C, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Pressure = () => {
  const t = useS();
  return (
    <Frame
      title={"كيف صار قرارك\nاختبارًا لوفائك؟"}
      kicker="مثال توضيحي · الاختيار المفخخ"
      accent={C.red}
    >
      <World>
        <g opacity={ease(t, 0, 0.5)}>
          <path
            d="M145 640H935V920H750L790 960L675 920H145Z"
            fill={C.panel}
            stroke={C.red}
            strokeWidth="4"
          />
          <Label x={540} y={735} size={65}>
            إما توافق الآن
          </Label>
          <Label x={540} y={835} size={53} color={C.red}>
            أو أنت لا تثق بي
          </Label>
        </g>
        <Stickman x={270} y={1340} s={1.08} pose={t > 9 ? "stop" : "think"} />
        <Stickman
          x={820}
          y={1340}
          s={1.08}
          color={C.muted}
          pose="point"
          facing={-1}
        />
        <g opacity={ease(t, 9.8, 10.4)}>
          <path
            d="M185 1029H395"
            fill="none"
            stroke={C.green}
            strokeWidth="4"
          />
          <Label x={290} y={1005} size={48} color={C.green}>
            أحتاج أفكّر
          </Label>
        </g>
        <Line d="M820 1000L650 1090" color={C.red} p={ease(t, 2.3, 3.5)} />
      </World>
      <CaptionLayer
        captions={[
          {
            text: " تخيّل",
            startMs: 3,
            endMs: 303,
            timestampMs: 153,
            confidence: null,
          },
          {
            text: " شخصًا",
            startMs: 343,
            endMs: 663,
            timestampMs: 503,
            confidence: null,
          },
          {
            text: " يقول",
            startMs: 743,
            endMs: 983,
            timestampMs: 863,
            confidence: null,
          },
          {
            text: " لك:",
            startMs: 1063,
            endMs: 1703,
            timestampMs: 1383,
            confidence: null,
          },
          {
            text: " إما",
            startMs: 1743,
            endMs: 1943,
            timestampMs: 1843,
            confidence: null,
          },
          {
            text: " توافق",
            startMs: 2023,
            endMs: 2423,
            timestampMs: 2223,
            confidence: null,
          },
          {
            text: " الآن،",
            startMs: 2503,
            endMs: 3063,
            timestampMs: 2783,
            confidence: null,
          },
          {
            text: " أو",
            startMs: 3103,
            endMs: 3223,
            timestampMs: 3163,
            confidence: null,
          },
          {
            text: " هذا",
            startMs: 3303,
            endMs: 3543,
            timestampMs: 3423,
            confidence: null,
          },
          {
            text: " دليل",
            startMs: 3623,
            endMs: 3943,
            timestampMs: 3783,
            confidence: null,
          },
          {
            text: " أنك",
            startMs: 4023,
            endMs: 4263,
            timestampMs: 4143,
            confidence: null,
          },
          {
            text: " ما",
            startMs: 4343,
            endMs: 4383,
            timestampMs: 4363,
            confidence: null,
          },
          {
            text: " تثق",
            startMs: 4423,
            endMs: 4743,
            timestampMs: 4583,
            confidence: null,
          },
          {
            text: " فيني.",
            startMs: 4863,
            endMs: 5543,
            timestampMs: 5203,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " تبدأ",
            startMs: 5583,
            endMs: 5863,
            timestampMs: 5723,
            confidence: null,
          },
          {
            text: " تدافع",
            startMs: 5943,
            endMs: 6263,
            timestampMs: 6103,
            confidence: null,
          },
          {
            text: " عن",
            startMs: 6303,
            endMs: 6343,
            timestampMs: 6323,
            confidence: null,
          },
          {
            text: " نفسك.",
            startMs: 6423,
            endMs: 7143,
            timestampMs: 6783,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " تشرح",
            startMs: 7223,
            endMs: 7543,
            timestampMs: 7383,
            confidence: null,
          },
          {
            text: " محبتك.",
            startMs: 7663,
            endMs: 8503,
            timestampMs: 8083,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " تحاول",
            startMs: 8583,
            endMs: 8903,
            timestampMs: 8743,
            confidence: null,
          },
          {
            text: " تثبت",
            startMs: 8983,
            endMs: 9303,
            timestampMs: 9143,
            confidence: null,
          },
          {
            text: " حسن",
            startMs: 9463,
            endMs: 9623,
            timestampMs: 9543,
            confidence: null,
          },
          {
            text: " نيتك.",
            startMs: 9743,
            endMs: 10503,
            timestampMs: 10123,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " ولحظة...",
            startMs: 10583,
            endMs: 11383,
            timestampMs: 10983,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " متى",
            startMs: 11463,
            endMs: 11703,
            timestampMs: 11583,
            confidence: null,
          },
          {
            text: " صار",
            startMs: 11823,
            endMs: 11943,
            timestampMs: 11883,
            confidence: null,
          },
          {
            text: " قرارك",
            startMs: 12023,
            endMs: 12423,
            timestampMs: 12223,
            confidence: null,
          },
          {
            text: " اختبارًا",
            startMs: 12663,
            endMs: 12983,
            timestampMs: 12823,
            confidence: null,
          },
          {
            text: " لوفائك؟",
            startMs: 13063,
            endMs: 14103,
            timestampMs: 13583,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " وأين",
            startMs: 14143,
            endMs: 14423,
            timestampMs: 14283,
            confidence: null,
          },
          {
            text: " خيار:",
            startMs: 14503,
            endMs: 15223,
            timestampMs: 14863,
            confidence: null,
          },
          {
            text: " أحتاج",
            startMs: 15263,
            endMs: 15623,
            timestampMs: 15443,
            confidence: null,
          },
          {
            text: " أفكّر؟",
            startMs: 15703,
            endMs: 16583,
            timestampMs: 16143,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
