import type {Caption} from "@remotion/captions";
import {
  AbsoluteFill, CanvasImage, Freeze, Sequence, staticFile,
  useCurrentFrame, useVideoConfig, delayRender, continueRender, cancelRender,
} from "remotion";
import {Audio} from "@remotion/media";
import {loadFont} from "@remotion/fonts";
import {useEffect,useMemo,useState} from "react";
import {
  CameraKeyframes, CinematicCamera, ParallaxLayer,
  type CameraConfig,type LayerConfig,
} from "../cinematic/CinematicCameraEngine";
import {presetCamera,validateProject,type SceneConfig} from "../workflow/config";

loadFont({family:"CairoLaw01",url:staticFile("law01/fonts/Cairo.ttf"),weight:"600"});
type MotionKey={frame:number;x:number;y:number;rotation:number};
type Plane=LayerConfig & {
  role:string; motionGroup?:string;
  motion?:{group:string;pivot:[number,number];keys:MotionKey[]};
  eyeAnimation?:{gazePixels:number;blinkAt:number;blinkFrames:number};
};
export type Shot=Omit<SceneConfig,"transition"|"layers"> & {
  layers:Plane[];durationInFrames:number;startFrame:number;endFrame:number;
  lastVisibleFrame:number;segment:number;imagePath:string;captionAnchor:"top"|"bottom";
  transition:{type:string;frames:number};attentionLight?:string|null;
  narrationStart:number;narrationEnd:number;visualAction:string;characterMovement:string;
};
export type LawProject={
  name:string;compositionId:string;fps:number;width:number;height:number;
  durationInFrames:number;audio:string|null;srt:string|null;captions:string|null;
  publicationReady:boolean;reviewLabel:string;shots:Shot[];
  approval:{images:string;narration:boolean;captionAlignment:boolean};
  captionSettings:{fontSize:number;maxLines:number;bottom:number;top:number;left:number;right:number};
  brand:{text:string;fontSize:number;bottom:number};
};
export function baseShot(s:Shot):SceneConfig {
  return {...s,transition:{type:"cut",duration:0}};
}
export function validateLawProject(p:LawProject) {
  if(p.fps!==60 || p.width!==1080 || p.height!==1920) throw Error("Expected portrait 1080x1920 at 60fps");
  validateProject({name:p.name,scenes:p.shots.map(baseShot)});
  let next=0;const ids=new Set<string>();
  for(const s of p.shots){
    if(ids.has(s.id))throw Error("Duplicate shot");
    ids.add(s.id);
    if(s.startFrame!==next||s.endFrame!==s.startFrame+s.durationInFrames||s.lastVisibleFrame!==s.endFrame-1)throw Error("Timeline gap/overlap");
    if(!Number.isInteger(s.durationInFrames)||s.durationInFrames<2)throw Error("Invalid shot duration");
    if(s.transition.frames<0||s.transition.frames>s.durationInFrames/2)throw Error("Transition exceeds shot");
    for(const l of s.layers){
      if(l.motion)for(let i=0;i<l.motion.keys.length;i++){
        const k=l.motion.keys[i];
        if(![k.frame,k.x,k.y,k.rotation].every(Number.isFinite)||k.frame<0||k.frame>=s.durationInFrames||(i>0&&k.frame<=l.motion.keys[i-1].frame))throw Error("Invalid character keys");
      }
    }
    next=s.endFrame;
  }
  if(next!==p.durationInFrames)throw Error("Final frame mismatch");
  if(p.publicationReady&&(!p.audio||!p.approval.narration||!p.approval.captionAlignment))throw Error("Publication requires approved actual narration and alignment");
  return p;
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
const SOURCE_SCALE=2200/1664;
const SOURCE_LEFT=(1600-936*SOURCE_SCALE)/2;

const AnimatedPlane=({camera,layer,duration}:{camera:CameraConfig;layer:Plane;duration:number})=>{
  const f=useCurrentFrame();
  const m=layer.motion?CameraKeyframes(f,layer.motion.keys.map(k=>({...k,zoom:1}))):{x:0,y:0,rotation:0};
  const pivot=layer.motion?.pivot??[468,832];
  const eye=layer.eyeAnimation;
  const gaze=eye?Math.sin(Math.PI*smooth(f/Math.max(1,duration-1)))*eye.gazePixels:0;
  // Opacity blink preserves the exact drawn eye geometry; no face scaling/warping.
  const blink=eye&&Math.abs(f-eye.blinkAt)<=eye.blinkFrames/2
    ?1-.92*Math.cos((f-eye.blinkAt)/eye.blinkFrames*Math.PI):1;
  return <ParallaxLayer camera={camera} layer={{...layer,src:undefined}}>
    <div data-motion-group={layer.motion?.group??"static"}
      style={{width:1600,height:2200,position:"absolute",inset:0,
        transformOrigin:`${SOURCE_LEFT+pivot[0]*SOURCE_SCALE}px ${pivot[1]*SOURCE_SCALE}px`,
        translate:`${m.x*SOURCE_SCALE}px ${m.y*SOURCE_SCALE}px`,
        rotate:`${m.rotation}deg`}}>
      <CanvasImage src={staticFile(layer.src!)} premountFor={60}
        style={{width:"100%",height:"100%",objectFit:"contain",
          translate:`${gaze*SOURCE_SCALE}px 0px`,opacity:clamp(blink)}}/>
    </div>
  </ParallaxLayer>;
};

export const ShotIllustration=({shot}:{shot:Shot})=>{
  const f=useCurrentFrame();
  const camera=presetCamera(baseShot(shot));
  const progress=smooth(f/Math.max(1,shot.durationInFrames-1));
  return <AbsoluteFill style={{background:"#091525",overflow:"hidden"}}>
    <CinematicCamera config={camera}>
      {[...shot.layers].sort((a,b)=>a.depth-b.depth).map(layer=>
        <AnimatedPlane key={layer.id} camera={camera} layer={layer} duration={shot.durationInFrames}/>)}
    </CinematicCamera>
    {shot.attentionLight==="authority-reveal"&&<AbsoluteFill style={{pointerEvents:"none",
      background:"linear-gradient(150deg,rgba(4,10,19,.04),rgba(2,5,10,.4))",
      opacity:1-smooth(f/Math.min(90,shot.durationInFrames-1))}}/>}
    {shot.attentionLight==="shared-team"&&<AbsoluteFill style={{pointerEvents:"none",
      background:"radial-gradient(ellipse at 34% 42%,transparent 22%,rgba(4,10,19,.45) 75%)",
      opacity:(1-progress)*.65}}/>}
    {shot.attentionLight==="lantern-ground"&&<AbsoluteFill style={{pointerEvents:"none",
      background:`radial-gradient(ellipse 15% 8% at ${48+progress*3}% ${76-progress*2}%,rgba(242,243,238,.09),transparent 100%)`,
      opacity:.75+Math.sin(f*.045)*.06}}/>}
  </AbsoluteFill>;
};
const TransitionedShot=({shot,previous}:{shot:Shot;previous?:Shot})=>{
  const f=useCurrentFrame();const n=shot.transition.frames;const type=shot.transition.type;
  if(!previous||!n||f>=n)return <ShotIllustration shot={shot}/>;
  const t=smooth(f/n);let opacity=1;let clipPath:string|undefined;
  if(type==="calm-dissolve"||type==="dawn-lift")opacity=t;
  else if(type==="shadow-reveal")clipPath=`inset(0 0 ${(1-t)*100}% 0)`;
  else if(type==="evidence-wipe")clipPath=`inset(0 ${(1-t)*100}% 0 0)`;
  else if(type==="shared-reveal")clipPath=`inset(0 ${(1-t)*64}% 0 0)`;
  return <>
    <Freeze frame={previous.durationInFrames-1}><ShotIllustration shot={previous}/></Freeze>
    <AbsoluteFill style={{opacity,clipPath}}><ShotIllustration shot={shot}/></AbsoluteFill>
  </>;
};
type ReviewCue=Caption & {shotId:string;timingBasis:string};
const useCues=(path:string|null)=>{
  const handle=useMemo(()=>delayRender("Law01 caption JSON"),[path]);
  const [cues,setCues]=useState<ReviewCue[]>([]);
  useEffect(()=>{
    let active=true;
    if(!path){continueRender(handle);return;}
    fetch(staticFile(path)).then(r=>{if(!r.ok)throw Error("Caption JSON missing");return r.json();})
      .then((data:ReviewCue[])=>{if(active){setCues(data);continueRender(handle);}})
      .catch(cancelRender);
    return ()=>{active=false;continueRender(handle);};
  },[path,handle]);
  return cues;
};
const Captions=({project,cues}:{project:LawProject;cues:ReviewCue[]})=>{
  const f=useCurrentFrame();const {fps}=useVideoConfig();
  const ms=f/fps*1000;const c=cues.find(x=>ms>=x.startMs&&ms<x.endMs);
  if(!c)return null;
  const shot=project.shots.find(s=>s.id===c.shotId);
  const top=shot?.captionAnchor==="top";
  return <div dir="rtl" data-law01-caption style={{
    position:"absolute",left:project.captionSettings.left,right:project.captionSettings.right,
    ...(top?{top:project.captionSettings.top}:{bottom:project.captionSettings.bottom}),
    display:"flex",justifyContent:"center",pointerEvents:"none"}}>
    <div style={{fontFamily:"CairoLaw01",fontWeight:600,fontSize:project.captionSettings.fontSize,
      lineHeight:1.35,color:"#f5f4ed",background:"rgba(5,11,20,.82)",padding:"12px 24px",
      borderRadius:10,textAlign:"center",whiteSpace:"pre-line",unicodeBidi:"plaintext",
      maxWidth:"100%",boxSizing:"border-box",boxShadow:"0 3px 18px rgba(0,0,0,.16)"}}>
      {c.text}
    </div>
  </div>;
};
export const Law01Production=({project}:{project:LawProject})=>{
  validateLawProject(project);
  const {fps}=useVideoConfig();const cues=useCues(project.captions);
  return <AbsoluteFill style={{background:"#091525",overflow:"hidden"}}>
    {project.shots.map((s,i)=><Sequence key={s.id} name={s.id} from={s.startFrame}
      durationInFrames={s.durationInFrames} premountFor={fps}>
      <TransitionedShot shot={s} previous={project.shots[i-1]}/>
    </Sequence>)}
    {project.audio&&<Audio src={staticFile(project.audio)} premountFor={fps}/>}
    <Captions project={project} cues={cues}/>
    {!project.publicationReady&&<div dir="rtl" style={{position:"absolute",top:38,left:180,right:180,
      textAlign:"center",fontFamily:"CairoLaw01",fontSize:24,lineHeight:1.5,color:"#d0dde5",
      background:"rgba(6,13,23,.72)",borderRadius:8,padding:"6px 12px"}}>
      {project.reviewLabel}
    </div>}
    <div dir="ltr" style={{position:"absolute",bottom:project.brand.bottom,left:0,right:0,
      fontFamily:"CairoLaw01",fontSize:project.brand.fontSize,textAlign:"center",
      color:"#d2e0e7",textShadow:"0 2px 7px #02050a",unicodeBidi:"isolate"}}>
      {project.brand.text}
    </div>
  </AbsoluteFill>;
};
export const Law01ShotPreview=({project,index}:{project:LawProject;index:number})=>{
  const s=project.shots[index];if(!s)throw Error("Shot index out of range");
  return <Sequence from={-s.startFrame} durationInFrames={project.durationInFrames}>
    <Law01Production project={project}/>
  </Sequence>;
};

