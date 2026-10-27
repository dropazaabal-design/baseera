import { CaptionLayer } from "../Captions";
import { C, Door, Frame, Label, Line, World, ease, useS } from "../design";
import { Stickman } from "../Stickman";
export const Ending = () => {
  const t = useS();
  return (
    <Frame
      title={"من قال إن هذه\nكل الأبواب؟"}
      kicker="القانون 31 · لا تسلّم حدود قرارك لغيرك"
      accent={C.green}
    >
      <World>
        <g opacity={1 - 0.7 * ease(t, 2.4, 4.2)}>
          <Door x={250} y={740} w={160} h={310} number="1" color={C.line} />
          <Door x={830} y={740} w={160} h={310} number="2" color={C.line} />
        </g>
        <g opacity={ease(t, 2.4, 4.2)}>
          <Door
            x={540}
            y={690}
            w={260}
            h={465}
            color={C.green}
            open={ease(t, 3.2, 6) * 0.9}
          />
          <Line d="M540 1160V1310" color={C.green} p={ease(t, 4, 5.5)} />
        </g>
        <Stickman
          x={540}
          y={1370 - 45 * ease(t, 4.5, 7)}
          s={0.77}
          pose={t > 3 ? "walk" : "think"}
          color={C.green}
        />
        <Label x={540} y={625} size={46} color={C.green}>
          حق السؤال · حق الرفض
        </Label>
      </World>
      <CaptionLayer
        captions={[
          {
            text: " وتذكّر:",
            startMs: -7,
            endMs: 747,
            timestampMs: 370,
            confidence: null,
          },
          {
            text: " السؤال",
            startMs: 827,
            endMs: 1307,
            timestampMs: 1067,
            confidence: null,
          },
          {
            text: " ليس",
            startMs: 1467,
            endMs: 1627,
            timestampMs: 1547,
            confidence: null,
          },
          {
            text: " فقط...",
            startMs: 1707,
            endMs: 2267,
            timestampMs: 1987,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " أي",
            startMs: 2307,
            endMs: 2507,
            timestampMs: 2407,
            confidence: null,
          },
          {
            text: " باب",
            startMs: 2587,
            endMs: 2827,
            timestampMs: 2707,
            confidence: null,
          },
          {
            text: " أختار؟",
            startMs: 2907,
            endMs: 3467,
            timestampMs: 3187,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " السؤال",
            startMs: 3707,
            endMs: 4187,
            timestampMs: 3947,
            confidence: null,
          },
          {
            text: " الأهم:",
            startMs: 4307,
            endMs: 4987,
            timestampMs: 4647,
            confidence: null,
          },
          {
            text: " من",
            startMs: 5067,
            endMs: 5227,
            timestampMs: 5147,
            confidence: null,
          },
          {
            text: " قال",
            startMs: 5307,
            endMs: 5627,
            timestampMs: 5467,
            confidence: null,
          },
          {
            text: " إن",
            startMs: 5747,
            endMs: 5867,
            timestampMs: 5807,
            confidence: null,
          },
          {
            text: " هذه",
            startMs: 5947,
            endMs: 6507,
            timestampMs: 6227,
            confidence: null,
          },
          {
            text: " كل",
            startMs: 6587,
            endMs: 6827,
            timestampMs: 6707,
            confidence: null,
          },
          {
            text: " الأبواب؟",
            startMs: 6907,
            endMs: 7787,
            timestampMs: 7347,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
