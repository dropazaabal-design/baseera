import { useEffect, useMemo, useRef, useState } from 'react';
import Slide from './Slide';
import SlideFrame from './SlideFrame';
import Filmstrip from './Filmstrip';
import Icon from './Icon';
import ContentPanel from './panels/ContentPanel';
import DesignPanel from './panels/DesignPanel';
import PluginsPanel from './panels/PluginsPanel';
import { Button, Select } from './ui';
import { templates } from '../templates';
import { paletteColors, resolvePalette } from '../plugins/palettes.js';
import { SLIDE_H, SLIDE_W, exportCarouselZip, exportSlidePng } from '../lib/exportEngine.js';
import { createSlide, initialDoc, saveDoc } from '../lib/doc.js';
import { formatNumber } from '../lib/numerals.js';

// <option> text cannot hold a <bdi>, so isolate with LRI…PDI characters.
const ltr = (s) => `⁦${s}⁩`;

const TABS = [
  { id: 'content', label: 'المحتوى' },
  { id: 'design', label: 'التصميم' },
  { id: 'plugins', label: 'الإضافات' },
];

// Switching template keeps any field the new template also has.
function retemplate(slide, templateId) {
  const t = templates[templateId];
  const data = structuredClone(t.defaults);
  for (const { key } of t.fields) {
    const old = slide.data[key];
    if (old !== undefined && Array.isArray(old) === Array.isArray(data[key]) && typeof old === typeof data[key]) data[key] = old;
  }
  return { ...slide, template: templateId, data };
}

const STAGE_PADDING = 48;

function usePreviewScale(ref) {
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.1, Math.min((width - STAGE_PADDING) / SLIDE_W, (height - STAGE_PADDING) / SLIDE_H)));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

export default function CarouselEditor() {
  const [init] = useState(initialDoc);
  const [doc, setDoc] = useState(init.doc);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('content');
  const [exportScale, setExportScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const stageRef = useRef(null);
  const stripRef = useRef(null);
  const previewScale = usePreviewScale(stageRef);

  useEffect(() => {
    if (!saveDoc(doc, init.storageKey)) setStatus({ tone: 'error', text: 'تعذّر الحفظ التلقائي: مساحة التخزين في المتصفح ممتلئة.' });
  }, [doc, init.storageKey]);

  // Runs after the FitBoxes have measured; slides whose text does not fit
  // even at the minimum size are flagged in the panel and the filmstrip.
  const [overflowing, setOverflowing] = useState([]);
  useEffect(() => {
    const check = () => {
      const ids = [...stripRef.current.querySelectorAll('.slide-root')].flatMap((n, i) =>
        n.querySelector('[data-overflow]') ? [i] : [],
      );
      setOverflowing((prev) => (prev.join() === ids.join() ? prev : ids));
    };
    check();
    document.fonts.addEventListener('loadingdone', check);
    return () => document.fonts.removeEventListener('loadingdone', check);
  });

  const { colors, report } = useMemo(() => resolvePalette(paletteColors(doc.design)), [doc.design]);
  const { slides, design } = doc;
  const total = slides.length;
  const current = Math.min(active, total - 1);
  const fmt = (n) => formatNumber(n, design.numerals);

  const slideProps = { total, colors, font: design.font, numerals: design.numerals, brand: doc.brand, plugins: doc.plugins };

  const patch = (key, value) => setDoc((d) => ({ ...d, [key]: typeof value === 'function' ? value(d[key]) : value }));
  const setSlides = (fn) => patch('slides', fn);
  const replaceAt = (i, fn) => setSlides((s) => s.map((slide, j) => (j === i ? fn(slide) : slide)));

  const actions = {
    onField: (key, value) => replaceAt(current, (s) => ({ ...s, data: { ...s.data, [key]: value } })),
    onTemplate: (id) => replaceAt(current, (s) => retemplate(s, id)),
    onMove: (dir) => {
      setSlides((s) => {
        const next = [...s];
        [next[current], next[current + dir]] = [next[current + dir], next[current]];
        return next;
      });
      setActive(current + dir);
    },
    onDuplicate: () => {
      setSlides((s) => [...s.slice(0, current + 1), createSlide(s[current].template, s[current].data), ...s.slice(current + 1)]);
      setActive(current + 1);
    },
    onRemove: () => {
      setSlides((s) => s.filter((_, i) => i !== current));
      setActive(Math.max(0, current - 1));
    },
  };

  const addSlide = (templateId) => {
    setSlides((s) => [...s.slice(0, current + 1), createSlide(templateId), ...s.slice(current + 1)]);
    setActive(current + 1);
    setTab('content');
  };

  const slideNodes = () => [...stripRef.current.querySelectorAll('.slide-root')];
  const exportOptions = { fontId: design.font, background: colors.bg, scale: exportScale };

  async function runExport(job, doneText) {
    setBusy(true);
    setStatus({ tone: 'info', text: 'جارٍ تحميل الخطوط وتضمينها…' });
    try {
      await job();
      setStatus({ tone: 'success', text: doneText });
    } catch (err) {
      console.error(err);
      setStatus({ tone: 'error', text: `فشل التصدير: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  const exportCurrent = () =>
    runExport(() => exportSlidePng(slideNodes()[current], current, exportOptions), `تم تنزيل الشريحة ${fmt(current + 1)}.`);

  const exportAll = () =>
    runExport(
      () =>
        exportCarouselZip(slideNodes(), exportOptions, (i, n) =>
          setStatus({ tone: 'info', text: `جارٍ تصدير الشريحة ${fmt(i + 1)} من ${fmt(n)}…` }),
        ),
      `تم تنزيل ${fmt(total)} شرائح في ملف ZIP.`,
    );

  const reset = () => {
    if (!window.confirm('ستُستعاد النسخة الأصلية وتُفقد تعديلاتك. متابعة؟')) return;
    setDoc(init.fresh());
    setActive(0);
    setStatus(null);
  };

  const statusTone = {
    info: 'bg-indigo-50 text-indigo-800',
    success: 'bg-emerald-50 text-emerald-800',
    error: 'bg-red-50 text-red-800',
  };

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-100 text-zinc-900 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-indigo-600 text-lg font-extrabold text-white">ب</span>
          <div className="leading-tight">
            <h1 className="text-base font-extrabold">بصيرة</h1>
            <p className="text-xs text-zinc-500">
              مولّد الكاروسيل العربي · <bdi dir="ltr">1080×1350</bdi>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-52">
            <Select
              aria-label="دقة التصدير"
              value={exportScale}
              onChange={(e) => setExportScale(Number(e.target.value))}
              options={[
                { value: 1, label: `${ltr('1080×1350')} — موصى به` },
                { value: 2, label: `${ltr('2160×2700')} — دقة مضاعفة` },
              ]}
            />
          </div>
          <Button onClick={exportCurrent} disabled={busy}>
            <Icon name="download" size={16} />
            الشريحة PNG
          </Button>
          <Button variant="primary" onClick={exportAll} disabled={busy}>
            <Icon name="download" size={16} />
            الكل ZIP
          </Button>
          <Button variant="ghost" onClick={reset} disabled={busy} aria-label="استعادة الأصل" title="استعادة الأصل">
            <Icon name="reset" size={16} />
          </Button>
        </div>
      </header>

      {status && (
        <div role="status" className={`flex items-center justify-between px-4 py-2 text-sm ${statusTone[status.tone]}`}>
          <span>{status.text}</span>
          {!busy && (
            <button type="button" onClick={() => setStatus(null)} aria-label="إغلاق" className="opacity-60 hover:opacity-100">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex w-full flex-col border-zinc-200 bg-white lg:order-1 lg:w-[400px] lg:border-e">
          <nav className="flex border-b border-zinc-200" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 border-b-2 px-3 py-3 text-sm font-bold transition ${
                  tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'content' && (
              <ContentPanel
                slide={slides[current]}
                index={current}
                total={total}
                numerals={design.numerals}
                overflow={overflowing.includes(current)}
                {...actions}
              />
            )}
            {tab === 'design' && (
              <DesignPanel
                design={design}
                brand={doc.brand}
                report={report}
                onDesign={(p) => patch('design', (d) => ({ ...d, ...p }))}
                onBrand={(p) => patch('brand', (b) => ({ ...b, ...p }))}
                onError={(text) => setStatus({ tone: 'error', text })}
              />
            )}
            {tab === 'plugins' && (
              <PluginsPanel
                plugins={doc.plugins}
                onChange={(id, p) => patch('plugins', (all) => ({ ...all, [id]: { ...all[id], ...p } }))}
              />
            )}
          </div>
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div ref={stageRef} className="relative h-[62vh] lg:h-auto lg:min-h-0 lg:flex-1">
            <div className="absolute inset-0 grid place-items-center p-6">
              <SlideFrame scale={Math.min(previewScale, 1)} className="rounded-sm shadow-xl shadow-zinc-900/10">
                <Slide slide={slides[current]} index={current} {...slideProps} />
              </SlideFrame>
            </div>
          </div>
          <Filmstrip
            stripRef={stripRef}
            slides={slides}
            active={current}
            overflowing={overflowing}
            numerals={design.numerals}
            slideProps={slideProps}
            onSelect={setActive}
            onAdd={addSlide}
          />
        </main>
      </div>
    </div>
  );
}
