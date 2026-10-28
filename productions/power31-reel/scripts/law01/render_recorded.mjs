// Resume exact global picture ranges, then mux the single mastered narration.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const p=JSON.parse(readFileSync('src/law01/project.json','utf8'));
if(!p.publicationReady||p.timingBasis!=='recording'||!p.audio||!p.approval.narration||!p.approval.captionAlignment)throw Error('Actual approved recording and alignment required.');
for(const file of [p.audio,p.srt,p.captions])if(!existsSync(path.join('public',file)))throw Error('Missing actual recording/caption asset');
const preflight=spawnSync(process.execPath,['scripts/law01/test.cjs'],{stdio:'inherit'});if(preflight.status)process.exit(preflight.status);
const version=Number(process.argv.find(x=>x.startsWith('--version='))?.split('=')[1]??1);
if(!Number.isInteger(version)||version<1)throw Error('Positive version required.');
const dir=`projects/law01-cinematic/renders/chunks-recorded-v${version}`;mkdirSync(dir,{recursive:true});
const qa='projects/law01-cinematic/qa/final';mkdirSync(qa,{recursive:true});
const review=`projects/law01-cinematic/renders/Law01-Voice-Visual-Review-1080x1920-60fps-v${version}.mp4`;
const files=['src/law01/project.json','src/law01/Production.tsx','src/law01/Root.tsx','public/'+p.captions,'public/'+p.audio];
const digest=createHash('sha256');for(const f of files)digest.update(readFileSync(f));const inputSHA256=digest.digest('hex');
const checkpoint=path.join(dir,'checkpoint.json');let state=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):{inputSHA256,chunks:[]};
if(state.inputSHA256!==inputSHA256)throw Error('Inputs changed; preserve this version and choose a new one.');
const browser=path.resolve('node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell');
function probe(file){const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height,avg_frame_rate,codec_name,pix_fmt','-of','json',file],{encoding:'utf8'});return r.status===0?JSON.parse(r.stdout).streams[0]:null;}
for(let start=0,index=0;start<p.durationInFrames;start+=300,index++){
 const end=Math.min(start+299,p.durationInFrames-1),expected=end-start+1;
 const file=path.join(dir,`${String(index).padStart(3,'0')}.mp4`),old=existsSync(file)?probe(file):null;
 if(!old||Number(old.nb_frames)!==expected){
  const args=['--require','./scripts/runtime.cjs','node_modules/@remotion/cli/remotion-cli.js','render','src/law01/index.ts','Law01-Cinematic-Final',file,`--frames=${start}-${end}`,'--codec=h264','--crf=17','--x264-preset=medium','--pixel-format=yuv420p','--color-space=bt709','--image-format=png','--muted','--concurrency=4',`--browser-executable=${browser}`];
  const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status)process.exit(run.status);
 }
 const meta=probe(file);if(!meta||Number(meta.nb_frames)!==expected||meta.width!==1080||meta.height!==1920||meta.avg_frame_rate!=='60/1')throw Error('Invalid range '+index);
 state.chunks=state.chunks.filter(x=>x.index!==index).concat({index,startFrame:start,endFrameInclusive:end,frames:expected,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')}).sort((a,b)=>a.index-b.index);
 writeFileSync(checkpoint+'.pending',JSON.stringify(state,null,2));renameSync(checkpoint+'.pending',checkpoint);console.log('CHECKPOINT',index,end);
}
const list=path.join(dir,'concat.txt');writeFileSync(list,state.chunks.map(c=>`file '${path.basename(c.file)}'`).join('\n')+'\n');
const picture=path.join(dir,'picture-master.mp4');
if(!existsSync(picture)){
 const concat=spawnSync('ffmpeg',['-hide_banner','-nostdin','-n','-f','concat','-safe','0','-i',list,'-map','0:v:0','-c','copy','-movflags','+faststart',picture],{stdio:'inherit'});if(concat.status)process.exit(concat.status);
}
if(existsSync(review))throw Error('Review output exists; do not overwrite.');
const mux=spawnSync('ffmpeg',['-hide_banner','-nostdin','-n','-threads','2','-i',picture,'-i',path.join('public',p.audio),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','1','-movflags','+faststart',review],{stdio:'inherit'});if(mux.status)process.exit(mux.status);
const output={renderProcess:'COMPLETED_REQUIRES_FINAL_FILE_QA',file:review,publicationReady:false,projectPublicationGatePassed:true,audioIncluded:true,estimatedCaptions:false,
 expectedFrames:p.durationInFrames,expectedFPS:p.fps,recordingSeconds:p.recording.durationSeconds,method:'Frame-identical global Remotion ranges, lossless picture concatenation, one mastered WAV encoded once to AAC at t=0.',checkpoint:state};
writeFileSync(qa+'/render-result.json',JSON.stringify(output,null,2));console.log(JSON.stringify({review,frames:p.durationInFrames,audioIncluded:true}));
