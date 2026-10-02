import { Button, Section } from '../ui';

// Quality gate results: the document checks (size, page count, missing or
// changed text, readability on a phone, cramped text, contrast, overlap,
// missing art) plus what the browser measured (text that does not fit its
// frame even at its minimum size).
export default function QualityPanel({ report, domOverflow, onJump, onRelayout, pageIndexOf }) {
  const issues = [
    ...report.issues,
    ...domOverflow.map((o) => ({ code: 'render.overflow', severity: 'error', pageId: o.pageId, elementId: o.elementId, message: `«${o.name}» لا يتسع في مساحته حتى بأصغر حجم مسموح.` })),
  ];
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return (
    <Section
      title="فحص الجودة"
      aside={
        <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={onRelayout}>
          إعادة التوزيع
        </Button>
      }
    >
      <p className={`rounded-lg px-3 py-2 text-sm font-bold ${errors.length ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
        {errors.length ? `${errors.length} مشكلات تمنع التسليم` : 'جاهز للتسليم'}
        {warnings.length ? ` · ${warnings.length} ملاحظات` : ''}
      </p>
      <ul className="space-y-1.5">
        {[...errors, ...warnings].map((i, k) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => i.pageId && onJump(i.pageId, i.elementId)}
              className={`w-full rounded-md px-2 py-1.5 text-start text-xs leading-relaxed ${i.severity === 'error' ? 'bg-red-50/60 text-red-900 hover:bg-red-50' : 'bg-amber-50/60 text-amber-900 hover:bg-amber-50'}`}
            >
              {i.pageId && <span className="font-bold">ص{pageIndexOf(i.pageId) + 1}: </span>}
              {i.message}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-zinc-500">
        لا يصغّر المحرر الخط تحت حد القراءة على الهاتف: إن لم يتسع النص يعيد توزيع العناصر أو يقترح اختصارًا محددًا.
      </p>
    </Section>
  );
}
