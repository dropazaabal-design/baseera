import { AbsoluteFill } from "remotion";
import { SceneDirector } from "./CinematicCameraEngine";
import { camera, layers } from "./demo-config";
import { C } from "../design";
export const CinematicDemo = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <SceneDirector camera={camera} layers={layers} />
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 350,
        background: "linear-gradient(#091525,transparent)",
      }}
    />
    <div
      dir="rtl"
      style={{
        position: "absolute",
        top: 110,
        right: 80,
        left: 80,
        color: "#F8FAFC",
        fontFamily: "Alexandria",
        fontSize: 58,
        lineHeight: 1.5,
      }}
    >
      من يضع الخيارات…
      <br />
      قد يوجّه النتيجة
    </div>
    <div
      dir="rtl"
      style={{
        position: "absolute",
        bottom: 100,
        left: 80,
        right: 80,
        fontFamily: "Cairo",
        fontSize: 36,
        color: "#C3E7ED",
      }}
    >
      القانون 31 · افهم التلاعب لتحمي نفسك
      <br />
      أصول اختبارية محلية · بدون موسيقى
    </div>
  </AbsoluteFill>
);
