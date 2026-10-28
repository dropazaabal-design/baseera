"""Decode the delivered MP4, inspect metadata, and sample every shot.

This checks the silent visual review. It cannot certify narration or alignment.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import re
import subprocess
import sys
import numpy as np

R = Path(__file__).resolve().parents[2]
P = R / 'projects/law01-cinematic'
Q = P / 'qa'
raw = Q / 'raw'
raw.mkdir(exist_ok=True)
result = json.loads((Q / 'render-result.json').read_text())
video = R / result['file']
assert video.is_file() and video.stat().st_size > 0
probe_cmd = ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-count_frames', '-of', 'json', str(video)]
probe = subprocess.run(probe_cmd, capture_output=True, text=True)
(raw / 'ffprobe.json').write_text(probe.stdout)
(raw / 'ffprobe.stderr.txt').write_text(probe.stderr)
assert probe.returncode == 0, probe.stderr
meta = json.loads(probe.stdout)
stream = next(s for s in meta['streams'] if s['codec_type'] == 'video')
audio = [s for s in meta['streams'] if s['codec_type'] == 'audio']
frames = int(stream.get('nb_read_frames', stream.get('nb_frames', 0)))
duration = float(stream['duration'])
checks = {
    'opens': True,
    'resolution1080x1920': (stream['width'], stream['height']) == (1080, 1920),
    'fps60': stream['avg_frame_rate'] == '60/1' and stream['r_frame_rate'] == '60/1',
    'h264': stream['codec_name'] == 'h264',
    'yuv420p': stream['pix_fmt'] == 'yuv420p',
    'all5760FramesReadable': frames == 5760,
    'exact96SecondReview': abs(duration - 96) < 1 / 60,
    'silentReviewHasNoAudio': len(audio) == 0,
}
samples = json.loads((Q / 'frame-samples-v2.json').read_text())['samples']
selected = sorted({s['frame'] for s in samples})
out = Q / 'review-mp4'
out.mkdir(exist_ok=True)
select = '+'.join(f'eq(n\\,{f})' for f in selected)
filters = f'blackdetect=d=0.05:pix_th=0.02:pic_th=0.98,freezedetect=n=-60dB:d=3,select={select},scale=360:640'
decode_cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-y', '-xerror', '-filter_threads', '2', '-i', str(video), '-vf', filters, '-fps_mode', 'vfr', '-an', '-c:v', 'png', '-threads', '2', str(out / '%04d.png')]
(raw / 'video-qa-command.json').write_text(json.dumps({'probe': probe_cmd, 'decodeAndDetection': decode_cmd}, indent=2))
with (raw / 'full-decode-black-freeze.log').open('w') as log:
    decode = subprocess.run(decode_cmd, stdout=log, stderr=subprocess.STDOUT)
logtext = (raw / 'full-decode-black-freeze.log').read_text()
black = [{'start': float(a), 'end': float(b), 'duration': float(c)} for a,b,c in re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)', logtext)]
freezes = []
opened = None
for line in logtext.splitlines():
    start = re.search(r'freeze_start: ([\d.]+)', line)
    end = re.search(r'freeze_end: ([\d.]+)', line)
    if start:
        opened = float(start.group(1))
    if end and opened is not None:
        freezes.append({'start': opened, 'end': float(end.group(1)), 'duration': float(end.group(1)) - opened})
        opened = None
if opened is not None:
    freezes.append({'start': opened, 'end': duration, 'duration': duration - opened})
checks.update({'fullDecodeExit0': decode.returncode == 0, 'noBlackIntervals': not black, 'noFreezeLongerThan3s': not any(x['duration'] > 3 for x in freezes)})
records = []
for i, f in enumerate(selected, 1):
    p = out / f'{i:04d}.png'
    with Image.open(p) as im:
        im.load()
        arr = np.array(im.convert('RGB'))
        assert im.size == (360, 640)
    records.append({'frame': f, 'file': str(p.relative_to(Q)), 'meanLuma': float(arr.mean() / 255), 'blackPixelFraction': float(np.mean(arr.max(2) < 8)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    # Compare each delivered-video sample with the same global Remotion frame.
    reference = next(s for s in samples if s['frame'] == f)
    with Image.open(Q / reference['file']) as im:
        expected = np.array(im.convert('RGB').resize((360,640), Image.Resampling.BICUBIC)).astype(float)
    delta = arr.astype(float) - expected
    records[-1]['referenceFrame'] = reference['file']
    records[-1]['referenceMeanAbsoluteError'] = float(np.abs(delta).mean())
    records[-1]['referencePSNR'] = float(10*np.log10(255**2 / max(1e-12,float((delta**2).mean()))))
checks['allShotSamplesDecoded'] = len(records) == len(selected)
checks['noBlankSamples'] = all(x['meanLuma'] > .015 for x in records)
checks['deliveredFramesMatchGlobalTimeline'] = all(x['referenceMeanAbsoluteError'] < 3 for x in records)
by_frame = {x['frame']: x for x in records}
shots = json.loads((P / 'storyboard/shot-manifest.json').read_text())['shots']
for page in range(6):
    sheet = Image.new('RGB', (1080, 3300), '#07111d')
    draw = ImageDraw.Draw(sheet)
    for row, shot in enumerate(shots[page*5:page*5+5]):
        for col, label in enumerate(('start','middle','end')):
            s = next(s for s in samples if s['shot'] == shot['id'] and s['label'] == label)
            p = Q / by_frame[s['frame']]['file']
            im = Image.open(p).convert('RGB')
            x, y = col*360, row*660
            draw.text((x+4,y+2), f"{shot['id']} {label} MP4 f{s['frame']}", fill='white')
            sheet.paste(im, (x,y+20))
    sheet.save(out / f'contact-{page+1}.jpg', quality=94)
report = {
    'status': 'PASS' if all(checks.values()) else 'FAIL',
    'file': str(video.relative_to(R)),
    'bytes': video.stat().st_size,
    'sha256': hashlib.sha256(video.read_bytes()).hexdigest(),
    'checks': checks,
    'metadata': {'codec': stream['codec_name'], 'profile': stream.get('profile'), 'pixelFormat': stream['pix_fmt'], 'width': stream['width'], 'height': stream['height'], 'fps': stream['avg_frame_rate'], 'readFrames': frames, 'durationSeconds': duration, 'colorSpace': stream.get('color_space')},
    'blackDetection': {'minimumDurationSeconds': .05, 'pixelThreshold': .02, 'pictureThreshold': .98, 'intervals': black},
    'freezeDetection': {'noiseThresholdDB': -60, 'minimumDurationSeconds': 3, 'intervals': freezes, 'scope': 'Detects near-identical frames at the documented FFmpeg threshold; not a measure of artistic motion quality.'},
    'decodedSamples': records,
    'audioQA': {'status': 'BLOCKED', 'reason': 'No approved actual narration recording is present. Review is intentionally silent.', 'audioStreamCount': len(audio), 'integratedLUFS': None, 'truePeakDBTP': None, 'clipping': 'NOT_TESTABLE', 'unexpectedSilence': 'NOT_TESTABLE', 'captionAlignment': 'NOT_TESTABLE', 'timingBasis': 'estimated_script_not_audio'},
    'publicationReady': False,
}
(Q / 'video-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k: report[k] for k in ('status','file','bytes','sha256','checks','metadata','blackDetection','freezeDetection')}, ensure_ascii=False, indent=2))
sys.exit(0 if report['status'] == 'PASS' else 1)
