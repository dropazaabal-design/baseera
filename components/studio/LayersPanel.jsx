import Icon from '../Icon';
import { Button, Field, Section, Select, TextArea, ColorInput } from '../ui';
import { THEME_TOKENS } from '../../lib/studio/contracts.js';
import { resolveColor } from '../../lib/studio/theme.js';
import { readImageFile } from '../../lib/image.js';

const KIND = { text: 'نص', image: 'صورة', shape: 'شكل' };
const TOKEN_LABEL = { bg: 'الخلفية', surface: 'البطاقات', text: 'النص', muted: 'النص الثانوي', accent: 'التمييز', onAccent: 'على التمييز' };

function NumberField({ label, value, onCommit, step = 1 }) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        type="number"
        step={step}
        defaultValue={Math.round(value * 10) / 10}
        key={value}
        onBlur={(e) => Number(e.target.value) !== value && onCommit(Number(e.target.value))}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
        dir="ltr"
      />
    </label>
  );
}

function ColorField({ label, value, colors, onChange }) {
  const isToken = typeof value === 'string' && value.startsWith('@');
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            value={isToken ? value : 'custom'}
            onChange={(e) => onChange(e.target.value === 'custom' ? resolveColor(value, colors) : e.target.value)}
            options={[...THEME_TOKENS.map((t) => ({ value: `@${t}`, label: `${TOKEN_LABEL[t]} (${colors[t]})` })), { value: 'custom', label: 'لون مخصص' }]}
          />
        </div>
        {!isToken && value !== 'none' && <ColorInput value={value} onChange={onChange} />}
      </div>
    </Field>
  );
}

// Layers (top first) and the selected element's properties. Every change is
// a DesignPatch, so it is validated, undoable and respects locks.
export default function LayersPanel({ page, colors, selected, onSelect, onPatch, onUploadAsset, onError }) {
  const elements = [...page.elements].sort((a, b) => b.z - a.z);
  const el = page.elements.find((e) => e.id === selected);
  const patch = (action, payload) => onPatch([{ pageId: page.id, elementId: el.id, action, payload }]);

  return (
    <>
      <Section title={`الطبقات (${elements.length})`}>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-zinc-200 p-1">
          {elements.map((e) => (
            <li key={e.id} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${e.id === selected ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-zinc-50'}`}>
              <button type="button" className="min-w-0 flex-1 truncate text-start" onClick={() => onSelect(e.id)} title={e.id}>
                <span className="text-[11px] text-zinc-400">{KIND[e.kind]} · </span>
                {e.name ?? e.id}
                {e.role === 'art-placeholder' && <span className="ms-1 text-[11px] text-amber-600">(فارغ)</span>}
              </button>
              <button
                type="button"
                aria-label={e.hidden ? 'إظهار' : 'إخفاء'}
                title={e.hidden ? 'إظهار' : 'إخفاء'}
                onClick={() => onPatch([{ pageId: page.id, elementId: e.id, action: 'hide', payload: { hidden: !e.hidden, force: true } }])}
                className={`rounded px-1 text-xs ${e.hidden ? 'text-zinc-400 line-through' : 'text-zinc-600'}`}
              >
                عرض
              </button>
              <button
                type="button"
                aria-label={e.locked ? 'فتح القفل' : 'قفل'}
                title={e.locked ? 'مقفل: الأوامر لا تغيّره' : 'قفل'}
                onClick={() => onPatch([{ pageId: page.id, elementId: e.id, action: 'lock', payload: { locked: !e.locked } }])}
                className={`rounded px-1 text-xs ${e.locked ? 'font-bold text-indigo-700' : 'text-zinc-400'}`}
              >
                {e.locked ? 'مقفل' : 'قفل'}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {el && (
        <Section title={`«${el.name ?? el.id}»`} aside={<span className="text-xs text-zinc-400" dir="ltr">{el.id}</span>}>
          {el.locked && <p className="rounded-md bg-indigo-50 px-2 py-1.5 text-xs text-indigo-800">العنصر مقفل: افتح القفل لتحريكه أو تنسيقه.</p>}
          {el.kind === 'text' && (
            <Field label={el.slot ? 'النص (من المحتوى المعتمد)' : 'النص'}>
              <TextArea
                rows={3}
                defaultValue={el.text}
                key={`${el.id}:${el.text}`}
                onBlur={(e) => e.target.value !== el.text && patch('replace_text', { text: e.target.value, force: true })}
              />
            </Field>
          )}
          <div className="grid grid-cols-4 gap-2">
            <NumberField label="x" value={el.frame.x} onCommit={(x) => patch('move', { x })} />
            <NumberField label="y" value={el.frame.y} onCommit={(y) => patch('move', { y })} />
            <NumberField label="العرض" value={el.frame.width} onCommit={(width) => patch('resize', { width })} />
            <NumberField label="الارتفاع" value={el.frame.height} onCommit={(height) => patch('resize', { height })} />
          </div>
          {el.kind === 'text' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="حجم الخط" value={el.style.fontSize} onCommit={(fontSize) => patch('update_style', { fontSize, minFontSize: Math.min(fontSize, el.style.minFontSize ?? fontSize) })} />
                <label className="block text-xs text-zinc-500">
                  الوزن
                  <select
                    value={el.style.weight}
                    onChange={(e) => patch('update_style', { weight: Number(e.target.value) })}
                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-1 py-1 text-sm"
                  >
                    {[400, 500, 600, 700, 800].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-zinc-500">
                  المحاذاة
                  <select value={el.style.align} onChange={(e) => patch('update_style', { align: e.target.value })} className="mt-0.5 w-full rounded-md border border-zinc-300 px-1 py-1 text-sm">
                    <option value="start">البداية</option>
                    <option value="center">الوسط</option>
                    <option value="end">النهاية</option>
                  </select>
                </label>
              </div>
              <ColorField label="لون النص" value={el.style.color} colors={colors} onChange={(color) => patch('update_style', { color })} />
            </>
          )}
          {el.kind === 'shape' && <ColorField label="التعبئة" value={el.fill} colors={colors} onChange={(fill) => patch('update_style', { fill })} />}
          {(el.kind === 'image' || el.role === 'art-placeholder') && (
            <Field label="استبدال الصورة (هذا العنصر وحده)">
              <input
                type="file"
                accept="image/*"
                className="block w-full text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const url = file.type === 'image/svg+xml' ? await file.text().then((t) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(t)))}`) : await readImageFile(file, 1200);
                    onUploadAsset(el, url, file.name);
                  } catch (err) {
                    onError(err.message);
                  }
                }}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => patch('layer', { to: 'front' })}>
              إلى الأمام
            </Button>
            <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => patch('layer', { to: 'back' })}>
              إلى الخلف
            </Button>
            <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-700" onClick={() => patch('delete', {})}>
              <Icon name="trash" size={14} /> حذف
            </Button>
          </div>
        </Section>
      )}
    </>
  );
}
