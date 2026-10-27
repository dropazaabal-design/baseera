import { CaptionLayer } from "../Captions";
import { Book, C, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Reading = () => {
  const t = useS();
  return (
    <Frame
      title={"افهم ألعاب السلطة…\nوحاكمها بأخلاقك"}
      kicker="قراءة نقدية · القانون 31"
      accent={C.green}
    >
      <World>
        <Book x={725} y={955} s={0.93} />
        <Stickman x={300} y={1340} s={1.23} pose="hold" color={C.green} />
        <Line
          d="M130 720H505V1210H130V720"
          color={C.green}
          p={ease(t, 2, 4.5)}
          width={5}
        />
        <g opacity={ease(t, 3, 3.6)}>
          <Label x={540} y={650} size={51} color={C.green}>
            المعرفة مسؤولية
          </Label>
        </g>
      </World>
      <CaptionLayer
        captions={[
          {
            text: " اقرأ",
            startMs: -7,
            endMs: 187,
            timestampMs: 90,
            confidence: null,
          },
          {
            text: " ألعاب",
            startMs: 387,
            endMs: 587,
            timestampMs: 487,
            confidence: null,
          },
          {
            text: " السلطة",
            startMs: 667,
            endMs: 1067,
            timestampMs: 867,
            confidence: null,
          },
          {
            text: " لتفهمها،",
            startMs: 1147,
            endMs: 2107,
            timestampMs: 1627,
            confidence: null,
          },
          {
            text: " ثم",
            startMs: 2227,
            endMs: 2347,
            timestampMs: 2287,
            confidence: null,
          },
          {
            text: " حاكمها",
            startMs: 2427,
            endMs: 2907,
            timestampMs: 2667,
            confidence: null,
          },
          {
            text: " بأخلاقك.",
            startMs: 2987,
            endMs: 3947,
            timestampMs: 3467,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " ولا",
            startMs: 4067,
            endMs: 4187,
            timestampMs: 4127,
            confidence: null,
          },
          {
            text: " تجعل",
            startMs: 4267,
            endMs: 4587,
            timestampMs: 4427,
            confidence: null,
          },
          {
            text: " معرفتك",
            startMs: 4787,
            endMs: 5227,
            timestampMs: 5007,
            confidence: null,
          },
          {
            text: " بنقاط",
            startMs: 5347,
            endMs: 5707,
            timestampMs: 5527,
            confidence: null,
          },
          {
            text: " ضعف",
            startMs: 5787,
            endMs: 5947,
            timestampMs: 5867,
            confidence: null,
          },
          {
            text: " الناس",
            startMs: 6027,
            endMs: 6507,
            timestampMs: 6267,
            confidence: null,
          },
          {
            text: " وسيلةً",
            startMs: 6667,
            endMs: 7227,
            timestampMs: 6947,
            confidence: null,
          },
          {
            text: " لكسرهم.",
            startMs: 7307,
            endMs: 8187,
            timestampMs: 7747,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
