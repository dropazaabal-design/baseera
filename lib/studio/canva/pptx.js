import { FONTS } from '../../fonts.js';
import { parsePathToSubpaths, transformSubpaths } from './geometry.js';
import { svgToShapes } from './svgshapes.js';
import { zipStore } from './zip.js';
import { pageTheme, resolveColor, resolveFont } from '../theme.js';
import { dataUrlToBytes, hashOf } from '../util.js';
import { markHandles } from '../adapters/canva.js';

// DesignDocument → PowerPoint (.pptx), the native file route into Canva
// (and PowerPoint, Keynote, Google Slides). Unlike the connector, the file
// carries what Canva's edit tools cannot set:
//   - the font family (Cairo, Tajawal…) on every text run
//   - an accent colour on one word inside a text (*word* → its own run)
//   - right-to-left paragraphs (rtl="1", Arabic language tags)
// and keeps everything else separate and editable: each text is its own
// text box, shapes are native shapes, recolourable SVG illustrations become
// groups of native vector shapes, raster images stay pictures.
//
// Geometry: 1 px = 9525 EMU (96 DPI), so a 1080×1350 page is an
// 11.25 × 14.0625 in slide. Each element keeps our id as its shape name
// and the "baseera:<page>/<element>" tag in its description, so a read-back
// can be mapped to our elements.
//
// Per Canva's Help Center (checked 2026-10-02), a .pptx import keeps text,
// fonts Canva has, shapes and images, but not transitions, animations or
// slide timings. Timings and transitions are still written (useful in
// PowerPoint/Keynote); the build report says Canva drops them.

export const EMU_PER_PX = 9525;
const emu = (px) => Math.round(px * EMU_PER_PX);
const MEDIA_EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp' };

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// XML text: escape, and drop characters XML 1.0 forbids.
const esc = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const hex6 = (c) => String(c).replace('#', '').toUpperCase();

export function fontName(fontId) {
  return FONTS[fontId]?.label ?? FONTS[fontId === 'readex-pro' ? 'readex' : fontId]?.label ?? 'Cairo';
}

const solid = (color, alpha = 1) => `<a:solidFill>${alpha < 1 ? `<a:srgbClr val="${hex6(color)}"><a:alpha val="${Math.round(alpha * 100000)}"/></a:srgbClr>` : `<a:srgbClr val="${hex6(color)}"/>`}</a:solidFill>`;
const xfrm = (f, rot = 0) => `<a:xfrm${rot ? ` rot="${Math.round(rot * 60000)}"` : ''}><a:off x="${emu(f.x)}" y="${emu(f.y)}"/><a:ext cx="${Math.max(1, emu(f.width))}" cy="${Math.max(1, emu(f.height))}"/></a:xfrm>`;

// *word* markers → runs; the marked words take the accent colour.
// Handles inside Arabic text carry a left-to-right mark, as on the
// connector route: PowerPoint and Canva apply the plain bidi algorithm.
export function textRuns(text) {
  const runs = [];
  const parts = markHandles(text).split('*');
  parts.forEach((part, i) => {
    if (part) runs.push({ text: part, accent: i % 2 === 1 });
  });
  return runs;
}

function customGeometry(subpaths, box, { open = false } = {}) {
  const W = Math.max(1, emu(box.width));
  const H = Math.max(1, emu(box.height));
  const pt = ([x, y]) => `<a:pt x="${Math.round((x - box.x) * EMU_PER_PX)}" y="${Math.round((y - box.y) * EMU_PER_PX)}"/>`;
  const body = subpaths
    .map((p) => `<a:moveTo>${pt(p.start)}</a:moveTo>${p.segs.map((s) => (s.type === 'L' ? `<a:lnTo>${pt(s.to)}</a:lnTo>` : `<a:cubicBezTo>${pt(s.c1)}${pt(s.c2)}${pt(s.to)}</a:cubicBezTo>`)).join('')}${p.closed ? '<a:close/>' : ''}`)
    .join('');
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${W}" h="${H}"${open ? ' fill="none"' : ''}>${body}</a:path></a:pathLst></a:custGeom>`;
}

const CAP = { butt: 'flat', round: 'rnd', square: 'sq' };
const JOIN = { round: '<a:round/>', bevel: '<a:bevel/>', miter: '<a:miter lim="800000"/>' };
const line = (stroke) => (stroke ? `<a:ln w="${Math.max(1, emu(stroke.width))}" cap="${CAP[stroke.cap] ?? 'rnd'}">${solid(stroke.color, stroke.alpha ?? 1)}${JOIN[stroke.join] ?? '<a:round/>'}</a:ln>` : '<a:ln><a:noFill/></a:ln>');

class Slide {
  constructor(index) {
    this.index = index;
    this.nextId = 2;
    this.parts = [];
    this.rels = [];
    this.map = [];
  }

  id() {
    return this.nextId++;
  }

  rel(target, type) {
    const existing = this.rels.find((r) => r.target === target);
    if (existing) return existing.id;
    const id = `rId${this.rels.length + 2}`; // rId1 is the layout
    this.rels.push({ id, target, type });
    return id;
  }
}

function textShape(slide, el, page, colors, fonts, tag) {
  const id = slide.id();
  const rtl = el.style.direction !== 'ltr';
  const align = el.style.align === 'center' ? 'ctr' : (el.style.align === 'end') === rtl ? 'l' : 'r';
  const anchor = { start: 't', center: 'ctr', end: 'b' }[el.style.verticalAlign ?? 'start'];
  const font = fontName(resolveFont(el.style.fontFamily, fonts));
  const sizePt = (el.style.fontSize * 0.75);
  const sz = Math.min(400000, Math.max(100, Math.round(sizePt * 100)));
  const pitch = Math.min(158400, Math.round(sizePt * el.style.lineHeight * 100));
  const color = resolveColor(el.style.color, colors);
  const accent = resolveColor(el.style.accentColor ?? '@accent', colors);
  const alpha = el.opacity ?? 1;
  const lang = rtl ? 'ar-SA' : 'en-US';
  // Marked words on a marker band: PowerPoint's text highlight (the full
  // line height, where the page draws the lower part), in the text colour.
  const highlight = el.style.highlight ? resolveColor(el.style.highlight, colors) : null;
  const rPr = (c, hl = null) => `<a:rPr lang="${lang}" altLang="en-US" sz="${sz}"${el.style.weight >= 600 ? ' b="1"' : ' b="0"'} dirty="0">${solid(c, alpha)}${hl ? `<a:highlight><a:srgbClr val="${hex6(hl)}"/></a:highlight>` : ''}<a:latin typeface="${esc(font)}"/><a:ea typeface="${esc(font)}"/><a:cs typeface="${esc(font)}"/></a:rPr>`;
  const paragraphs = String(el.text).split('\n').map((lineText) => {
    const runs = textRuns(lineText).map((r) => `<a:r>${r.accent && highlight ? rPr(color, highlight) : rPr(r.accent ? accent : color)}<a:t>${esc(r.text)}</a:t></a:r>`).join('');
    return `<a:p><a:pPr algn="${align}" rtl="${rtl ? 1 : 0}"><a:lnSpc><a:spcPts val="${pitch}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>${runs}<a:endParaRPr lang="${lang}" sz="${sz}" dirty="0"/></a:p>`;
  });
  slide.parts.push(
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(el.id)}" descr="${esc(tag)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el.frame, el.rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="${el.style.nowrap ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs.join('')}</p:txBody></p:sp>`,
  );
  return { shapeId: id, as: 'text', font };
}

function shapeShape(slide, el, colors, tag) {
  const id = slide.id();
  const fill = el.fill === 'none' ? null : resolveColor(el.fill, colors);
  const stroke = el.stroke ? resolveColor(el.stroke, colors) : null;
  const alpha = el.opacity ?? 1;
  const f = el.frame;
  let geometry;
  let frame = f;
  if (el.shape === 'path' || el.shape === 'line') {
    const [vw, vh] = el.viewBox ?? [f.width, f.height];
    const k = [f.width / vw, 0, 0, f.height / vh, f.x, f.y];
    const subpaths = transformSubpaths(parsePathToSubpaths(el.path), k);
    geometry = customGeometry(subpaths, f, { open: !fill });
    const sw = (el.strokeWidth ?? 1) * (f.width / vw);
    return push(stroke ? { color: stroke, alpha, width: sw, cap: 'round', join: 'round' } : null);
  }
  // Our renderer draws rect/ellipse outlines inside the box; PowerPoint
  // centres them on the outline, so the outline geometry is inset by half.
  const sw = stroke ? el.strokeWidth ?? 1 : 0;
  frame = sw ? { x: f.x + sw / 2, y: f.y + sw / 2, width: Math.max(1, f.width - sw), height: Math.max(1, f.height - sw) } : f;
  if (el.shape === 'ellipse') geometry = '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';
  else if (el.radius) {
    const m = Math.min(frame.width, frame.height);
    geometry = `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round((Math.min(el.radius, m / 2) / m) * 100000)}"/></a:avLst></a:prstGeom>`;
  } else geometry = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return push(stroke ? { color: stroke, alpha, width: sw, cap: 'round', join: 'round' } : null);

  function push(ln) {
    slide.parts.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(el.id)}" descr="${esc(tag)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(frame, el.rotation)}${geometry}${fill ? solid(fill, alpha) : '<a:noFill/>'}${line(ln)}</p:spPr></p:sp>`,
    );
    return { shapeId: id, as: 'shape' };
  }
}

function svgGroup(slide, el, svgText, colors, tag, report) {
  const { shapes, degraded } = svgToShapes(svgText, el.frame, { colors: el.colorable === false ? null : colors, fit: el.fit ?? 'contain' });
  for (const d of degraded) report.degraded.push({ elementId: el.id, note: d });
  const gid = slide.id();
  const children = shapes.map((s) => {
    const id = slide.id();
    const box = s.bounds.width && s.bounds.height ? s.bounds : { ...s.bounds, width: Math.max(s.bounds.width, 0.1), height: Math.max(s.bounds.height, 0.1) };
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(`${el.id}/${s.name}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(box)}${customGeometry(s.subpaths, box, { open: !s.fill })}${s.fill ? solid(s.fill.color, s.fill.alpha * (el.opacity ?? 1)) : '<a:noFill/>'}${line(s.stroke && { ...s.stroke, alpha: s.stroke.alpha * (el.opacity ?? 1) })}</p:spPr></p:sp>`;
  });
  const f = el.frame;
  const off = `<a:off x="${emu(f.x)}" y="${emu(f.y)}"/><a:ext cx="${Math.max(1, emu(f.width))}" cy="${Math.max(1, emu(f.height))}"/>`;
  slide.parts.push(
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${gid}" name="${esc(el.id)}" descr="${esc(el.alt || tag)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm${el.rotation ? ` rot="${Math.round(el.rotation * 60000)}"` : ''}>${off}<a:chOff x="${emu(f.x)}" y="${emu(f.y)}"/><a:chExt cx="${Math.max(1, emu(f.width))}" cy="${Math.max(1, emu(f.height))}"/></a:xfrm></p:grpSpPr>${children.join('')}</p:grpSp>`,
  );
  return { shapeId: gid, as: 'vector-group', shapes: shapes.length };
}

function picture(slide, el, asset, media, tag) {
  const id = slide.id();
  const rid = slide.rel(`../media/${media.name}`, `${REL}/image`);
  const f = el.frame;
  const ar = asset.widthPx / asset.heightPx;
  let box = f;
  let crop = '';
  if (el.fit === 'cover') {
    const fr = f.width / f.height;
    if (ar > fr) {
      const keep = fr / ar;
      const side = Math.round(((1 - keep) / 2) * 100000);
      crop = `<a:srcRect l="${side}" r="${side}"/>`;
    } else if (ar < fr) {
      const keep = ar / fr;
      const side = Math.round(((1 - keep) / 2) * 100000);
      crop = `<a:srcRect t="${side}" b="${side}"/>`;
    }
  } else {
    const w = Math.min(f.width, f.height * ar);
    const h = w / ar;
    box = { x: f.x + (f.width - w) / 2, y: f.y + (f.height - h) / 2, width: w, height: h };
  }
  const geometry = el.radius ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round((Math.min(el.radius, Math.min(box.width, box.height) / 2) / Math.min(box.width, box.height)) * 100000)}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const alpha = el.opacity !== undefined && el.opacity < 1 ? `<a:alphaModFix amt="${Math.round(el.opacity * 100000)}"/>` : '';
  slide.parts.push(
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(el.id)}" descr="${esc(el.alt || tag)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${alpha}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box, el.rotation)}${geometry}</p:spPr></p:pic>`,
  );
  return { shapeId: id, as: 'picture' };
}

const TRANSITIONS = { fade: '<p:fade/>', push: '<p:push dir="u"/>', wipe: '<p:wipe dir="u"/>', cut: '<p:cut/>' };

// options:
//   assetBytes(asset) → Uint8Array   bytes of an asset (default: its dataUrl)
//   timing: [{ seconds, transition }] per page (reels); written for
//           PowerPoint/Keynote, dropped by Canva's import
//   title
// → { bytes, fingerprint, slides: [{ pageId, index, elements: [...] }], report }
export function buildPptx(doc, { assetBytes, timing, title } = {}) {
  const first = doc.pages[0];
  const sizes = new Set(doc.pages.map((p) => `${p.widthPx}x${p.heightPx}`));
  if (sizes.size > 1) throw new Error('a .pptx has one slide size: all pages must share it');
  const fonts = doc.theme.fonts;
  const report = { native: { text: 0, shape: 0, vectorGroup: 0, picture: 0 }, skipped: [], degraded: [], fonts: new Set(), limitations: [] };
  const media = new Map(); // contentHash → { name, bytes, type }
  const bytesOf = (asset) => {
    if (assetBytes) return assetBytes(asset);
    return asset?.dataUrl ? dataUrlToBytes(asset.dataUrl)?.bytes ?? null : null;
  };

  const slides = doc.pages.map((page, i) => {
    const slide = new Slide(i + 1);
    const { colors } = pageTheme(doc, page);
    const elements = [...page.elements].filter((e) => !e.hidden).sort((a, b) => a.z - b.z);
    for (const el of elements) {
      const tag = `baseera:${page.id}/${el.id}`;
      let placed = null;
      if (el.kind === 'text') {
        placed = textShape(slide, el, page, colors, fonts, tag);
        report.native.text++;
        report.fonts.add(placed.font);
      } else if (el.kind === 'shape') {
        placed = shapeShape(slide, el, colors, tag);
        report.native.shape++;
      } else if (el.kind === 'image') {
        const asset = doc.assets?.[el.assetId];
        const bytes = asset && bytesOf(asset);
        if (!asset || !bytes) {
          report.skipped.push({ pageId: page.id, elementId: el.id, reason: 'asset bytes missing' });
          continue;
        }
        if (asset.mediaType === 'image/svg+xml') {
          try {
            placed = svgGroup(slide, { ...el, colorable: asset.colorable ? undefined : false }, new TextDecoder().decode(bytes), colors, tag, report);
            report.native.vectorGroup++;
          } catch (err) {
            report.skipped.push({ pageId: page.id, elementId: el.id, reason: `SVG could not be converted: ${err.message}` });
            continue;
          }
        } else if (MEDIA_EXT[asset.mediaType]) {
          if (!media.has(asset.contentHash)) media.set(asset.contentHash, { name: `image${media.size + 1}.${MEDIA_EXT[asset.mediaType]}`, bytes, type: asset.mediaType });
          placed = picture(slide, el, asset, media.get(asset.contentHash), tag);
          report.native.picture++;
        } else {
          report.skipped.push({ pageId: page.id, elementId: el.id, reason: `${asset.mediaType} cannot go in a .pptx` });
          continue;
        }
      }
      if (placed) slide.map.push({ elementId: el.id, kind: el.kind, name: el.id, ...placed });
    }
    const t = timing?.[i];
    const transition = t ? `<p:transition spd="fast" advClick="0" advTm="${Math.round(t.seconds * 1000)}">${TRANSITIONS[t.transition] ?? ''}</p:transition>` : '';
    slide.xml = `${XML}<p:sld ${NS}><p:cSld><p:bg><p:bgPr>${solid(colors.bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${slide.parts.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transition}</p:sld>`;
    return slide;
  });

  if (timing?.length) report.limitations.push('مدد الشرائح والانتقالات مكتوبة في الملف لـ PowerPoint وKeynote، لكن Canva لا يستوردها (مركز مساعدة Canva): تُضبط في Canva يدويًا.');
  if (doc.pages.some((p) => p.elements.some((e) => e.kind === 'text' && !e.hidden && e.style.highlight && e.text.includes('*')))) report.limitations.push('الكلمات المظلّلة مكتوبة بتظليل النص في PowerPoint: يغطي ارتفاع السطر كله بدل نصفه السفلي كما في المعاينة.');
  if (report.skipped.length) report.limitations.push(`${report.skipped.length} عنصر لم يُنقل: ${report.skipped.map((s) => `${s.elementId} (${s.reason})`).join('، ')}`);

  const cx = emu(first.widthPx);
  const cy = emu(first.heightPx);
  const files = [];
  const add = (name, data) => files.push({ name, data });
  const mediaTypes = [...new Set([...media.values()].map((m) => m.type))];
  add(
    '[Content_Types].xml',
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaTypes.map((t) => `<Default Extension="${MEDIA_EXT[t]}" ContentType="${t}"/>`).join('')}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>${slides.map((s) => `<Override PartName="/ppt/slides/slide${s.index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  add(
    '_rels/.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  const name = title ?? doc.brief ?? 'تصميم';
  add(
    'docProps/core.xml',
    `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(name)}</dc:title><dc:creator>بصيرة</dc:creator><dc:language>ar</dc:language><dc:identifier>${esc(doc.id)}</dc:identifier>${doc.createdAt ? `<dcterms:created xsi:type="dcterms:W3CDTF">${esc(doc.createdAt)}</dcterms:created>` : ''}</cp:coreProperties>`,
  );
  add(
    'docProps/app.xml',
    `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Baseera</Application><Slides>${slides.length}</Slides></Properties>`,
  );
  add(
    'ppt/presentation.xml',
    `${XML}<p:presentation ${NS} saveSubsetFonts="1" rtl="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((s) => `<p:sldId id="${255 + s.index}" r:id="rId${s.index + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  const n = slides.length;
  add(
    'ppt/_rels/presentation.xml.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((s) => `<Relationship Id="rId${s.index + 1}" Type="${REL}/slide" Target="slides/slide${s.index}.xml"/>`).join('')}<Relationship Id="rId${n + 2}" Type="${REL}/presProps" Target="presProps.xml"/><Relationship Id="rId${n + 3}" Type="${REL}/viewProps" Target="viewProps.xml"/><Relationship Id="rId${n + 4}" Type="${REL}/theme" Target="theme/theme1.xml"/><Relationship Id="rId${n + 5}" Type="${REL}/tableStyles" Target="tableStyles.xml"/></Relationships>`,
  );
  add('ppt/presProps.xml', `${XML}<p:presentationPr ${NS}/>`);
  add('ppt/viewProps.xml', `${XML}<p:viewPr ${NS}><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  add('ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  add('ppt/theme/theme1.xml', themeXml(doc.theme, fontName(fonts.heading), fontName(fonts.body)));
  const emptyTree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree>';
  add(
    'ppt/slideMasters/slideMaster1.xml',
    `${XML}<p:sldMaster ${NS}><p:cSld>${emptyTree}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="r" rtl="1"><a:defRPr/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="r" rtl="1"><a:defRPr/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="r" rtl="1"><a:defRPr/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
  );
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  add('ppt/slideLayouts/slideLayout1.xml', `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${emptyTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  add(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  );
  for (const s of slides) {
    add(`ppt/slides/slide${s.index}.xml`, s.xml);
    add(
      `ppt/slides/_rels/slide${s.index}.xml.rels`,
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${s.rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')}</Relationships>`,
    );
  }
  for (const m of media.values()) add(`ppt/media/${m.name}`, m.bytes);

  const bytes = zipStore(files);
  return {
    bytes,
    mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    fingerprint: hashOf({ pages: doc.pages.map((p) => [p.id, p.widthPx, p.heightPx, p.elements]), theme: doc.theme, timing: timing ?? null }),
    slides: slides.map((s, i) => ({ index: s.index, pageId: doc.pages[i].id, elements: s.map })),
    report: { ...report, fonts: [...report.fonts] },
  };
}

function themeXml(theme, heading, body) {
  const c = theme.colors;
  const scheme = (tag, v) => `<a:${tag}><a:srgbClr val="${hex6(v)}"/></a:${tag}>`;
  const fill3 = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const ln = (w) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
  return `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Baseera"><a:themeElements><a:clrScheme name="Baseera">${scheme('dk1', c.text === '#FFFFFF' ? '#000000' : c.text)}${scheme('lt1', '#FFFFFF')}${scheme('dk2', c.bg)}${scheme('lt2', c.surface)}${scheme('accent1', c.accent)}${scheme('accent2', c.muted)}${scheme('accent3', c.surface)}${scheme('accent4', c.onAccent)}${scheme('accent5', c.text)}${scheme('accent6', c.bg)}${scheme('hlink', c.accent)}${scheme('folHlink', c.muted)}</a:clrScheme><a:fontScheme name="Baseera"><a:majorFont><a:latin typeface="${esc(heading)}"/><a:ea typeface=""/><a:cs typeface="${esc(heading)}"/></a:majorFont><a:minorFont><a:latin typeface="${esc(body)}"/><a:ea typeface=""/><a:cs typeface="${esc(body)}"/></a:minorFont></a:fontScheme><a:fmtScheme name="Baseera"><a:fillStyleLst>${fill3}${fill3}${fill3}</a:fillStyleLst><a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fill3}${fill3}${fill3}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

// Reads back the texts of a .pptx (ours, or one exported from Canva), per
// slide, joining runs and paragraphs as our text model does.
export function readPptxTexts(files) {
  const slides = [...files.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return slides.map((name, index) => {
    const xml = new TextDecoder().decode(files.get(name));
    const size = null;
    const texts = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)]
      .map(([, sp]) => {
        const nameAttr = /<p:cNvPr [^>]*name="([^"]*)"/.exec(sp)?.[1];
        const body = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(sp)?.[1];
        if (!body) return null;
        const paragraphs = [...body.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(([, p]) => [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(([, t]) => decode(t)).join(''));
        const text = paragraphs.join('\n');
        return text.trim() ? { name: nameAttr ? decode(nameAttr) : null, text, rtl: /rtl="1"/.test(body), fonts: [...new Set([...body.matchAll(/<a:cs typeface="([^"]*)"/g)].map((m) => decode(m[1])))] } : null;
      })
      .filter(Boolean);
    return { index, size, texts };
  });
}
