import { Field, Section, Select, TextArea, TextInput } from '../ui';
import { compositionList, compositionOf } from '../../lib/studio/compositions.js';

// The page's approved text, by composition field. Editing it re-lays out the
// page (the reflow engine keeps text readable); artwork is never touched.
export default function ContentFields({ page, index, onContent, onComposition }) {
  const comp = compositionOf(page.composition.id);
  const content = page.content ?? {};
  const set = (key, value) => onContent(page.id, { ...content, [key]: value });
  return (
    <>
      <Section title={`الصفحة ${index + 1}: ${comp.label}`}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="التكوين">
            <Select
              value={page.composition.id}
              onChange={(e) => onComposition(page.id, { id: e.target.value, variant: compositionOf(e.target.value).defaultVariant })}
              options={compositionList.map((c) => ({ value: c.id, label: c.label }))}
            />
          </Field>
          <Field label="التوزيع">
            <Select
              value={page.composition.variant ?? comp.defaultVariant}
              onChange={(e) => onComposition(page.id, { id: page.composition.id, variant: e.target.value })}
              options={Object.entries(comp.variants).map(([value, label]) => ({ value, label }))}
            />
          </Field>
        </div>
        {page.layout?.variant && page.layout.variant !== page.composition.variant && (
          <p className="text-xs text-amber-800">يُعرض الآن بتوزيع «{comp.variants[page.layout.variant]}» ليتسع المحتوى.</p>
        )}
      </Section>
      <Section title="المحتوى المعتمد">
        {comp.fields
          .filter((f) => f.type !== 'asset' && f.type !== 'assets')
          .map((f) => {
            const v = content[f.key];
            if (f.type === 'list') {
              return (
                <Field key={f.key} label={f.label} hint="سطر لكل بند">
                  <TextArea rows={Math.max(3, (v ?? []).length + 1)} defaultValue={(v ?? []).join('\n')} key={`${page.id}:${f.key}:${(v ?? []).join('|')}`} onBlur={(e) => set(f.key, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />
                </Field>
              );
            }
            if (f.type === 'number') {
              return (
                <Field key={f.key} label={f.label}>
                  <TextInput type="number" min={1} defaultValue={v ?? 1} key={`${page.id}:${f.key}:${v}`} onBlur={(e) => set(f.key, Math.max(1, Number(e.target.value) || 1))} />
                </Field>
              );
            }
            const Input = f.type === 'textarea' ? TextArea : TextInput;
            return (
              <Field key={f.key} label={f.label} hint={f.key === 'title' || f.key === 'hook' ? 'ضع الكلمة المميزة بين *نجمتين*' : undefined}>
                <Input rows={2} defaultValue={v ?? ''} key={`${page.id}:${f.key}:${v}`} onBlur={(e) => e.target.value !== (v ?? '') && set(f.key, e.target.value)} />
              </Field>
            );
          })}
      </Section>
      {page.layout?.decisions?.length > 0 && (
        <Section title="قرارات التوزيع">
          <ul className="space-y-1 text-xs leading-relaxed text-zinc-600">
            {page.layout.decisions.map((d, i) => (
              <li key={i} className={d.code === 'overflow' ? 'text-red-700' : ''}>
                {d.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
