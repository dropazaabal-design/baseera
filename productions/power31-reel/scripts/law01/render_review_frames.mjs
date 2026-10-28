// Reuses the Baseera renderer QA pattern from scripts/law31, with a separate entry/output.
import {bundle} from "@remotion/bundler";
import {getCompositions,openBrowser,renderStill} from "@remotion/renderer";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
const root=path.resolve("."),baseQa=path.join(root,"projects/law01-cinematic/qa");
const variant=process.argv[2]??"v1";
const qa=variant==="recorded"?path.join(baseQa,"final"):baseQa;
const project=JSON.parse(readFileSync("src/law01/project.json","utf8"));
const browserExecutable=process.env.REMOTION_CHROME??path.join(root,"node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell");
const serveUrl=await bundle({entryPoint:path.join(root,"src/law01/index.ts"),outDir:path.join(root,"out/law01-qa-bundle"),rspack:true,enableCaching:true});
const browser=await openBrowser("chrome",{browserExecutable});
const samples=[],errors=[];
mkdirSync(path.join(qa,"frames-"+variant),{recursive:true});
try{
 const comps=await getCompositions(serveUrl,{puppeteerInstance:browser});
 writeFileSync(path.join(qa,"compositions.json"),JSON.stringify(comps.map(c=>({id:c.id,width:c.width,height:c.height,fps:c.fps,durationInFrames:c.durationInFrames})),null,2));
 const composition=comps.find(c=>c.id===(project.publicationReady?"Law01-Cinematic-Final":"Law01-Visual-Review"));if(!composition)throw Error("Missing full reel");
 if(comps.filter(c=>/^Law01-SHOT/.test(c.id)).length!==30)throw Error("Missing standalone shot previews");
 for(const s of project.shots){
  const points=[["start",0],["middle",Math.floor(s.durationInFrames/2)],["end",s.durationInFrames-1]];
  if(s.transition.frames)points.push(["transition",Math.min(s.transition.frames,s.durationInFrames-1)]);
  for(const [label,localFrame]of points){
   const file=`frames-${variant}/${s.id}-${label}.png`,frame=s.startFrame+localFrame;
   await renderStill({serveUrl,composition,frame,output:path.join(qa,file),imageFormat:"png",puppeteerInstance:browser,overwrite:true,onBrowserLog:l=>{if(l.type==="error")errors.push(l.text);}});
   samples.push({shot:s.id,label,frame,localFrame,file});console.log(s.id,label,frame);
  }
 }
 // One independent shot preview must match the same assembly frame exactly.
 const s=project.shots.find(s=>s.id==="SHOT19"),frame=60;
 await renderStill({serveUrl,composition:comps.find(c=>c.id==="Law01-SHOT19"),frame,output:path.join(qa,"preview-SHOT19.png"),imageFormat:"png",puppeteerInstance:browser,overwrite:true});
 const sampleData=JSON.stringify({samples,errors,previewComparison:{assembly:`frames-${variant}/SHOT19-middle.png`,assemblyFrame:s.startFrame+frame,previewFrame:frame,preview:"preview-SHOT19.png"}},null,2);
 writeFileSync(path.join(qa,"frame-samples.json"),sampleData);
 writeFileSync(path.join(qa,`frame-samples-${variant}.json`),sampleData);
 // Exact comparison assembly render at the preview's actual offset.
 await renderStill({serveUrl,composition,frame:s.startFrame+frame,output:path.join(qa,"assembly-SHOT19-frame60.png"),imageFormat:"png",puppeteerInstance:browser,overwrite:true});
 if(errors.length)throw Error("Browser render errors: "+errors.join(";"));
 console.log(JSON.stringify({status:"PASS",samples:samples.length,compositions:comps.length}));
}finally{await browser.close({silent:true});}

