import {readFileSync,existsSync,mkdirSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
const p=JSON.parse(readFileSync("src/law01/project.json","utf8"));
const final=process.argv.includes("--final");
if(final&&(!p.publicationReady||!p.audio||!p.approval.narration||!p.approval.captionAlignment||p.timingBasis!=="recording"||!p.srt||!existsSync(path.join("public",p.srt))||!existsSync(path.join("public",p.audio)))){
 console.error(JSON.stringify({status:"BLOCKED",reason:"Approved actual narration and recording-aligned captions are required. Silent estimated review cannot be exported as final."}));process.exit(2);
}
const preflight=spawnSync(process.execPath,["scripts/law01/test.cjs"],{stdio:"inherit"});if(preflight.status!==0)process.exit(preflight.status??1);
const dir="projects/law01-cinematic/renders";mkdirSync(dir,{recursive:true});
let v=1,file;do{file=path.join(dir,`Law01-${final?"Final":"Visual-Review"}-1080x1920-60fps-v${v++}.mp4`);}while(existsSync(file));
const browser=path.resolve("node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell");
const args=["--require","./scripts/runtime.cjs","node_modules/@remotion/cli/remotion-cli.js","render","src/law01/index.ts",final?"Law01-Cinematic-Final":"Law01-Visual-Review",file,"--codec=h264","--crf=17","--x264-preset=medium","--pixel-format=yuv420p","--color-space=bt709","--image-format=png","--concurrency=4",`--browser-executable=${process.env.REMOTION_CHROME??browser}`];
const result=spawnSync(process.execPath,args,{stdio:"inherit"});
if(result.status!==0)process.exit(result.status??1);
writeFileSync("projects/law01-cinematic/qa/render-result.json",JSON.stringify({renderProcess:"COMPLETED",file,publicationReady:final&&p.publicationReady,audioIncluded:!!p.audio,estimatedCaptions:!p.approval.captionAlignment,expectedFrames:p.durationInFrames,expectedFPS:p.fps},null,2));
console.log(JSON.stringify({rendered:file,publicationReady:final&&p.publicationReady}));

