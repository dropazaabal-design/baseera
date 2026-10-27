import { Sequence, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";
import { PulseOverlay } from "./design";
import { Opening } from "./scenes/Opening";
import { Ending } from "./scenes/Ending";
import { Dizzy } from "./scenes/Dizzy";
import { Tingles } from "./scenes/Tingles";
import { Stretch } from "./scenes/Stretch";
import { Sleep } from "./scenes/Sleep";
import { Eye } from "./scenes/Eye";
import { Freeze } from "./scenes/Freeze";
import { Skin } from "./scenes/Skin";
import { Tinnitus } from "./scenes/Tinnitus";
import { Reflux } from "./scenes/Reflux";
import { Globus } from "./scenes/Globus";
import { Fullness } from "./scenes/Fullness";
import { Chest } from "./scenes/Chest";

export const PartOne = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio
        src={staticFile("audio/part-1.flac")}
        volume={0.7079457844}
        premountFor={fps}
      />
      <Sequence
        name="الافتتاح"
        from={Math.round((0 / 60) * fps)}
        durationInFrames={Math.round((550 / 60) * fps)}
        premountFor={fps}
      >
        <Opening part={1} />
      </Sequence>
      <Sequence
        name="الدوخة عند الوقوف"
        from={Math.round((550 / 60) * fps)}
        durationInFrames={Math.round((1262 / 60) * fps)}
        premountFor={fps}
      >
        <Dizzy beats={[5.2, 10.6, 13.88, 16.16]} />
      </Sequence>
      <Sequence
        name="التنميل"
        from={Math.round((1812 / 60) * fps)}
        durationInFrames={Math.round((1346 / 60) * fps)}
        premountFor={fps}
      >
        <Tingles beats={[6.44, 10.36, 12.52, 17.56]} />
      </Sequence>
      <Sequence
        name="التمغط"
        from={Math.round((3158 / 60) * fps)}
        durationInFrames={Math.round((1066 / 60) * fps)}
        premountFor={fps}
      >
        <Stretch beats={[4.84, 8.48, 10.8, 15.12]} />
      </Sequence>
      <Sequence
        name="النفضة النومية"
        from={Math.round((4224 / 60) * fps)}
        durationInFrames={Math.round((1030 / 60) * fps)}
        premountFor={fps}
      >
        <Sleep beats={[5.56, 7.16, 9.0, 13.28]} />
      </Sequence>
      <Sequence
        name="الخاتمة والجزء التالي"
        from={Math.round((5254 / 60) * fps)}
        durationInFrames={Math.round((640 / 60) * fps)}
        premountFor={fps}
      >
        <Ending part={1} teaserAt={4.88} />
      </Sequence>
      <PulseOverlay from={1.2} />
    </>
  );
};

export const PartTwo = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio
        src={staticFile("audio/part-2.flac")}
        volume={0.7079457844}
        premountFor={fps}
      />
      <Sequence
        name="الافتتاح"
        from={Math.round((0 / 60) * fps)}
        durationInFrames={Math.round((482 / 60) * fps)}
        premountFor={fps}
      >
        <Opening part={2} />
      </Sequence>
      <Sequence
        name="رفة الجفن"
        from={Math.round((482 / 60) * fps)}
        durationInFrames={Math.round((1392 / 60) * fps)}
        premountFor={fps}
      >
        <Eye beats={[5.28, 11.08, 13.16, 17.08]} />
      </Sequence>
      <Sequence
        name="صداع المثلجات"
        from={Math.round((1874 / 60) * fps)}
        durationInFrames={Math.round((1186 / 60) * fps)}
        premountFor={fps}
      >
        <Freeze beats={[5.88, 9.68, 14.52, 17.6]} />
      </Sequence>
      <Sequence
        name="القشعريرة"
        from={Math.round((3060 / 60) * fps)}
        durationInFrames={Math.round((1171 / 60) * fps)}
        premountFor={fps}
      >
        <Skin beats={[7.2, 12.32, 14.96, 17.04]} />
      </Sequence>
      <Sequence
        name="طنين الأذن"
        from={Math.round((4231 / 60) * fps)}
        durationInFrames={Math.round((1399 / 60) * fps)}
        premountFor={fps}
      >
        <Tinnitus beats={[5.32, 8.92, 14.0, 17.4, 19.56]} />
      </Sequence>
      <Sequence
        name="الخاتمة والجزء التالي"
        from={Math.round((5630 / 60) * fps)}
        durationInFrames={Math.round((711 / 60) * fps)}
        premountFor={fps}
      >
        <Ending part={2} teaserAt={4.56} />
      </Sequence>
      <PulseOverlay from={1.2} />
    </>
  );
};

export const PartThree = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio
        src={staticFile("audio/part-3.flac")}
        volume={0.7079457844}
        premountFor={fps}
      />
      <Sequence
        name="الافتتاح"
        from={Math.round((0 / 60) * fps)}
        durationInFrames={Math.round((626 / 60) * fps)}
        premountFor={fps}
      >
        <Opening part={3} />
      </Sequence>
      <Sequence
        name="الحرقان"
        from={Math.round((626 / 60) * fps)}
        durationInFrames={Math.round((1258 / 60) * fps)}
        premountFor={fps}
      >
        <Reflux beats={[2.48, 6.68, 12.2, 18.12]} />
      </Sequence>
      <Sequence
        name="إحساس الكتلة"
        from={Math.round((1884 / 60) * fps)}
        durationInFrames={Math.round((1368 / 60) * fps)}
        premountFor={fps}
      >
        <Globus beats={[6.56, 11.96, 13.64, 16.4]} />
      </Sequence>
      <Sequence
        name="الثقل"
        from={Math.round((3252 / 60) * fps)}
        durationInFrames={Math.round((1462 / 60) * fps)}
        premountFor={fps}
      >
        <Fullness beats={[5.72, 9.28, 13.24, 18.64]} />
      </Sequence>
      <Sequence
        name="نغزة الصدر"
        from={Math.round((4714 / 60) * fps)}
        durationInFrames={Math.round((1104 / 60) * fps)}
        premountFor={fps}
      >
        <Chest beats={[1.88, 4.48, 8.12, 13.52, 15.04]} />
      </Sequence>
      <Sequence
        name="الخاتمة والجزء التالي"
        from={Math.round((5818 / 60) * fps)}
        durationInFrames={Math.round((898 / 60) * fps)}
        premountFor={fps}
      >
        <Ending part={3} teaserAt={5.6} />
      </Sequence>
      <PulseOverlay from={1.2} />
    </>
  );
};
