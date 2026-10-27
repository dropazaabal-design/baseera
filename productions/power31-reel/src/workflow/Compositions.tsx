import { Composition, Folder } from "remotion";
import data from "../projects/current.json";
import { Production, ScenePreview } from "./Production";
import { timeline, type Project } from "./config";
const project = data as Project;
export const ProductionCompositions = () => {
  const items = timeline(project);
  const total = items.reduce((n, s) => n + s.durationInFrames, 0);
  return (
    <>
      <Composition
        id="Power31-Cinematic"
        component={Production}
        width={1080}
        height={1920}
        fps={60}
        durationInFrames={total}
        defaultProps={{ project }}
        calculateMetadata={({ props }) => ({
          durationInFrames: timeline(props.project).reduce(
            (n, s) => n + s.durationInFrames,
            0,
          ),
        })}
      />
      <Folder name="Cinematic-Project-Scenes">
        {items.map(({ scene, durationInFrames }, index) => (
          <Composition
            key={scene.id}
            id={`Cinematic-${scene.id}`}
            component={ScenePreview}
            width={1080}
            height={1920}
            fps={60}
            durationInFrames={durationInFrames}
            defaultProps={{ project, index }}
          />
        ))}
      </Folder>
    </>
  );
};
