"""Local non-generative layer prep, adapted from existing Law31 GrabCut workflow.
Preserves internal holes (the legacy external-contour fill did not), emits aligned
full-canvas RGBA and opaque completed plates. No source plate is overwritten."""
from pathlib import Path
import cv2,numpy as np,json,hashlib,subprocess,os,io,sys
from PIL import Image,ImageDraw,ImageFilter,ImageChops
cv2.setNumThreads(2)
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';U=R/'public/law01'
plan=json.loads((P/'layers/layer-plan.json').read_text())
refinements=json.loads((P/'layers/mask-refinements.json').read_text())
def refine_mask(im,mask,a,correction):
 m=np.array(mask)
 if correction.get('darkRefine'):
  spec=correction['darkRefine'];rgb=np.array(im.convert('RGB'));dark=np.uint8(rgb.mean(2)<spec['threshold'])*255
  dark=cv2.dilate(dark,np.ones((3,3),np.uint8))
  dark[:spec['fromY']]=255
  for x,y,w,h in correction.get('preserveBrightRects',[]):dark[y:y+h,x:x+w]=255
  for cx,cy,r in a.get('heads',[]):cv2.circle(dark,(cx,cy),round(r*1.35),255,-1)
  m=np.minimum(m,dark)
 clip=correction.get('clipPolygon')
 if clip:
  c=np.zeros_like(m);cv2.fillPoly(c,[np.array(clip,np.int32)],255)
  for cx,cy,r in a.get('heads',[]):cv2.circle(c,(cx,cy),round(r*1.5),255,-1)
  for poly in correction.get('keepPolygons',[]):cv2.fillPoly(c,[np.array(poly,np.int32)],255)
  m=np.minimum(m,c)
 if correction.get('rightClip'):
  rc=correction['rightClip'];c=np.zeros_like(m);cv2.fillPoly(c,[np.array(rc['polygon'],np.int32)],255);c[:,:rc['fromX']]=255;m=np.minimum(m,c)
 for x,y,w,h in correction.get('subtractRects',[]):m[y:y+h,x:x+w]=0
 for poly in correction.get('keepPolygons',[]):cv2.fillPoly(m,[np.array(poly,np.int32)],255)
 return Image.fromarray(cv2.GaussianBlur(m,(3,3),.3))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def actor_mask(im,a):
 x,y,w,h=a['rect'];rgb=np.array(im.convert('RGB').crop((x,y,x+w,y+h)))
 m=np.zeros((h,w),np.uint8);m[2:h-2,2:w-2]=cv2.GC_PR_FGD
 for cx,cy,r in a.get('heads',[]):cv2.circle(m,(cx-x,cy-y),r,cv2.GC_FGD,-1)
 for sx,sy,sw,sh in a.get('seeds',[]):
  m[max(1,sy-y):min(h-1,sy-y+sh),max(1,sx-x):min(w-1,sx-x+sw)]=cv2.GC_FGD
 cv2.setRNGSeed(1001)
 cv2.grabCut(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),m,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
 fg=np.uint8((m==cv2.GC_FGD)|(m==cv2.GC_PR_FGD))
 # Keep only foreground components touching authored positive seeds.
 count,labels,stats,_=cv2.connectedComponentsWithStats(fg,8)
 good=set(np.unique(labels[m==cv2.GC_FGD]));good.discard(0)
 fg=np.uint8(np.isin(labels,list(good)))*255
 # White eye highlights are retained because the full inner head is a sure seed.
 full=np.zeros((im.height,im.width),np.uint8);full[y:y+h,x:x+w]=fg
 return Image.fromarray(cv2.GaussianBlur(full,(3,3),.38))
def complete(im,mask):
 rgb=np.array(im.convert('RGB'));m=np.uint8(np.array(mask)>5)*255
 # Remove antialiased outline plus its halo before local hidden-area repair.
 m=cv2.dilate(m,np.ones((13,13),np.uint8),iterations=1)
 result=cv2.inpaint(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),m,5,cv2.INPAINT_TELEA)
 return Image.fromarray(cv2.cvtColor(result,cv2.COLOR_BGR2RGB)).convert('RGBA')
def terrain(im,split):
 alpha=np.clip((np.arange(im.height)-split+35)/70,0,1)
 a=np.tile(np.uint8(alpha[:,None]*255),(1,im.width))
 layer=im.copy();layer.putalpha(Image.fromarray(a))
 # Fully opaque continuation behind this occluder, only edge strips can reveal.
 bg=np.array(im.convert('RGB'));sample=bg[max(0,split-40):split]
 for y in range(split,im.height):bg[y]=sample[(y-split)%len(sample)]
 return Image.fromarray(bg).convert('RGBA'),layer
def remove_eyes(base,heads):
 arr=np.array(base);alpha=np.zeros(arr.shape[:2],np.uint8);yy,xx=np.indices(alpha.shape)
 for cx,cy,r in heads:
  disk=(xx-cx)**2+(yy-cy)**2<(r*.77)**2
  bright=(arr[:,:,:3].mean(2)>155)&disk&(arr[:,:,3]>240)
  n,l,stats,_=cv2.connectedComponentsWithStats(bright.astype(np.uint8),8)
  accepted=np.zeros_like(bright)
  for k in range(1,n):
   sx,sy,w,h,area=stats[k]
   if 3<=area<=max(700,r*r*.16) and w>=h*.75:accepted|=l==k
  if accepted.sum():
   alpha[accepted]=255
   dark=arr[:,:,:3][disk & (arr[:,:,:3].max(2)<35)]
   color=np.median(dark,axis=0).astype(np.uint8) if len(dark) else np.array([1,2,3],np.uint8)
   arr[:,:,:3][accepted]=color
 eye=base.copy();eye.putalpha(Image.fromarray(alpha))
 return Image.fromarray(arr),eye, int((alpha>0).sum())
def layer_row(folder,name,im,depth,role,pivot=None,group=None):
 arr=np.array(im);arr[arr[:,:,3]==0,:3]=0;im=Image.fromarray(arr)
 p=folder/(name+'.png')
 staging=R/'out/law01/layer-staging';staging.mkdir(parents=True,exist_ok=True)
 pending=staging/(folder.name+'-'+name+'.pending')
 buf=io.BytesIO();im.save(buf,format='PNG');payload=buf.getvalue()
 assert payload.endswith(b'\x00\x00\x00\x00IEND\xaeB`\x82')
 pending.write_bytes(payload)
 with Image.open(pending) as t:t.load();assert t.size==(936,1664)
 os.replace(pending,p)
 assert p.read_bytes()==payload
 with Image.open(p) as t:t.load();assert t.size==(936,1664)
 row={'id':name,'src':str(p.relative_to(R/'public')),'depth':depth,'scale':1/(1+depth*.035),'role':role,'width':im.width,'height':im.height,'alphaExtrema':list(im.getchannel('A').getextrema()),'sha256':sha(p)}
 if pivot:row['pivot']=pivot
 if group:row['motionGroup']=group
 return row
def main():
 only=set(sys.argv[1:]);prior={}
 if only:
  prior={x['shotId']:x for x in json.loads((P/'qa/layer-validation-report.json').read_text())['shots']}
 summary=[]
 for i in range(1,31):
  sid=f'SHOT{i:02d}'
  if only and sid not in only:summary.append(prior[sid]);continue
  im=Image.open(U/'originals'/(sid+'.png')).convert('RGBA');spec=plan['shots'].get(sid,{})
  folder=U/'layers'/sid;folder.mkdir(parents=True,exist_ok=True)
  current=im.copy();actors=[];union=Image.new('L',im.size)
  for a in spec.get('actors',[]):
   mask=refine_mask(im,actor_mask(im,a),a,refinements.get(sid,{}));actor=im.copy();actor.putalpha(mask);actors.append((a,actor));union=ImageChops.lighter(union,mask)
  if actors:current=complete(im,union)
  # Additional free stone fragment has a dark-void background: authored polygon.
  frag=None
  if spec.get('foreground'):
   f=spec['foreground'];mask=Image.new('L',im.size);ImageDraw.Draw(mask).polygon(f['polygon'],fill=255);mask=mask.filter(ImageFilter.GaussianBlur(.45))
   frag=im.copy();frag.putalpha(mask);current=complete(current,mask)
  # Eyes are independently moved inside their unchanged black heads, not fake parallax.
  heads=plan['eyeHeads'].get(sid,[])
  if actors:
   heads=[h for h in heads if union.getpixel((h[0],h[1]))<128]
  eye_pieces=[];current,current_eyes,cnt=remove_eyes(current,heads)
  if cnt:eye_pieces.append(('background-eyes',current_eyes,0,None,None))
  newactors=[]
  for a,actor in actors:
   actor,eye,cnt=remove_eyes(actor,a.get('heads',[]))
   newactors.append((a,actor))
   if cnt:eye_pieces.append((a['id']+'-eyes',eye,1.2,a['pivot'],a['id']))
  actors=newactors
  layers=[]
  if spec.get('terrain'):
   bg,ground=terrain(current,spec['terrain']['split'])
   layers.append(layer_row(folder,'background',bg,-.6,'completed-background'))
   layers.append(layer_row(folder,spec['terrain']['id'],ground,spec['terrain']['depth'],'foreground-terrain'))
  else:layers.append(layer_row(folder,'background',current,-.6 if actors else 0,'completed-background' if actors else 'single-illustrated-plane'))
  for a,actor in actors:
   layers.append(layer_row(folder,a['id'],actor,1.2,'character-group',a['pivot'],a['id']))
  if frag:layers.append(layer_row(folder,spec['foreground']['id'],frag,spec['foreground']['depth'],'falling-fragment',[700,905],spec['foreground']['id']))
  for name,eye,depth,pivot,group in eye_pieces:layers.append(layer_row(folder,name,eye,depth,'eye-expression',pivot,group))
  mode='MULTILAYER_2_5D' if actors or spec.get('terrain') or frag else ('ILLUSTRATED_PLANE_WITH_EYE_ANIMATION' if eye_pieces else 'SINGLE_ILLUSTRATED_PLANE')
  manifest={'shotId':sid,'mode':mode,'canvas':[936,1664],'original':f'law01/originals/{sid}.png','source_sha256':sha(U/'originals'/(sid+'.png')),'coordinateSystem':'full source canvas; engine depth scale is compensated at rest','backgroundCompletion':'Local OpenCV Telea inpainting with expanded mask, no generative model; hidden regions reviewed for the bounded camera path' if actors or frag else ('Local edge-texture continuation behind opaque foreground terrain' if spec.get('terrain') else 'not needed'),'segmentation':'authored ROI/seeds + deterministic GrabCut; internal holes retained','layers':layers,'actions':[a['action'] for a in spec.get('actors',[])]}
  (folder/'alignment.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
  (P/'layers'/f'{sid}-alignment.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
  # Recompose at rest to measure alignment independent of camera.
  comp=Image.new('RGBA',im.size)
  for l in sorted(layers,key=lambda x:x['depth']):comp.alpha_composite(Image.open(R/'public'/l['src']).convert('RGBA'))
  arr=np.abs(np.array(comp.convert('RGB')).astype(float)-np.array(im.convert('RGB')).astype(float))
  q={'shotId':sid,'mode':mode,'layers':len(layers),'recompositionMAE':round(float(arr.mean()),4),'recompositionP99':round(float(np.percentile(arr,99)),3),'backgroundOpaque':layers[0]['alphaExtrema']==[255,255],'aligned':all(l['width']==936 and l['height']==1664 for l in layers),'alphaVerified':all(l['alphaExtrema']==[0,255] for l in layers[1:]),'sourcePreserved':sha(U/'originals'/(sid+'.png'))==manifest['source_sha256']}
  comp.convert('RGB').resize((468,832)).save(P/'qa/review'/f'{sid}-composite.jpg',quality=94)
  # Checker preview of separated actors reveals halo/background leakage.
  if actors:
   checker=Image.new('RGBA',im.size,(51,64,76,255));dr=ImageDraw.Draw(checker)
   for y in range(0,im.height,48):
    for x in range(0,im.width,48):
     if (x//48+y//48)%2:dr.rectangle((x,y,x+47,y+47),fill=(92,104,118,255))
   for a,actor in actors:checker.alpha_composite(actor)
   checker.convert('RGB').resize((468,832)).save(P/'qa/review'/f'{sid}-cutouts.jpg',quality=94)
  summary.append(q);print(json.dumps(q),flush=True)
 (P/'qa/layer-validation-report.json').write_text(json.dumps({'shots':summary,'method':'CPU deterministic manual-seeded GrabCut and local hidden-area repair; not AI depth or articulated 3D','scope':'Recomposition/alpha and dimensions measured; motion occlusion review is recorded separately.'},indent=2))
 if any(q['recompositionMAE']>2 for q in summary):print('REVIEW: inspect recomposition differences above 2.0')
if __name__=='__main__':main()

