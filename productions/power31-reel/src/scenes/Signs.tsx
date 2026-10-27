import { CaptionLayer } from "../Captions";
import { C, Door, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Signs = () => {
  const t = useS();
  return (
    <Frame title={"هل يناقش قرارك…\nأم يهاجمك؟"}>
      <World>
        <Door x={345} y={680} w={170} h={325} number="1" />
        <Door x={735} y={680} w={170} h={325} number="2" />
        <Line
          d="M345 1020Q345 1110 540 1110M735 1020Q735 1110 540 1110"
          color={C.red}
          p={ease(t, 1.5, 3.5)}
        />
        <g opacity={ease(t, 4.8, 5.4)}>
          <Label x={290} y={1205} size={48} color={C.red}>
            أناني؟
          </Label>
          <Label x={790} y={1205} size={48} color={C.red}>
            قليل وفاء؟
          </Label>
        </g>
        <Stickman x={540} y={1350} s={0.8} pose="think" />
        <path
          d="M154 669V1305M926 669V1305"
          stroke={C.red}
          strokeWidth="4"
          opacity={0.15 + 0.1 * Math.sin(t * 1.5)}
        />
      </World>
      <CaptionLayer
        captions={[
          {
            text: " كيف",
            startMs: -4,
            endMs: 30,
            timestampMs: 13,
            confidence: null,
          },
          {
            text: " تلاحظ",
            startMs: 110,
            endMs: 430,
            timestampMs: 270,
            confidence: null,
          },
          {
            text: " الفخ؟",
            startMs: 510,
            endMs: 1230,
            timestampMs: 870,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " حين",
            startMs: 1350,
            endMs: 1470,
            timestampMs: 1410,
            confidence: null,
          },
          {
            text: " يحصر",
            startMs: 1550,
            endMs: 1790,
            timestampMs: 1670,
            confidence: null,
          },
          {
            text: " النقاش",
            startMs: 1870,
            endMs: 2350,
            timestampMs: 2110,
            confidence: null,
          },
          {
            text: " في",
            startMs: 2430,
            endMs: 2510,
            timestampMs: 2470,
            confidence: null,
          },
          {
            text: " خيارين",
            startMs: 2590,
            endMs: 3070,
            timestampMs: 2830,
            confidence: null,
          },
          {
            text: " يخدمانه،",
            startMs: 3150,
            endMs: 3950,
            timestampMs: 3550,
            confidence: null,
          },
          {
            text: " ويعامل",
            startMs: 4030,
            endMs: 4510,
            timestampMs: 4270,
            confidence: null,
          },
          {
            text: " كل",
            startMs: 4670,
            endMs: 4910,
            timestampMs: 4790,
            confidence: null,
          },
          {
            text: " بديل",
            startMs: 4950,
            endMs: 5310,
            timestampMs: 5130,
            confidence: null,
          },
          {
            text: " آخر",
            startMs: 5390,
            endMs: 5790,
            timestampMs: 5590,
            confidence: null,
          },
          {
            text: " كأنه",
            startMs: 5870,
            endMs: 6350,
            timestampMs: 6110,
            confidence: null,
          },
          {
            text: " ممنوع.",
            startMs: 6390,
            endMs: 7070,
            timestampMs: 6730,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " وحين",
            startMs: 7150,
            endMs: 7390,
            timestampMs: 7270,
            confidence: null,
          },
          {
            text: " يربط",
            startMs: 7470,
            endMs: 7790,
            timestampMs: 7630,
            confidence: null,
          },
          {
            text: " رفضك",
            startMs: 7950,
            endMs: 8270,
            timestampMs: 8110,
            confidence: null,
          },
          {
            text: " بتهمة:",
            startMs: 8390,
            endMs: 9070,
            timestampMs: 8730,
            confidence: null,
          },
          {
            text: " أناني،",
            startMs: 9150,
            endMs: 9870,
            timestampMs: 9510,
            confidence: null,
          },
          {
            text: " جبان،",
            startMs: 9950,
            endMs: 10670,
            timestampMs: 10310,
            confidence: null,
          },
          {
            text: " أو",
            startMs: 10697,
            endMs: 10750,
            timestampMs: 10724,
            confidence: null,
          },
          {
            text: " قليل",
            startMs: 10830,
            endMs: 11150,
            timestampMs: 10990,
            confidence: null,
          },
          {
            text: " وفاء.",
            startMs: 11230,
            endMs: 11950,
            timestampMs: 11590,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
