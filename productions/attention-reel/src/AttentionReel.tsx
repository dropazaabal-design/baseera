import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { BoundaryOverlay } from "./design";
import { Hook } from "./scenes/Hook";
import { Science } from "./scenes/Science";
import { Roadmap } from "./scenes/Roadmap";
import { Triggers } from "./scenes/Triggers";
import { Friction } from "./scenes/Friction";
import { Rest } from "./scenes/Rest";
import { Measure } from "./scenes/Measure";
import { Ending } from "./scenes/Ending";
export const AttentionReel = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio src={staticFile("audio/mix.flac")} premountFor={fps} />
      <Sequence
        name="Hook"
        from={Math.round((0 / 60) * fps)}
        durationInFrames={Math.round((605 / 60) * fps)}
        premountFor={fps}
      >
        <Hook beats={[2.32, 6, 8.8]} />
      </Sequence>
      <Sequence
        name="Science"
        from={Math.round((605 / 60) * fps)}
        durationInFrames={Math.round((557 / 60) * fps)}
        premountFor={fps}
      >
        <Science beats={[3.04, 6.0]} />
      </Sequence>
      <Sequence
        name="Roadmap"
        from={Math.round((1162 / 60) * fps)}
        durationInFrames={Math.round((211 / 60) * fps)}
        premountFor={fps}
      >
        <Roadmap />
      </Sequence>
      <Sequence
        name="Triggers"
        from={Math.round((1373 / 60) * fps)}
        durationInFrames={Math.round((693 / 60) * fps)}
        premountFor={fps}
      >
        <Triggers beats={[2.8, 4.56, 5.72, 7.44, 9.24]} />
      </Sequence>
      <Sequence
        name="Friction"
        from={Math.round((2066 / 60) * fps)}
        durationInFrames={Math.round((893 / 60) * fps)}
        premountFor={fps}
      >
        <Friction beats={[4.48, 6.48, 8.28, 11.2, 12.68]} />
      </Sequence>
      <Sequence
        name="Rest"
        from={Math.round((2959 / 60) * fps)}
        durationInFrames={Math.round((670 / 60) * fps)}
        premountFor={fps}
      >
        <Rest beats={[3.24, 4.68, 6.0, 7.64]} />
      </Sequence>
      <Sequence
        name="Measure"
        from={Math.round((3629 / 60) * fps)}
        durationInFrames={Math.round((698 / 60) * fps)}
        premountFor={fps}
      >
        <Measure beats={[2.36, 5.52, 6.8, 9.08]} />
      </Sequence>
      <Sequence
        name="Ending"
        from={Math.round((4327 / 60) * fps)}
        durationInFrames={Math.round((495 / 60) * fps)}
        premountFor={fps}
      >
        <Ending beats={[2.08, 3.36, 4.96, 6.64]} />
      </Sequence>
      <BoundaryOverlay from={40.92} />
    </>
  );
};
