import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import Slide from './Slide';
import SlideFrame from './SlideFrame';
import Filmstrip from './Filmstrip';
import Icon from './Icon';
import Menu from './Menu';
import ContentPanel from './panels/ContentPanel';
import DesignPanel from './panels/DesignPanel';
import PluginsPanel from './panels/PluginsPanel';
import { Button, Segmented, Select } from './ui';
import { templates } from '../templates';
import { paletteColors, resolvePalette } from '../plugins/palettes.js';
import { governDesign, governPlugins } from '../plugins/agencyKit.js';
import { exportCarouselPdf, exportCarouselZip, exportSlidePng, slideFilename } from '../lib/exportEngine.js';
import { FORMATS, formatOf } from '../lib/formats.js';
import { createSlide, initialDoc, presetSlides, saveDoc } from '../lib/doc.js';
import useBeforeUnload from '../hooks/useBeforeUnload.js';
import { formatNumber } from '../lib/numerals.js';

// The video engine and encoder load only when the reel dialog opens.
const ReelDialog = lazy(() => import('./ReelDialog'));

// <option> text cannot hold a <bdi>, so isolate with LRI…PDI characters.
const ltr = (s) => `\u2066${s}\u2069`;

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

function useStageSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const fitScale = (stage, { width, height }) =>
  Math.min(1, Math.max(0.1, Math.min((stage.width - STAGE_PADDING) / width, (stage.height - STAGE_PADDING) / height)));

export default function CarouselEditor() {
  const [init] = useState(initialDoc);
  const [doc, setDoc] = useState(init.doc);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('content');
  const [exportScale, setExportScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const stageRef = useRef(null);
  const stripRef = useRef(null);
  const stage = useStageSize(stageRef);

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

  // The Agency Kit policy is applied on top of the saved choices at render
  // time. Design and plugins are memoised separately so typing in one slide
  // does not re-render every other slide.
  const { slides, governance } = doc;
  const institutional = governance.institutional;
  const design = useMemo(() => governDesign(doc.design, governance), [doc.design, governance]);
  const plugins = useMemo(() => governPlugins(doc.plugins, governance), [doc.plugins, governance]);
  const { colors, report } = useMemo(() => resolvePalette(paletteColors(design)), [design]);
  const format = formatOf(design.format);
  const total = slides.length;
  const current = Math.min(active, total - 1);
  const fmt = (n) => formatNumber(n, design.numerals);

  const slideProps = { total, colors, font: design.font, numerals: design.numerals, format: format.id, brand: doc.brand, plugins };

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
  const exportOptions = { fontId: design.font, background: colors.bg, scale: exportScale, width: format.width, height: format.height };
  const progress = (i, n) => setStatus({ tone: 'info', text: `جارٍ تصدير الشريحة ${fmt(i + 1)} من ${fmt(n)}…` });

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

  useBeforeUnload(busy);
  const filenames = slides.map((s, i) => slideFilename(i, templates[s.template].role));

  const exportCurrent = () =>
    runExport(() => exportSlidePng(slideNodes()[current], filenames[current], exportOptions), `تم تنزيل الشريحة ${fmt(current + 1)}.`);

  const exportAll = () =>
    runExport(() => exportCarouselZip(slideNodes(), exportOptions, filenames, progress), `تم تنزيل ${fmt(total)} شرائح في ملف ZIP.`);

  // LinkedIn shows a PDF as a swipeable document carousel, one page per slide.
  const exportPdf = () =>
    runExport(
      () => exportCarouselPdf(slideNodes(), exportOptions, { title: 'كاروسيل', author: doc.brand.name || 'بصيرة' }, progress),
      `تم تنزيل ملف PDF من ${fmt(total)} صفحات، جاهزًا للنشر كمستند على لينكدإن.`,
    );

  const applyPreset = (preset) => {
    if (!window.confirm(`ستُستبدل الشرائح الحالية ببنية «${preset.label}». متابعة؟`)) return;
    patch('slides', presetSlides(preset.id));
    setActive(0);
    setTab('content');
  };

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
              مولّد الكاروسيل العربي · <bdi dir="ltr">{`${format.width}×${format.height}`}</bdi>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64" role="group" aria-label="مقاس الشرائح">
            <Segmented
              value={format.id}
              onChange={(id) => patch('design', (d) => ({ ...d, format: id }))}
              options={Object.values(FORMATS).map((f) => ({ value: f.id, label: `${f.label} ${fmt(f.ratio)}` }))}
            />
          </div>
          <div className="w-52">
            <Select
              aria-label="دقة التصدير"
              value={exportScale}
              onChange={(e) => setExportScale(Number(e.target.value))}
              options={[
                { value: 1, label: `${ltr(`${format.width}×${format.height}`)} — موصى به` },
                { value: 2, label: `${ltr(`${format.width * 2}×${format.height * 2}`)} — دقة مضاعفة` },
              ]}
            />
          </div>
          <Menu
            label="تصدير"
            icon="download"
            variant="primary"
            disabled={busy}
            items={[
              { label: 'الشريحة الحالية PNG', description: ltr(filenames[current]), onSelect: exportCurrent },
              { label: 'كل الشرائح ZIP', description: 'ملفات مرقّمة بترتيب النشر', onSelect: exportAll },
              { label: 'PDF لينكدإن', description: 'مستند قابل للتمرير، صفحة لكل شريحة', onSelect: exportPdf },
              { label: 'فيديو ريلز', description: 'قصة ٩:١٦ متحركة، ١٤ ثانية افتراضيًا', onSelect: () => setReelOpen(true) },
            ]}
          />
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
                locked={institutional}
                onError={(text) => setStatus({ tone: 'error', text })}
                {...actions}
              />
            )}
            {tab === 'design' && (
              <DesignPanel
                design={design}
                governance={governance}
                brand={doc.brand}
                report={report}
                onDesign={(p) => patch('design', (d) => ({ ...d, ...p }))}
                onBrand={(p) => patch('brand', (b) => ({ ...b, ...p }))}
                onGovernance={(p) => patch('governance', (g) => ({ ...g, ...p }))}
                onError={(text) => setStatus({ tone: 'error', text })}
              />
            )}
            {tab === 'plugins' && (
              <PluginsPanel
                plugins={plugins}
                locked={institutional}
                onChange={(id, p) => patch('plugins', (all) => ({ ...all, [id]: { ...all[id], ...p } }))}
              />
            )}
          </div>
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div ref={stageRef} className="relative h-[62vh] lg:h-auto lg:min-h-0 lg:flex-1">
            <div className="absolute inset-0 grid place-items-center p-6">
              <SlideFrame
                scale={fitScale(stage, format)}
                width={format.width}
                height={format.height}
                className="rounded-sm shadow-xl shadow-zinc-900/10"
              >
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
            onPreset={applyPreset}
          />
        </main>
      </div>
      {reelOpen && (
        <Suspense
          fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/60 text-sm text-white">جارٍ تحميل محرّك الفيديو…</div>}
        >
          <ReelDialog slides={slides} slideProps={slideProps} onClose={() => setReelOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
