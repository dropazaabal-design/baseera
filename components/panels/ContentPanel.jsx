import { templateList, templates } from '../../templates';
import { formatNumber } from '../../lib/numerals.js';
import { Field, IconButton, Section, Select, TextArea, TextInput } from '../ui';

function FieldEditor({ field, value, onChange }) {
  switch (field.type) {
    case 'textarea':
      return (
        <Field label={field.label} hint={field.hint}>
          <TextArea rows={field.rows ?? 3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case 'list':
      // Stored with empty lines kept, so Enter can start a new item;
      // templates drop the empty ones when rendering.
      return (
        <Field label={field.label} hint={field.hint ?? 'كل سطر عنصر مستقل'}>
          <TextArea rows={field.rows ?? 5} value={(value ?? []).join('\n')} onChange={(e) => onChange(e.target.value.split('\n'))} />
        </Field>
      );
    case 'number':
      return (
        <Field label={field.label} hint={field.hint}>
          <TextInput
            type="number"
            min={1}
            dir="ltr"
            value={value ?? 1}
            onChange={(e) => onChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </Field>
      );
    default:
      return (
        <Field label={field.label} hint={field.hint}>
          <TextInput value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

export default function ContentPanel({ slide, index, total, numerals, overflow, onField, onTemplate, onMove, onDuplicate, onRemove }) {
  const template = templates[slide.template];
  return (
    <>
      {overflow && (
        <p role="alert" className="mx-5 mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
          النص أطول من مساحة الشريحة حتى بأصغر خط مقروء، وسيُقصّ عند التصدير. اختصره أو وزّعه على شريحتين.
        </p>
      )}
      <Section
        title={`الشريحة ${formatNumber(index + 1, numerals)} من ${formatNumber(total, numerals)}`}
        aside={
          <div className="flex">
            <IconButton icon="arrowBack" directional label="نقل للخلف" disabled={index === 0} onClick={() => onMove(-1)} />
            <IconButton icon="arrow" directional label="نقل للأمام" disabled={index === total - 1} onClick={() => onMove(1)} />
            <IconButton icon="copy" label="تكرار الشريحة" onClick={onDuplicate} />
            <IconButton icon="trash" label="حذف الشريحة" disabled={total === 1} onClick={onRemove} />
          </div>
        }
      >
        <Field label="القالب">
          <Select
            value={slide.template}
            onChange={(e) => onTemplate(e.target.value)}
            options={templateList.map((t) => ({ value: t.id, label: `${t.label} — ${t.description}` }))}
          />
        </Field>
      </Section>
      <Section title="النصوص">
        {template.fields.map((f) => (
          <FieldEditor key={f.key} field={f} value={slide.data[f.key]} onChange={(v) => onField(f.key, v)} />
        ))}
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-800">
          ضع أي كلمة بين نجمتين <span dir="ltr">*هكذا*</span> لتلوينها بلون التمييز. الأسماء اللاتينية والأرقام والروابط تُعزل اتجاهيًا تلقائيًا.
        </p>
      </Section>
    </>
  );
}
