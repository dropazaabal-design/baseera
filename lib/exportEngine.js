import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import JSZip from 'jszip';
import { loadFont } from './fonts.js';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
const SUPERSAMPLE = 2;

const fontCssCache = new Map();

// Fonts are inlined as base64 @font-face rules inside the SVG snapshot.
// Without this the snapshot falls back to a system font mid-render, which is
// where disconnected Arabic letters in exports come from.
async function embeddedFontCss(node, fontId) {
  await loadFont(fontId);
  if (!fontCssCache.has(fontId)) {
    // Do not pass `preferredFontFormat`: html-to-image 1.11 filters it with a
    // shared global regex whose lastIndex leaks between @font-face rules, so
    // about every other face loses its src and silently drops out of the
    // snapshot (e.g. bold Arabic rendering as regular).
    fontCssCache.set(fontId, await getFontEmbedCSS(node));
  }
  return fontCssCache.get(fontId);
}

function downscale(source, width, height) {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return out;
}

const toBlob = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذّر إنشاء ملف الصورة'))), 'image/png'),
  );

// Always rasterises at 2x (2160×2700) regardless of the screen's DPR, then
// either keeps it (scale 2) or downsamples to a crisp 1080×1350 (scale 1).
export async function renderSlide(node, { fontId, background, scale = 1 }) {
  const fontEmbedCSS = await embeddedFontCss(node, fontId);
  const canvas = await toCanvas(node, {
    width: SLIDE_W,
    height: SLIDE_H,
    pixelRatio: SUPERSAMPLE,
    backgroundColor: background,
    fontEmbedCSS,
    // The preview scales slides with a transform on the parent wrapper; make
    // sure nothing on the node itself shrinks the snapshot.
    style: { transform: 'none', margin: '0' },
  });
  const out = scale === SUPERSAMPLE ? canvas : downscale(canvas, SLIDE_W * scale, SLIDE_H * scale);
  return toBlob(out);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slideFilename = (i) => `slide-${String(i + 1).padStart(2, '0')}.png`;

export async function exportSlidePng(node, index, options) {
  downloadBlob(await renderSlide(node, options), slideFilename(index));
}

// Sequential on purpose: each 2x canvas is ~23 MB of pixels.
export async function exportCarouselZip(nodes, options, onProgress) {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i, nodes.length);
    zip.file(slideFilename(i), await renderSlide(nodes[i], options));
  }
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'carousel.zip');
}
