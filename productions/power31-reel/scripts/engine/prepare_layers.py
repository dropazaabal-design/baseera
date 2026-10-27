"""Offline manual segmentation. No model download, no rendering-time processing."""
import argparse,json
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('output');p.add_argument('--background');p.add_argument('--regions',help='JSON list of id, box [l,t,r,b], depth, optional grayscale mask');a=p.parse_args()
im=Image.open(a.image).convert('RGBA');out=Path(a.output);out.mkdir(parents=True,exist_ok=False)
regions=json.loads(Path(a.regions).read_text()) if a.regions else []
manifest={'mode':'manual' if regions else 'flat','width':im.width,'height':im.height,'layers':[],'limitations':'No semantic segmentation or inferred depth. Regions/masks supplied by editor. Background holes require a clean plate; no generative inpainting.'}
if not regions:regions=[{'id':'flat-image','box':[0,0,im.width,im.height],'depth':0}]
if a.background:
 bg=Image.open(a.background).convert('RGBA');assert bg.size==im.size;bg.save(out/'background.png');manifest['layers'].append({'id':'background','src':'background.png','depth':-2})
for r in regions:
 name=r['id'];assert name.replace('-','').replace('_','').isalnum()
 box=r['box'];assert 0<=box[0]<box[2]<=im.width and 0<=box[1]<box[3]<=im.height
 mask=Image.new('L',im.size);mask.paste(255,box)
 if r.get('mask'):mask=ImageChops.multiply(mask,Image.open(r['mask']).convert('L').resize(im.size))
 mask=ImageChops.multiply(mask,im.getchannel('A'));layer=im.copy();layer.putalpha(mask);layer.save(out/(name+'.png'))
 manifest['layers'].append({'id':name,'src':name+'.png','depth':r.get('depth',0),'x':r.get('x',0),'y':r.get('y',0),'scale':r.get('scale',1)})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print(out/'manifest.json')
