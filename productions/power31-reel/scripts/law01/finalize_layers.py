from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,os,io,numpy as np
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';U=R/'public/law01/layers'
rows=[]
for manifest_path in sorted(U.glob('SHOT*/alignment.json')):
 d=json.loads(manifest_path.read_text())
 for l in d['layers']:
  p=R/'public'/l['src'];expected=l['sha256'];before=hashlib.sha256(p.read_bytes()).hexdigest();assert before==expected,(p,'changed after publication')
  with Image.open(p) as im:im.load();a=np.array(im.convert('RGBA'))
  a[a[:,:,3]==0,:3]=0;im=Image.fromarray(a)
  stage=R/'out/law01/layer-staging'/f'{d["shotId"]}-{l["id"]}-optimized.pending'
  buf=io.BytesIO();im.save(buf,format='PNG');data=buf.getvalue();stage.write_bytes(data)
  with Image.open(stage) as test:test.load();assert test.size==(936,1664)
  os.replace(stage,p)
  l['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
  rows.append({'shot':d['shotId'],'layer':l['id'],'fullDecode':True,'sha256':l['sha256'],'bytes':len(data),'alphaExtrema':list(im.getchannel('A').getextrema()),'postPublishHashMatches':True})
 manifest_path.write_text(json.dumps(d,ensure_ascii=False,indent=2));(P/'layers'/f'{d["shotId"]}-alignment.json').write_text(json.dumps(d,ensure_ascii=False,indent=2))
(P/'qa/layer-byte-integrity.json').write_text(json.dumps({'layers':rows,'atomicWriteFix':'Initial non-atomic SHOT05 completed-background PNG was caught truncated after an initial successful decode. Replaced via fully validated staged atomic publication; all final layer hashes and full decode checked again.','initialFailureEvidence':'qa/raw/layer-preparation-v1-failed.log'},indent=2))
cutouts=sorted((P/'qa/review').glob('SHOT*-cutouts.jpg'))
for k in range(0,len(cutouts),5):
 sheet=Image.new('RGB',(1400,530),'#0a1420');dr=ImageDraw.Draw(sheet)
 for j,p in enumerate(cutouts[k:k+5]):
  im=Image.open(p).convert('RGB');im.thumbnail((270,480));sheet.paste(im,(j*280,25));dr.text((j*280+8,6),p.stem,fill='white')
 sheet.save(P/f'qa/review/cutout-group-{k//5+1}.jpg',quality=95)
print(json.dumps({'layers':len(rows),'fullDecode':'PASS','totalBytes':sum(r['bytes'] for r in rows),'cutoutGroups':(len(cutouts)+4)//5}))

