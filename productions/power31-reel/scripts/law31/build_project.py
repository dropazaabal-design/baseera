from pathlib import Path
import json
R=Path(__file__).resolve().parents[2];P=R/'projects/law31-first-reel';U=R/'public/law31-first-reel'
texts=[
'تخيّل واحدًا يقول لك: «اختر الباب اللي يعجبك». تفكّر، وتقارن، وتختار.',
'لكن المفاجأة؟ البابان يؤدّيان إلى المكان نفسه!',
'لأن شخصًا آخر رسم الطريقين، وحدّد نهايتهما.',
'هذه فكرة القانون الحادي والثلاثين في «ثمانية وأربعون قانونًا للسلطة» لروبرت غرين: أحيانًا تكون السيطرة بالتحكّم في خياراتك. نفهمها لنحمي قرارنا، لا لنحاصر الناس.',
'في العمل: «إمّا تقبل ضغطًا إضافيًا بلا نقاش، أو أنت غير ملتزم». وفجأة، تحس أن أمامك طريقين فقط!',
'لكن أين التفاوض؟ وتوزيع المهام؟ والاتفاق الواضح الذي يحفظ حق الجميع؟',
'وفي العلاقات: «إمّا توافقني في كل شيء، أو أنت ما تهتم بي». وكأن الاهتمام اختبار طاعة!',
'لكن الاحترام ما يعني تلغي رأيك. من حقك تختلف، وتناقش، وتحافظ على حدودك.',
'وفي العائلة: «إمّا تختار التخصص اللي نريده، أو تخيّب أملنا».',
'قد يكون وراء الكلام خوف حقيقي على مستقبلك. لكن هذا لا يمنع الحوار، ولا يلغي البدائل.',
'وانتبه: مو كل موقف فيه خياران يعني تلاعبًا. لكن إذا حسّيت أنك محاصر، اسأل: من حدّد الخيارات؟ وهل فيه خيار ثالث؟',
'ليس كل من يمنحك خيارًا، يمنحك حرية. وأحيانًا أقوى قرار... أن ترفض الاختيار بين بابين لا يناسبانك أصلًا.'
]
visuals=['Confused black stickman before two cyan and emerald doors in a midnight stone hall','Two winding stone routes converge at one distant fortress gate','Giant controller holds delicate strings attached to two doors; cuffed hero below','Small hero on a monumental stone chessboard','Manager behind a carved desk pressures employee in a navy office','Same office: employee indicates negotiation and fair workload alternatives','Two stickmen separated by a cracked bridge, tense conversation','Same bridge: calm open hand, respectful boundaries','Caring parents and young hero discuss two study folders','Same family: calm dialogue, three folders and branching garden paths','Same two doors and a narrow hidden third passage','Hero and an open landscape with multiple distinct routes toward city, garden and mountains']
frames=[338,228,228,696,531,338,476,393,311,476,613,532]
moves=[('slowPush',(785,1100,.96),(812,1080,1.05)),('pullBack',(800,1065,1.12),(800,1100,.93)),('tiltReveal',(800,1370,1.17),(800,1065,.94)),('slowPush',(800,1110,.95),(800,1070,1.05)),('panLeft',(781,1100,.94),(817,1100,.94)),('pullBack',(805,1100,1.06),(800,1100,.94)),('panLeft',(779,1100,1),(819,1095,1)),('slowPush',(800,1100,.97),(810,1085,1.035)),('pullBack',(800,1100,1),(800,1100,.94)),('driftRight',(789,1100,.97),(808,1090,.99)),('driftRight',(780,1110,1.01),(816,1082,1.045)),('pullBack',(800,1080,1.12),(800,1100,.93))]
master='Cinematic psychological graphic novel, premium hand-painted storytelling illustration, stylized black stickman characters with circular heads and expressive white eyes, one emerald left-wrist cuff on hero, detailed dark illustrated environments, atmospheric depth, navy and charcoal, cyan and emerald accents, chiaroscuro lighting, powerful silhouettes, vertical 9:16, consistent identity, no photorealistic faces, no text, no watermark, no yellow, no orange, no gold.'
def stamp(t):
 n=round(t*1000);return f'{n//3600000:02d}:{n//60000%60:02d}:{n//1000%60:02d},{n%1000:03d}'
scenes=[];story=[];cues=[];start=0
for i,(text,n,move,visual) in enumerate(zip(texts,frames,moves,visuals),1):
 sid=f'scene-{i:02d}';preset,a,b=move;m=json.loads((U/sid/'manifest.json').read_text());layers=[{k:l[k] for k in ['id','src','depth','scale']} for l in m['layers']];camera={'from':dict(zip(['x','y','zoom'],a)),'to':dict(zip(['x','y','zoom'],b))};keys=[{'frame':0,**camera['from']},{'frame':n-1,**camera['to']}]
 if i==3:keys=[keys[0],{'frame':18,**camera['from']},{'frame':n-18,**camera['to']},keys[-1]];camera['keys']=keys
 transition={'type':'crossfade','duration':.3} if i in [4,6,8,10,12] else {'type':'cut','duration':0}
 scenes.append({'id':sid,'title':f'المشهد {i}','duration':n/60,'narration':text,'preset':preset,'camera':camera,'parallax':1,'transition':transition,'layers':layers})
 story.append({'sceneId':sid,'narration':text,'estimatedDuration':n/60,'finalDuration':None,'previewFromFrame':start,'visualDescription':visual,'aiImagePrompt':master+' '+visual,'promptProvenance':'Art direction reconstructed after environment reset; not identical regeneration guarantee','characterReferences':['character-references/reference-sheet-v1.png'],'environmentReferences':[f'generated-images/{sid}-master-v1.png'],'layerManifest':f'layers/{sid}/manifest.json','layerMode':m['mode'],'cameraPreset':preset,'cameraKeyframes':keys,'transition':transition,'imageProvider':'built-in image_gen','generationStatus':'GENERATED_ORIGINAL_RECOVERED','reviewStatus':'STILL_REVIEWED','timingStatus':'ESTIMATED_NOT_AUDIO_ALIGNED'})
 words=text.split();cursor=start/60
 for j in range(0,len(words),6):
  chunk=words[j:j+6];duration=(n-12)/60*len(chunk)/len(words);line=' '.join(chunk)
  if len(line)>38:
   mid=len(chunk)//2;line=' '.join(chunk[:mid])+'\n'+' '.join(chunk[mid:])
  cues.append({'start':cursor+.05,'end':cursor+duration-.04,'text':line,'sceneId':sid});cursor+=duration
 start+=n
project={'name':'Law31-First-Cinematic-Reel','stage':'VISUAL_REVIEW_AUDIO_BLOCKED','timingStatus':'PROVISIONAL_86_SECONDS','srt':'law31-first-reel/subtitles/visual-review-estimated.srt','presentation':{'showSceneTitle':False,'compactBrand':True,'captionFontSize':48,'captionBottom':205,'reviewLabel':'نسخة بصرية للمراجعة · بانتظار التعليق الصوتي'},'scenes':scenes}
for path in [R/'src/projects/law31-first-reel.json',R/'src/projects/active-production.json',P/'scene-configs/law31-first-reel.json']:path.write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n')
srt='\n\n'.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i,c in enumerate(cues))+'\n';(U/'subtitles').mkdir(exist_ok=True)
for path in [U/'subtitles/visual-review-estimated.srt',P/'subtitles/visual-review-estimated.srt']:path.write_text(srt)
(P/'subtitles/preview-cues.json').write_text(json.dumps({'status':'ESTIMATED_NO_AUDIO','cues':cues},ensure_ascii=False,indent=2))
(P/'storyboard/scene-manifest.json').write_text(json.dumps({'title':'أخطر أنواع السيطرة… أن تظن أنك تختار!','targetSeconds':[80,90],'previewDuration':86,'finalDuration':None,'scenes':story},ensure_ascii=False,indent=2))
(P/'script/narration-reviewed.txt').write_text('\n\n'.join(texts)+'\n');(P/'script/scene-narration.json').write_text(json.dumps(texts,ensure_ascii=False,indent=2))
(P/'visual-bible/visual-bible.json').write_text(json.dumps({'style':'Cinematic Psychological Graphic Novel — Premium Stickman 2.5D','masterPrompt':master,'palette':['#091525','#173C59','#277DB5','#10B981','#F8FAFC'],'hero':'Slim black body, circular head, white eyes, one emerald LEFT-wrist cuff','reference':'character-references/reference-sheet-v1.png','constraints':['No music','No yellow/orange/gold','No text in generated art','No SVG placeholders']},ensure_ascii=False,indent=2))
(P/'audio/provider-status.json').write_text(json.dumps({'status':'BLOCKED_PENDING_EXPLICIT_PAID_APPROVAL','generated':False,'freeAlternative':'SILMA status and short generation returned connection errors in preceding session','paidEstimateOnly':{'provider':'ElevenLabs','voiceId':'DhfzvPf0OIN8xdGwcHOk','voice':'Mohammed — Deep Narrator & Documentary','model':'eleven_v4','takes':1,'credits':1017.8982,'price_cents':18.50724,'currency':'USD'},'legacyAudio':'Existing approved recording has a different script and was preserved'},ensure_ascii=False,indent=2))
print({'scenes':len(scenes),'frames':start,'previewSeconds':start/60,'captions':len(cues),'audio':False})
