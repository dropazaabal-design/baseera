from pathlib import Path
import json,re,subprocess,math,sys

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT.parents[2]
TRANS=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'production/local-transcription-results.json'
data=json.loads(TRANS.read_text())
names=[['intro','dizzy','tingles','stretch','sleep','outro'],['intro','eye','freeze','skin','tinnitus','outro'],['intro','reflux','globus','fullness','chest','outro']]
markers=[['جسمك يسوي','أولًا الدوخة','ثانيًا الرجل','ثالثًا التمغّط','رابعًا النفضة','الفكرة راقب'],['جفنك يسوي','نبدأ برفّة','ثانيًا صداع','ثالثًا القشعريرة','رابعًا طنين','لاحظ الرابط'],['كلمة واحدة','أولًا الحرقان','ثانيًا الكتلة','ثالثًا الثقل','رابعًا نغزة','اكتملت السلسلة']]
beat_markers=[
 {'dizzy':['عند الوقوف','أحيانًا يتأخر','قم على','وإذا تتكرر'],'tingles':['الضغط على','غيّر وضعيتك','لكن تنميل','وتنميل مفاجئ'],'stretch':['هذا سلوك','العضلات تنقبض','أما حكاية','تحرك براحتك'],'sleep':['هذه نفضة','وسببها الدقيق','الإرهاق وقلة','لكن لو']},
 {'eye':['غالبًا هي','جرّب ترتاح','والرفّة وحدها','لو استمرت'],'freeze':['البرودة تلمس','هذا مثال','وقف البارد','وبعدها خذ'],'skin':['عضلات دقيقة','حركة صغيرة','لكنها مو','ولا دليل'],'tinnitus':['هذا اسمه','قد يرتبط','خفف الأصوات','لو مستمر','ومع فقدان']},
 {'reflux':['محتويات المعدة','وجبة أصغر','لكن حرقان','ومو كل'],'globus':['أحيانًا يكون','التوتر قد','خذ رشفات','أما صعوبة'],'fullness':['هذا قد','خفف حجم','لكن الثقل','وإذا استمر'],'chest':['ممكن يكون','لكن وصفها','ألم مفاجئ','اطلب الإسعاف','والألم اللي']}
]

def norm(s):
 s=re.sub('[\u064b-\u065f\u0670]','',s).replace('أ','ا').replace('إ','ا').replace('آ','ا').replace('ى','ي')
 return re.sub(r'[^\w\s]','',s).strip()
def find(words,phrase,lo=0,hi=1e9):
 target=norm(phrase).split()
 for i,w in enumerate(words):
  if w['start']<lo-.01 or w['start']>=hi:continue
  if [norm(x['text']) for x in words[i:i+len(target)]]==target:return w['start']
 raise ValueError((phrase,lo,hi))
def ts(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

timelines=[]
for i,v in enumerate(data):
 t=v['transcripts'][0]
 words=[w for w in t['words'] if not w['text'].startswith('[')]
 raw=ROOT/'public/audio'/f'part-{i+1}-raw.mp3'
 duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(raw)]))
 out=ROOT/'public/audio'/f'part-{i+1}.wav'
 # Normalize in two passes without altering speech timing.
 p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(raw),'-af','loudnorm=I=-16:TP=-4:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True)
 measured=json.loads(p.stderr[p.stderr.rfind('{'):])
 filt=f"loudnorm=I=-16:TP=-4:LRA=7:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true:print_format=summary"
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',filt,'-ar','48000','-ac','1','-c:a','pcm_s24le',str(out)],check=True)
 starts=[0]+[find(words,m) for m in markers[i][1:]]
 ends=starts[1:]+[math.ceil((duration+.35)*60)/60]
 scenes=[]
 for name,start,end in zip(names[i],starts,ends):
  cues=[round(find(words,m,start,end)-start,3) for m in beat_markers[i].get(name,[])]
  scenes.append({'id':name,'start':round(start,3),'end':round(end,3),'from':round(start*60),'frames':round(end*60)-round(start*60),'beats':cues})
 captions=[]
 for w in words:
  captions.append({'text':w['text'],'startMs':round(w['start']*1000),'endMs':round(min(w['end'],duration)*1000),'timestampMs':None,'confidence':None})
 (ROOT/'production'/f'part-{i+1}-captions.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2))
 # A sidecar subtitle, with short readable lines and measured word timing.
 chunks=[];cur=[]
 for w in words:
  cur.append(w)
  if len(cur)>=7 or re.search(r'[.!؟?؛:]$',w['text']):chunks.append(cur);cur=[]
 if cur:chunks.append(cur)
 srt='\n\n'.join(f"{n}\n{ts(chunk[0]['start'])} --> {ts(min(chunk[-1]['end'],duration))}\n"+' '.join(x['text'] for x in chunk) for n,chunk in enumerate(chunks,1))+'\n'
 (ROOT/'production'/f'part-{i+1}.srt').write_text(srt)
 timelines.append({'part':i+1,'duration':duration,'frames':round(ends[-1]*60),'scenes':scenes,'audio_normalization':measured})
(ROOT/'src/timeline.json').write_text(json.dumps(timelines,ensure_ascii=False,indent=2))
print(json.dumps([{'part':x['part'],'duration':x['duration'],'frames':x['frames'],'scenes':x['scenes']} for x in timelines],ensure_ascii=False,indent=2))
