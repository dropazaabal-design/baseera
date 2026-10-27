import { CaptionLayer } from "../Captions";
import { C, Frame, Label, Line, Stop, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Warning = () => {
  const t = useS();
  return (
    <Frame
      title={"افهم التلاعب\nحتى تحمي نفسك"}
      kicker="تنبيه أخلاقي"
      accent={C.red}
    >
      <World>
        <Stop x={540} y={765} r={112} />
        <Label x={540} y={1000} size={58} color={C.red}>
          الخداع · الإكراه · الاستغلال
        </Label>
        <Line d="M174 1055H906" color={C.red} p={ease(t, 3, 5)} width={6} />
        <Label x={540} y={1150} size={55}>
          ليست إنجازًا أخلاقيًا
        </Label>
        <Stickman x={540} y={1370} s={0.65} color={C.green} pose="stop" />
      </World>
      <CaptionLayer
        captions={[
          {
            text: " وتنبيه",
            startMs: -3,
            endMs: 500,
            timestampMs: 248,
            confidence: null,
          },
          {
            text: " واضح:",
            startMs: 580,
            endMs: 1380,
            timestampMs: 980,
            confidence: null,
          },
          {
            text: " هذا",
            startMs: 1460,
            endMs: 1620,
            timestampMs: 1540,
            confidence: null,
          },
          {
            text: " الشرح",
            startMs: 1700,
            endMs: 2100,
            timestampMs: 1900,
            confidence: null,
          },
          {
            text: " لتكشف",
            startMs: 2180,
            endMs: 2660,
            timestampMs: 2420,
            confidence: null,
          },
          {
            text: " التلاعب",
            startMs: 2780,
            endMs: 3300,
            timestampMs: 3040,
            confidence: null,
          },
          {
            text: " وتحمي",
            startMs: 3380,
            endMs: 3780,
            timestampMs: 3580,
            confidence: null,
          },
          {
            text: " نفسك.",
            startMs: 3940,
            endMs: 4580,
            timestampMs: 4260,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " لا",
            startMs: 4660,
            endMs: 4740,
            timestampMs: 4700,
            confidence: null,
          },
          {
            text: " لتخدع",
            startMs: 4860,
            endMs: 5220,
            timestampMs: 5040,
            confidence: null,
          },
          {
            text: " الناس،",
            startMs: 5260,
            endMs: 5860,
            timestampMs: 5560,
            confidence: null,
          },
          {
            text: " أو",
            startMs: 5887,
            endMs: 5940,
            timestampMs: 5914,
            confidence: null,
          },
          {
            text: " تحاصرهم،",
            startMs: 6020,
            endMs: 6900,
            timestampMs: 6460,
            confidence: null,
          },
          {
            text: " أو",
            startMs: 6927,
            endMs: 6980,
            timestampMs: 6954,
            confidence: null,
          },
          {
            text: " تستغل",
            startMs: 7060,
            endMs: 7540,
            timestampMs: 7300,
            confidence: null,
          },
          {
            text: " حاجتهم.",
            startMs: 7620,
            endMs: 8500,
            timestampMs: 8060,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " السيطرة",
            startMs: 8580,
            endMs: 9020,
            timestampMs: 8800,
            confidence: null,
          },
          {
            text: " على",
            startMs: 9060,
            endMs: 9220,
            timestampMs: 9140,
            confidence: null,
          },
          {
            text: " إنسان",
            startMs: 9300,
            endMs: 9940,
            timestampMs: 9620,
            confidence: null,
          },
          {
            text: " ليست",
            startMs: 10060,
            endMs: 10420,
            timestampMs: 10240,
            confidence: null,
          },
          {
            text: " إنجازًا",
            startMs: 10500,
            endMs: 10900,
            timestampMs: 10700,
            confidence: null,
          },
          {
            text: " أخلاقيًا.",
            startMs: 10980,
            endMs: 11940,
            timestampMs: 11460,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
