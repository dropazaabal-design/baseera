import { useState } from 'react';
import Icon from '../Icon';
import { Button, ColorInput, Field, Section, Select, TextInput } from '../ui';
import { FONTS } from '../../lib/fonts.js';
import { KITABWBS_PRESET, PREFERENCE_KEYS } from '../../lib/studio/memory.js';
import { exportSnapshot, importSnapshot } from '../../lib/studio/store.js';
import { downloadBlob } from '../../lib/exportEngine.js';

const ROLES = { bg: 'خلفية', surface: 'بطاقات', text: 'نص', accent: 'تمييز', secondary: 'ثانوي', paper: 'ورق' };
const SCOPE_LABEL = { brandId: 'الهوية', platform: 'المنصة', format: 'المقاس', projectId: 'المشروع' };
const fontOptions = Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }));

function Chip({ children }) {
  return <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">{children}</span>;
}

function BrandEditor({ brand, onSave, onApply, onCancel }) {
  const [b, setB] = useState(brand);
  const set = (p) => setB((x) => ({ ...x, ...p }));
  const colors = b.colors ?? [];
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="الاسم">
          <TextInput value={b.name ?? ''} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="المعرّف">
          <TextInput value={b.handle ?? ''} onChange={(e) => set({ handle: e.target.value })} />
        </Field>
      </div>
      <Field label="الألوان وأدوارها">
        <div className="space-y-1.5">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <ColorInput value={c.hex} onChange={(hex) => set({ colors: colors.map((x, j) => (j === i ? { ...x, hex } : x)) })} />
              <select value={c.role} onChange={(e) => set({ colors: colors.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} className="rounded-md border border-zinc-300 px-1 py-1 text-xs">
                {Object.entries(ROLES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input value={c.name ?? ''} placeholder="اسم اللون" onChange={(e) => set({ colors: colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs" />
              <button type="button" aria-label="حذف اللون" onClick={() => set({ colors: colors.filter((_, j) => j !== i) })} className="text-zinc-400 hover:text-red-600">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => set({ colors: [...colors, { hex: '#2563EB', role: 'accent', name: '' }] })}>
            <Icon name="plus" size={14} /> لون
          </Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="خط العناوين">
          <Select value={b.fonts?.heading ?? 'cairo'} onChange={(e) => set({ fonts: { ...b.fonts, heading: e.target.value } })} options={fontOptions} />
        </Field>
        <Field label="خط النص">
          <Select value={b.fonts?.body ?? 'cairo'} onChange={(e) => set({ fonts: { ...b.fonts, body: e.target.value } })} options={fontOptions} />
        </Field>
      </div>
      <Field label="نبرة الكتابة">
        <TextInput value={b.voice?.tone ?? ''} onChange={(e) => set({ voice: { ...b.voice, tone: e.target.value } })} />
      </Field>
      <Field label="أسلوب الصور والرسوم">
        <TextInput value={b.imagery?.style ?? ''} onChange={(e) => set({ imagery: { ...b.imagery, style: e.target.value } })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="كثافة المحتوى">
          <Select value={b.density ?? 'medium'} onChange={(e) => set({ density: e.target.value })} options={[{ value: 'light', label: 'خفيفة' }, { value: 'medium', label: 'متوسطة' }, { value: 'dense', label: 'كثيفة' }]} />
        </Field>
        <label className="mt-6 flex items-center gap-2 text-xs text-zinc-700">
          <input type="checkbox" checked={(b.constraints ?? []).includes('no-warm-colors')} onChange={(e) => set({ constraints: e.target.checked ? [...new Set([...(b.constraints ?? []), 'no-warm-colors'])] : (b.constraints ?? []).filter((c) => c !== 'no-warm-colors') })} />
          بلا ألوان دافئة
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => onSave(b)}>
          حفظ الهوية
        </Button>
        <Button onClick={() => onApply(b)}>طبّقها على هذا التصميم</Button>
        <Button variant="ghost" onClick={onCancel}>
          إغلاق
        </Button>
      </div>
    </div>
  );
}

// «ذوقي وهويتي»: what the studio remembers, all of it visible and editable.
// Facts are kept apart from preferences; each preference shows where it came
// from and where it applies; inferred patterns wait for confirmation.
export default function TastePanel({ studio, doc, onApplyBrand, onStatus }) {
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null);
  const [newPref, setNewPref] = useState({ key: 'text.density', value: '', scope: 'brand' });
  if (!studio) return <Section title="ذوقي وهويتي">التخزين في المتصفح غير متاح هنا.</Section>;
  const creatorId = doc.creatorId ?? 'default';
  const profile = studio.memory.profile(creatorId);
  const brands = studio.memory.brands(creatorId);
  const refresh = () => setVersion((v) => v + 1);
  const run = (fn, ok) => {
    try {
      fn();
      refresh();
      if (ok) onStatus({ tone: 'success', text: ok });
    } catch (err) {
      onStatus({ tone: 'error', text: err.message });
    }
  };
  const prefs = profile.preferences.filter((r) => r.origin === 'explicit_feedback' || r.confirmed);
  const suggestions = profile.preferences.filter((r) => r.origin === 'observed_pattern' && !r.confirmed);

  return (
    <div key={version}>
      <Section title="الحساب والجمهور" aside={<Chip>حقائق صرّحت بها</Chip>}>
        <Field label="الجمهور">
          <TextInput defaultValue={profile.facts.audience} onBlur={(e) => run(() => studio.memory.setFact(creatorId, 'audience', e.target.value))} />
        </Field>
        <Field label="النبرة">
          <TextInput defaultValue={profile.facts.tone} onBlur={(e) => run(() => studio.memory.setFact(creatorId, 'tone', e.target.value))} />
        </Field>
        <Field label="محاور المحتوى" hint="افصل بفاصلة">
          <TextInput defaultValue={profile.facts.pillars.join('، ')} onBlur={(e) => run(() => studio.memory.setFact(creatorId, 'pillars', e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean)))} />
        </Field>
        <Field label="الأهداف" hint="افصل بفاصلة">
          <TextInput defaultValue={profile.facts.goals.join('، ')} onBlur={(e) => run(() => studio.memory.setFact(creatorId, 'goals', e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean)))} />
        </Field>
      </Section>

      <Section
        title={`الهويات (${brands.length})`}
        aside={
          !brands.some((b) => b.id === 'kitabwbs') && (
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => run(() => studio.memory.saveBrand(creatorId, KITABWBS_PRESET), 'أضيفت هوية «كتاب وبس» كخيار مستقل.')}>
              + «كتاب وبس»
            </Button>
          )
        }
      >
        {brands.map((b) =>
          editing === b.id ? (
            <BrandEditor key={b.id} brand={b} onCancel={() => setEditing(null)} onSave={(next) => run(() => studio.memory.saveBrand(creatorId, next), 'حُفظت الهوية.')} onApply={(next) => onApplyBrand(next)} />
          ) : (
            <div key={b.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2">
              <div className="flex">
                {(b.colors ?? []).slice(0, 4).map((c) => (
                  <span key={c.hex + c.role} className="size-5 rounded-full border border-white" style={{ background: c.hex }} title={c.name} />
                ))}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-bold">{b.name}</p>
                <p className="truncate text-xs text-zinc-500" dir="ltr">
                  {b.handle}
                </p>
              </div>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditing(b.id)}>
                تعديل
              </Button>
              <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => onApplyBrand(b)}>
                تطبيق
              </Button>
            </div>
          ),
        )}
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditing(`new-${Date.now()}`)}>
          <Icon name="plus" size={14} /> هوية جديدة
        </Button>
        {editing?.startsWith('new-') && (
          <BrandEditor
            brand={{ id: `brand-${brands.length + 1}`, name: '', handle: '', colors: [{ hex: '#FFFFFF', role: 'bg', name: 'خلفية' }, { hex: '#2563EB', role: 'accent', name: 'تمييز' }], fonts: { heading: 'cairo', body: 'cairo' } }}
            onCancel={() => setEditing(null)}
            onSave={(next) => run(() => (studio.memory.saveBrand(creatorId, next), setEditing(null)), 'حُفظت الهوية.')}
            onApply={(next) => onApplyBrand(next)}
          />
        )}
      </Section>

      <Section title={`تفضيلاتي (${prefs.length})`}>
        {prefs.length === 0 && <p className="text-xs text-zinc-500">لا تفضيلات بعد. الطلب الحالي يتقدّم دائمًا على أي تفضيل محفوظ.</p>}
        <ul className="space-y-1.5">
          {prefs.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-md bg-zinc-50 px-2 py-1.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-zinc-800">{r.preference}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <Chip>{r.origin === 'explicit_feedback' ? 'صريح' : 'نمط أكّدته'}</Chip>
                  {Object.keys(r.scope).length ? Object.entries(r.scope).map(([k, v]) => <Chip key={k}>{`${SCOPE_LABEL[k]}: ${v}`}</Chip>) : <Chip>كل أعمالي</Chip>}
                  <Chip>ثقة {Math.round(r.confidence * 100)}٪</Chip>
                </div>
                {r.evidence && <p className="mt-0.5 text-zinc-500">{r.evidence}</p>}
              </div>
              <button type="button" aria-label="حذف التفضيل" onClick={() => run(() => studio.memory.forget(creatorId, r.id), 'حُذف التفضيل.')} className="text-zinc-400 hover:text-red-600">
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <select value={newPref.key} onChange={(e) => setNewPref((p) => ({ ...p, key: e.target.value, value: '' }))} className="rounded-md border border-zinc-300 px-1 py-1 text-xs">
            {Object.entries(PREFERENCE_KEYS).map(([k, d]) => (
              <option key={k} value={k}>
                {d.label}
              </option>
            ))}
          </select>
          {PREFERENCE_KEYS[newPref.key].values ? (
            <select value={newPref.value} onChange={(e) => setNewPref((p) => ({ ...p, value: e.target.value }))} className="rounded-md border border-zinc-300 px-1 py-1 text-xs">
              <option value="">—</option>
              {PREFERENCE_KEYS[newPref.key].values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <input value={newPref.value} onChange={(e) => setNewPref((p) => ({ ...p, value: e.target.value }))} className="rounded-md border border-zinc-300 px-2 py-1 text-xs" />
          )}
          <select value={newPref.scope} onChange={(e) => setNewPref((p) => ({ ...p, scope: e.target.value }))} className="rounded-md border border-zinc-300 px-1 py-1 text-xs">
            <option value="brand">هذه الهوية</option>
            <option value="platform">هذه المنصة</option>
            <option value="format">هذا المقاس</option>
            <option value="all">كل أعمالي</option>
          </select>
        </div>
        <Button
          variant="secondary"
          className="!px-2 !py-1 text-xs"
          disabled={!newPref.value}
          onClick={() =>
            run(() => {
              const scope =
                newPref.scope === 'brand' ? { brandId: doc.brandId } : newPref.scope === 'platform' ? { platform: doc.intent.platform } : newPref.scope === 'format' ? { format: doc.intent.format } : {};
              if (newPref.scope === 'brand' && !doc.brandId) throw new Error('هذا التصميم بلا هوية؛ طبّق هوية أولًا أو اختر نطاقًا آخر.');
              studio.memory.remember(creatorId, { key: newPref.key, value: newPref.value, scope, evidence: 'أضفته من «ذوقي وهويتي»', source: 'editor' });
              setNewPref((p) => ({ ...p, value: '' }));
            }, 'حُفظ التفضيل.')
          }
        >
          إضافة تفضيل
        </Button>
      </Section>

      {suggestions.length > 0 && (
        <Section title="أنماط لاحظتها">
          <p className="text-xs text-zinc-500">تكررت في عدة تصاميم، لكنها لا تُطبَّق حتى تؤكدها.</p>
          {suggestions.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              <span className="min-w-0 flex-1">
                {r.preference} — {r.evidence}
              </span>
              <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => run(() => studio.memory.confirm(creatorId, r.id), 'أُكّد التفضيل.')}>
                اعتمده
              </Button>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => run(() => studio.memory.forget(creatorId, r.id))}>
                تجاهل
              </Button>
            </div>
          ))}
        </Section>
      )}

      <Section title="نسخة احتياطية">
        <p className="text-xs text-zinc-500">الذاكرة والهويات والمكتبة محفوظة في هذا المتصفح. انقلها إلى جهاز آخر أو إلى أداة الأوامر (studio restore).</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => downloadBlob(new Blob([JSON.stringify(exportSnapshot(studio.store))], { type: 'application/json' }), 'baseera-studio-backup.json')}
          >
            تصدير
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50">
            استيراد
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) {
                  const text = await file.text();
                  run(() => importSnapshot(studio.store, JSON.parse(text)), 'استُوردت النسخة الاحتياطية.');
                }
              }}
            />
          </label>
        </div>
      </Section>
    </div>
  );
}
