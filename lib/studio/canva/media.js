import { probeImage } from '../assets.js';
import { unzip } from './zip.js';

// Checks on files exported from Canva (or built here), from their bytes:
// a PNG's pixel size, an MP4's duration, size and tracks, a PDF's page
// count and page sizes, a .pptx's slide count. Used to report "exported
// and verified" only when the file says so.

const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const type4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function* boxes(b, start, end) {
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    const type = type4(b, o + 4);
    let header = 8;
    if (size === 1) {
      size = Number((BigInt(u32(b, o + 8)) << 32n) | BigInt(u32(b, o + 12)));
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header || o + size > end) return;
    yield { type, start: o, body: o + header, end: o + size };
    o += size;
  }
}

export function probeMp4(bytes) {
  const b = bytes;
  const top = [...boxes(b, 0, b.length)];
  if (!top.some((x) => x.type === 'ftyp')) throw new Error('not an MP4 file (no ftyp box)');
  const moov = top.find((x) => x.type === 'moov');
  if (!moov) throw new Error('MP4 without a moov box');
  let duration = null;
  const tracks = [];
  for (const box of boxes(b, moov.body, moov.end)) {
    if (box.type === 'mvhd') {
      const v = b[box.body];
      const timescale = v === 1 ? u32(b, box.body + 20) : u32(b, box.body + 12);
      const dur = v === 1 ? Number((BigInt(u32(b, box.body + 24)) << 32n) | BigInt(u32(b, box.body + 28))) : u32(b, box.body + 16);
      duration = timescale ? dur / timescale : null;
    }
    if (box.type === 'trak') {
      const track = { kind: null, width: null, height: null };
      for (const t of boxes(b, box.body, box.end)) {
        if (t.type === 'tkhd') {
          const v = b[t.body];
          const at = t.body + (v === 1 ? 88 : 76);
          track.width = u32(b, at) / 65536;
          track.height = u32(b, at + 4) / 65536;
        }
        if (t.type === 'mdia') {
          for (const m of boxes(b, t.body, t.end)) {
            if (m.type === 'hdlr') track.kind = { vide: 'video', soun: 'audio' }[type4(b, m.body + 8)] ?? type4(b, m.body + 8);
            // mdia > minf > stbl > stsd: the first sample entry names the codec.
            if (m.type === 'minf') {
              for (const st of boxes(b, m.body, m.end)) {
                if (st.type !== 'stbl') continue;
                for (const sd of boxes(b, st.body, st.end)) if (sd.type === 'stsd' && sd.end - sd.body >= 16) track.codec = type4(b, sd.body + 12);
              }
            }
          }
        }
      }
      tracks.push(track);
    }
  }
  const video = tracks.find((t) => t.kind === 'video');
  return { format: 'mp4', duration, width: video?.width ?? null, height: video?.height ?? null, codec: video?.codec ?? null, hasAudio: tracks.some((t) => t.kind === 'audio'), tracks };
}

export function probePdf(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.startsWith('%PDF-')) throw new Error('not a PDF file');
  const pages = [...text.matchAll(/\/Type\s*\/Page(?![s\w])/g)].length;
  const boxesFound = [...text.matchAll(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g)].map((m) => ({ widthPt: Number(m[3]) - Number(m[1]), heightPt: Number(m[4]) - Number(m[2]) }));
  return { format: 'pdf', pages, sizes: boxesFound.slice(0, Math.max(1, pages)) };
}

export function probePptx(bytes, { inflateRaw } = {}) {
  const files = unzip(bytes, { inflateRaw });
  const slides = [...files.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;
  const pres = files.get('ppt/presentation.xml');
  const size = pres && /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(new TextDecoder().decode(pres));
  return { format: 'pptx', slides, widthPx: size ? Math.round(Number(size[1]) / 9525) : null, heightPx: size ? Math.round(Number(size[2]) / 9525) : null };
}

// Any exported file → what it is and its measurable properties.
export function probeFile(bytes, options) {
  if (bytes.length > 8 && type4(bytes, 4) === 'ftyp') return probeMp4(bytes);
  if (bytes.length > 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-') return probePdf(bytes);
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return probePptx(bytes, options);
  const img = probeImage(bytes);
  return { format: img.mediaType.split('/')[1], width: img.widthPx, height: img.heightPx };
}
