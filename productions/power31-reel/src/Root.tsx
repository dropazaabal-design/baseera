import { ProductionCompositions } from "./workflow/Compositions";
import { EngineProbe } from "./cinematic/EngineProbe";
import { CinematicDemo } from "./cinematic/CinematicDemo";
import { Composition, Folder } from "remotion";
import { Power31 } from "./Power31";
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
export const RemotionRoot = () => (
  <>
    <ProductionCompositions />
    <Composition
      id="Power31"
      component={Power31}
      width={1080}
      height={1920}
      fps={60}
      durationInFrames={7889}
    />
    <Composition
      id="CinematicDemo"
      component={CinematicDemo}
      width={1080}
      height={1920}
      fps={60}
      durationInFrames={720}
    />
    <Composition
      id="EngineProbe"
      component={EngineProbe}
      width={1080}
      height={1920}
      fps={60}
      durationInFrames={240}
    />
    <Folder name="Power31-Scenes">
      <Composition
        id="Scene-Hook"
        component={Hook}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={589}
      />
      <Composition
        id="Scene-Pressure"
        component={Pressure}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={1003}
      />
      <Composition
        id="Scene-Law"
        component={Law}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={1090}
      />
      <Composition
        id="Scene-Warning"
        component={Warning}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={729}
      />
      <Composition
        id="Scene-Signs"
        component={Signs}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={727}
      />
      <Composition
        id="Scene-Nuance"
        component={Nuance}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={555}
      />
      <Composition
        id="Scene-Response"
        component={Response}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={1047}
      />
      <Composition
        id="Scene-Ethics"
        component={Ethics}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={584}
      />
      <Composition
        id="Scene-Contrast"
        component={Contrast}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={572}
      />
      <Composition
        id="Scene-Reading"
        component={Reading}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={504}
      />
      <Composition
        id="Scene-Ending"
        component={Ending}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={489}
      />
    </Folder>
  </>
);
