"""Retime existing approved shots to actual word alignment, without new art."""
from pathlib import Path
import json,re,math,hashlib,copy
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';Q=P/'qa/audio-final'
alignment=json.loads((Q/'forced-alignment.json').read_text())
if alignment['issues']:raise ValueError('Resolve forced-alignment issues before retiming')
mastering=json.loads((Q/'audio-mastering.json').read_text());assert mastering['status']=='PASS'
p=json.loads((P/'versions/visual-review-v1/runtime-project.json').read_text());fps=p['fps']
words=alignment['words'];index=0
for s in p['shots']:
    n=len(s['narration'].split());s['wordStart']=index;s['wordEnd']=index+n;index+=n
assert index==len(words)==209
boundaries=[0]
for s in p['shots'][1:]:
    i=s['wordStart'];a=words[i-1]['end'];b=words[i]['start']
    # A cut in the intervening pause anticipates the next word by at most 150ms.
    point=(a+b)/2 if b>=a else b
    point=max(b-.15,min(b,point));boundaries.append(round(point*fps))
boundaries.append(math.ceil(alignment['duration']*fps))
assert all(b>a for a,b in zip(boundaries,boundaries[1:]))
for j,s in enumerate(p['shots']):
    old=s['durationInFrames'];start,end=boundaries[j:j+2];dur=end-start
    assert dur>=15,(s['id'],'unreadably brief shot')
    def keyframe(k):return round(k/(old-1)*(dur-1))
    s.update(startFrame=start,endFrame=end,lastVisibleFrame=end-1,durationInFrames=dur,duration=dur/fps,
        narrationStart=words[s['wordStart']]['start'],narrationEnd=words[s['wordEnd']-1]['end'],timingBasis='recording_forced_word_alignment')
    for k in s['camera']['keys']:k['frame']=keyframe(k['frame'])
    for l in s['layers']:
        if l.get('motion'):
            for k in l['motion']['keys']:k['frame']=keyframe(k['frame'])
        if l.get('eyeAnimation'):l['eyeAnimation']['blinkAt']=keyframe(l['eyeAnimation']['blinkAt'])
    s['transition']['frames']=min(s['transition']['frames'],dur//3)

def digits(s):
    for a,b in [('ألف وستمية وواحد وستين','1661'),('سبعتعش أغسطس','17 أغسطس'),('خمسة سبتمبر','5 سبتمبر'),('ثمانية وأربعين','48')]:s=s.replace(a,b)
    return s
def atoms(s):
    raw=s['narration'].split();out=[];i=0
    special=[['ألف','وستمية','وواحد','وستين'],['ثمانية','وأربعين']]
    while i<len(raw):
        length=1
        for phrase in special:
            part=' '.join(raw[i:i+len(phrase)])
            if ' '.join(phrase) in part:length=len(phrase);break
        out.append({'text':digits(' '.join(raw[i:i+length])),'first':s['wordStart']+i,'last':s['wordStart']+i+length-1})
        i+=length
    # Single-word numeric date replacements when the month is the next atom.
    for j,x in enumerate(out):
        if j+1<len(out):
            joined=x['text']+' '+out[j+1]['text'];changed=digits(joined)
            if changed!=joined:
                a,b=changed.split(' ',1);x['text']=a;out[j+1]['text']=b
    return out
cues=[]
for s in p['shots']:
    groups=[];g=[]
    for a in atoms(s):
        if g and (len(' '.join(x['text'] for x in g+[a]))>39 or len(g)>=6):groups.append(g);g=[]
        g.append(a)
    if g:groups.append(g)
    for g in groups:
        first,last=g[0]['first'],g[-1]['last'];start=max(s['startFrame']/fps,words[first]['start']-.04)
        end=min(s['endFrame']/fps,words[last]['end']+.08)
        cues.append({'text':' '.join(x['text'] for x in g),'startMs':round(start*1000),'endMs':round(end*1000),
            'timestampMs':round(words[first]['start']*1000),'confidence':round(sum(w['probability'] for w in words[first:last+1])/(last-first+1),5),
            'shotId':s['id'],'timingBasis':'recording_forced_word_alignment','firstWordIndex':first,'lastWordIndex':last})
for i,c in enumerate(cues):
    if i+1<len(cues):c['endMs']=min(c['endMs'],cues[i+1]['startMs'])
    assert c['endMs']>c['startMs']
    assert not re.search('[٠-٩۰-۹]',c['text'])
def stamp(ms):
    h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
srt='\n'.join(f'{i+1}\n{stamp(c["startMs"])} --> {stamp(c["endMs"])}\n{c["text"]}\n' for i,c in enumerate(cues))
pub=R/'public/law01/subtitles'
for folder in [pub,P/'subtitles']:
    (folder/'Law01-Recording-Aligned.json').write_text(json.dumps(cues,ensure_ascii=False,indent=2))
    (folder/'Law01-Recording-Aligned.srt').write_text(srt,encoding='utf-8')
p.update(name='Law01-Cinematic-Final',compositionId='Law01-Cinematic-Final',durationInFrames=boundaries[-1],
    audio='law01/audio/Law01-Narration-Mastered.wav',srt='law01/subtitles/Law01-Recording-Aligned.srt',
    captions='law01/subtitles/Law01-Recording-Aligned.json',timingBasis='recording',publicationReady=True,reviewLabel='')
p['approval'].update(narration=True,captionAlignment=True)
p['approval']['basis']='User authorized the exact selected voice/script take; local audio measurements and recording-derived alignment checked.'
p['recording']={'voiceId':'dlGxemPxFMTY7iXagmOj','provider':'ElevenLabs','model':'eleven_v4','generationCount':1,
    'durationSeconds':alignment['duration'],'alignmentMethod':alignment['method'],'groundTruth17msClaim':False,
    'audioSHA256':alignment['audioSHA256'],'scriptSHA256':alignment['approvedTextSHA256']}
for seg in p['segments']:
    ss=[s for s in p['shots'] if s['segment']==seg['id']];seg['startFrame']=ss[0]['startFrame'];seg['endFrame']=ss[-1]['endFrame']
p['editorialNotes']=[n for n in p['editorialNotes'] if 'صامت' not in n]
p['editorialNotes'].append('التوقيت مشتق من التسجيل الحقيقي ومحاذاة الكلمات المحلية؛ لا توجد دعوى دقة 17ms.')
for dest in [P/'scene-configs/Law01-Cinematic.json',P/'scene-configs/Law01-Cinematic-Final.json',R/'src/law01/project.json']:
    dest.write_text(json.dumps(p,ensure_ascii=False,indent=2))
original=json.loads((P/'versions/visual-review-v1/storyboard/shot-manifest.json').read_text())
manifest={'timingBasis':'actual recording with local forced word alignment','endFrameConvention':'exclusive; lastVisibleFrame is inclusive',
    'reordering':original['reordering'],'shots':p['shots']}
(P/'storyboard/shot-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
report={'status':'PASS','shots':len(p['shots']),'frames':p['durationInFrames'],'durationSeconds':p['durationInFrames']/fps,
    'actualRecordingSeconds':alignment['duration'],'cueCount':len(cues),'recordingDerived':True,'cueCoverageWords':len(words),
    'maximumFrameQuantizationSeconds':1/(2*fps),'alignmentTimingResolutionSeconds':.02,'groundTruth17msClaim':False,
    'boundaries':[{k:s[k] for k in ['id','startFrame','endFrame','narrationStart','narrationEnd','wordStart','wordEnd']} for s in p['shots']]}
(Q/'recording-timeline.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:report[k] for k in ['status','shots','frames','durationSeconds','actualRecordingSeconds','cueCount','recordingDerived']},indent=2))
