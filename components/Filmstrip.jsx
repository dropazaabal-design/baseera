import { useEffect, useRef, useState } from 'react';
import Slide from './Slide';
import SlideFrame from './SlideFrame';
import Icon from './Icon';
import { Button } from './ui';
import { templateList } from '../templates';
import { formatNumber } from '../lib/numerals.js';
import { formatOf } from '../lib/formats.js';

// Thumbnails share one height so every format lines up in the strip.
const THUMB_HEIGHT = 160;

function AddSlideMenu({ onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button variant="primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="plus" size={16} />
        إضافة شريحة
      </Button>
      {open && (
        <div className="absolute bottom-full end-0 z-20 mb-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {templateList.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onAdd(t.id);
                setOpen(false);
              }}
              className="block w-full px-4 py-2.5 text-start hover:bg-zinc-50"
            >
              <span className="block text-sm font-bold text-zinc-800">{t.label}</span>
              <span className="block text-xs text-zinc-500">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Thumbnails are full-resolution slide nodes shrunk by their wrapper; the
// exporter captures them directly (see `stripRef` in CarouselEditor).
export default function Filmstrip({ stripRef, slides, active, overflowing, numerals, slideProps, onSelect, onAdd }) {
  const { width, height } = formatOf(slideProps.format);
  return (
    <div className="border-t border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-sm font-bold text-zinc-700">الشرائح ({formatNumber(slides.length, numerals)})</span>
        <AddSlideMenu onAdd={onAdd} />
      </div>
      <div ref={stripRef} className="flex gap-4 overflow-x-auto px-4 pt-4 pb-4">
        {slides.map((slide, i) => (
          <div key={slide.id} className="relative shrink-0">
            <SlideFrame
              scale={THUMB_HEIGHT / height}
              width={width}
              height={height}
              className={`rounded-md transition ${i === active ? 'ring-2 ring-indigo-500 ring-offset-2' : 'ring-1 ring-zinc-300'}`}
            >
              <Slide slide={slide} index={i} {...slideProps} />
            </SlideFrame>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`تحديد الشريحة ${i + 1}`}
              aria-current={i === active}
              className="absolute inset-0 rounded-md"
            />
            <span
              className={`pointer-events-none absolute -top-2 -start-2 grid size-6 place-items-center rounded-full text-xs text-white ${
                overflowing.includes(i) ? 'bg-amber-500' : 'bg-zinc-900'
              }`}
              title={overflowing.includes(i) ? 'النص يتجاوز مساحة الشريحة' : undefined}
            >
              {overflowing.includes(i) ? '!' : formatNumber(i + 1, numerals)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
