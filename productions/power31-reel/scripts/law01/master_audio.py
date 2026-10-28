"""Measured loudness mastering and oversampled limiting; preserve the original."""
from pathlib import Path
import subprocess,json,re,hashlib
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';Q=P/'qa/audio-final'
Q.mkdir(parents=True,exist_ok=True)
A=R/'public/law01/audio';source=A/'Law01-Narration-ElevenV4-Original.mp3'
def run(args,name):
    proc=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-threads','2','-filter_threads','2',*args],capture_output=True,text=True)
    (Q/name).write_text(proc.stderr)
    if proc.returncode:raise RuntimeError(f'{name}: FFmpeg exit {proc.returncode}; see log')
    return proc.stderr
def loudness(text):
    matches=re.findall(r'\{\s*"input_i"[\s\S]*?\}',text)
    if not matches:raise ValueError('Loudness JSON missing')
    return json.loads(matches[-1])
first=loudness(run(['-i',str(source),'-af','loudnorm=I=-16:TP=-6:LRA=11:print_format=json','-f','null','-'],'master-source-measurement.log'))
stage=R/'out/law01-audio-mastering';stage.mkdir(parents=True,exist_ok=True)
gain=-16-float(first['input_i']);trials=[]
for attempt in range(1,9):
    candidate=stage/f'master-{attempt}.wav'
    filt=f'aresample=192000,volume={gain:.5f}dB,alimiter=limit=0.501187:level=false:attack=5:release=50:latency=true,aresample=48000'
    run(['-i',str(source),'-af',filt,'-ac','1','-c:a','pcm_s24le','-y',str(candidate)],f'master-limited-{attempt}.log')
    measured=loudness(run(['-i',str(candidate),'-af','loudnorm=I=-16:TP=-4:LRA=11:print_format=json','-f','null','-'],f'master-limited-{attempt}-measurement.log'))
    trials.append({'attempt':attempt,'gainDB':gain,'filter':filt,'measured':measured})
    error=-16-float(measured['input_i'])
    if abs(error)<=.1:break
    gain+=error*2
else:raise RuntimeError('Measured gain did not converge; do not publish master.')
master=A/'Law01-Narration-Mastered.wav'
if master.exists():raise FileExistsError('Keep existing master; use a new version for changes.')
candidate.replace(master)
mp3=A/'Law01-Narration-Final.mp3'
run(['-i',str(master),'-c:a','libmp3lame','-q:a','2','-id3v2_version','3','-metadata','title=Baseera Law01 Narration','-n',str(mp3)],'master-mp3-encode-final.log')
records=[]
for name,file in [('wav',master),('mp3',mp3)]:
    measured=loudness(run(['-i',str(file),'-af','loudnorm=I=-16:TP=-4:LRA=11:print_format=json','-f','null','-'],f'{name}-verification.log'))
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(file)],text=True))
    rec={'format':name,'file':str(file.relative_to(R)),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,
         'integratedLUFS':float(measured['input_i']),'truePeakDBTP':float(measured['input_tp']),'loudnessRangeLU':float(measured['input_lra']),
         'probe':probe}
    rec['loudnessPass']=abs(rec['integratedLUFS']+16)<=.25;rec['truePeakPass']=rec['truePeakDBTP']<=-4
    records.append(rec)
report={'status':'PASS' if all(x['loudnessPass'] and x['truePeakPass'] for x in records) else 'FAIL',
    'method':'Measured gain targets -16 LUFS; 192kHz lookahead limiter with latency compensation and -6dB sample ceiling provides lossy-codec headroom; then 48kHz 24-bit master. No trim, time stretch, music or new voice generation.',
    'originalPreserved':True,'firstPass':first,'trials':trials,'outputs':records}
(Q/'audio-mastering.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'status':report['status'],'outputs':[{k:r[k] for k in ['file','integratedLUFS','truePeakDBTP','loudnessPass','truePeakPass']} for r in records]},indent=2))
assert report['status']=='PASS'
