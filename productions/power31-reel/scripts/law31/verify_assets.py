from pathlib import Path
from PIL import Image
import json,hashlib
r=Path(__file__).resolve().parents[2];rows=[]
for f in sorted((r/'public/law31-first-reel').glob('scene-*/manifest.json')):
 m=json.loads(f.read_text())
 for l in m['layers']:
  p=r/'public'/l['src']
  with Image.open(p) as im:im.verify()
  with Image.open(p) as im:im.load();assert list(im.size)==l['dimensions'];alpha=im.convert('RGBA').getchannel('A').getextrema()
  assert hashlib.sha256(p.read_bytes()).hexdigest()==l['sha256'],str(p)
  assert alpha==((255,255) if l['id'] in ['background','illustration'] else (0,255)),str(p)
  rows.append({'file':l['src'],'status':'PASS','alpha':alpha,'sha256':l['sha256']})
(r/'projects/law31-first-reel/qa/asset-preflight.json').write_text(json.dumps({'status':'PASS','decodedImages':len(rows),'images':rows},indent=2));print('PASS',len(rows),'decoded and verified PNGs')
