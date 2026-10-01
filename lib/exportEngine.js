import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import JSZip from 'jszip';
import { loadFont } from './fonts.js';
import { buildPdf } from './pdf.js';

const SUPERSAMPLE = 2;

// WebKit (Safari, and every browser on iOS) rasterises the SVG snapshot
// before fonts and images embedded in it have decoded, so the first render
// can come out blank or in a fallback font. Chromium and Firefox do not.
const IS_WEBKIT =
  typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
const MAX_WEBKIT_RETRIES = 3;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const fontCssCache = new Map();

// Fonts are inlined as base64 @font-face rules inside the SVG snapshot.
// Without this the snapshot falls back to a system font mid-render, which is
// where disconnected Arabic letters in exports come from.
async function embeddedFontCss(node, fontId) {
  if (!fontCssCache.has(fontId)) {
    // Do not pass `preferredFontFormat`: html-to-image 1.11 filters it with a
    // shared global regex whose lastIndex leaks between @font-face rules, so
    // about every other face loses its src and silently drops out of the
    // snapshot (e.g. bold Arabic rendering as regular).
    fontCssCache.set(fontId, await getFontEmbedCSS(node));
  }
  return fontCssCache.get(fontId);
}

// Everything the snapshot depends on must be ready in the live DOM first:
// every font face the slide's text needs, decoded images, and a settled
// layout (FitBox re-fits when late fonts arrive, one frame later).
async function settle(node, fontId) {
  await loadFont(fontId, node.textContent);
  await Promise.all([...node.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  await nextFrame();
  await nextFrame();
}

// Canvases are freed explicitly: iOS Safari caps total canvas memory, and a
// 2x story canvas alone is ~33 MB.
export function release(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

function fingerprint(canvas) {
  const probe = document.createElement('canvas');
  probe.width = 36;
  probe.height = 48;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
  return ctx.getImageData(0, 0, probe.width, probe.height).data.join(',');
}

// On WebKit, re-render until two consecutive snapshots agree. Once WebKit
// has decoded the embedded fonts and images, renders become identical.
export async function renderStable(node, options) {
  let canvas = await toCanvas(node, options);
  if (!IS_WEBKIT) return canvas;
  for (let i = 0; i < MAX_WEBKIT_RETRIES; i++) {
    const next = await toCanvas(node, options);
    const same = fingerprint(next) === fingerprint(canvas);
    release(canvas);
    canvas = next;
    if (same) break;
  }
  return canvas;
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

export async function snapshotOptions(node, { fontId, background, width, height }) {
  await settle(node, fontId);
  return {
    width,
    height,
    pixelRatio: SUPERSAMPLE,
    backgroundColor: background,
    fontEmbedCSS: await embeddedFontCss(node, fontId),
    // The preview scales slides with a transform on the parent wrapper; make
    // sure nothing on the node itself shrinks the snapshot.
    style: { transform: 'none', margin: '0' },
  };
}

// One throwaway low-resolution render before a batch: it pushes the fonts
// and images through the SVG pipeline once, so the first real slide is not
// the one that pays for (or, on WebKit, suffers from) cold decoding.
async function warmUp(node, options) {
  release(await toCanvas(node, { ...(await snapshotOptions(node, options)), pixelRatio: 0.1 }));
}

// Always rasterises at 2x regardless of the screen's DPR, then either keeps
// it (scale 2) or downsamples to a crisp 1x (scale 1).
export async function renderSlide(node, options) {
  const canvas = await renderStable(node, await snapshotOptions(node, options));
  if (options.scale === SUPERSAMPLE) {
    const blob = await toBlob(canvas);
    release(canvas);
    return blob;
  }
  const out = downscale(canvas, options.width * options.scale, options.height * options.scale);
  release(canvas);
  const blob = await toBlob(out);
  release(out);
  return blob;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// "01-hook.png", "02-content.png", … "05-cta.png": the number fixes the
// posting order in any file browser, the role says what each image is.
export const slideFilename = (index, role) => `${String(index + 1).padStart(2, '0')}-${role}.png`;

export async function exportSlidePng(node, filename, options) {
  await warmUp(node, options);
  downloadBlob(await renderSlide(node, options), filename);
}

// Sequential on purpose: each 2x canvas is 23–33 MB of pixels.
async function renderAll(nodes, options, onProgress) {
  await warmUp(nodes[0], options);
  const blobs = [];
  for (let i = 0; i < nodes.length; i++) {
    onProgress?.(i, nodes.length);
    blobs.push(await renderSlide(nodes[i], options));
  }
  return blobs;
}

export async function exportCarouselZip(nodes, options, filenames, onProgress) {
  const zip = new JSZip();
  const blobs = await renderAll(nodes, options, onProgress);
  blobs.forEach((blob, i) => zip.file(filenames[i], blob));
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'carousel.zip');
}

export async function exportCarouselPdf(nodes, options, meta, onProgress) {
  const blobs = await renderAll(nodes, options, onProgress);
  const pngs = await Promise.all(blobs.map(async (b) => new Uint8Array(await b.arrayBuffer())));
  const bytes = await buildPdf(pngs, { width: options.width, height: options.height, ...meta });
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'carousel.pdf');
}
