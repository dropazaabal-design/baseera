import { applyPatches } from '../patch.js';

// Local destination: the self-contained HTML editor with the document
// embedded. Every element stays independently editable there, fonts are
// embedded, and PNG / ZIP / PDF export runs in the browser, offline.

const SEED = /(<script id="carousel-seed" type="application\/json">)([\s\S]*?)(<\/script>)/;

// "<" is escaped so no text in the document can close the <script> tag.
export function injectSeed(template, doc) {
  if (!SEED.test(template)) throw new Error('the editor template has no carousel-seed tag');
  const seed = JSON.stringify(doc).replace(/</g, '\\u003c');
  return template.replace(SEED, (_, open, _old, close) => open + seed + close);
}

export function readSeed(html) {
  const m = SEED.exec(html);
  if (!m || !m[2].trim()) return null;
  return JSON.parse(m[2]);
}

export class LocalHtmlAdapter {
  constructor({ template, write, read }) {
    this.template = template;
    this.write = write;
    this.read = read;
  }

  async capabilities() {
    return {
      createDesign: true,
      insertText: true,
      updateText: true,
      setFontFamily: true,
      insertAsset: true,
      positionElements: true,
      preview: true,
      exportFormats: ['png', 'pdf'],
    };
  }

  async create(doc, { out }) {
    const missing = doc.pages.flatMap((p) => p.elements.filter((e) => e.kind === 'image' && !doc.assets?.[e.assetId]?.dataUrl).map((e) => e.assetId));
    if (missing.length) throw new Error(`assets without data cannot be embedded: ${[...new Set(missing)].join(', ')}`);
    this.write(out, injectSeed(this.template, doc));
    return {
      saved: true,
      editability: 'native',
      files: [{ format: 'html', storageRef: out }],
      limitations: ['صور PNG وملف ZIP وملف PDF تُصدَّر من الملف نفسه في المتصفح (Chrome أو Edge أو Firefox أو Safari).'],
    };
  }

  async patch(target, changes, options = {}) {
    const doc = readSeed(this.read(target));
    if (!doc) throw new Error(`${target} has no embedded design`);
    const { doc: next } = applyPatches(doc, changes, options);
    return this.create(next, { out: target });
  }

  async preview(target) {
    return target;
  }
}
