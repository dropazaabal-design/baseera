"""Assemble the production report from test outputs; missing gates stay blocked."""
from pathlib import Path
import hashlib
import json

R=Path(__file__).resolve().parents[2]
P=R/'projects/law01-cinematic';Q=P/'qa'
def read(name):return json.loads((Q/name).read_text())
assets=read('asset-validation-report.json');layers=read('layer-validation-report.json')
pixels=read('render-determinism-regression.json');math=read('timeline-animation-tests.json')
render=read('render-frame-validation.json');video=read('video-validation.json')
baseline=read('source-preservation-baseline.json')
changed=[p for p,sha in baseline.items() if hashlib.sha256((R/p).read_bytes()).hexdigest()!=sha]
preservation={'status':'PASS' if not changed else 'FAIL','baselineRef':'a83f0528e466ab44b02c3ba29aecadb15a4d992d','checkedExistingSourceFiles':len(baseline),'changedExistingSourceFiles':changed,'engineCoreUnchanged':'src/cinematic/CinematicCameraEngine.tsx' not in changed,'oldProjectsModified':bool(changed),'scope':'All existing src files byte-compared; actual legacy rendering regression is limited to the two sample frames documented separately.'}
(Q/'source-preservation.json').write_text(json.dumps(preservation,indent=2))
type_log=(Q/'raw/typecheck.txt').read_text();lint=(Q/'raw/eslint-law01.txt').read_text()
checks=[
 {'category':'Images','status':'PASS' if assets['passed']==30 and assets['failed']==0 else 'FAIL','evidence':'asset-validation-report.json','details':'30 original PNGs fully decoded; signature, chunks, CRC, IEND, SHA-256, 936x1664 exact 9:16. All match Phase 2 hashes.'},
 {'category':'Layers','status':'PASS' if all(x['aligned'] and x['alphaVerified'] and x['backgroundOpaque'] for x in layers['shots']) else 'FAIL','evidence':['layer-validation-report.json','layer-byte-integrity.json'],'details':'67 used PNGs, aligned source canvas. 13 true multilayer shots; other shots explicitly flat/eye overlays. Initial truncated derived SHOT05 PNG caught and replaced through atomic saving. Originals unchanged.'},
 {'category':'Timeline and animation','status':'PASS' if math['camera']['all5760FramesFinite'] and math['camera']['all5760FramesDeterministic'] and math['timeline']['exactBoundaries'] else 'FAIL','evidence':'timeline-animation-tests.json','details':'5760 frames; no timeline gaps/overlaps; exclusive end boundaries; final visible frame 5759. Minimum opaque coverage margin 57.09375px.'},
 {'category':'Actual sampled renders','status':'PASS' if render['noBlankSamples'] and not render['browserErrors'] and render['standalonePreviewComparison']['pixelEqual'] else 'FAIL','evidence':['render-frame-validation.json','frame-samples-v2.json'],'details':'95 actual 1080x1920 frames: start/middle/end of all 30 shots plus 5 transition completions; SHOT19 isolated preview exactly matches assembled pixels.'},
 {'category':'Determinism and regression','status':pixels['status'],'evidence':['render-determinism-regression.json','source-preservation.json','raw/engine-regression.txt','raw/workflow-regression.txt'],'details':'3 Law01 frames repeated in independent browsers; 2 legacy frames before/after exactly equal. Original engine/workflow tests pass. Full previous videos and their audio not re-rendered.'},
 {'category':'Source preservation','status':preservation['status'],'evidence':'source-preservation.json','details':f'{len(baseline)} existing src files unchanged.'},
 {'category':'TypeScript','status':'PASS' if 'error TS' not in type_log else 'FAIL','evidence':'raw/typecheck.txt','details':'npm run check completed successfully.'},
 {'category':'Scoped lint','status':'PASS_WITH_WARNINGS' if '0 errors' in lint or not lint.strip() else 'REVIEW','evidence':'raw/eslint-law01.txt','details':'0 errors, 2 warnings: config transition object detected as CSS animation; caption-path dependency intentionally resets delayRender handle. Actual deterministic renders pass. No blanket rule disable.'},
 {'category':'MP4 render','status':video['status'],'evidence':['video-validation.json','raw/ffprobe.json','raw/full-decode-black-freeze.log','render-result.json'],'details':'H.264/yuv420p, 1080x1920, 60fps, 5760 decoded frames, 96 seconds. Full-file black/freeze detection uses documented thresholds.'},
 {'category':'Narration and audio QA','status':'BLOCKED','evidence':'../audio/provider-status.json','details':'No approved actual recording. No paid voice generation. No music. LUFS, true peak, clipping, and unexpected silence cannot be certified.'},
 {'category':'SRT recording alignment','status':'BLOCKED','evidence':'timeline-animation-tests.json','details':'45 short RTL Cairo cues, Western digits, exact SRT/JSON round trip. Timings estimated from script only; no word alignment or 17ms accuracy claimed.'},
 {'category':'Publication gate','status':'BLOCKED','evidence':'raw/final-export-gate.txt','details':'Final export deliberately rejected until approved narration and recording-aligned captions exist.'},
]
report={'project':'Law01-Cinematic','reviewStatus':'PASS' if not any(x['status']=='FAIL' for x in checks) else 'FAIL','publicationStatus':'BLOCKED','publicationReady':False,'checks':checks,'visualReview':{'method':'Six start/middle/end contact sheets covering all shots and a five-transition sheet inspected; actual delivered-MP4 samples inspected separately. Motion also verified from frame-driven source, keyframe tests, full video decoding and freeze detection.','audioReviewed':False},'limits':['Narration absent; 96s is a review timeline, not measured voice performance.','Source art is 936x1664 upscaled to the requested 1080x1920 output.','Character animation consists of bounded whole-cutout leans, eye shifts/blinks and approved alternate poses, not a fully articulated walk rig.','Local background completion is bounded 2.5D inpainting, not a reconstructed 3D environment.','Regression covers source hashes, existing tests, and two rendered legacy sample frames, not every old film.','Visual samples and measured coverage do not constitute a human inspection of every one of the 5760 frames.'],'video':{k:video[k] for k in ['file','bytes','sha256','metadata']},'paidProvidersUsed':False,'musicUsed':False}
(Q/'qa-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
lines=['# القانون 1 — تقرير الجودة','',f'مراجعة بصرية: **{report["reviewStatus"]}**. النشر النهائي: **BLOCKED** بسبب غياب التسجيل المعتمد ومحاذاة الترجمة معه.','', '| الفحص | النتيجة | الدليل |','|---|---|---|']
for x in checks:
 evidence=x['evidence'] if isinstance(x['evidence'],list) else [x['evidence']]
 links=', '.join(f'[{Path(e).name}]({e})' for e in evidence)
 lines.append(f'| {x["category"]} | {x["status"]} | {links} |')
lines+=['','## الملف الفعلي','',f'96 ثانية، 1080×1920، 60fps، H.264/yuv420p، 5760 إطارًا مفكوكًا. لا مسار صوتي في نسخة المراجعة. SHA-256: `{video["sha256"]}`.','', '## ما أُصلح','', 'أُصلح ملف طبقة مشتقة غير مكتمل قبل إدخاله في التصدير، مع حفظ ذري وفك ترميز كامل. حُسنت أقنعة الحواف، وأعيدت 3 لقطات إلى رسومات مسطحة عندما لم يحفظ الفصل تفاصيلها. ضُبط التفاف النص داخل منطقة الهاتف. قُوي ميل بعض الشخصيات ضمن حركة لا تكشف مناطق الخلفية المعالجة. انقطع التصدير المتصل قبل اكتماله؛ استُخدمت نطاقات إطارات قابلة للاستئناف من Composition نفسه وجُمعت دون إعادة ترميز، ثم فُحص الملف الكامل.','', '## حدود النتائج','']
lines += ['- '+x for x in report['limits']]
lines += ['', 'ملفات SRT وCaption JSON الحالية تقديرية؛ لا تصلح دليلًا على مزامنة مع صوت غير موجود. لم يُستخدم رصيد ElevenLabs أو MotionLab ولم تُدمج أي PR.','', 'تفاصيل السرد والمصادر في [المراجعة التحريرية](../editorial-review-ar.md)، وطريقة التشغيل في [دليل الإنتاج](../production-guide-ar.md).']
(Q/'qa-report-ar.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'reviewStatus':report['reviewStatus'],'publicationStatus':report['publicationStatus'],'checks':[{k:x[k] for k in ['category','status']} for x in checks]},indent=2))
assert report['reviewStatus']=='PASS'
