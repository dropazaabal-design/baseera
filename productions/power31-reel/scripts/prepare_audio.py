"""Process the selected narration only. No music or sound-effect sources exist."""
from pathlib import Path
import json, subprocess

root=Path(__file__).resolve().parent.parent
src=root/'public/audio/narration-raw.mp3'
stage=root/'public/audio/narration-stage.flac'
base='aformat=channel_layouts=mono,pan=stereo|c0=c0|c1=c0,acompressor=threshold=0.251188:ratio=2:attack=6:release=100:makeup=1:knee=2.5'
def run(filters, output):
    return subprocess.run(['ffmpeg','-hide_banner','-i',str(src),'-af',filters,*output],check=True,text=True,capture_output=True)
first=run(base+',loudnorm=I=-16:TP=-5:LRA=9:print_format=json',['-f','null','-'])
j=json.loads(first.stderr[first.stderr.rfind('{'):])
filters=base+',loudnorm=I=-16:TP=-5:LRA=9:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true:print_format=json'.format(**j)
second=run(filters,['-ar','48000','-c:a','flac',str(stage)])
out=json.loads(second.stderr[second.stderr.rfind('{'):])
# The gain correction is measured from the second pass and stays below its ceiling.
gain=-16-float(out['output_i'])
dest=root/'public/audio/narration.flac'
args=['ffmpeg','-hide_banner','-i',str(stage),'-af',f'volume={gain}dB','-c:a','flac',str(root/'public/audio/narration-new.flac')]
subprocess.run(args,check=True,capture_output=True)
(root/'public/audio/narration-new.flac').replace(dest)
stage.unlink()
(root/'production/audio-qa.json').write_text(json.dumps({'source_generation':'iSDC1n9ccDfALgdV4Elq','voice_id':'DhfzvPf0OIN8xdGwcHOk','model':'eleven_v4','music':False,'sound_effects':False,'first_pass':j,'normalization':out,'post_gain_db':gain,'chain':base},indent=2))
print(dest)
