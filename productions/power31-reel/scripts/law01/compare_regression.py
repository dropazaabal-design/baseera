"""Compare actual raster pixels from independent browser renderings."""
from pathlib import Path
from PIL import Image
import hashlib
import json,sys
import numpy as np

R = Path(__file__).resolve().parents[2]
Q = R / 'projects/law01-cinematic/qa'
if '--recorded' in sys.argv:Q=Q/'final'
cases = json.loads((Q/'determinism-cases.json').read_text())
def compare(a,b,**extra):
    ap,bp=Q/a,Q/b
    with Image.open(ap) as im: im.load(); aa=np.array(im.convert('RGBA'))
    with Image.open(bp) as im: im.load(); bb=np.array(im.convert('RGBA'))
    return {**extra,'before':a,'after':b,'sameDimensions':aa.shape==bb.shape,'pixelEqual':bool(np.array_equal(aa,bb)),'maximumChannelDifference':int(np.abs(aa.astype(int)-bb.astype(int)).max()),'beforeSHA256':hashlib.sha256(ap.read_bytes()).hexdigest(),'afterSHA256':hashlib.sha256(bp.read_bytes()).hexdigest()}
det = [compare(f'repeat-final/{x["shot"]}-a.png',f'repeat-final/{x["shot"]}-b.png',**x) for x in cases]
reg = [compare(f'legacy-before-{name}.png',f'legacy-after-{name}.png',composition=comp,frame=frame) for name,comp,frame in [('cinematic','CinematicDemo',360),('workflow','Power31-Cinematic',300)]]
report={'status':'PASS' if all(x['pixelEqual'] for x in det+reg) else 'FAIL','independentBrowserRenders':det,'legacyBeforeAfter':reg,'scope':'Three actual Law01 frames rendered in two independent Chrome instances; two legacy sample frames compared against pre-change renders. Existing Workflow uses the canonical SVG project with unavailable narration/SRT disabled. Full legacy films and legacy audio were not re-rendered.'}
(Q/'render-determinism-regression.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
assert report['status']=='PASS'
