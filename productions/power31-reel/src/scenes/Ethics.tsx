import { CaptionLayer } from "../Captions";
import { C, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Ethics = () => {
  const t = useS();
  return (
    <Frame
      title={"إذا عرضت الخيارات…\nاكشف الصورة كاملة"}
      kicker="البديل الأخلاقي"
      accent={C.green}
    >
      <World>
        <path
          d="M190 700H890V1190H190Z"
          fill={C.panel}
          stroke={C.green}
          strokeWidth="4"
        />
        <Label x={540} y={790} size={55}>
          القيود الحقيقية
        </Label>
        <Line d="M275 835H805" color={C.line} width={3} />
        <g opacity={ease(t, 2.5, 3.2)}>
          <Label x={540} y={940} size={55}>
            كلفة كل بديل
          </Label>
          <Line d="M275 985H805" color={C.line} width={3} />
        </g>
        <g opacity={ease(t, 5, 5.7)}>
          <Label x={540} y={1090} size={52} color={C.green}>
            المعلومات المؤثرة
          </Label>
        </g>
        <Stickman x={270} y={1390} s={0.6} pose="point" color={C.green} />
        <Stickman x={810} y={1390} s={0.6} pose="stand" facing={-1} />
      </World>
      <CaptionLayer
        captions={[
          {
            text: " وإذا",
            startMs: 0,
            endMs: 173,
            timestampMs: 87,
            confidence: null,
          },
          {
            text: " كنت",
            startMs: 253,
            endMs: 573,
            timestampMs: 413,
            confidence: null,
          },
          {
            text: " أنت",
            startMs: 613,
            endMs: 893,
            timestampMs: 753,
            confidence: null,
          },
          {
            text: " من",
            startMs: 973,
            endMs: 1053,
            timestampMs: 1013,
            confidence: null,
          },
          {
            text: " يعرض",
            startMs: 1093,
            endMs: 1373,
            timestampMs: 1233,
            confidence: null,
          },
          {
            text: " الخيارات،",
            startMs: 1413,
            endMs: 2253,
            timestampMs: 1833,
            confidence: null,
          },
          {
            text: " فكن",
            startMs: 2333,
            endMs: 2573,
            timestampMs: 2453,
            confidence: null,
          },
          {
            text: " واضحًا.",
            startMs: 2653,
            endMs: 3373,
            timestampMs: 3013,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " اشرح",
            startMs: 3413,
            endMs: 3693,
            timestampMs: 3553,
            confidence: null,
          },
          {
            text: " القيود",
            startMs: 3773,
            endMs: 4173,
            timestampMs: 3973,
            confidence: null,
          },
          {
            text: " الحقيقية،",
            startMs: 4253,
            endMs: 5133,
            timestampMs: 4693,
            confidence: null,
          },
          {
            text: " وأظهر",
            startMs: 5173,
            endMs: 5613,
            timestampMs: 5393,
            confidence: null,
          },
          {
            text: " كلفة",
            startMs: 5693,
            endMs: 6173,
            timestampMs: 5933,
            confidence: null,
          },
          {
            text: " كل",
            startMs: 6293,
            endMs: 6413,
            timestampMs: 6353,
            confidence: null,
          },
          {
            text: " بديل،",
            startMs: 6493,
            endMs: 7053,
            timestampMs: 6773,
            confidence: null,
          },
          {
            text: " ولا",
            startMs: 7173,
            endMs: 7293,
            timestampMs: 7233,
            confidence: null,
          },
          {
            text: " تخفِ",
            startMs: 7373,
            endMs: 7693,
            timestampMs: 7533,
            confidence: null,
          },
          {
            text: " معلومةً",
            startMs: 7773,
            endMs: 8413,
            timestampMs: 8093,
            confidence: null,
          },
          {
            text: " تغيّر",
            startMs: 8573,
            endMs: 8813,
            timestampMs: 8693,
            confidence: null,
          },
          {
            text: " القرار.",
            startMs: 8893,
            endMs: 9613,
            timestampMs: 9253,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
