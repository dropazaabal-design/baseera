import { CaptionLayer } from "../Captions";
import {
  C,
  Door,
  Frame,
  GateOverlay,
  Label,
  Line,
  World,
  ease,
  useS,
} from "../design";
import { Stickman } from "../Stickman";
export const Response = () => {
  const t = useS();
  return (
    <Frame
      title={"ثقتي فيك لا تلغي\nحقي في التفكير"}
      kicker="استعد مساحة القرار"
      accent={C.green}
    >
      <World>
        <Door
          x={260}
          y={790}
          w={165}
          h={320}
          color={C.line}
          opacity={1 - 0.6 * ease(t, 5, 7)}
          number="1"
        />
        <Door
          x={820}
          y={790}
          w={165}
          h={320}
          color={C.line}
          opacity={1 - 0.6 * ease(t, 5, 7)}
          number="2"
        />
        <g opacity={ease(t, 5, 6.4)}>
          <Door
            x={540}
            y={835}
            w={280}
            h={410}
            color={C.green}
            open={ease(t, 6.4, 8.7) * 0.9}
          />
          <Label x={540} y={738} size={48} color={C.green}>
            خيار ثالث
          </Label>
        </g>
        <g opacity={ease(t, 8.7, 9.6)}>
          <Label x={244} y={1250} size={46} color={C.green}>
            أطلب مهلة
          </Label>
          <Label x={838} y={1250} size={46} color={C.green}>
            أرفض العرض
          </Label>
        </g>
        <Line d="M540 1305V1170" color={C.green} p={ease(t, 5, 7)} width={7} />
        <Stickman
          x={540}
          y={1370}
          s={0.78}
          pose={t > 5 ? "walk" : "stop"}
          color={C.green}
        />
      </World>
      <GateOverlay at={5} />
      <CaptionLayer
        captions={[
          {
            text: " وفي",
            startMs: -7,
            endMs: 23,
            timestampMs: 8,
            confidence: null,
          },
          {
            text: " مثالنا،",
            startMs: 223,
            endMs: 823,
            timestampMs: 523,
            confidence: null,
          },
          {
            text: " يمكنك",
            startMs: 903,
            endMs: 1303,
            timestampMs: 1103,
            confidence: null,
          },
          {
            text: " أن",
            startMs: 1343,
            endMs: 1383,
            timestampMs: 1363,
            confidence: null,
          },
          {
            text: " تقول:",
            startMs: 1463,
            endMs: 2183,
            timestampMs: 1823,
            confidence: null,
          },
          {
            text: " ثقتي",
            startMs: 2303,
            endMs: 2583,
            timestampMs: 2443,
            confidence: null,
          },
          {
            text: " فيك",
            startMs: 2663,
            endMs: 3063,
            timestampMs: 2863,
            confidence: null,
          },
          {
            text: " لا",
            startMs: 3143,
            endMs: 3223,
            timestampMs: 3183,
            confidence: null,
          },
          {
            text: " تلغي",
            startMs: 3303,
            endMs: 3623,
            timestampMs: 3463,
            confidence: null,
          },
          {
            text: " حقي",
            startMs: 3703,
            endMs: 3943,
            timestampMs: 3823,
            confidence: null,
          },
          {
            text: " في",
            startMs: 4023,
            endMs: 4076,
            timestampMs: 4050,
            confidence: null,
          },
          {
            text: " التفكير.",
            startMs: 4130,
            endMs: 4903,
            timestampMs: 4517,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " لن",
            startMs: 5023,
            endMs: 5143,
            timestampMs: 5083,
            confidence: null,
          },
          {
            text: " أقرر",
            startMs: 5183,
            endMs: 5543,
            timestampMs: 5363,
            confidence: null,
          },
          {
            text: " تحت",
            startMs: 5623,
            endMs: 5943,
            timestampMs: 5783,
            confidence: null,
          },
          {
            text: " هذا",
            startMs: 5983,
            endMs: 6103,
            timestampMs: 6043,
            confidence: null,
          },
          {
            text: " الضغط.",
            startMs: 6143,
            endMs: 6823,
            timestampMs: 6483,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " ثم",
            startMs: 6943,
            endMs: 7063,
            timestampMs: 7003,
            confidence: null,
          },
          {
            text: " اسأل",
            startMs: 7103,
            endMs: 7303,
            timestampMs: 7203,
            confidence: null,
          },
          {
            text: " نفسك:",
            startMs: 7463,
            endMs: 8023,
            timestampMs: 7743,
            confidence: null,
          },
          {
            text: " هل",
            startMs: 8103,
            endMs: 8183,
            timestampMs: 8143,
            confidence: null,
          },
          {
            text: " يوجد",
            startMs: 8223,
            endMs: 8503,
            timestampMs: 8363,
            confidence: null,
          },
          {
            text: " خيار",
            startMs: 8583,
            endMs: 8823,
            timestampMs: 8703,
            confidence: null,
          },
          {
            text: " ثالث؟",
            startMs: 8983,
            endMs: 9623,
            timestampMs: 9303,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " هل",
            startMs: 9703,
            endMs: 9783,
            timestampMs: 9743,
            confidence: null,
          },
          {
            text: " أحتاج",
            startMs: 9823,
            endMs: 10183,
            timestampMs: 10003,
            confidence: null,
          },
          {
            text: " مهلة؟",
            startMs: 10263,
            endMs: 10823,
            timestampMs: 10543,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " وهل",
            startMs: 10863,
            endMs: 11063,
            timestampMs: 10963,
            confidence: null,
          },
          {
            text: " أستطيع",
            startMs: 11103,
            endMs: 11623,
            timestampMs: 11363,
            confidence: null,
          },
          {
            text: " رفض",
            startMs: 11743,
            endMs: 11863,
            timestampMs: 11803,
            confidence: null,
          },
          {
            text: " العرض",
            startMs: 11943,
            endMs: 12263,
            timestampMs: 12103,
            confidence: null,
          },
          {
            text: " كله؟",
            startMs: 12423,
            endMs: 12983,
            timestampMs: 12703,
            confidence: null,
            pageBreakAfter: true,
          },
          {
            text: " لا",
            startMs: 13063,
            endMs: 13143,
            timestampMs: 13103,
            confidence: null,
          },
          {
            text: " يلزمك",
            startMs: 13223,
            endMs: 13623,
            timestampMs: 13423,
            confidence: null,
          },
          {
            text: " أن",
            startMs: 13703,
            endMs: 13783,
            timestampMs: 13743,
            confidence: null,
          },
          {
            text: " تختار",
            startMs: 13863,
            endMs: 14263,
            timestampMs: 14063,
            confidence: null,
          },
          {
            text: " من",
            startMs: 14383,
            endMs: 14503,
            timestampMs: 14443,
            confidence: null,
          },
          {
            text: " قائمة",
            startMs: 14543,
            endMs: 15063,
            timestampMs: 14803,
            confidence: null,
          },
          {
            text: " لم",
            startMs: 15143,
            endMs: 15303,
            timestampMs: 15223,
            confidence: null,
          },
          {
            text: " توافق",
            startMs: 15383,
            endMs: 15863,
            timestampMs: 15623,
            confidence: null,
          },
          {
            text: " أصلًا",
            startMs: 15943,
            endMs: 16263,
            timestampMs: 16103,
            confidence: null,
          },
          {
            text: " على",
            startMs: 16343,
            endMs: 16503,
            timestampMs: 16423,
            confidence: null,
          },
          {
            text: " حدودها.",
            startMs: 16703,
            endMs: 17383,
            timestampMs: 17043,
            confidence: null,
            pageBreakAfter: true,
          },
        ]}
      />
    </Frame>
  );
};
