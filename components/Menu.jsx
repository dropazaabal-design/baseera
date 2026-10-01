import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { Button } from './ui';

export default function Menu({ label, icon, variant = 'secondary', placement = 'down', disabled = false, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant={variant} disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {icon && <Icon name={icon} size={16} />}
        {label}
      </Button>
      {open && (
        <div
          role="menu"
          className={`absolute end-0 z-30 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg ${
            placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-4 py-2.5 text-start hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-sm font-bold text-zinc-800">{item.label}</span>
              {item.description && <span className="block text-xs text-zinc-500">{item.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
