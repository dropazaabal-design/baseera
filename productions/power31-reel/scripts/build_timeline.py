from pathlib import Path
import json, math, re, subprocess

ROOT=Path(__file__).resolve().parent.parent
FPS=60
words=json.loads((ROOT/'production/words-clean.json').read_text())['words']
spec=[('Hook',0,'مو كل اختيار يعني حرية'),('Pressure',17,'الاختيار المفخخ'),('Law',51,'القانون 31'),('Warning',86,'التنبيه الأخلاقي'),('Signs',108,'علامات الضغط'),('Nuance',132,'القيود الحقيقية'),('Response',150,'استعادة مساحة القرار'),('Ethics',193,'الوضوح الأخلاقي'),('Contrast',213,'ترتيب أم تلاعب'),('Reading',231,'قراءة نقدية'),('Ending',246,'من قال إن هذه كل الأبواب')]
audio=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(ROOT/'public/audio/narration.flac')],text=True))
total=math.ceil((max(audio,words[-1]['end'])+.35)*FPS)
starts=[0]+[round(words[idx]['start']*FPS) for _,idx,_ in spec[1:]]
timeline={'fps':FPS,'durationInFrames':total,'audioDuration':audio,'scenes':[]}
imports=[];nodes=[];regs=[];allcaps=[]
for i,(name,idx,label) in enumerate(spec):
 start=starts[i];end=starts[i+1] if i+1<len(spec) else total;endidx=spec[i+1][1] if i+1<len(spec) else len(words)
 caps=[]
 for w in words[idx:endidx]:
  c={'text':' '+w['text'],'startMs':round(w['start']*1000-start/FPS*1000),'endMs':round(w['end']*1000-start/FPS*1000),'timestampMs':round((w['start']+w['end'])/2*1000-start/FPS*1000),'confidence':None}
  if re.search(r'[.؟!…]$',w['text']):c['pageBreakAfter']=True
  caps.append(c)
  allcaps.append({**c,'startMs':round(w['start']*1000),'endMs':round(w['end']*1000),'timestampMs':round((w['start']+w['end'])/2*1000)})
 p=ROOT/f'src/scenes/{name}.tsx';src=p.read_text()
 if "import {CaptionLayer}" not in src:src="import {CaptionLayer} from '../Captions';\n"+src
 src=re.sub(r'<CaptionLayer\s+captions=\{\[.*?\]\}\s*/>','',src,flags=re.S)
 src=src.replace('</Frame>', '<CaptionLayer captions={'+json.dumps(caps,ensure_ascii=False,separators=(',',':'))+'}/></Frame>')
 p.write_text(src)
 imports.append(f'import {{{name}}} from "./scenes/{name}";')
 nodes.append(f'  <Sequence name="{label}" from={{{start}}} durationInFrames={{{end-start}}} premountFor={{fps}}><{name}/></Sequence>')
 regs.append(f'   <Composition id="Scene-{name}" component={{{name}}} width={{1080}} height={{1920}} fps={{60}} durationInFrames={{{end-start}}}/>')
 timeline['scenes'].append({'id':name,'name':label,'from':start,'durationInFrames':end-start,'startSeconds':start/FPS})
(ROOT/'src/timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2))
(ROOT/'production/captions.json').write_text(json.dumps(allcaps,ensure_ascii=False,indent=2))
(ROOT/'src/Power31.tsx').write_text('import {AbsoluteFill,Sequence,staticFile,useVideoConfig} from "remotion";\nimport {Audio} from "@remotion/media";\n'+'\n'.join(imports)+'\nexport const Power31=()=>{const {fps}=useVideoConfig();return <AbsoluteFill>\n'+'\n'.join(nodes)+'\n  <Audio name="الرواية فقط — بدون موسيقى" src={staticFile("audio/narration.flac")} premountFor={fps}/>\n</AbsoluteFill>;};\n')
(ROOT/'src/Root.tsx').write_text('import {Composition,Folder} from "remotion";\nimport {Power31} from "./Power31";\n'+'\n'.join(imports)+'\nexport const RemotionRoot=()=> <>\n <Composition id="Power31" component={Power31} width={1080} height={1920} fps={60} durationInFrames={'+str(total)+'}/>\n <Folder name="Power31-Scenes">\n'+'\n'.join(regs)+'\n </Folder>\n</>;\n')
def stamp(ms):
 n=round(ms);return f'{n//3600000:02d}:{n//60000%60:02d}:{n//1000%60:02d},{n%1000:03d}'
groups=[];g=[]
for c in allcaps:
 if g and (len(g)>=6 or sum(len(a['text']) for a in g)+len(c['text'])>37):groups.append(g);g=[]
 g.append(c)
 if c.get('pageBreakAfter'):groups.append(g);g=[]
if g:groups.append(g)
(ROOT/'production/captions.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(a[0]["startMs"])} --> {stamp(a[-1]["endMs"])}\n'+''.join(c['text'] for c in a).strip() for i,a in enumerate(groups))+'\n')
print(json.dumps({'durationInFrames':total,'durationSeconds':total/FPS,'scenes':len(spec),'words':len(allcaps)}))
