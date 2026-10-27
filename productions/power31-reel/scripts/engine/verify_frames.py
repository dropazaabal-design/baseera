from PIL import Image
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[2]
a=root/'out/final-repeat-a';b=root/'out/final-repeat-b';results=[]
for p in sorted(a.glob('*.png')):
 q=b/p.name
 equal=Image.open(p).convert('RGBA').tobytes()==Image.open(q).convert('RGBA').tobytes()
 assert equal,p.name
 results.append({'frame':p.stem,'pixel_equal':equal,'sha256_a':hashlib.sha256(p.read_bytes()).hexdigest(),'sha256_b':hashlib.sha256(q.read_bytes()).hexdigest()})
assert len(results)==3
(root/'docs/determinism-results.json').write_text(json.dumps(results,indent=2))
print(results)
