from pathlib import Path
import json
import cv2
from PIL import Image,ImageDraw
cv2.setNumThreads(2)
p=Path(__file__).resolve().parents[2]/'projects/law31-first-reel';q=p/'qa';d=q/'mp4-frames';d.mkdir(exist_ok=True)
cap=cv2.VideoCapture(str(p/'renders/Law31-Visual-Review-1080x1920-60fps.mp4'));assert cap.isOpened()
assert int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))==1080 and int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))==1920
assert abs(cap.get(cv2.CAP_PROP_FPS)-60)<.001
samples=json.loads((q/'frame-samples.json').read_text())['samples']
for s in samples:
 cap.set(cv2.CAP_PROP_POS_FRAMES,s['frame']);ok,frame=cap.read();assert ok,s
 Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)).save(d/f"{s['scene']}-{s['label']}.jpg",quality=94)
cap.release()
for page in range(4):
 out=Image.new('RGB',(972,1800),'#162230');draw=ImageDraw.Draw(out)
 for row,n in enumerate(range(page*3+1,page*3+4)):
  for col,label in enumerate(['start','middle','end']):
   im=Image.open(d/f'scene-{n:02d}-{label}.jpg');im.thumbnail((324,576));out.paste(im,(col*324,row*600+24));draw.text((col*324+5,row*600+5),f'{n:02d} {label} MP4',fill='white')
 out.save(q/f'mp4-review-board-{page+1}.jpg',quality=92)
trans=Image.new('RGB',(324*5,600),'#162230');draw=ImageDraw.Draw(trans)
for j,n in enumerate([4,6,8,10,12]):
 im=Image.open(d/f'scene-{n:02d}-transition.jpg');im.thumbnail((324,576));trans.paste(im,(324*j,24));draw.text((j*324+5,5),f'Transition into {n:02d}',fill='white')
trans.save(q/'mp4-transitions.jpg',quality=92)
(q/'mp4-samples.json').write_text(json.dumps({'status':'PASS_EXTRACTION','samples':len(samples),'fps':60,'resolution':[1080,1920]},indent=2));print('Extracted',len(samples),'actual MP4 samples')
