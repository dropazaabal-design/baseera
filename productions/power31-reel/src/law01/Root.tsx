import {Composition,Folder} from "remotion";
import data from "./project.json";
import {Law01Production,Law01ShotPreview,type LawProject} from "./Production";
const project=data as unknown as LawProject;
export const Law01Root=()=> <>
  <Composition id="Law01-Visual-Review" component={Law01Production}
    width={project.width} height={project.height} fps={project.fps}
    durationInFrames={project.durationInFrames} defaultProps={{project}}
    calculateMetadata={({props})=>({durationInFrames:props.project.durationInFrames})}/>
  {project.publicationReady&&<Composition id="Law01-Cinematic-Final" component={Law01Production}
    width={project.width} height={project.height} fps={project.fps}
    durationInFrames={project.durationInFrames} defaultProps={{project}}
    calculateMetadata={({props})=>({durationInFrames:props.project.durationInFrames})}/>}
  <Folder name="Law01-Shots">
    {project.shots.map((shot,index)=><Composition key={shot.id} id={`Law01-${shot.id}`}
      component={Law01ShotPreview} width={project.width} height={project.height} fps={project.fps}
      durationInFrames={shot.durationInFrames} defaultProps={{project,index}}/>)}
  </Folder>
</>;
