// Render the same global timeline in resumable ranges. No timing or animation changes.
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.');
const p=JSON.parse(readFileSync('src/law01/project.json','utf8'));
if(p.publicationReady||p.audio)throw Error('Checkpointed renderer is for the silent review only.');
const preflight=spawnSync(process.execPath,['scripts/law01/test.cjs'],{stdio:'inherit'});
if(preflight.status!==0)process.exit(preflight.status??1);
const qa='projects/law01-cinematic/qa';
const version=Number(process.argv.find(x=>x.startsWith('--version='))?.split('=')[1]??1);
if(!Number.isInteger(version)||version<1)throw Error('Version must be a positive integer.');
const output=`projects/law01-cinematic/renders/Law01-Visual-Review-1080x1920-60fps-v${version}.mp4`;
const dir=`projects/law01-cinematic/renders/chunks-v${version}`;mkdirSync(dir,{recursive:true});
const files=['src/law01/project.json','src/law01/Production.tsx','src/law01/Root.tsx','public/law01/subtitles/visual-review-estimated.json'];
const hash=createHash('sha256');for(const f of files)hash.update(readFileSync(f));const inputSHA256=hash.digest('hex');
const checkpoint=path.join(dir,'checkpoint.json');
let state=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):{inputSHA256,chunks:[]};
if(state.inputSHA256!==inputSHA256)throw Error('Inputs changed; retain this checkpoint and choose a new render version.');
const browser=path.resolve('node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell');
const cli='node_modules/@remotion/cli/remotion-cli.js';
function probe(file){
 const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height,avg_frame_rate,codec_name,pix_fmt','-of','json',file],{encoding:'utf8'});
 if(r.status!==0)return null;return JSON.parse(r.stdout).streams[0];
}
for(let start=0,index=0;start<p.durationInFrames;start+=300,index++){
 const end=Math.min(start+299,p.durationInFrames-1),expected=end-start+1;
 const file=path.join(dir,`${String(index).padStart(3,'0')}.mp4`);
 const old=existsSync(file)?probe(file):null;
 if(old&&Number(old.nb_frames)===expected){console.log('RESUME',index,start,end);continue;}
 const args=['--require','./scripts/runtime.cjs',cli,'render','src/law01/index.ts','Law01-Visual-Review',file,`--frames=${start}-${end}`,'--codec=h264','--crf=17','--x264-preset=medium','--pixel-format=yuv420p','--color-space=bt709','--image-format=png','--concurrency=4',`--browser-executable=${browser}`];
 const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)process.exit(run.status??1);
 const meta=probe(file);if(!meta||Number(meta.nb_frames)!==expected||meta.width!==1080||meta.height!==1920||meta.avg_frame_rate!=='60/1')throw Error(`Invalid chunk ${index}`);
 state.chunks=state.chunks.filter(x=>x.index!==index).concat({index,startFrame:start,endFrameInclusive:end,frames:expected,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')}).sort((a,b)=>a.index-b.index);
 writeFileSync(checkpoint+'.pending',JSON.stringify(state,null,2));renameSync(checkpoint+'.pending',checkpoint);
 console.log('CHECKPOINT',index,end);
}
// Reload to retain resumed metadata. A valid existing output is never overwritten.
const chunks=[];
for(let start=0,index=0;start<p.durationInFrames;start+=300,index++){
 const file=path.join(dir,`${String(index).padStart(3,'0')}.mp4`),frames=Math.min(300,p.durationInFrames-start);
 const meta=probe(file);if(!meta||Number(meta.nb_frames)!==frames)throw Error('Missing range');
 chunks.push({index,startFrame:start,endFrameInclusive:start+frames-1,frames,file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')});
}
state={inputSHA256,chunks};writeFileSync(checkpoint,JSON.stringify(state,null,2));
const list=path.join(dir,'concat.txt');writeFileSync(list,chunks.map(c=>`file '${path.basename(c.file)}'`).join('\n')+'\n');
if(existsSync(output))throw Error('Output exists; preserve it and select a new version.');
const concat=spawnSync('ffmpeg',['-hide_banner','-nostdin','-n','-f','concat','-safe','0','-i',list,'-map','0:v:0','-c','copy','-movflags','+faststart',output],{stdio:'inherit'});
if(concat.status!==0)process.exit(concat.status??1);
writeFileSync(qa+'/render-result.json',JSON.stringify({renderProcess:'COMPLETED',file:output,publicationReady:false,audioIncluded:false,estimatedCaptions:true,expectedFrames:p.durationInFrames,expectedFPS:p.fps,method:'Global frame ranges rendered at identical quality and stream-concatenated without re-encoding.',checkpoint:state},null,2));
console.log(JSON.stringify({rendered:output,frames:p.durationInFrames,publicationReady:false}));
