"""Promote the checked full audiovisual review to a preserved final MP4."""
from pathlib import Path
import json,hashlib,shutil
R=Path(__file__).resolve().parents[2];P=R/'projects/law01-cinematic';Q=P/'qa/final'
def read(file):return json.loads((Q/file).read_text())
video=read('video-validation.json');timeline=read('timeline-animation-tests.json');frames=read('render-frame-validation.json')
assets=read('asset-revalidation.json');repeat=read('render-determinism-regression.json')
alignment=json.loads((P/'qa/audio-final/forced-alignment.json').read_text());master=json.loads((P/'qa/audio-final/audio-mastering.json').read_text())
native=read('native-remotion-audio.json')
assert video['status']=='PASS' and video['publicationReady'] and video['audioQA']['status']=='PASS'
assert assets['status']==repeat['status']==master['status']==native['status']=='PASS'
assert timeline['camera']['allFramesFinite'] and timeline['camera']['allFramesDeterministic']
assert not frames['browserErrors'] and frames['standalonePreviewComparison']['pixelEqual'] and frames['noBlankSamples']
assert len(alignment['words'])==209 and not alignment['issues']
source=R/video['file'];final=P/'renders/Law01-Cinematic-Final-1080x1920-60fps-v1.mp4'
if final.exists():assert hashlib.sha256(final.read_bytes()).hexdigest()==video['sha256']
else:shutil.copy2(source,final)
assert hashlib.sha256(final.read_bytes()).hexdigest()==video['sha256']
final_artifact={'status':'PASS','file':str(final.relative_to(R)),'visualReviewFile':video['file'],'sha256':video['sha256'],
    'bytes':final.stat().st_size,'metadata':video['metadata'],'audioQA':video['audioQA'],
    'reviewAndFinalByteIdentical':True,'reason':'Complete audiovisual review passed without a further picture/audio change; final is a preserved copy, not a re-encode.',
    'publicationReady':True}
(Q/'final-artifact.json').write_text(json.dumps(final_artifact,ensure_ascii=False,indent=2))
checks=[
 {'category':'Approved artwork and layers','status':assets['status'],'evidence':'final/asset-revalidation.json','detail':'97 actual PNG files fully decoded and hashed: 30 originals, 67 used layers; source canvas and alpha verified. No new art generation.'},
 {'category':'Camera, motion and timeline','status':'PASS','evidence':'final/timeline-animation-tests.json','detail':f"All {timeline['timeline']['frames']} frames finite/deterministic; no shot gaps/overlaps; final frame {timeline['timeline']['finalFrame']}; 13 actual depth-separated shots."},
 {'category':'Actual rendered samples','status':'PASS','evidence':'final/render-frame-validation.json','detail':'95 1080x1920 reference frames, every shot start/middle/end plus transitions; isolated SHOT19 and assembly pixels match.'},
 {'category':'Repeated renders / regression','status':repeat['status'],'evidence':'final/render-determinism-regression.json','detail':'Three Law01 frames in independent browsers and two legacy before/after frames match exactly. All 29 original src files retain hashes; engine not rebuilt.'},
 {'category':'Actual narration','status':'PASS_WITH_SCOPE','evidence':'audio-final/narration-content-review.json','detail':'One user-authorized ElevenLabs v4 take with the selected voice, unchanged 209-word prompt. Two independent local ASR checks and forced alignment; no claim of a human listening review or perfect ASR phonetic proof.'},
 {'category':'Audio master / MP3','status':master['status'],'evidence':'audio-final/audio-mastering.json','detail':'Master and final MP3 meet measured -16 LUFS tolerance and peak <= -4dBTP. Original recording preserved; failed local masters retained separately.'},
 {'category':'Caption timing','status':'PASS_WITH_SCOPE','evidence':'audio-final/forced-alignment.json','detail':'209 words aligned to the actual recording, 45 short RTL Cairo cues; Western digits, SRT/JSON round trip, 20ms model timing resolution. No 17ms ground-truth claim.'},
 {'category':'Native Remotion audio','status':native['status'],'evidence':'final/native-remotion-audio.json','detail':'An actual unmuted 2-second render verifies the reusable Audio component path.'},
 {'category':'Full MP4 and audio','status':video['status'],'evidence':'final/video-validation.json','detail':'Full-file decode, expected codec/resolution/fps/frame count, black/freeze checks, 95 delivered samples versus global reference frames, AAC loudness/peak/clipping/silence and waveform-offset measurements.'},
 {'category':'TypeScript','status':'PASS','evidence':'final/typecheck.txt','detail':'npm run check passes.'},
 {'category':'Scoped ESLint','status':'PASS_WITH_WARNINGS','evidence':'final/eslint.txt','detail':'0 errors, 2 existing Law01 warnings; actual deterministic render checks pass.'},
 {'category':'Credit authorization','status':'PASS','evidence':'../audio/narration-request.json','detail':'Exactly one generation, 1215.8784 credits / USD 0.2210688, explicitly authorized by user. No paid transcription, MotionLab or music.'},
]
report={'project':'Law01-Cinematic-Final','status':'PASS','publicationReady':True,'checks':checks,'final':final_artifact,
    'paidGenerations':1,'actualCredits':1215.8784,'actualUSD':.2210688,'voiceId':'dlGxemPxFMTY7iXagmOj',
    'recordingSeconds':99.68,'videoFrames':5981,'videoSeconds':5981/60,'music':False,
    'limits':['Transcription and word boundaries are model estimates; no independently labeled phonetic ground truth or 17ms guarantee.','ASR spelling differences for proper names were retained in raw reports; captions use the approved Arabic orthography.','No human listening review is claimed.','Visual inspection samples every shot and transitions; automated full-file decoding does not mean a person inspected all 5981 frames.','Character animation is bounded cutout lean, eyes and approved pose changes; no newly articulated walking rig.','Source art is 936x1664 upscaled to 1080x1920.','Legacy compatibility covers hashes, original tests and two rendered sample frames, not all prior films/audio.']}
(Q/'qa-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(P/'qa/qa-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
lines=['# القانون 1 — تقرير الفيديو بالصوت','', '**PASS — ملف MP4 كامل بالصوت والترجمة المشتقة من التسجيل الحقيقي.**','',
    f'المدة {5981/60:.3f} ثانية، 1080×1920، 60fps، 5981 إطارًا، H.264/yuv420p. الصوت AAC أحادي 48kHz.','',
    f'مستوى الصوت في MP4: {video["audioQA"]["integratedLUFS"]} LUFS، الذروة {video["audioQA"]["truePeakDBTP"]} dBTP. SHA-256: `{video["sha256"]}`.','',
    '| الفحص | النتيجة | الدليل |','|---|---|---|']
for x in checks:lines.append(f'| {x["category"]} | {x["status"]} | [{Path(x["evidence"]).name}]({x["evidence"]}) |')
lines+=['','## الصوت والإنفاق','', 'أُنتج تسجيل واحد فقط بعد موافقة المستخدم: الصوت dlGxemPxFMTY7iXagmOj، النموذج eleven_v4، والتكلفة 1215.8784 رصيدًا (0.2210688 دولار حسب المزود). استُخدم تفريغ ومحاذاة محليان دون تكلفة مزود إضافية. النص المعتمد لم يتغير.','',
    'أُصلحت ذروة MP3 التي تجاوزت الهدف في تجربة معالجة محلية أولى، باستخدام هامش للترميز وقياس جديد. النسخة النهائية من MP3 وWAV وAAC اختُبرت فعليًا. لم يُعاد توليد الصوت المدفوع.','',
    'مدة الأداء 99.68 ثانية؛ ضُبطت اللقطات والكاميرا وحركة الشخصيات على هذا الأداء. نسخة المراجعة الصامتة السابقة وإعداداتها محفوظة. المراجعة الكاملة بالصوت اجتازت الفحص دون تعديل إضافي، لذلك يطابقها ملف Final ببايتاته دون إعادة ترميز.','',
    '## نطاق الاختبارات وحدودها','']
lines+=['- '+x for x in report['limits']]
lines+=['','السجلات الخام لفك الفيديو وقياس الصوت في final/raw، والكلمات ومحاذاتها في audio-final. مصادر القصة في [المراجعة التحريرية](../editorial-review-ar.md).']
(P/'qa/qa-report-ar.md').write_text('\n'.join(lines),encoding='utf-8')
status=json.loads((P/'audio/provider-status.json').read_text());status.update(stage='FINAL_VIDEO_WITH_ACTUAL_AUDIO',audio_path='law01/audio/Law01-Narration-Mastered.wav',final_narration_available=True,srt_status='recording-derived local forced alignment; 45 cues',publication_gate='PASSED_ACTUAL_AUDIO_CAPTIONS_AND_FINAL_FILE_QA')
status['elevenlabs'].update(generation_invoked=True,billing_authorized=True,generationRequested=True,actualGenerationCount=1,actualCredits=1215.8784,actualPriceCents=22.10688,selectedVoiceId='dlGxemPxFMTY7iXagmOj',selectedModel='eleven_v4')
(P/'audio/provider-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
request=json.loads((P/'audio/narration-request.json').read_text());request.update(status='COMPLETED_ONE_AUTHORIZED_GENERATION_FINAL_VIDEO_QA_PASSED',captionAlignmentStatus='RECORDING_DERIVED_WORD_ALIGNMENT_COMPLETED')
(P/'audio/narration-request.json').write_text(json.dumps(request,ensure_ascii=False,indent=2))
print(json.dumps({'status':'PASS','file':str(final),'sha256':video['sha256'],'seconds':5981/60,'audioLUFS':video['audioQA']['integratedLUFS'],'truePeakDBTP':video['audioQA']['truePeakDBTP']},indent=2))
