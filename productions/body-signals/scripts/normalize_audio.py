from pathlib import Path
import subprocess,json
R=Path(__file__).resolve().parents[1]
def measure(path):
 r=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-16:TP=-4.5:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 return json.loads(r.stderr[r.stderr.rfind('{'):])
stats=[]
for i in (1,2,3):
 raw=R/f'public/audio/part-{i}-raw.mp3';comp=R/f'public/audio/part-{i}-compressed.wav';out=R/f'public/audio/part-{i}.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af','highpass=f=65,acompressor=threshold=0.1:ratio=3.5:attack=2:release=90:knee=2.8:makeup=1','-ar','48000','-ac','1','-c:a','pcm_s24le',str(comp)],check=True)
 m=measure(comp);gain=-16-float(m['input_i']);peak=float(m['input_tp'])+gain
 if peak > -4.4:
  # Catch rare brief transients, then remeasure for an exact final gain.
  temp=R/f'public/audio/part-{i}-limited.wav'
  limit=10**((-4.8-gain)/20)
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(comp),'-af',f'alimiter=limit={limit}:level=false:latency=true','-c:a','pcm_s24le',str(temp)],check=True)
  comp=temp;m=measure(comp);gain=-16-float(m['input_i'])
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(comp),'-af',f'volume={gain}dB','-ar','48000','-ac','1','-c:a','pcm_s24le',str(out)],check=True)
 safe=R/f'public/audio/part-{i}-peak-safe.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(out),'-af','aresample=192000,alimiter=limit=0.585:level=false:latency=true,aresample=48000','-c:a','pcm_s24le',str(safe)],check=True)
 safe.replace(out)
 final=measure(out);stats.append({'part':i,'integrated_lufs':float(final['input_i']),'true_peak_dbtp':float(final['input_tp']),'lra_lu':float(final['input_lra'])})
 print(stats[-1],flush=True)
(R/'production/audio-qa.json').write_text(json.dumps(stats,indent=2))
