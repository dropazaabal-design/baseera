import { Composition, Folder } from "remotion";
import { AttentionReel } from "./AttentionReel";
import { Hook } from "./scenes/Hook";
import { Science } from "./scenes/Science";
import { Roadmap } from "./scenes/Roadmap";
import { Triggers } from "./scenes/Triggers";
import { Friction } from "./scenes/Friction";
import { Rest } from "./scenes/Rest";
import { Measure } from "./scenes/Measure";
import { Ending } from "./scenes/Ending";
export const RemotionRoot = () => (
  <>
    <Composition
      id="AttentionReel"
      component={AttentionReel}
      durationInFrames={4822}
      fps={60}
      width={1080}
      height={1920}
    />
    <Folder name="Scenes">
      <Composition
        id="Hook"
        component={Hook}
        durationInFrames={605}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [2.32, 6, 8.8] }}
      />
      <Composition
        id="Science"
        component={Science}
        durationInFrames={557}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [3.04, 6.0] }}
      />
      <Composition
        id="Roadmap"
        component={Roadmap}
        durationInFrames={211}
        fps={60}
        width={1080}
        height={1920}
      />
      <Composition
        id="Triggers"
        component={Triggers}
        durationInFrames={693}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [2.8, 4.56, 5.72, 7.44, 9.24] }}
      />
      <Composition
        id="Friction"
        component={Friction}
        durationInFrames={893}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [4.48, 6.48, 8.28, 11.2, 12.68] }}
      />
      <Composition
        id="Rest"
        component={Rest}
        durationInFrames={670}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [3.24, 4.68, 6.0, 7.64] }}
      />
      <Composition
        id="Measure"
        component={Measure}
        durationInFrames={698}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [2.36, 5.52, 6.8, 9.08] }}
      />
      <Composition
        id="Ending"
        component={Ending}
        durationInFrames={495}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [2.08, 3.36, 4.96, 6.64] }}
      />
    </Folder>
  </>
);
