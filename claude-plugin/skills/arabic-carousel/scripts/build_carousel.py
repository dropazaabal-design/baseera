#!/usr/bin/env python3
"""Validate a carousel JSON file and write the standalone editor with it embedded.

Usage: build_carousel.py <carousel.json> [output.html]
"""
import json
import re
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((SKILL / "references" / "schema.json").read_text(encoding="utf-8"))
TEMPLATE = SKILL / "assets" / "carousel.html"
SEED = re.compile(r'(<script id="carousel-seed" type="application/json">)(.*?)(</script>)', re.S)

TEMPLATES = {t["id"]: {f["key"]: f["type"] for f in t["fields"]} for t in SCHEMA["templates"]}
FONTS = [f["id"] for f in SCHEMA["fonts"]]
FORMATS = [f["id"] for f in SCHEMA["formats"]]
PALETTES = [p["id"] for p in SCHEMA["palettes"]] + ["custom"]
PLUGINS = {p["id"]: p["defaults"] for p in SCHEMA["plugins"]}
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
AR = "؀-ۿ"
MAX_SLIDES = 20  # Instagram's carousel limit


def field_ok(ftype, value):
    if ftype in ("text", "textarea"):
        return isinstance(value, str)
    if ftype == "list":
        return isinstance(value, list) and all(isinstance(v, str) for v in value)
    if ftype == "number":
        return isinstance(value, int) and not isinstance(value, bool) and value >= 1
    if ftype == "image":
        return value is None or (isinstance(value, str) and value.startswith("data:image/"))
    return False


def texts(value):
    if isinstance(value, str):
        return [value]
    return value if isinstance(value, list) else []


def lint(where, text, warnings):
    if re.search(rf"[{AR}]\s*[,;?]", text):
        warnings.append(f"{where}: use Arabic punctuation (، ؛ ؟) after Arabic words")
    if re.search(rf'"[^"]*[{AR}][^"]*"', text):
        warnings.append(f'{where}: use «» instead of "" around Arabic text')
    if "ـ" in text:
        warnings.append(f"{where}: remove tatweel (ـ); Arabic is not stretched to fill lines")
    if re.search("[‎‏‪-‮⁦-⁩]", text):
        warnings.append(f"{where}: remove bidi control characters; the renderer isolates mixed text itself")


def check_object(where, value, errors):
    if not isinstance(value, dict):
        errors.append(f"{where}: must be an object")
        return {}
    return value


def validate(doc):
    errors, warnings = [], []
    doc = check_object("top level", doc, errors)
    for key in doc.keys() - {"slides", "design", "brand", "plugins", "governance"}:
        errors.append(f"{key}: unknown top-level key (allowed: slides, design, brand, plugins, governance)")

    slides = doc.get("slides")
    if not isinstance(slides, list) or not slides:
        errors.append("slides: need a list with at least one slide")
        slides = []
    if len(slides) > MAX_SLIDES:
        errors.append(f"slides: at most {MAX_SLIDES} slides")
    for i, slide in enumerate(slides, 1):
        where = f"slides[{i}]"
        if not isinstance(slide, dict) or slide.get("template") not in TEMPLATES:
            errors.append(f"{where}.template: must be one of {', '.join(TEMPLATES)}")
            continue
        fields = TEMPLATES[slide["template"]]
        for key, value in check_object(f"{where}.data", slide.get("data", {}), errors).items():
            if key not in fields:
                errors.append(f"{where}.data.{key}: not a '{slide['template']}' field (allowed: {', '.join(fields)})")
            elif not field_ok(fields[key], value):
                expected = "null or a data:image/... URL" if fields[key] == "image" else fields[key]
                errors.append(f"{where}.data.{key}: expected {expected}")
            elif fields[key] != "image":
                for text in texts(value):
                    lint(f"{where}.data.{key}", text, warnings)
    templates_used = [s.get("template") for s in slides if isinstance(s, dict)]
    if templates_used and templates_used[0] != "cover":
        warnings.append("slides[1]: carousels usually open with a 'cover' slide")
    if len(templates_used) > 1 and templates_used[-1] != "outro":
        warnings.append(f"slides[{len(slides)}]: carousels usually end with an 'outro' slide")

    design = check_object("design", doc.get("design", {}), errors)
    if "font" in design and design["font"] not in FONTS:
        errors.append(f"design.font: must be one of {', '.join(FONTS)}")
    if "paletteId" in design and design["paletteId"] not in PALETTES:
        errors.append(f"design.paletteId: must be one of {', '.join(PALETTES)}")
    if design.get("paletteId") == "custom":
        custom = design.get("custom")
        if not isinstance(custom, dict) or not all(HEX.match(str(custom.get(k, ""))) for k in ("bg", "accent")):
            errors.append('design.custom: needs {"bg": "#RRGGBB", "accent": "#RRGGBB"}')
    if "format" in design and design["format"] not in FORMATS:
        errors.append(f"design.format: must be one of {', '.join(FORMATS)}")
    if "numerals" in design and design["numerals"] not in SCHEMA["numerals"]:
        errors.append(f"design.numerals: must be one of {', '.join(SCHEMA['numerals'])}")

    brand = check_object("brand", doc.get("brand", {}), errors)
    for key, value in brand.items():
        if key in ("name", "handle"):
            if not isinstance(value, str):
                errors.append(f"brand.{key}: must be text")
            else:
                lint(f"brand.{key}", value, warnings)
        elif key in ("logo", "avatar"):
            if value is not None and not (isinstance(value, str) and value.startswith("data:image/")):
                errors.append(f"brand.{key}: must be null or a data:image/... URL")
        else:
            errors.append(f"brand.{key}: unknown key (allowed: name, handle, logo, avatar)")

    for key, value in check_object("governance", doc.get("governance", {}), errors).items():
        if key not in ("institutional", "locked"):
            errors.append(f"governance.{key}: unknown key (allowed: institutional, locked)")
        elif not isinstance(value, bool):
            errors.append(f"governance.{key}: expected true or false")

    for pid, settings in check_object("plugins", doc.get("plugins", {}), errors).items():
        if pid not in PLUGINS:
            errors.append(f"plugins.{pid}: unknown plugin (allowed: {', '.join(PLUGINS)})")
            continue
        for key, value in check_object(f"plugins.{pid}", settings, errors).items():
            if key not in PLUGINS[pid]:
                errors.append(f"plugins.{pid}.{key}: unknown setting (allowed: {', '.join(PLUGINS[pid])})")
            elif type(value) is not type(PLUGINS[pid][key]):
                errors.append(f"plugins.{pid}.{key}: expected {type(PLUGINS[pid][key]).__name__}")
    return errors, warnings


def main(argv):
    if len(argv) not in (2, 3):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    src = Path(argv[1])
    out = Path(argv[2]) if len(argv) == 3 else src.with_suffix(".html")
    try:
        doc = json.loads(src.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1

    errors, warnings = validate(doc)
    for warning in warnings:
        print(f"warning: {warning}")
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    # "<" is escaped so no text can close the <script> it is embedded in.
    seed = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    html, count = SEED.subn(lambda m: m.group(1) + seed + m.group(3), TEMPLATE.read_text(encoding="utf-8"), count=1)
    if count != 1:
        print("error: assets/carousel.html has no carousel-seed tag", file=sys.stderr)
        return 1
    out.write_text(html, encoding="utf-8")
    print(f"ok: {len(doc['slides'])} slides -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
