import { CaptionLayer } from "../Captions";
import { C, Door, Frame, Label, Line, World, ease, useS } from "../design";
export const Nuance = () => {
  const t = useS();
  return (
    <Frame
      title={"خياران وحدهما\nلا يثبتان التلاعب"}
      kicker="افحص السبب قبل الحكم"
      accent={C.green}
    >
      <World>
        <Door
          x={310}
          y={730}
          w={170}
          h={330}
          color={C.blue}
          number="1"
          open={0.25}
        />
        <Door
          x={770}
          y={730}
          w={170}
          h={330}
          color={C.blue}
          number="2"
          open={0.25}
        />
        <g opacity={ease(t, 1.7, 2.4)}>
          <Label x={540} y={650} size={50} color={C.green}>
            هل توجد قيود حقيقية؟
          </Label>
          <Line d="M220 1140H860" color={C.green} p={ease(t, 2.2, 3.8)} />
        </g>
        <Label x={540} y={1250} size={50}>
          اسأل… هل يسمح بالنقاش؟
        </Label>
      </World>
      <CaptionLayer
        captions={[
          {
            text: " وجود",
            startMs: -7,
            endMs: 153,
            timestampMs: 73,
            confidence: null,
          },
          {
            text: " خيارين",
            startMs: 233,
            endMs: 793,
            timestampMs: 513,
            confidence: null,
          },
          {
            text: " وحده",
            startMs: 873,
            endMs: 1353,
            timestampMs: 1113,
            confidence: null,
          },
          {
            text: " لا",
            startMs: 1433,
            endMs: 1513,
            timestampMs: 1473,
            confidence: null,
          },
          {
            text: " يعني",
            startMs: 1593,
            endMs: 1833,
            timestampMs: 1713,
            confidence: null,
          },
          {
            text: " تلاعبًا.",
            startMs: 1913,
            endMs: 2793,
            timestampMs: 2353,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " أحيانًا",
            startMs: 2833,
            endMs: 3353,
            timestampMs: 3093,
            confidence: null,
          },
          {
            text: " توجد",
            startMs: 3593,
            endMs: 3913,
            timestampMs: 3753,
            confidence: null,
          },
          {
            text: " قيود",
            startMs: 3993,
            endMs: 4313,
            timestampMs: 4153,
            confidence: null,
          },
          {
            text: " حقيقية.",
            startMs: 4473,
            endMs: 5433,
            timestampMs: 4953,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " اسأل",
            startMs: 5513,
            endMs: 5753,
            timestampMs: 5633,
            confidence: null,
          },
          {
            text: " عن",
            startMs: 5833,
            endMs: 5913,
            timestampMs: 5873,
            confidence: null,
          },
          {
            text: " السبب،",
            startMs: 5993,
            endMs: 6553,
            timestampMs: 6273,
            confidence: null,
          },
          {
            text: " وراقب",
            startMs: 6633,
            endMs: 7193,
            timestampMs: 6913,
            confidence: null,
          },
          {
            text: " إن",
            startMs: 7273,
            endMs: 7353,
            timestampMs: 7313,
            confidence: null,
          },
          {
            text: " كان",
            startMs: 7473,
            endMs: 7593,
            timestampMs: 7533,
            confidence: null,
          },
          {
            text: " يسمح",
            startMs: 7673,
            endMs: 7993,
            timestampMs: 7833,
            confidence: null,
          },
          {
            text: " بالنقاش.",
            startMs: 8073,
            endMs: 9033,
            timestampMs: 8553,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
