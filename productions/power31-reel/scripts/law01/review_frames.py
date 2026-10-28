"""Verify rendered frame pixels and make QA-only contact sheets."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib,numpy as np
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';Q=P/'qa'
data=json.loads((Q/'frame-samples.json').read_text());samples=data['samples']
records=[]
for s in samples:
 p=Q/s['file']
 with Image.open(p) as im:im.load();a=np.array(im.convert('RGB'));assert im.size==(1080,1920)
 records.append({**s,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'fullDecode':True,'meanLuma':float(a.mean()/255),'blackPixelFraction':float(np.mean(a.max(2)<8))})
for n in range(6):
 sheet=Image.new('RGB',(990,2990),'#07111d');dr=ImageDraw.Draw(sheet)
 shots=[]
 for s in samples:
  if s['shot'] not in shots:shots.append(s['shot'])
 for row,sid in enumerate(shots[n*5:n*5+5]):
  for col,label in enumerate(['start','middle','end']):
   record=next(s for s in samples if s['shot']==sid and s['label']==label)
   im=Image.open(Q/record['file']).convert('RGB');im.thumbnail((326,580))
   x=col*330;y=row*598;sheet.paste(im,(x,y+17));dr.text((x+4,y+2),f'{sid} {label} f{record["frame"]}',fill='white')
 sheet.save(Q/f'review/timeline-{n+1}.jpg',quality=95)
a=np.array(Image.open(Q/'preview-SHOT19.png').convert('RGBA'))
b=np.array(Image.open(Q/'assembly-SHOT19-frame60.png').convert('RGBA'))
preview={'pixelEqual':bool(np.array_equal(a,b)),'maximumChannelDifference':int(np.abs(a.astype(int)-b.astype(int)).max()),'previewFrame':60,'assemblySource':'assembly-SHOT19-frame60.png'}
assert preview['pixelEqual']
font=ImageFont.truetype(str(R/'public/law01/fonts/Cairo.ttf'),54)
cues=json.loads((R/'public/law01/subtitles/visual-review-estimated.json').read_text())
widths=[{'text':c['text'],'width':font.getlength(c['text'],direction='rtl')} for c in cues]
result={'frames':records,'browserErrors':data['errors'],'standalonePreviewComparison':preview,'captionMeasurements':{'maxUnwrappedWidth':max(x['width'] for x in widths),'availableTextWidth':888,'font':'Cairo 54px','scope':'Font width measurement plus browser-rendered frame review; actual audio alignment not available.'},'noBlankSamples':all(x['meanLuma']>.015 for x in records)}
(Q/'render-frame-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'samples':len(records),'previewPixelsEqual':preview['pixelEqual'],'noBlankSamples':result['noBlankSamples'],'maxCaptionWidth':result['captionMeasurements']['maxUnwrappedWidth']}))

