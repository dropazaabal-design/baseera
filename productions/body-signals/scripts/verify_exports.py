from pathlib import Path
import subprocess,json,re,concurrent.futures,sys
R=Path(__file__).resolve().parents[1]
F=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else max((R/'out').glob('*'),key=lambda p:p.stat().st_mtime)
Q=R/'production/qa'
Q.mkdir(parents=True,exist_ok=True)
def check(i):
 p=F/f'Body_Signals_Part_{i}.mp4'
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(p)]))
 video=next(s for s in probe['streams'] if s['codec_type']=='video')
 audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
 cmd=['ffmpeg','-hide_banner','-nostats','-i',str(p),'-vf','scale=320:568,blackdetect=d=0.1:pix_th=0.02,freezedetect=n=-55dB:d=3','-af','silencedetect=noise=-42dB:d=0.8,ebur128=peak=true','-f','null','-']
 r=subprocess.run(cmd,capture_output=True,text=True,check=True)
 (Q/f'export-{i}-scan.log').write_text(r.stderr)
 summary=r.stderr[r.stderr.rfind('Summary:'):]
 loud=re.search(r'I:\s*([-\d.]+) LUFS',summary);peak=re.search(r'Peak:\s*([-\d.]+) dBFS',summary)
 freezes=re.findall(r'freeze_(?:start|end|duration):\s*[\d.]+',r.stderr)
 black=re.findall(r'black_start:[^\n]+',r.stderr)
 silence=re.findall(r'silence_(?:start|end|duration):\s*[\d.]+',r.stderr)
 result={'part':i,'filename':p.name,'bytes':p.stat().st_size,'duration_seconds':float(probe['format']['duration']),'width':video['width'],'height':video['height'],'fps':video['avg_frame_rate'],'decoded_frames':int(video['nb_read_frames']),'codec':video['codec_name'],'pixel_format':video['pix_fmt'],'color_space':video.get('color_space'),'audio_codec':audio['codec_name'],'audio_sample_rate':audio['sample_rate'],'integrated_lufs':float(loud.group(1)),'true_peak_dbtp':float(peak.group(1)),'black_intervals':black,'tolerance_based_hold_events':freezes,'silence_events':silence,'audio_start':audio.get('start_time'),'video_start':video.get('start_time'),'hold_scan_note':'The tolerance-based freeze detector also flags authored reading holds and small vector animations; these events are retained as measurements, not treated as proof of a stalled decoder.'}
 print(json.dumps(result,ensure_ascii=False),flush=True)
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(check,[1,2,3]))
(R/'production/final-qa.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
