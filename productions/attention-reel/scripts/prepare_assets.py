from pathlib import Path
import json,re,math,subprocess,sys,hashlib
import numpy as np
from scipy.signal import butter,sosfilt
from scipy.io import wavfile
def write_wav(path,data,sample_rate):
 wavfile.write(str(path),sample_rate,np.asarray(data,dtype=np.float32))
R=Path(__file__).resolve().parents[1]
inp=Path(sys.argv[1]).resolve()
raw=R/'public/audio/narration-raw.mp3'
words=json.loads(inp.read_text())['words']
words=[w for w in words if not w['text'].startswith('[')]
def norm(s):return re.sub(r'[^\w\s]','',re.sub('[\u064b-\u065f\u0670]','',s).replace('أ','ا').replace('إ','ا').replace('آ','ا').replace('ى','ي')).strip()
def find(phrase,lo=0):
 p=norm(phrase).split()
 for i,w in enumerate(words):
  if w['start']>=lo-.01 and [norm(x['text']) for x in words[i:i+len(p)]]==p:return w['start']
 raise ValueError(phrase)
duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(raw)]))
total=math.ceil((duration+.4)*60)/60
markers=[('Hook','فتحت جوالك'),('Science','الموضوع مو'),('Roadmap','المفيد هنا'),('Triggers','أولًا اكتشف'),('Friction','ثانيًا خل'),('Rest','ثالثًا لا'),('Measure','وما تحتاج'),('Ending','اليوم اختر')]
beats={
'Hook':['وبعد نصف','فتفتح مقطعًا','شفت الدائرة'],
'Science':['الدوبامين له','تقليل التصفح'],
'Roadmap':[],
'Triggers':['تفتح التطبيق','من التوتر','ولا لأن','راقب مرة','وش صار'],
'Friction':['أطفئ الإشعارات','وابعد الجوال','وبدل لازم','أبدأ بخمس','وبعدها أختار'],
'Rest':['جرّب تمشي','تتنفس بهدوء','أو تكتب','استراحة ترجعك'],
'Measure':['أو تنتظر','راقب السلوك','هل صار','وهل بدأت'],
'Ending':['حط الجوال','وافتح أول','خله إنجازك','قبل أول']}
starts=[0]+[find(p) for _,p in markers[1:]]
scenes=[]
for i,(name,_) in enumerate(markers):
 start=starts[i];end=starts[i+1] if i+1<len(starts) else total
 cues=[round(find(p,start)-start,3) for p in beats[name]]
 scenes.append({'id':name,'start':start,'end':end,'from':round(start*60),'frames':round(end*60)-round(start*60),'beats':cues})
(R/'src/timeline.json').write_text(json.dumps({'duration':total,'frames':round(total*60),'scenes':scenes},ensure_ascii=False,indent=2))
caps=[{'text':w['text'],'startMs':round(w['start']*1000),'endMs':round(min(w['end'],duration)*1000),'timestampMs':None,'confidence':None} for w in words]
(R/'production/captions.json').write_text(json.dumps(caps,ensure_ascii=False,indent=2))
def ts(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
chunks=[];cur=[]
for w in words:
 cur.append(w)
 if len(cur)>=7 or re.search(r'[.!؟?؛:]$',w['text']):chunks.append(cur);cur=[]
if cur:chunks.append(cur)
(R/'production/captions.srt').write_text('\n\n'.join(f"{i}\n{ts(c[0]['start'])} --> {ts(min(c[-1]['end'],duration))}\n"+' '.join(w['text'] for w in c) for i,c in enumerate(chunks,1))+'\n')

def loudness(path):
 p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-16:TP=-4.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 return json.loads(p.stderr[p.stderr.rfind('{'):])
def ff(args):subprocess.run(['ffmpeg','-v','error','-y']+args,check=True)

# Speech: light compression; exact mono loudness; then a true-peak safety pass.
comp=R/'public/audio/speech-comp.wav';voice=R/'public/audio/narration.wav'
ff(['-i',str(raw),'-af','highpass=f=65,acompressor=threshold=0.1:ratio=3.5:attack=2:release=90:knee=2.8:makeup=1','-ar','48000','-ac','1','-c:a','pcm_s24le',str(comp)])
m=loudness(comp);gain=-16-float(m['input_i'])
ff(['-i',str(comp),'-af',f'volume={gain}dB,aresample=192000,alimiter=limit=0.585:level=false:latency=true,aresample=48000','-c:a','pcm_s24le',str(voice)])
sr=48000;v=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(voice),'-f','f64le','-acodec','pcm_f64le','-ac','1','-ar',str(sr),'-']),dtype='<f8');n=round(total*sr);v=np.pad(v,(0,max(0,n-len(v))))[:n]

# An original ambient score synthesized here. No recording, sample library,
# downloaded loop, named-song reference, or borrowed melody is an input.
rng=np.random.default_rng(27102026)
music=np.zeros((n,2),dtype=np.float64)
chords=[[52,59,62,66],[45,52,59,61],[48,55,59,64],[43,50,57,59],[52,57,62,66],[45,52,60,64],[48,55,62,67],[47,54,59,62]]
events=[]
segment=10.5
for idx,start in enumerate(np.arange(0,total,segment)):
 notes=chords[idx%len(chords)];length=min(segment+2.3,total-start);N=round(length*sr);tt=np.arange(N)/sr
 env=np.minimum(1,tt/1.8)*np.minimum(1,np.maximum(0,(length-tt)/2.1))
 for j,midi in enumerate(notes):
  freq=440*2**((midi-69)/12);phase=rng.uniform(0,2*np.pi)
  tone=(np.sin(2*np.pi*freq*tt+phase)+.13*np.sin(2*np.pi*freq*2*tt+phase*.8)+.045*np.sin(2*np.pi*freq*3*tt+phase*.6))
  tone*=env*(.024 if j==0 else .015)*(0.93+.07*np.sin(tt*.7+j))
  pan=(j-1.5)*.32;left=np.sqrt((1-pan)/2);right=np.sqrt((1+pan)/2)
  a=round(start*sr);b=min(n,a+N);music[a:b,0]+=tone[:b-a]*left;music[a:b,1]+=tone[:b-a]*right
 events.append({'start':round(float(start),3),'duration':round(float(length),3),'midi_notes':notes})
# Sparse gentle bell tones, generated from sine partials rather than samples.
for k,start in enumerate(np.arange(5.4,total-3,7.7)):
 midi=[76,71,74,69,79,73,76,71,74,69][k%10];N=min(round(3.2*sr),n-round(start*sr));tt=np.arange(N)/sr
 env=(1-np.exp(-tt*25))*np.exp(-tt*1.7);freq=440*2**((midi-69)/12)
 tone=(np.sin(2*np.pi*freq*tt)+.12*np.sin(2*np.pi*freq*2.01*tt))*env*.008
 a=round(start*sr);music[a:a+N,0]+=tone*.7;music[a:a+N,1]+=tone*.5
music=sosfilt(butter(2,[120,1900],btype='bandpass',fs=sr,output='sos'),music,axis=0)
tt=np.arange(n)/sr;music*=np.minimum(1,tt/1.5)[:,None]*np.minimum(1,np.maximum(0,(total-tt)/1.8))[:,None]
orig=R/'public/audio/original-music.wav';write_wav(orig,music,sr)
m=loudness(orig);music*=10**((-34-float(m['input_i']))/20)
write_wav(orig,music,sr)
# Quiet ducking under words. No speech speed or timing changes.
power=sosfilt(butter(1,3,fs=sr,output='sos'),v*v)
presence=np.clip(np.sqrt(np.maximum(power,0))/.055,0,1)
duck=1-.55*presence
mix=v[:,None]*(10**(-3/20))+music*duck[:,None]
pre=R/'public/audio/mix-pre.wav';write_wav(pre,mix,sr)
m=loudness(pre);final_gain=-16-float(m['input_i']);final=R/'public/audio/mix.wav'
ff(['-i',str(pre),'-af',f'volume={final_gain}dB,aresample=192000,alimiter=limit=0.585:level=false:latency=true,aresample=48000','-ar','48000','-c:a','pcm_s24le',str(final)])
for name in ['narration','original-music','mix']:
 ff(['-i',str(R/f'public/audio/{name}.wav'),'-c:a','flac','-compression_level','8',str(R/f'public/audio/{name}.flac')])
measurements={k:{'integrated_lufs':float((q:=loudness(R/f'public/audio/{k}.wav'))['input_i']),'true_peak_dbtp':float(q['input_tp'])} for k in ['narration','original-music','mix']}
(R/'production/audio-qa.json').write_text(json.dumps(measurements,indent=2))
(R/'production/music-provenance.json').write_text(json.dumps({'title':'Quiet First Page','method':'Original procedural composition and oscillator synthesis','seed':27102026,'sample_rate':sr,'channels':2,'external_recordings':[],'sample_libraries':[],'reference_songs':[],'events':events,'scope':'A custom background score for this reel; no claim of copyright registration or guaranteed Content ID clearance.','sha256_wav':hashlib.sha256(orig.read_bytes()).hexdigest()},indent=2))
print(json.dumps({'duration':total,'scenes':scenes,'audio':measurements},ensure_ascii=False,indent=2),flush=True)
