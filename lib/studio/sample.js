import { inlineAsset } from './assets.js';
import { createDesign } from './document.js';
import { themeFromPalette } from './theme.js';
import { base64Encode, utf8 } from './util.js';

// The design the studio opens with when no file is embedded: a short
// carousel that shows each composition, with one recolourable illustration.

const OPEN_BOOK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><path d="M24 72 V190 C60 180 96 182 120 198 C144 182 180 180 216 190 V72 C180 62 144 64 120 80 C96 64 60 62 24 72 Z" fill="#7DB6FF" data-token="accent"/><path d="M120 74 C96 58 62 56 34 64 V180 C62 172 96 174 120 188 Z" fill="#F1F5F9" data-token="text"/><path d="M120 74 C144 58 178 56 206 64 V180 C178 172 144 174 120 188 Z" fill="#F1F5F9" data-token="text"/><path d="M120 76 V188" stroke="#A9B8CE" data-token-stroke="muted" stroke-width="3" fill="none"/><g fill="none" stroke="#0E2A5C" data-token-stroke="bg" stroke-width="5" stroke-linecap="round" opacity="0.45"><path d="M50 88 C70 82 90 82 106 90"/><path d="M50 108 C70 102 90 102 106 110"/><path d="M50 128 C70 122 90 122 106 130"/><path d="M134 90 C150 82 170 82 190 88"/><path d="M134 110 C150 102 170 102 190 108"/><path d="M134 130 C150 122 170 122 190 128"/></g></svg>`;

export function createSampleDesign(options) {
  const art = inlineAsset(`data:image/svg+xml;base64,${base64Encode(utf8(OPEN_BOOK))}`, {
    tags: ['كتاب', 'قراءة'],
    provenance: { kind: 'generated', source: 'baseera starter pack (AI-authored SVG)', rightsNote: 'original artwork for this project' },
    name: 'open-book.svg',
  });
  return createDesign(
    {
      brief: 'مثال الاستوديو: عادات القراءة',
      intent: { mode: 'carousel', format: 'portrait', platform: 'instagram', pages: 4 },
      theme: themeFromPalette('midnight', { fonts: { heading: 'cairo', body: 'tajawal' } }),
      brand: { name: 'بصيرة', handle: '@baseera' },
      assets: { [art.id]: art },
      pages: [
        { composition: 'hero', variant: 'art', keepArt: true, content: { kicker: 'دليل القارئ', title: '٥ عادات *تضاعف* قراءتك', subtitle: 'خطوات بسيطة جرّبها فريق Baseera مع أكثر من 300 قارئ.', art: art.id, artAlt: 'كتاب مفتوح' } },
        { composition: 'list', variant: 'cards', content: { title: 'ابدأ *بخطوات* صغيرة', items: ['اقرأ ١٠ صفحات قبل النوم', 'احمل كتابًا أينما ذهبت', 'دوّن فكرة من كل فصل', 'أغلق الإشعارات أثناء القراءة'] } },
        { composition: 'comparison', variant: 'columns', content: { title: 'القراءة *السطحية* والعميقة', beforeLabel: 'سطحية', before: ['تقفز بين الصفحات', 'تنسى ما قرأت'], afterLabel: 'عميقة', after: ['تقرأ بتركيز', 'تتذكر الأفكار'] } },
        { composition: 'outro', content: { title: 'هل كان المحتوى *مفيدًا*؟', subtitle: 'احفظه وتابعنا لمحتوى عملي كل أسبوع.', save: 'احفظه', share: 'شاركه', follow: 'تابعنا', socials: ['@baseera'] } },
      ],
    },
    options,
  );
}
