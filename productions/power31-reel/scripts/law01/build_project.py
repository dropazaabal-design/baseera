"""Build exact frame timeline and estimated review cues; never claims audio alignment."""
from pathlib import Path
import json,re,unicodedata,hashlib
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic'
def norm(s):return re.sub(r'[^\w]+','',unicodedata.normalize('NFKD',s),flags=re.UNICODE)
def stamp(t):
 n=round(t*1000);h,n=divmod(n,3600000);m,n=divmod(n,60000);s,ms=divmod(n,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
def caption_text(s):
 for a,b in [('ألف وستمية وواحد وستين','1661'),('سبعتعش أغسطس','17 أغسطس'),('خمسة سبتمبر','5 سبتمبر'),('ثمانية وأربعين','48')]:s=s.replace(a,b)
 return s
def split_caption(s):
 words=caption_text(s).split();groups=[];g=[]
 for w in words:
  if g and (len(' '.join(g+[w]))>39 or len(g)>=6):groups.append(' '.join(g));g=[]
  g.append(w)
 if g:groups.append(' '.join(g))
 return groups
def camera(preset,dur,sid):
 # Portrait-safe overrides reuse the five existing Baseera camera presets.
 a={'x':800,'y':1100,'zoom':1.015,'rotation':0};b=dict(a)
 if preset=='slowPush':a.update(x=797,zoom=1.0);b.update(x=803,zoom=1.045)
 elif preset=='pullBack':a.update(x=803,zoom=1.055);b.update(x=797,zoom=.985)
 elif preset=='panLeft':a['x']=819;b['x']=788
 elif preset=='driftRight':a['x']=785;b['x']=812
 elif preset=='tiltReveal':a['y']=1130;b['y']=1085
 if sid=='SHOT14':a.update(x=800,y=1130,zoom=1.025);b.update(x=800,y=1100,zoom=1.02)
 if sid=='SHOT15':a.update(x=800,y=1100,zoom=1.02);b.update(x=809,y=1092,zoom=1.02)
 if sid in ['SHOT25','SHOT28']:a.update(x=800,zoom=1.08 if sid=='SHOT25' else .965);b.update(x=800,zoom=.965)
 if sid=='SHOT24':a.update(x=800,y=1100,zoom=1.0);b.update(x=785,y=1096,zoom=1.025)
 if sid=='SHOT18':a.update(x=790,zoom=1.015);b.update(x=805,zoom=1.015)
 if sid=='SHOT30':a.update(x=803,y=1100,zoom=1.025);b.update(x=800,y=1090,zoom=.99)
 return {'keys':[dict(frame=0,**a),dict(frame=dur-1,**b)]}
def main():
 plan=json.loads((P/'storyboard/directing-plan.json').read_text());rows=plan['rows']
 script=(P/'script/narration-approved.txt').read_text()
 assert norm(' '.join(r[3] for r in rows))==norm(script),'Narration differs from approved source'
 frames=0;shots=[];cues=[];srt=[];segments=[]
 for n,segment,seconds,narration,action,preset,transition,char_action in rows:
  sid=f'SHOT{n:02d}';dur=round(seconds*60);start=frames;frames+=dur
  layer_manifest=json.loads((R/'public/law01/layers'/sid/'alignment.json').read_text())
  layers=layer_manifest['layers']
  for l in layers:
   if l.get('motionGroup'):
    # Same group transform is shared by body and eyes so attachment cannot drift.
    dx=-7.0 if sid=='SHOT03' else (-2.0 if sid=='SHOT09' else 1.4)
    dy=-2.0 if sid=='SHOT01' else (2 if sid=='SHOT10' else -.8)
    rot={'SHOT01':-.7,'SHOT02':.8,'SHOT03':-1.2,'SHOT08':.32,'SHOT09':-.15,'SHOT14':.45,'SHOT15':.25,'SHOT16':.5,'SHOT17':-1.1,'SHOT24':.6,'SHOT29':-.5,'SHOT30':.18}.get(sid,.3)
    l['motion']={'group':l['motionGroup'],'pivot':l.get('pivot',[468,1200]),'keys':[{'frame':0,'x':0,'y':0,'rotation':0},{'frame':max(1,round((dur-1)*.55)),'x':dx,'y':dy,'rotation':rot},{'frame':dur-1,'x':dx*.35,'y':dy*.3,'rotation':rot*.3}]}
   if l['role']=='eye-expression':
    l['eyeAnimation']={'gazePixels':1.5 if sid not in ['SHOT18','SHOT19'] else 1.0,'blinkAt':round(dur*.62),'blinkFrames':7}
   if l['role']=='falling-fragment':
    l['motion']={'group':'falling-fragment','pivot':[700,905],'keys':[{'frame':0,'x':0,'y':0,'rotation':0},{'frame':dur-1,'x':4,'y':18,'rotation':1.5}]}
  top=n in [2,3,8,20,21,22,29,30]
  shot={'id':sid,'segment':segment,'title':action,'imagePath':f'law01/originals/{sid}.png','duration':dur/60,'durationInFrames':dur,'startFrame':start,'endFrame':frames,'lastVisibleFrame':frames-1,'narrationStart':start/60,'narrationEnd':frames/60,'narration':narration,'timingBasis':'estimated_script_not_audio','preset':preset,'camera':camera(preset,dur,sid),'parallax':1,'layers':layers,'layerMode':layer_manifest['mode'],'visualAction':action,'characterMovement':char_action,'transition':{'type':transition,'frames':12 if transition in ['calm-dissolve','dawn-lift'] else (10 if transition in ['evidence-wipe','shared-reveal','shadow-reveal'] else 0)},'captionAnchor':'top' if top else 'bottom','narrativePurpose':action,'attentionLight':'shared-team' if n==25 else ('lantern-ground' if n in [29,30] else ('authority-reveal' if n in [2,14] else None))}
  shots.append(shot)
  groups=split_caption(narration);weights=[max(5,len(g)) for g in groups];weight=sum(weights);elapsed=0
  for i,(text,w) in enumerate(zip(groups,weights)):
   a=start/60+(dur/60)*elapsed/weight;elapsed+=w;b=start/60+(dur/60)*elapsed/weight
   cues.append({'text':text,'startMs':round(a*1000),'endMs':round(b*1000),'timestampMs':None,'confidence':None,'shotId':sid,'timingBasis':'estimated_script_not_audio'})
   srt.append(f'{len(srt)+1}\n{stamp(a)} --> {stamp(b)}\n{text}\n')
 assert frames==5760 and len(shots)==30
 for seg in range(1,11):
  ss=[s for s in shots if s['segment']==seg];segments.append({'id':seg,'shotIds':[s['id'] for s in ss],'startFrame':ss[0]['startFrame'],'endFrame':ss[-1]['endFrame']})
 project={'schemaVersion':'baseera-shots/1','name':'Law01-Cinematic','compositionId':'Law01-Visual-Review','targetFinalCompositionId':'Law01-Cinematic-Final','fps':60,'width':1080,'height':1920,'durationInFrames':frames,'audio':None,'srt':'law01/subtitles/visual-review-estimated.srt','captions':'law01/subtitles/visual-review-estimated.json','timingBasis':'estimated_script_not_audio','publicationReady':False,'approval':{'images':'approved_by_phase3_request','narration':False,'captionAlignment':False},'reviewLabel':'نسخة مراجعة صامتة · التوقيت تقديري','captionSettings':{'fontFamily':'Cairo','fontPath':'law01/fonts/Cairo.ttf','fontSize':54,'maxLines':2,'bottom':180,'top':136,'left':72,'right':72,'rtl':True,'digits':'western'},'brand':{'text':'@kitabwbs','fontSize':28,'bottom':64},'segments':segments,'shots':shots,'editorialNotes':[plan['reordered_shots']['reason'],'المشاهد التاريخية تفسير مرسوم، ولا تثبت حوارًا أو انفعالًا محددًا.','الفيلم صامت للمراجعة؛ لا يُنشر قبل إضافة تسجيل معتمد وإعادة المحاذاة.']}
 pub=R/'public/law01/subtitles';pub.mkdir(parents=True,exist_ok=True)
 for p in [P/'scene-configs/Law01-Cinematic.json',R/'src/law01/project.json']:p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(project,ensure_ascii=False,indent=2))
 for p in [pub/'visual-review-estimated.json',P/'subtitles/visual-review-estimated.json']:p.write_text(json.dumps(cues,ensure_ascii=False,indent=2))
 for p in [pub/'visual-review-estimated.srt',P/'subtitles/visual-review-estimated.srt']:p.write_text('\n'.join(srt),encoding='utf-8')
 (P/'storyboard/shot-manifest.json').write_text(json.dumps({'timingBasis':'estimated, no actual narration','endFrameConvention':'exclusive; lastVisibleFrame is inclusive','reordering':plan['reordered_shots'],'shots':shots},ensure_ascii=False,indent=2))
 print(json.dumps({'shots':len(shots),'frames':frames,'seconds':frames/60,'cues':len(cues),'sourceNarrationExact':True,'publicationReady':False}))
if __name__=='__main__':main()

