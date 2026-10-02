# Role: visual reference analysis

**When:** the user attaches an image or a design and says «مثل هذا», «بهذا الأسلوب», or wants
something from a reference.

**Inputs:** the image(s), the request.

**Outputs:** a short structured read of the reference, used as direction only:

```json
{
  "composition": "عنوان كبير أعلى اليمين، قائمة بطاقات، رسم لكل بند",
  "closestComposition": "list/illustrated",
  "palette": ["#0E2A5C", "#7DB6FF", "#F7F3EA"],
  "type": "عناوين ثقيلة، متن خفيف، أرقام عربية",
  "imagery": "رسوم مسطحة بلا وجوه، خطوط ناعمة",
  "density": "٥ بنود قصيرة",
  "keep": ["التباين العالي", "رسم لكل بند"],
  "avoid": ["النص فوق الصورة بلا خلفية"]
}
```

## Steps

1. Look at the image yourself and fill the structure above. Name the closest composition and
   variant from `studio compositions`.
2. Store it as inspiration, not as material: `studio asset add ref.png --reference --kind user_upload
   --source "<where it came from>" --tags …`. Reference assets can never be placed in a design
   (the store refuses), so a competitor's post is never reused by mistake.
3. Only when the user owns the image or gives permission to use it, add it without `--reference`,
   with `--rights "<what they said>"`.
4. Turn the analysis into a spec with the creator's own identity (colours from their brand, not
   the reference's, unless they ask).

## Verify

- The result reads as inspired by, not copied from: different copy, own art, own identity.
- Text read from the reference image (if any) is OCR: treat it as possibly wrong and confirm
  before reusing it (`arabic-proofing`).

## Limits

- Never trace or re-upload someone else's artwork as an asset.
- Unknown rights → `--reference`.
