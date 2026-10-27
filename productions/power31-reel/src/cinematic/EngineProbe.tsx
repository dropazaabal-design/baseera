import { AbsoluteFill, Img, staticFile } from "remotion";
import {
  CharacterAnimator,
  DoorReveal,
  LightTransition,
  SceneTransition,
} from "./CinematicCameraEngine";
export const EngineProbe = () => (
  <AbsoluteFill style={{ background: "#173D50" }}>
    <SceneTransition start={0} duration={30}>
      <CharacterAnimator enter={0} exit={240}>
        <DoorReveal start={30} duration={120}>
          <Img
            src={staticFile("cinematic/doors.svg")}
            style={{ height: 1500, width: 1080, objectFit: "contain" }}
          />
        </DoorReveal>
      </CharacterAnimator>
    </SceneTransition>
    <LightTransition start={90} duration={60} />
  </AbsoluteFill>
);
