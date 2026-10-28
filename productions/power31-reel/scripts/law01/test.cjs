const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),Module=require("node:module");
const ts=require("typescript");
for(const ext of [".ts",".tsx"])Module._extensions[ext]=(m,file)=>{
  const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText;
  m._compile(code,file);
};
const nativeRequire=Module.prototype.require;
Module.prototype.require=function(id){
 if(id==="@remotion/fonts")return {loadFont:()=>{}};
 // Pure validation/math harness only; actual ESM media is tested by real Remotion renders.
 if(id==="@remotion/media")return {Audio:()=>null};
 return nativeRequire.call(this,id);
};
const {validateLawProject,baseShot}=require(path.resolve("src/law01/Production.tsx"));
const {presetCamera,parseSrt}=require(path.resolve("src/workflow/config.ts"));
const {layerTransform,CameraKeyframes}=require(path.resolve("src/cinematic/CinematicCameraEngine.tsx"));
const P="projects/law01-cinematic",p=JSON.parse(fs.readFileSync("src/law01/project.json","utf8"));
validateLawProject(p);
const results={timeline:{shots:p.shots.length,frames:p.durationInFrames,seconds:p.durationInFrames/60,exactBoundaries:true,finalFrame:p.durationInFrames-1},invalidInput:{},camera:{},captions:{},publication:{}};
for(const [label,mutate] of [
 ["gap",q=>q.shots[1].startFrame++],["duplicate",q=>q.shots[1].id=q.shots[0].id],
 ["badCharacterKey",q=>q.shots[0].layers.find(l=>l.motion).motion.keys[1].frame=-1],
 ["unapprovedFinal",q=>{q.publicationReady=true;q.approval.narration=false;}]
]){
 const q=structuredClone(p);mutate(q);assert.throws(()=>validateLawProject(q));results.invalidInput[label]="PASS";
}
function corners(t){
 const w=2200*9/16,h=2200,r=t.rotation*Math.PI/180;
 return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>[t.x+t.scale*(x*Math.cos(r)-y*Math.sin(r)),t.y+t.scale*(x*Math.sin(r)+y*Math.cos(r))]);
}
function margin(poly,point){
 let min=Infinity;
 for(let i=0;i<4;i++){
  const a=poly[i],b=poly[(i+1)%4];const dx=b[0]-a[0],dy=b[1]-a[1];
  const cross=dx*(point[1]-a[1])-dy*(point[0]-a[0]);min=Math.min(min,cross/Math.hypot(dx,dy));
 }return min;
}
let minimumMargin=Infinity,allFinite=true,allDeterministic=true;
const depth=[];
for(const s of p.shots){
 const cam=presetCamera(baseShot(s)),bg=s.layers.find(l=>l.role.includes("background")||l.id==="background");
 for(let f=0;f<s.durationInFrames;f++){
  const a=CameraKeyframes(f,cam.keys),b=CameraKeyframes(f,cam.keys);
  allFinite&&=Object.values(a).every(Number.isFinite);allDeterministic&&=JSON.stringify(a)===JSON.stringify(b);
  const poly=corners(layerTransform(f,cam,bg));
  for(const pt of [[0,0],[1080,0],[1080,1920],[0,1920]])minimumMargin=Math.min(minimumMargin,margin(poly,pt));
 }
 if(s.layerMode==="MULTILAYER_2_5D"){
  const fg=s.layers.find(l=>l.role==="character-group"||l.role==="foreground-terrain"||l.role==="falling-fragment");
  const a0=layerTransform(0,cam,bg),a1=layerTransform(s.durationInFrames-1,cam,bg),b0=layerTransform(0,cam,fg),b1=layerTransform(s.durationInFrames-1,cam,fg);
  const delta=Math.hypot((b1.x-b0.x)-(a1.x-a0.x),(b1.y-b0.y)-(a1.y-a0.y));
  assert(delta>.1,s.id+" has no camera-derived depth separation");
  depth.push({shot:s.id,foregroundDepth:fg.depth,backgroundDepth:bg.depth,differentialPixels:delta});
 }
}
assert(allFinite&&allDeterministic);assert(minimumMargin>=0,"Camera exposes image borders");
results.camera={framesChecked:p.durationInFrames,allFramesFinite:allFinite,allFramesDeterministic:allDeterministic,minimumOpaqueCoverageMarginPixels:minimumMargin,depthSeparatedShots:depth,coreReused:true};
const cues=JSON.parse(fs.readFileSync("public/"+p.captions,"utf8"));
const srt=parseSrt(fs.readFileSync("public/"+p.srt,"utf8"));
assert.equal(cues.length,srt.length);let previous=-1;
for(let i=0;i<cues.length;i++){
 const c=cues[i];assert(c.startMs>=previous&&c.endMs>c.startMs);previous=c.endMs;
 assert(!/[٠-٩۰-۹]/.test(c.text));assert.equal(c.text,srt[i].text);
 assert(Math.abs(c.startMs-srt[i].start*1000)<.01);assert(Math.abs(c.endMs-srt[i].end*1000)<.01);
}
const recorded=p.timingBasis==="recording";
if(recorded){
 assert(fs.existsSync("public/"+p.audio));assert(p.approval.narration&&p.approval.captionAlignment);
 const alignment=JSON.parse(fs.readFileSync(P+"/qa/audio-final/forced-alignment.json","utf8"));
 assert.equal(alignment.words.length,209);assert.equal(alignment.issues.length,0);assert(alignment.sourceTextExact);
 assert(Math.abs(p.durationInFrames/p.fps-alignment.duration)<=1/p.fps);
 for(const c of cues){assert(c.firstWordIndex>=0&&c.lastWordIndex<209);assert(c.endMs<=p.durationInFrames/p.fps*1000);}
}
results.captions={cues:cues.length,jsonSrtRoundTrip:"PASS",orderedNoOverlap:"PASS",westernDigits:"PASS",timingBasis:p.timingBasis,audioAlignment:recorded?"RECORDING_DERIVED_LOCAL_FORCED_ALIGNMENT":"NOT_TESTABLE_NO_RECORDING",groundTruth17msClaim:false};
results.publication={finalExportGate:recorded?"APPROVED_AUDIO_AND_CAPTIONS_PRESENT":"BLOCKED_AS_EXPECTED",audioAvailable:!!p.audio,approvedNarration:p.approval.narration,publicationReady:p.publicationReady};
const qa=P+"/qa"+(recorded?"/final":"");fs.mkdirSync(qa,{recursive:true});
fs.writeFileSync(qa+"/timeline-animation-tests.json",JSON.stringify(results,null,2));
console.log(JSON.stringify({status:"PASS",shots:p.shots.length,frames:p.durationInFrames,depthSeparatedShots:depth.length,minimumCoverage:minimumMargin,cues:cues.length,publicationReady:p.publicationReady}));

