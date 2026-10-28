"""Force-align approved Arabic text against the actual recording locally.

Independent ASR locates broad narrative sections. CTranslate2 Whisper attention
and DTW then align the approved tokens within those audio windows. Timings are
model estimates with 20ms resolution, not a claim of 17ms ground-truth accuracy.
"""
from pathlib import Path
import json,re,unicodedata,difflib,subprocess,hashlib,time
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.tokenizer import Tokenizer
from faster_whisper.audio import pad_or_trim

R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';Q=P/'qa/audio-final'
def norm(s):
    s=unicodedata.normalize('NFKD',s)
    s=''.join(c for c in s if not unicodedata.combining(c))
    s=s.translate(str.maketrans('أإآىةؤئ','ااايهوي'))
    s=re.sub(r'[^\w]','',s)
    return {'1661':'الفوستميهوواحدوستين','17':'سبعتعش','5':'خمسه','48':'ثمانيهواربعين'}.get(s,s)
script=(P/'script/narration-approved.txt').read_text()
project=json.loads((P/'versions/visual-review-v1/runtime-project.json').read_text())
source_words=script.split();source_norm=[norm(w) for w in source_words]
asr_path=Q/'asr-medium-recording.json'
if not asr_path.exists():asr_path=Q/'asr-recording.json'
asr=json.loads(asr_path.read_text());asr_words=[w for s in asr['segments'] for w in s['words']]
def chars(words,key):
    text='';indices=[]
    for i,w in enumerate(words):
        n=norm(key(w));text+=n;indices.extend([i]*len(n))
    return text,indices
a,ai=chars(source_words,lambda x:x);b,bi=chars(asr_words,lambda x:x['word'])
mapping={i:[] for i in range(len(source_words))}
matched=0
for block in difflib.SequenceMatcher(None,a,b,autojunk=False).get_matching_blocks():
    for j in range(block.size):mapping[ai[block.a+j]].append(bi[block.b+j]);matched+=1
approx=[]
for i,w in enumerate(source_words):
    ids=mapping[i]
    if ids:approx.append({'start':min(asr_words[j]['start'] for j in ids),'end':max(asr_words[j]['end'] for j in ids)})
    else:approx.append(None)
# A padded attention window may assign its first word the window's start.
# Anchor those onsets with the consensus of independently transcribed recordings.
onset_anchors={i:[x['start']] for i,x in enumerate(approx) if x}
second_path=Q/'asr-recording.json'
if second_path!=asr_path and second_path.exists():
    second=json.loads(second_path.read_text());second_words=[w for s in second['segments'] for w in s['words']]
    c,ci=chars(second_words,lambda x:x['word']);mapped={i:[] for i in range(len(source_words))}
    for block in difflib.SequenceMatcher(None,a,c,autojunk=False).get_matching_blocks():
        for j in range(block.size):mapped[ai[block.a+j]].append(ci[block.b+j])
    for i,ids in mapped.items():
        if ids:onset_anchors.setdefault(i,[]).append(min(second_words[j]['start'] for j in ids))
segments=[];index=0
for n in range(1,11):
    ss=[s for s in project['shots'] if s['segment']==n]
    text=' '.join(s['narration'] for s in ss);words=text.split();end=index+len(words)
    assert [norm(w) for w in words]==source_norm[index:end]
    first=next(approx[i] for i in range(index,min(end,index+3)) if approx[i])
    last=next(approx[i] for i in range(end-1,max(index-1,end-4),-1) if approx[i])
    segments.append({'segment':n,'firstWord':index,'endWord':end,'text':text,'approxStart':first['start'],'approxEnd':last['end']});index=end
assert index==len(source_words)
audio_path=R/'public/law01/audio/Law01-Narration-Mastered.wav'
decoded=subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(audio_path),'-ar','16000','-ac','1','-f','f32le','pipe:1'],capture_output=True,check=True)
wave=np.frombuffer(decoded.stdout,dtype=np.float32).copy();duration=len(wave)/16000
model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=6,num_workers=1,download_root='/workspace/scratch/4b49832951b6/law01-model-cache')
tokenizer=Tokenizer(model.hf_tokenizer,model.model.is_multilingual,task='transcribe',language='ar')
all_words=[];raw_chunks=[];started=time.monotonic()
for seg in segments:
    n=seg['segment'];start=max(0,seg['approxStart']-.32);end=min(duration,seg['approxEnd']+.35)
    chunk=wave[round(start*16000):round(end*16000)]
    features=model.feature_extractor(chunk,padding=False)
    frames=min(features.shape[-1],3000)
    encoder=model.encode(pad_or_trim(features))
    tokens=tokenizer.encode(' '+seg['text'])
    result=model.find_alignment(tokenizer,[tokens],encoder,[frames])[0]
    raw=[{k:(float(v) if k in ['start','end','probability'] else v) for k,v in w.items()} for w in result]
    raw_chunks.append({**seg,'audioStart':start,'audioEnd':end,'rawAlignment':raw})
    expected=source_words[seg['firstWord']:seg['endWord']]
    expected_chars,_=chars(expected,lambda x:x);actual_chars,actual_indices=chars(raw,lambda x:x['word'])
    assert expected_chars==actual_chars,(n,'Tokenizer changed approved text')
    pos=0
    for local,w in enumerate(expected):
        length=len(norm(w));ids=actual_indices[pos:pos+length];pos+=length
        if not ids:raise ValueError('Empty source word')
        selected=[raw[i] for i in set(ids)]
        x={'index':seg['firstWord']+local,'text':w,'segment':n,
            'start':round(start+min(x['start'] for x in selected),4),
            'end':round(start+max(x['end'] for x in selected),4),
            'probability':round(float(np.mean([x['probability'] for x in selected])),5)}
        all_words.append(x)
    print('ALIGNED',n,round(start,3),round(end,3),len(expected),flush=True)
    (Q/'forced-alignment-partial.json').write_text(json.dumps(all_words,ensure_ascii=False,indent=2))
assert len(all_words)==len(source_words)
corrections=[]
for seg in segments:
    i=seg['firstWord'];w=all_words[i];anchor=float(np.median(onset_anchors.get(i,[seg['approxStart']])))
    adjusted=min(w['end']-.02,max(w['start'],anchor))
    if adjusted>w['start']+.005:
        corrections.append({'index':i,'kind':'padded-window onset to independent-ASR consensus','from':w['start'],'to':round(adjusted,4)})
        w['start']=round(adjusted,4)
for prev,w in zip(all_words,all_words[1:]):
    if w['start']<prev['end']:
        boundary=round((w['start']+prev['end'])/2,4)
        assert boundary>prev['start'] and boundary<w['end']
        corrections.append({'index':w['index'],'kind':'shared boundary for model overlap','from':[prev['end'],w['start']],'to':boundary})
        prev['end']=w['start']=boundary
issues=[]
for i,w in enumerate(all_words):
    if w['end']<=w['start']:issues.append({'index':i,'issue':'nonpositive duration','word':w})
    if w['end']-w['start']>2:issues.append({'index':i,'issue':'long word','word':w})
    if i and w['start']<all_words[i-1]['start']-.02:issues.append({'index':i,'issue':'nonmonotonic start','word':w})
    if i and w['start']<all_words[i-1]['end']-.001:issues.append({'index':i,'issue':'overlapping words','word':w})
    if w['start']<0 or w['end']>duration+.02:issues.append({'index':i,'issue':'outside recording','word':w})
report={'method':'Local CTranslate2 Whisper small forced cross-attention/DTW alignment of approved tokens, broadly anchored by independent ASR.',
    'sourceASR':str(asr_path.relative_to(P)),'timingResolutionSeconds':.02,'groundTruth17msClaim':False,
    'approvedTextSHA256':hashlib.sha256(script.encode()).hexdigest(),'audioSHA256':hashlib.sha256(audio_path.read_bytes()).hexdigest(),
    'duration':duration,'words':all_words,'wordCount':len(all_words),'sourceTextExact':True,'ASRCharacterMatchRatio':matched/len(a),
    'issues':issues,'onsetAndOverlapCorrections':corrections,'chunks':raw_chunks,'elapsedSeconds':time.monotonic()-started}
(Q/'forced-alignment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'wordCount':len(all_words),'issues':issues,'duration':duration,'elapsedSeconds':report['elapsedSeconds']},ensure_ascii=False),flush=True)
