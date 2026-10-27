import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Hook } from "./scenes/Hook";
import { Pressure } from "./scenes/Pressure";
import { Law } from "./scenes/Law";
import { Warning } from "./scenes/Warning";
import { Signs } from "./scenes/Signs";
import { Nuance } from "./scenes/Nuance";
import { Response } from "./scenes/Response";
import { Ethics } from "./scenes/Ethics";
import { Contrast } from "./scenes/Contrast";
import { Reading } from "./scenes/Reading";
import { Ending } from "./scenes/Ending";
export const Power31 = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence
        name="مو كل اختيار يعني حرية"
        from={0}
        durationInFrames={589}
        premountFor={fps}
      >
        <Hook />
      </Sequence>
      <Sequence
        name="الاختيار المفخخ"
        from={589}
        durationInFrames={1003}
        premountFor={fps}
      >
        <Pressure />
      </Sequence>
      <Sequence
        name="القانون 31"
        from={1592}
        durationInFrames={1090}
        premountFor={fps}
      >
        <Law />
      </Sequence>
      <Sequence
        name="التنبيه الأخلاقي"
        from={2682}
        durationInFrames={729}
        premountFor={fps}
      >
        <Warning />
      </Sequence>
      <Sequence
        name="علامات الضغط"
        from={3411}
        durationInFrames={727}
        premountFor={fps}
      >
        <Signs />
      </Sequence>
      <Sequence
        name="القيود الحقيقية"
        from={4138}
        durationInFrames={555}
        premountFor={fps}
      >
        <Nuance />
      </Sequence>
      <Sequence
        name="استعادة مساحة القرار"
        from={4693}
        durationInFrames={1047}
        premountFor={fps}
      >
        <Response />
      </Sequence>
      <Sequence
        name="الوضوح الأخلاقي"
        from={5740}
        durationInFrames={584}
        premountFor={fps}
      >
        <Ethics />
      </Sequence>
      <Sequence
        name="ترتيب أم تلاعب"
        from={6324}
        durationInFrames={572}
        premountFor={fps}
      >
        <Contrast />
      </Sequence>
      <Sequence
        name="قراءة نقدية"
        from={6896}
        durationInFrames={504}
        premountFor={fps}
      >
        <Reading />
      </Sequence>
      <Sequence
        name="من قال إن هذه كل الأبواب"
        from={7400}
        durationInFrames={489}
        premountFor={fps}
      >
        <Ending />
      </Sequence>
      <Audio
        name="الرواية فقط — بدون موسيقى"
        src={staticFile("audio/narration.flac")}
        premountFor={fps}
      />
    </AbsoluteFill>
  );
};
