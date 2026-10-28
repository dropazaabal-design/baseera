import { Composition, Folder } from "remotion";
import data from "../projects/current.json";
import law31Data from "../projects/law31-first-reel.json";
import activeData from "../projects/active-production.json";
import { Production, ScenePreview } from "./Production";
import { timeline, type Project } from "./config";
const project = data as Project;
const ProjectCompositions = ({
  project,
  id,
  folder,
  prefix,
}: {
  project: Project;
  id: string;
  folder: string;
  prefix: string;
}) => {
  const items = timeline(project);
  const total = items.reduce((n, s) => n + s.durationInFrames, 0);
  return (
    <>
      <Composition
        id={id}
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
      <Folder name={folder}>
        {items.map(({ scene, durationInFrames }, index) => (
          <Composition
            key={scene.id}
            id={`${prefix}-${scene.id}`}
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
export const ProductionCompositions = () => (
  <>
    <ProjectCompositions
      project={project}
      id="Power31-Cinematic"
      folder="Cinematic-Project-Scenes"
      prefix="Cinematic"
    />
    <ProjectCompositions
      project={law31Data as Project}
      id="Law31-First-Cinematic-Reel"
      folder="Law31-First-Reel-Scenes"
      prefix="Law31"
    />
    <ProjectCompositions
      project={activeData as Project}
      id="Baseera-Production"
      folder="Active-Production-Scenes"
      prefix="Baseera"
    />
  </>
);
