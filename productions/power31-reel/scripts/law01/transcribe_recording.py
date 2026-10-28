"""Local Arabic ASR and word timestamps, with no paid transcription service."""
from pathlib import Path
import json, time, dataclasses, importlib.metadata, subprocess, argparse
import numpy as np
from faster_whisper import WhisperModel

R=Path(__file__).resolve().parents[2]
P=R/'projects/law01-cinematic';Q=P/'qa/audio-final'
Q.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--model',default='small');args=parser.parse_args()
start=time.monotonic()
model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=6,num_workers=1,
    download_root='/workspace/scratch/4b49832951b6/law01-model-cache')
print('MODEL_LOADED',flush=True)
audio=R/'public/law01/audio/Law01-Narration-ElevenV4-Original.mp3'
decoded=subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(audio),'-ar','16000','-ac','1','-f','f32le','pipe:1'],capture_output=True,check=True)
waveform=np.frombuffer(decoded.stdout,dtype=np.float32).copy()
segments,info=model.transcribe(waveform,language='ar',task='transcribe',beam_size=5,
    word_timestamps=True,vad_filter=False,condition_on_previous_text=False,
    temperature=0,compression_ratio_threshold=2.4,log_progress=True)
rows=[]
for seg in segments:
    row=dataclasses.asdict(seg);rows.append(row)
    print(f'{seg.start:.2f}–{seg.end:.2f} {seg.text}',flush=True)
    (Q/f'asr-{args.model}-partial.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
report={'method':f'faster-whisper {args.model} multilingual CPU int8; independent transcription without approved-script prompt',
    'language':info.language,'languageProbability':info.language_probability,'duration':info.duration,
    'elapsedSeconds':time.monotonic()-start,'versions':{p:importlib.metadata.version(p) for p in ['faster-whisper','ctranslate2','numpy']},
    'segments':rows,'text':' '.join(s['text'].strip() for s in rows)}
(Q/('asr-recording.json' if args.model=='small' else f'asr-{args.model}-recording.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('ASR_COMPLETE',len(rows),'segments',round(report['elapsedSeconds'],2),'seconds',flush=True)
