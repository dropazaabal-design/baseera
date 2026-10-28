"""Manual matting of approved AI art, separate from frame rendering. No AI weights."""
from pathlib import Path
import hashlib,json,os,shutil
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFilter
R=Path(__file__).resolve().parents[2];P=R/'projects/law31-first-reel';A=P/'generated-images';U=R/'public/law31-first-reel'
cv2.setNumThreads(2)
def load(f,size=None):
 im=Image.open(A/f).convert('RGBA')
 return im.resize(size,Image.Resampling.LANCZOS) if size and im.size!=size else im
def plate(im,poly,blur=2):
 mask=Image.new('L',im.size);ImageDraw.Draw(mask).polygon(poly,fill=255)
 out=im.copy();out.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)));return out
def actor(im,poly,ellipses=(),seeds=()):
 # Cropped GrabCut keeps preprocessing light; all output remains full-canvas aligned.
 x0=max(0,min(x for x,y in poly)-3);y0=max(0,min(y for x,y in poly)-3)
 x1=min(im.width,max(x for x,y in poly)+4);y1=min(im.height,max(y for x,y in poly)+4)
 rgb=np.array(im.convert('RGB').crop((x0,y0,x1,y1)));m=np.zeros(rgb.shape[:2],np.uint8)
 cv2.fillPoly(m,[np.array([(x-x0,y-y0) for x,y in poly],np.int32)],cv2.GC_PR_FGD)
 for x,y,rx,ry in ellipses:cv2.ellipse(m,(x-x0,y-y0),(rx,ry),0,0,360,cv2.GC_FGD,-1)
 for pts in seeds:cv2.fillPoly(m,[np.array([(x-x0,y-y0) for x,y in pts],np.int32)],cv2.GC_FGD)
 cv2.setRNGSeed(5821);cv2.grabCut(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),m,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),5,cv2.GC_INIT_WITH_MASK)
 binary=np.where((m==1)|(m==3),255,0).astype('uint8');contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 filled=np.zeros_like(binary)
 for c in contours:
  if cv2.contourArea(c)>12:cv2.drawContours(filled,[c],-1,255,-1)
 alpha=Image.new('L',im.size);alpha.paste(Image.fromarray(cv2.GaussianBlur(filled,(3,3),.4)),(x0,y0))
 out=im.copy();out.putalpha(alpha);return out
def write(n,items,depths,mode='TRUE_SEPARATE_PLANES',notes=None):
 folder=U/f'scene-{n:02d}';folder.mkdir(parents=True,exist_ok=True);layers=[];comp=None
 for name,im in items:
  staging=R/'out/layer-staging';staging.mkdir(parents=True,exist_ok=True)
  pending=staging/f'{n:02d}-{name}.pending';target=folder/(name+'.png');im.save(pending,format='PNG')
  with Image.open(pending) as test:test.verify()
  os.replace(pending,target)
  if comp is None:comp=im.copy()
  else:comp.alpha_composite(im)
  d=depths[name];layers.append({'id':name,'src':f'law31-first-reel/scene-{n:02d}/{name}.png','depth':d,'scale':round(1/(1+d*.035),8),'dimensions':list(im.size),'alphaExtrema':list(im.getchannel('A').getextrema()),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 m={'sceneId':f'scene-{n:02d}','mode':mode,'canvas':list(items[0][1].size),'coordinateSystem':'Full source canvas, depth scaling compensated at rest','segmentation':'Manual masks + OpenCV GrabCut; no SAM/depth model' if len(items)>1 else 'Not applied','notes':notes or [],'layers':layers}
 (folder/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));dst=P/'layers'/m['sceneId'];dst.mkdir(parents=True,exist_ok=True);shutil.copy2(folder/'manifest.json',dst/'manifest.json');comp.convert('RGB').resize((470,836)).save(P/'qa'/f'scene-{n:02d}-composite.jpg',quality=94)
 print(n,mode,len(layers),flush=True)
def main():
 # Corrected transparent hero, cleaned low-alpha halo, proportion-preserving registration.
 hero=load('scene-01-hero-v2.png');a=np.array(hero.getchannel('A'));a=np.clip((a.astype(float)-100)*255/145,0,255).astype('uint8');hero.putalpha(Image.fromarray(a));yy,xx=np.where(a>200);hero=hero.crop((xx.min(),yy.min(),xx.max()+1,yy.max()+1));hero.thumbnail((190,453),Image.Resampling.LANCZOS);aligned=Image.new('RGBA',(941,1672));aligned.alpha_composite(hero,(380,1208-hero.height))
 im=load('scene-01-clean-v1.png');left=plate(im,[(92,897),(99,450),(112,392),(143,350),(191,319),(250,302),(305,308),(357,340),(393,391),(417,443),(423,897)],3);right=plate(im,[(513,898),(514,443),(536,386),(574,340),(621,311),(676,300),(729,314),(779,346),(814,395),(838,449),(844,899)],3)
 write(1,[('background',load('scene-01-empty-v1.png')),('left-door',left),('right-door',right),('main-character',aligned)],{'background':-1,'left-door':0,'right-door':.35,'main-character':2})
 im=load('scene-03-master-v1.png');poly=[(22,355),(95,325),(174,280),(270,255),(310,236),(367,239),(360,250),(360,78),(580,78),(580,254),(610,244),(680,271),(758,304),(921,365),(921,455),(832,428),(783,403),(762,457),(734,455),(725,431),(700,437),(683,422),(648,423),(606,427),(585,423),(577,531),(351,531),(344,433),(317,419),(276,419),(236,420),(197,425),(178,405),(120,433),(20,458)]
 giant=actor(im,poly,[(470,184,97,97)],[[(412,275),(533,275),(550,510),(400,510)],[(45,382),(199,302),(320,263),(375,274),(349,300),(176,350),(65,420)],[(566,274),(622,261),(745,306),(899,385),(875,424),(742,357),(606,306)]])
 alpha=np.array(giant.getchannel('A')).astype(float);alpha*=np.clip((500-np.arange(im.height))/90,0,1)[:,None];giant.putalpha(Image.fromarray(alpha.astype('uint8')))
 mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
 for p,q in [((203,402),(168,660)),((249,401),(210,660)),((300,390),(319,617)),((349,381),(397,654)),((613,402),(558,647)),((652,411),(636,618)),((706,416),(699,646)),((747,438),(775,652))]:d.line([p,q],fill=255,width=20)
 a=np.array(im);s=np.array(mask)*((a[:,:,1]>120)&(a[:,:,2]>170)&(a[:,:,2]>a[:,:,0]));s[:400]=0;s[670:]=0;strings=im.copy();strings.putalpha(Image.fromarray(cv2.GaussianBlur(s,(3,3),.35)))
 clean=load('scene-03-clean-v1.png',im.size);left=plate(clean,[(152,1123),(156,767),(171,704),(204,657),(256,626),(303,616),(354,629),(399,660),(427,711),(441,771),(442,1126)],3);right=plate(clean,[(500,1126),(500,766),(516,710),(549,661),(594,630),(639,617),(688,628),(736,659),(767,709),(784,769),(787,1127)],3)
 hero=actor(im,[(378,1354),(389,1263),(413,1167),(393,1222),(384,1217),(389,1180),(410,1118),(421,1104),(413,1089),(414,1058),(438,1032),(469,1030),(486,1049),(494,1072),(489,1095),(476,1110),(490,1127),(504,1176),(515,1206),(512,1226),(498,1228),(492,1210),(480,1179),(498,1266),(512,1333),(532,1340),(530,1356),(489,1361),(478,1336),(452,1247),(420,1327),(414,1356)],[(454,1068,27,26)],[[(435,1117),(466,1119),(478,1192),(426,1192)],[(432,1190),(447,1213),(411,1339),(394,1339)],[(457,1190),(473,1189),(502,1338),(490,1346)]])
 write(3,[('background',load('scene-03-empty-v1.png',im.size)),('puppet-master',giant),('left-door',left),('right-door',right),('strings',strings),('main-character',hero)],{'background':-.6,'puppet-master':0,'left-door':0,'right-door':0,'strings':0,'main-character':1.7},notes=['Strings, hands and doors share depth to retain attachment.','A provider cutout edit was rejected; local matting of approved art used instead.'])
 im=load('scene-05-master-v1.png');hero=actor(im,[(82,1143),(88,1106),(106,1009),(124,907),(113,894),(111,872),(116,808),(126,738),(138,675),(161,649),(145,619),(142,582),(155,550),(182,527),(220,521),(257,539),(278,572),(277,608),(260,632),(235,646),(216,648),(226,685),(237,754),(249,829),(257,870),(250,896),(233,896),(219,871),(218,838),(208,793),(210,892),(218,1016),(231,1110),(266,1126),(264,1145),(171,1149),(175,1115),(174,1035),(169,934),(143,1031),(137,1109),(163,1120),(158,1143)],[(210,586,48,46)],[[(156,664),(194,660),(206,786),(191,851),(148,841)],[(143,841),(160,853),(129,1117),(105,1117)],[(176,853),(198,853),(211,1124),(188,1125)]])
 desk=actor(im,[(235,1142),(237,887),(261,839),(288,833),(291,788),(396,781),(425,783),(435,773),(435,753),(463,724),(504,711),(530,707),(565,690),(610,666),(630,658),(634,607),(648,600),(679,599),(682,579),(707,559),(744,556),(779,570),(800,591),(807,612),(840,600),(896,600),(916,612),(917,800),(940,816),(940,1144)],[(735,620,46,48)],[[(685,681),(781,673),(839,739),(856,812),(641,812)],[(261,861),(939,861),(939,1112),(261,1112)],[(654,618),(674,622),(673,796),(642,794)],[(842,625),(899,623),(902,798),(873,801)]])
 write(5,[('background',load('scene-05-clean-v1.png')),('desk-and-manager',desk),('main-character',hero)],{'background':-1,'desk-and-manager':0,'main-character':1.5})
 im=load('scene-11-master-v1.png');hero=actor(im,[(210,1225),(213,1165),(246,1065),(265,1012),(221,1035),(215,1010),(228,976),(246,935),(264,893),(286,860),(272,835),(272,788),(290,762),(320,747),(354,748),(383,770),(396,802),(391,833),(371,850),(357,858),(370,884),(379,930),(391,982),(403,1011),(397,1043),(376,1050),(357,1022),(355,1082),(363,1178),(400,1193),(399,1219),(326,1225),(316,1174),(315,1083),(282,1153),(269,1186),(262,1207),(245,1217)],[(334,800,40,39)],[[(300,864),(343,864),(351,954),(283,972)],[(282,973),(304,983),(251,1181),(226,1181)],[(317,974),(336,974),(344,1190),(327,1190)],[(280,888),(291,895),(257,981),(241,1008),(231,1008)],[(350,882),(360,893),(380,1005),(374,1018),(364,982)]])
 write(11,[('background',load('scene-11-clean-v1.png')),('main-character',hero)],{'background':-1,'main-character':1.7},notes=['Third passage revealed by reframing; no claim of simulated door geometry.'])
 for n in [2,4,6,7,8,9,10,12]:write(n,[('illustration',load(f'scene-{n:02d}-master-v1.png'))],{'illustration':0},'SINGLE_ILLUSTRATED_PLANE',['Camera motion only; not multilayer parallax.'])
if __name__=='__main__':main()
