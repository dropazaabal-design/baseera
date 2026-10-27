import { CaptionLayer } from "../Captions";
import { Book, C, Frame, Label, Line, World, ease, useS } from "../design";
export const Law = () => {
  const t = useS();
  return (
    <Frame
      title={"من يضع الخيارات…\nقد يوجّه النتيجة"}
      kicker="روبرت غرين · القانون 31"
    >
      <World>
        <g
          opacity={1 - ease(t, 7.4, 8.5)}
          transform={`translate(0 ${12 * Math.sin(t * 0.8)})`}
        >
          <Book x={555} y={1000} s={1.18} />
        </g>
        <g opacity={ease(t, 7.6, 8.7)}>
          <path
            d="M126 855H954M126 1170H954"
            stroke={C.line}
            strokeWidth="2"
            strokeDasharray="9 12"
          />
          <g transform={`translate(540 1010) rotate(${-11 + 2 * Math.sin(t)})`}>
            <rect
              x="-186"
              y="-188"
              width="260"
              height="350"
              rx="17"
              fill="#142A46"
              stroke={C.blue}
              strokeWidth="5"
            />
            <Label x={-56} y={0} size={62} color={C.blue}>
              1
            </Label>
          </g>
          <g
            transform={`translate(540 1010) rotate(${12 + 2 * Math.sin(t + 0.4)})`}
          >
            <rect
              x="-55"
              y="-179"
              width="260"
              height="350"
              rx="17"
              fill="#1A3550"
              stroke={C.blue}
              strokeWidth="5"
            />
            <Label x={75} y={7} size={62} color={C.blue}>
              2
            </Label>
          </g>
          <Line d="M180 760H900" color={C.green} p={ease(t, 10, 12)} />
          <Label x={540} y={705} size={48} color={C.green}>
            قائمة وضعها غيرك
          </Label>
          <Label x={540} y={1292} size={45} color={C.muted}>
            قراءة نقدية · وليست قاعدة أخلاقية
          </Label>
        </g>
      </World>
      <CaptionLayer
        captions={[
          {
            text: " في",
            startMs: 0,
            endMs: 27,
            timestampMs: 13,
            confidence: null,
          },
          {
            text: " كتاب",
            startMs: 147,
            endMs: 427,
            timestampMs: 287,
            confidence: null,
          },
          {
            text: " «ثمانية",
            startMs: 587,
            endMs: 1067,
            timestampMs: 827,
            confidence: null,
          },
          {
            text: " وأربعون",
            startMs: 1227,
            endMs: 1707,
            timestampMs: 1467,
            confidence: null,
          },
          {
            text: " قانونًا",
            startMs: 1867,
            endMs: 2267,
            timestampMs: 2067,
            confidence: null,
          },
          {
            text: " للسلطة»",
            startMs: 2347,
            endMs: 2907,
            timestampMs: 2627,
            confidence: null,
          },
          {
            text: " لروبرت",
            startMs: 3067,
            endMs: 3467,
            timestampMs: 3267,
            confidence: null,
          },
          {
            text: " غرين،",
            startMs: 3547,
            endMs: 4267,
            timestampMs: 3907,
            confidence: null,
          },
          {
            text: " القانون",
            startMs: 4387,
            endMs: 4747,
            timestampMs: 4567,
            confidence: null,
          },
          {
            text: " الحادي",
            startMs: 4827,
            endMs: 5227,
            timestampMs: 5027,
            confidence: null,
          },
          {
            text: " والثلاثون",
            startMs: 5307,
            endMs: 5947,
            timestampMs: 5627,
            confidence: null,
          },
          {
            text: " يتناول",
            startMs: 6027,
            endMs: 6587,
            timestampMs: 6307,
            confidence: null,
          },
          {
            text: " التحكم",
            startMs: 6627,
            endMs: 7147,
            timestampMs: 6887,
            confidence: null,
          },
          {
            text: " بالخيارات.",
            startMs: 7227,
            endMs: 8187,
            timestampMs: 7707,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " فكرته",
            startMs: 8347,
            endMs: 8827,
            timestampMs: 8587,
            confidence: null,
          },
          {
            text: " أن",
            startMs: 9067,
            endMs: 9227,
            timestampMs: 9147,
            confidence: null,
          },
          {
            text: " من",
            startMs: 9307,
            endMs: 9387,
            timestampMs: 9347,
            confidence: null,
          },
          {
            text: " يرسم",
            startMs: 9467,
            endMs: 9787,
            timestampMs: 9627,
            confidence: null,
          },
          {
            text: " حدود",
            startMs: 9947,
            endMs: 10107,
            timestampMs: 10027,
            confidence: null,
          },
          {
            text: " الاختيار،",
            startMs: 10147,
            endMs: 10987,
            timestampMs: 10567,
            confidence: null,
          },
          {
            text: " قد",
            startMs: 11067,
            endMs: 11147,
            timestampMs: 11107,
            confidence: null,
          },
          {
            text: " يوجّه",
            startMs: 11187,
            endMs: 11547,
            timestampMs: 11367,
            confidence: null,
          },
          {
            text: " النتيجة",
            startMs: 11627,
            endMs: 12187,
            timestampMs: 11907,
            confidence: null,
          },
          {
            text: " قبل",
            startMs: 12267,
            endMs: 12507,
            timestampMs: 12387,
            confidence: null,
          },
          {
            text: " أن",
            startMs: 12547,
            endMs: 12587,
            timestampMs: 12567,
            confidence: null,
          },
          {
            text: " تقرر.",
            startMs: 12667,
            endMs: 13467,
            timestampMs: 13067,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " كأنك",
            startMs: 13507,
            endMs: 13867,
            timestampMs: 13687,
            confidence: null,
          },
          {
            text: " تمسك",
            startMs: 13947,
            endMs: 14267,
            timestampMs: 14107,
            confidence: null,
          },
          {
            text: " البطاقات...",
            startMs: 14307,
            endMs: 15227,
            timestampMs: 14767,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " لكن",
            startMs: 15347,
            endMs: 15507,
            timestampMs: 15427,
            confidence: null,
          },
          {
            text: " شخصًا",
            startMs: 15547,
            endMs: 15947,
            timestampMs: 15747,
            confidence: null,
          },
          {
            text: " آخر",
            startMs: 16027,
            endMs: 16347,
            timestampMs: 16187,
            confidence: null,
          },
          {
            text: " اختار",
            startMs: 16587,
            endMs: 16907,
            timestampMs: 16747,
            confidence: null,
          },
          {
            text: " لك",
            startMs: 16987,
            endMs: 17147,
            timestampMs: 17067,
            confidence: null,
          },
          {
            text: " الأوراق.",
            startMs: 17227,
            endMs: 18027,
            timestampMs: 17627,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
