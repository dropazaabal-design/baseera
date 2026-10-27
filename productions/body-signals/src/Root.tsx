import { Composition, Folder } from "remotion";
import { PartOne, PartTwo, PartThree } from "./Parts";
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
export const RemotionRoot = () => (
  <>
    <Composition
      id="BodySignals-Part1"
      component={PartOne}
      durationInFrames={5894}
      fps={60}
      width={1080}
      height={1920}
    />
    <Composition
      id="BodySignals-Part2"
      component={PartTwo}
      durationInFrames={6341}
      fps={60}
      width={1080}
      height={1920}
    />
    <Composition
      id="BodySignals-Part3"
      component={PartThree}
      durationInFrames={6716}
      fps={60}
      width={1080}
      height={1920}
    />
    <Folder name="Scenes">
      <Composition
        id="P1-intro"
        component={Opening}
        durationInFrames={550}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ part: 1 }}
      />
      <Composition
        id="P1-dizzy"
        component={Dizzy}
        durationInFrames={1262}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [5.2, 10.6, 13.88, 16.16] }}
      />
      <Composition
        id="P1-tingles"
        component={Tingles}
        durationInFrames={1346}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [6.44, 10.36, 12.52, 17.56] }}
      />
      <Composition
        id="P1-stretch"
        component={Stretch}
        durationInFrames={1066}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [4.84, 8.48, 10.8, 15.12] }}
      />
      <Composition
        id="P1-sleep"
        component={Sleep}
        durationInFrames={1030}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [5.56, 7.16, 9.0, 13.28] }}
      />
      <Composition
        id="P1-outro"
        component={Ending}
        durationInFrames={640}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ part: 1, teaserAt: 4.88 }}
      />
      <Composition
        id="P2-intro"
        component={Opening}
        durationInFrames={482}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ part: 2 }}
      />
      <Composition
        id="P2-eye"
        component={Eye}
        durationInFrames={1392}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [5.28, 11.08, 13.16, 17.08] }}
      />
      <Composition
        id="P2-freeze"
        component={Freeze}
        durationInFrames={1186}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [5.88, 9.68, 14.52, 17.6] }}
      />
      <Composition
        id="P2-skin"
        component={Skin}
        durationInFrames={1171}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [7.2, 12.32, 14.96, 17.04] }}
      />
      <Composition
        id="P2-tinnitus"
        component={Tinnitus}
        durationInFrames={1399}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [5.32, 8.92, 14.0, 17.4, 19.56] }}
      />
      <Composition
        id="P2-outro"
        component={Ending}
        durationInFrames={711}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ part: 2, teaserAt: 4.56 }}
      />
      <Composition
        id="P3-intro"
        component={Opening}
        durationInFrames={626}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ part: 3 }}
      />
      <Composition
        id="P3-reflux"
        component={Reflux}
        durationInFrames={1258}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [2.48, 6.68, 12.2, 18.12] }}
      />
      <Composition
        id="P3-globus"
        component={Globus}
        durationInFrames={1368}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [6.56, 11.96, 13.64, 16.4] }}
      />
      <Composition
        id="P3-fullness"
        component={Fullness}
        durationInFrames={1462}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [5.72, 9.28, 13.24, 18.64] }}
      />
      <Composition
        id="P3-chest"
        component={Chest}
        durationInFrames={1104}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ beats: [1.88, 4.48, 8.12, 13.52, 15.04] }}
      />
      <Composition
        id="P3-outro"
        component={Ending}
        durationInFrames={898}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{ part: 3, teaserAt: 5.6 }}
      />
    </Folder>
  </>
);
