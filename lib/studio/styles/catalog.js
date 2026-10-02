// Style records (Design Library V2). Data only: tokens, type, treatment,
// declarative decoration, layout, roles, formats, provenance and status.
// lib/studio/styles.js validates and applies them; docs/library/matrix.json
// says which composition pairs passed QA. A style is offered as ready only
// with status "reusable".
//
// Source values are inputs, never identity: the brand's accent replaces the
// source accent, Arabic faces replace Latin ones, and every visual decision
// made here for Arabic social posts is listed under "designedHere".

import { sourceRef } from './sources.js';

export const STYLES = [
  {
    kind: 'style',
    id: 'quiet-editorial',
    version: 1,
    status: 'preview_verified',
    family: 'editorial',
    name: 'تحريري هادئ',
    purpose: 'مقالات وقوائم هادئة القراءة: عنوان كبير في أعلى الصفحة، فراغ واسع، ولون تمييز واحد في كل صفحة',
    tone: 'متأنٍّ، واثق، بلا زخرفة',
    distinctFrom: { style: 'classic', how: 'بلا دوائر زخرفية ولا بطاقات مملوءة: بطاقات بإطار رفيع، وأرقام بلون التمييز بلا دوائر، وكتلة المحتوى مائلة إلى الأعلى، وزخرفة واحدة بلون التمييز فقط' },
    tokens: {
      light: { bg: '#FAF7F2', surface: '#FFFFFF', text: '#1C1A17', muted: '#6F6760' },
    },
    defaultMode: 'light',
    type: { titleScale: 1, titleWeight: 'bold', titleLineHeight: 1.35, headingFont: 'cairo', bodyFont: 'tajawal' },
    treatment: { pillRadius: 12, pillFill: 'outline', cardMode: 'outline', cardRadius: 16, badge: 'plain', ruleFill: '@text', ruleRadius: 0, artRadius: 16 },
    layout: { stackAlign: 'upper', margin: 96, maxScale: 1.35 },
    decor: {
      cover: [{ shape: 'rect', at: 'start', x: 'M', y: 'R-44', w: 140, h: 10, fill: '@accent', name: 'علامة التمييز الوحيدة' }],
      content: [{ shape: 'rect', at: 'start', x: 'M', y: 'R-32', w: 'W-2*M', h: 2, fill: '@muted', opacity: 0.45, name: 'خط علوي رفيع' }],
      cta: [{ shape: 'rect', at: 'start', x: 'M', y: 'R-44', w: 140, h: 10, fill: '@accent', name: 'علامة التمييز الوحيدة' }],
    },
    densities: ['comfortable', 'airy'],
    roles: ['cover', 'list', 'steps', 'quote', 'statement', 'evidence', 'checklist', 'cta'],
    formats: ['portrait', 'square', 'story'],
    rtl: ['المحاذاة من البداية (اليمين)', 'لا تباعد حروف ولا أحرف كبيرة', 'الزخرفة تُقاس من بداية القراءة'],
    provenance: [
      {
        source: sourceRef('opendesign/warm-editorial'),
        extracted: ['الخلفية الورقية #FAF7F2 والنص #1C1A17 والسطح #FFFFFF', 'زوايا بين 8 و24 (البطاقات 16 والأزرار 12)', 'لون تمييز واحد لكل صفحة', 'المحتوى مائل إلى الأعلى لا في الوسط', 'لا تدرجات ولا ظلال إلا للرفع'],
        adapted: ['لون التمييز الطيني استُبدل بلون الهوية', 'الخط الرأسي اللاتيني (serif) استُبدل بـ Cairo لعدم وجود خط عربي مذيّل في المجموعة', 'ارتفاع السطر 1.2/1.6 رُفع إلى 1.35/1.7 للتشكيل والنقاط', 'الرمادي #8A817A غُمّق إلى #6F6760 ليبلغ تباين 4.5'],
        notUsed: ['تباعد الحروف السالب', 'Title Case', 'شبكة 12 عمودًا لصفحات الويب'],
      },
    ],
    designedHere: ['خط علوي رفيع لصفحات المحتوى', 'أرقام القوائم بلون التمييز بلا دوائر', 'شارة بإطار بدل التعبئة'],
    keepCompositionDecor: false,
  },
];
