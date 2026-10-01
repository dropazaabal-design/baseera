import { test } from 'node:test';
import assert from 'node:assert/strict';
import { richLines, segmentBidi } from '../lib/bidi.js';

// Golden cases: input → the exact runs that must be isolated as LTR.
const ltrRuns = (s) => segmentBidi(s).filter((x) => x.ltr).map((x) => x.text);

const GOLDEN = [
  ['pure Arabic', 'خمس عادات تضاعف إنتاجيتك', []],
  ['Arabic-Indic year', 'في عام ٢٠٢٦', ['٢٠٢٦']],
  ['brand name', 'جرّبنا Notion لمدة شهر', ['Notion']],
  ['two brands split by Arabic و', 'استخدم Notion و Google Calendar', ['Notion', 'Google Calendar']],
  ['latin list joined by comma', 'أدوات مثل React, Vue للواجهات', ['React, Vue']],
  ['percent keeps its side', 'زادت الإنتاجية 40% خلال شهر', ['40%']],
  ['Arabic percent stays outside the run', 'زادت ٥٠٪ فقط', ['٥٠']],
  ['phone digit groups stay in order', 'اتصل على +966 50 123 4567 الآن', ['+966 50 123 4567']],
  ['hyphenated date', 'الموعد 01-10-2026 مساءً', ['01-10-2026']],
  ['time', 'نبدأ 11:00 م', ['11:00']],
  ['handle', 'تابعنا @baseera للمزيد', ['@baseera']],
  ['latin hashtag', 'استخدم وسم #marketing دائمًا', ['#marketing']],
  ['Arabic hashtag needs no isolation', 'وسم #تسويق_رقمي', []],
  ['url', 'زوروا https://baseera.sa/blog اليوم', ['https://baseera.sa/blog']],
  ['email', 'راسلنا hello@baseera.sa', ['hello@baseera.sa']],
  ['sentence-final period left outside', 'تعلّم React.', ['React']],
  ['arabic comma after latin', 'تعلّم Node.js، ثم Express', ['Node.js', 'Express']],
  ['brackets stay outside the run', 'واجهة برمجية (API) سريعة', ['API']],
  ['em dash joins an English phrase', 'ستيف جوبز Steve Jobs — Apple', ['Steve Jobs — Apple']],
];

for (const [name, input, expected] of GOLDEN) {
  test(`segmentBidi: ${name}`, () => {
    assert.deepEqual(ltrRuns(input), expected);
    assert.equal(segmentBidi(input).map((s) => s.text).join(''), input, 'segments must cover the input exactly');
  });
}

test('richLines: accent markers are stripped and flagged', () => {
  assert.deepEqual(richLines('عادات *تضاعف* إنتاجيتك'), [
    [
      {
        ltr: false,
        parts: [
          { text: 'عادات ', accent: false },
          { text: 'تضاعف', accent: true },
          { text: ' إنتاجيتك', accent: false },
        ],
      },
    ],
  ]);
});

test('richLines: accent inside an LTR run does not split the run', () => {
  const [line] = richLines('جرّب *Notion* AI اليوم');
  const ltr = line.filter((s) => s.ltr);
  assert.equal(ltr.length, 1);
  assert.deepEqual(ltr[0].parts, [
    { text: 'Notion', accent: true },
    { text: ' AI', accent: false },
  ]);
});

test('richLines: multi-line text keeps per-line segments', () => {
  const lines = richLines('السطر الأول 2026\nالسطر الثاني @baseera');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].filter((s) => s.ltr).map((s) => s.parts[0].text), ['2026']);
  assert.deepEqual(lines[1].filter((s) => s.ltr).map((s) => s.parts[0].text), ['@baseera']);
});

test('richLines: an unpaired asterisk stays literal', () => {
  const [line] = richLines('سعر * خاص');
  assert.equal(line.map((s) => s.parts.map((p) => p.text).join('')).join(''), 'سعر * خاص');
});
