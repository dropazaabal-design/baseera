import { CaptionLayer } from "../Captions";
import { C, Door, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Hook = () => {
  const t = useS();
  return (
    <Frame title={"مو كل اختيار\nيعني حرية"}>
      <World>
        <g opacity={ease(t, 0.5, 1.5)}>
          <Door x={300} y={635} number="1" open={0.15 + 0.1 * Math.sin(t)} />
          <Door
            x={780}
            y={635}
            number="2"
            open={0.15 + 0.1 * Math.sin(t + 0.4)}
          />
        </g>
        <Line
          d="M300 1030Q300 1095 540 1095M780 1030Q780 1095 540 1095"
          color={C.blue}
          p={ease(t, 2.9, 5.4)}
          width={8}
        />
        <g opacity={ease(t, 4.8, 6.4)}>
          <circle
            cx="540"
            cy="1095"
            r="31"
            fill={C.panel}
            stroke={C.red}
            strokeWidth="6"
          />
          <Line
            d="M525 1080L555 1110M555 1080L525 1110"
            color={C.red}
            width={5}
          />
          <Label x={540} y={1055} size={48} color={C.red}>
            نفس النتيجة
          </Label>
        </g>
        <Stickman x={540} y={1350} s={0.74} pose="think" />
      </World>
      <CaptionLayer
        captions={[
          {
            text: " مو",
            startMs: 160,
            endMs: 320,
            timestampMs: 240,
            confidence: null,
          },
          {
            text: " كل",
            startMs: 440,
            endMs: 560,
            timestampMs: 500,
            confidence: null,
          },
          {
            text: " من",
            startMs: 640,
            endMs: 720,
            timestampMs: 680,
            confidence: null,
          },
          {
            text: " قال",
            startMs: 800,
            endMs: 960,
            timestampMs: 880,
            confidence: null,
          },
          {
            text: " لك:",
            startMs: 1095,
            endMs: 1480,
            timestampMs: 1300,
            confidence: null,
          },
          {
            text: " اختر...",
            startMs: 1680,
            endMs: 2440,
            timestampMs: 2060,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " أعطاك",
            startMs: 2640,
            endMs: 3040,
            timestampMs: 2840,
            confidence: null,
          },
          {
            text: " حرية.",
            startMs: 3120,
            endMs: 3960,
            timestampMs: 3540,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " أحيانًا",
            startMs: 4320,
            endMs: 4800,
            timestampMs: 4560,
            confidence: null,
          },
          {
            text: " يفتح",
            startMs: 4880,
            endMs: 5120,
            timestampMs: 5000,
            confidence: null,
          },
          {
            text: " لك",
            startMs: 5240,
            endMs: 5360,
            timestampMs: 5300,
            confidence: null,
          },
          {
            text: " بابين...",
            startMs: 5480,
            endMs: 6320,
            timestampMs: 5900,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " وكل",
            startMs: 6440,
            endMs: 6800,
            timestampMs: 6620,
            confidence: null,
          },
          {
            text: " باب",
            startMs: 6880,
            endMs: 7200,
            timestampMs: 7040,
            confidence: null,
          },
          {
            text: " يرجّعك",
            startMs: 7600,
            endMs: 8160,
            timestampMs: 7880,
            confidence: null,
          },
          {
            text: " لنفس",
            startMs: 8240,
            endMs: 8560,
            timestampMs: 8400,
            confidence: null,
          },
          {
            text: " المكان.",
            startMs: 8640,
            endMs: 9680,
            timestampMs: 9160,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
