import { PALETTES, derivePalette } from '../../plugins/palettes.js';
import { POLICY, paletteLock } from '../../plugins/agencyKit.js';
import { FONTS } from '../../lib/fonts.js';
import { ColorInput, Field, ImageUpload, Locked, Section, Segmented, TextInput, Toggle } from '../ui';

function Swatch({ name, colors, active, lockReason, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(lockReason)}
      title={lockReason ?? undefined}
      className={`overflow-hidden rounded-xl border text-start transition disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale ${
        active ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-zinc-200 hover:border-zinc-300'
      }`}
    >
      <div className="flex h-12 items-end justify-between p-2" style={{ background: colors.bg }}>
        <span className="text-lg font-bold" style={{ color: colors.text }}>
          أ
        </span>
        <span className="size-4 rounded-full" style={{ background: colors.accent }} />
      </div>
      <div className="bg-white px-2 py-1 text-xs text-zinc-700">
        {name}
        {lockReason && <span className="block text-[10px] text-zinc-500">🔒 {lockReason}</span>}
      </div>
    </button>
  );
}

function ContrastReport({ report }) {
  const fixedCount = report.filter((r) => r.fixed).length;
  return (
    <Section
      title="فحص التباين التلقائي"
      aside={
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${fixedCount ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}
        >
          {fixedCount ? `صُحّح ${fixedCount}` : 'كل الألوان مقروءة'}
        </span>
      }
    >
      <ul className="space-y-1.5 text-sm">
        {report.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2">
            <span className="text-zinc-600">{r.label}</span>
            <span className="flex items-center gap-2">
              {r.fixed && (
                <span dir="ltr" className="text-xs text-zinc-400 line-through">
                  {r.before.toFixed(1)}
                </span>
              )}
              <span dir="ltr" className="font-mono text-xs tabular-nums text-zinc-800">
                {r.ratio.toFixed(1)}:1
              </span>
              <span className={`size-2 rounded-full ${r.fixed ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-zinc-500">
        أي لون لا يحقق معيار WCAG AA (٤٫٥:١ للنص، ٣:١ للنص الكبير) يُصحَّح تلقائيًا قبل العرض والتصدير.
      </p>
    </Section>
  );
}

function InstitutionalMode({ governance, onGovernance }) {
  return (
    <Section
      title="الوضع المؤسسي"
      aside={
        <Toggle
          checked={governance.institutional}
          disabled={governance.locked}
          label="الوضع المؤسسي"
          onChange={(institutional) => onGovernance({ institutional })}
        />
      }
    >
      <p className="text-xs leading-relaxed text-zinc-500">
        يقفل نظام التصميم للاستخدام المؤسسي: الكحلي والزمردي فقط، ولا ألوان دافئة، والخط والإضافات والهوية ثابتة. تبقى النصوص والصور قابلة
        للتعديل.
      </p>
      {governance.institutional && (
        <ul className="space-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <li>الألوان: {POLICY.palettes.map((id) => PALETTES.find((p) => p.id === id).name).join('، ')}</li>
          <li>الخط: {FONTS[POLICY.font].label}</li>
          <li>الترقيم والعلامة والهوية: إلزامية</li>
          {governance.locked && <li className="font-bold">مقفل من الجهة المالكة لهذا الملف.</li>}
        </ul>
      )}
    </Section>
  );
}

export default function DesignPanel({ design, governance, brand, report, onDesign, onBrand, onGovernance, onError }) {
  const institutional = governance.institutional;
  return (
    <>
      <InstitutionalMode governance={governance} onGovernance={onGovernance} />

      <Section title="لوحة الألوان">
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => (
            <Swatch
              key={p.id}
              name={p.name}
              colors={p.colors}
              active={design.paletteId === p.id}
              lockReason={institutional ? paletteLock(p) : null}
              onClick={() => onDesign({ paletteId: p.id })}
            />
          ))}
          <Swatch
            name="مخصّص"
            colors={derivePalette(design.custom)}
            active={design.paletteId === 'custom'}
            lockReason={institutional ? 'خارج الهوية' : null}
            onClick={() => onDesign({ paletteId: 'custom' })}
          />
        </div>
        {design.paletteId === 'custom' && !institutional && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="الخلفية">
              <ColorInput value={design.custom.bg} onChange={(bg) => onDesign({ custom: { ...design.custom, bg } })} />
            </Field>
            <Field label="لون التمييز">
              <ColorInput value={design.custom.accent} onChange={(accent) => onDesign({ custom: { ...design.custom, accent } })} />
            </Field>
          </div>
        )}
      </Section>

      <ContrastReport report={report} />

      <Section title="الخط">
        <Locked locked={institutional}>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(FONTS).map(([id, f]) => (
              <button
                key={id}
                type="button"
                onClick={() => onDesign({ font: id })}
                className={`rounded-xl border px-3 py-2 text-start transition ${
                  design.font === id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20' : 'border-zinc-200 hover:border-zinc-300'
                }`}
                style={{ fontFamily: f.family }}
              >
                <span className="block text-lg leading-snug" style={{ fontWeight: f.weights.black }}>
                  أبجد هوز
                </span>
                <span className="block text-xs text-zinc-500">{f.label}</span>
              </button>
            ))}
          </div>
        </Locked>
      </Section>

      <Section title="الأرقام المولّدة">
        <Segmented
          value={design.numerals}
          onChange={(numerals) => onDesign({ numerals })}
          options={[
            { value: 'arab', label: '١٢٣ (مشرقية)' },
            { value: 'latn', label: '123 (غربية)' },
          ]}
        />
        <p className="text-xs text-zinc-500">تُطبَّق على العدّاد وأرقام الخطوات. النص الذي تكتبه يبقى كما هو.</p>
      </Section>

      <Section title="الهوية">
        <Locked locked={institutional}>
          <Field label="الاسم">
            <TextInput value={brand.name} onChange={(e) => onBrand({ name: e.target.value })} />
          </Field>
          <Field label="المعرّف">
            <TextInput value={brand.handle} placeholder="@handle" onChange={(e) => onBrand({ handle: e.target.value })} />
          </Field>
          <Field label="الشعار">
            <ImageUpload label="الشعار" value={brand.logo} onChange={(logo) => onBrand({ logo })} onError={onError} />
          </Field>
          <Field label="الصورة الشخصية">
            <ImageUpload label="الصورة" value={brand.avatar} onChange={(avatar) => onBrand({ avatar })} onError={onError} />
          </Field>
        </Locked>
      </Section>
    </>
  );
}
