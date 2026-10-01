import { useRef } from 'react';
import Icon from './Icon';
import { readImageFile } from '../lib/image.js';

export function Section({ title, aside, children }) {
  return (
    <section className="border-b border-zinc-200 px-5 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-zinc-800">{title}</h3>
        {aside}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// A disabled <fieldset> natively disables every control inside it.
export function Locked({ locked, children }) {
  return (
    <fieldset disabled={locked} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-60">
      {children}
    </fieldset>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500';

// dir="auto" lets "@handle" or a URL display LTR inside the RTL editor.
export function TextInput({ className = '', ...props }) {
  return <input type="text" dir="auto" className={`${inputClass} ${className}`} {...props} />;
}

export function TextArea({ className = '', ...props }) {
  return <textarea dir="rtl" className={`${inputClass} resize-y leading-relaxed ${className}`} {...props} />;
}

export function Select({ options, ...props }) {
  return (
    <select className={inputClass} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-indigo-600' : 'bg-zinc-300'
      }`}
    >
      {/* The knob starts at inline-start and travels toward inline-end,
          so the translate direction flips in RTL. */}
      <span
        className={`absolute top-0.5 start-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5 rtl:-translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-zinc-700">
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="grid rounded-lg bg-zinc-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1.5 text-sm transition ${
            value === o.value ? 'bg-white font-bold text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function ColorInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white p-1.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <span dir="ltr" className="font-mono text-xs text-zinc-600">
        {value}
      </span>
    </div>
  );
}

export function Button({ variant = 'secondary', className = '', children, ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    secondary: 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 disabled:text-zinc-400',
    ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-300',
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon, label, directional, ...props }) {
  return (
    <Button variant="ghost" className="!p-1.5" aria-label={label} title={label} {...props}>
      <Icon name={icon} size={18} directional={directional} />
    </Button>
  );
}

export function ImageUpload({ value, onChange, onError, label }) {
  const input = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange(await readImageFile(file));
    } catch (err) {
      onError?.(err.message);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        {value ? <img src={value} alt="" className="size-full object-contain" /> : <Icon name="image" size={22} className="text-zinc-400" />}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => input.current.click()}>{value ? 'تغيير' : 'رفع'} {label}</Button>
        {value && (
          <Button variant="ghost" onClick={() => onChange(null)}>
            إزالة
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}
