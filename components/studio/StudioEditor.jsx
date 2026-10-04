import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import ScenePage from './ScenePage';
import SlideFrame from '../SlideFrame';
import Icon from '../Icon';
import Menu from '../Menu';
import { Button, Segmented } from '../ui';
import ChatBar from './ChatBar';
import ContentFields from './ContentFields';
import LayersPanel from './LayersPanel';
import QualityPanel from './QualityPanel';
import TastePanel from './TastePanel';
import HistoryPanel from './HistoryPanel';
import AlgorithmPanel from './AlgorithmPanel';
import useStudio, { initialStudioDoc } from './useStudio';
import useBeforeUnload from '../../hooks/useBeforeUnload.js';
import { exportCarouselPdf, exportCarouselZip, exportSlidePng, slideFilename } from '../../lib/exportEngine.js';
import { formatNumber } from '../../lib/numerals.js';
import { countWords } from '../../lib/timeline.js';
import { FORMATS } from '../../lib/studio/contracts.js';
import { COMPOSITIONS, compositionList, compositionOf, contentTexts } from '../../lib/studio/compositions.js';
import { composeAll, newPageId, setFormat, updatePage } from '../../lib/studio/document.js';
import { applyPatches } from '../../lib/studio/patch.js';
import { runCommand } from '../../lib/studio/commands.js';
import { checkDesign } from '../../lib/studio/quality.js';
import { inlineAsset } from '../../lib/studio/assets.js';
import { pageTheme, themeFromBrand } from '../../lib/studio/theme.js';
import { now } from '../../lib/studio/util.js';

const ReelDialog = lazy(() => import('../ReelDialog'));

const TABS = [
  { id: 'content', label: 'المحتوى' },
  { id: 'layers', label: 'العناصر' },
  { id: 'quality', label: 'الجودة' },
  { id: 'algorithm', label: 'ذكاء المنصات' },
  { id: 'taste', label: 'ذوقي وهويتي' },
  { id: 'history', label: 'السجل' },
];

// Starting content for a page added from the menu.
const NEW_CONTENT = {
  hero: { title: 'عنوان *جديد*', subtitle: 'سطر داعم يوضّح الفائدة.' },
  list: { title: 'عنوان *القائمة*', items: ['البند الأول', 'البند الثاني', 'البند الثالث'] },
  post: { hook: 'خطّاف *واضح*', points: ['نقطة أولى', 'نقطة ثانية'], cta: 'احفظ المنشور' },
  comparison: { title: 'الفرق *واضح*', beforeLabel: 'قبل', before: ['حالة أولى'], afterLabel: 'بعد', after: ['حالة ثانية'] },
  quote: { quote: 'اقتباس *مؤثر* هنا.', author: 'اسم القائل' },
  statement: { title: 'جملة واحدة *تحمل* الفكرة' },
  collage: { title: 'عنوان *تحريري*', art: [] },
  outro: { title: 'هل كان المحتوى *مفيدًا*؟', save: 'احفظه', share: 'شاركه', follow: 'تابعنا' },
};

const STAGE_PADDING = 48;
const THUMB_HEIGHT = 150;

function useSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const ltr = (s) => `⁦${s}⁩`;
let messageId = 0;

export default function StudioEditor({ onClassic }) {
  const [init] = useState(initialStudioDoc);
  const s = useStudio(init);
  const { doc, studio } = s;
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('content');
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);
  const [domOverflow, setDomOverflow] = useState([]);
  const stageRef = useRef(null);
  const stripRef = useRef(null);
  const stage = useSize(stageRef);

  const current = Math.min(active, doc.pages.length - 1);
  const page = doc.pages[current];
  const theme = pageTheme(doc, page);
  const format = FORMATS[doc.intent.format] ?? FORMATS.portrait;
  const fmt = (n) => formatNumber(n, doc.theme.numerals);
  const brand = (doc.brandId && studio?.memory.brand(doc.brandId)) || doc.brandKit || null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const report = useMemo(() => checkDesign(doc, { ...s.layoutOptions(), brand }), [doc, brand?.version, s.measureReady]);

  useBeforeUnload(busy);
  useEffect(() => {
    if (s.saveError) setStatus({ tone: 'error', text: s.saveError });
  }, [s.saveError]);

  // Text the browser could not fit in its frame even at minimum size.
  useEffect(() => {
    const check = () => {
      const found = [...(stripRef.current?.querySelectorAll('[data-page]') ?? [])].flatMap((node) =>
        [...node.querySelectorAll('[data-overflow]')].map((t) => {
          const elementId = t.closest('[data-el]')?.dataset.el;
          const p = doc.pages.find((x) => x.id === node.dataset.page);
          return { pageId: node.dataset.page, elementId, name: p?.elements.find((e) => e.id === elementId)?.name ?? elementId };
        }),
      );
      setDomOverflow((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found));
    };
    const t = setTimeout(check, 50);
    document.fonts.addEventListener('loadingdone', check);
    return () => {
      clearTimeout(t);
      document.fonts.removeEventListener('loadingdone', check);
    };
  });

  const say = (msg) => setMessages((m) => [...m.slice(-20), { id: ++messageId, ...msg }]);
  const bump = (next) => ({ ...next, revision: doc.revision + 1, updatedAt: now() });

  function patch(patches, label, scope = 'any') {
    try {
      const { doc: next } = applyPatches(doc, patches, { scope, label, ...s.layoutOptions() });
      s.commit(next, label);
      return true;
    } catch (err) {
      setStatus({ tone: 'error', text: err.problems ? err.problems.map((p) => p.message).join('؛ ') : err.message });
      return false;
    }
  }

  const onContent = (pageId, content) => s.commit(bump(updatePage(doc, pageId, (p) => ({ ...p, content }), s.layoutOptions())), 'تعديل المحتوى');

  const onComposition = (pageId, { id, variant }) => {
    const next = updatePage(
      doc,
      pageId,
      (p) => {
        const fields = new Set(compositionOf(id).fields.map((f) => f.key));
        const carried = Object.fromEntries(Object.entries(p.content).filter(([k]) => fields.has(k)));
        // Titles carry over between "title" and "hook".
        if (fields.has('hook') && !carried.hook && p.content.title) carried.hook = p.content.title;
        if (fields.has('title') && !carried.title && p.content.hook) carried.title = p.content.hook;
        const content = id === p.composition.id ? p.content : { ...NEW_CONTENT[id], ...carried };
        return { ...p, composition: { id, version: COMPOSITIONS[id].version, variant, lockVariant: id === p.composition.id }, content, overrides: id === p.composition.id ? p.overrides : {} };
      },
      s.layoutOptions(),
    );
    s.commit(bump(next), 'تغيير التكوين');
  };

  const pagesChanged = (pages, label) => s.commit(bump(composeAll({ ...doc, pages, intent: { ...doc.intent, pages: pages.length, mode: pages.length > 1 ? 'carousel' : 'post' } }, s.layoutOptions())), label);

  const addPage = (id) => {
    const pages = [...doc.pages];
    pages.splice(current + 1, 0, { id: newPageId(), widthPx: format.width, heightPx: format.height, composition: { id, version: COMPOSITIONS[id].version, variant: COMPOSITIONS[id].defaultVariant }, content: structuredClone(NEW_CONTENT[id]), overrides: {}, elements: [] });
    pagesChanged(pages, 'إضافة صفحة');
    setActive(current + 1);
  };
  const removePage = () => {
    if (doc.pages.length < 2) return;
    pagesChanged(doc.pages.filter((_, i) => i !== current), 'حذف صفحة');
    setActive(Math.max(0, current - 1));
  };
  const movePage = (dir) => {
    const j = current + dir;
    if (j < 0 || j >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[current], pages[j]] = [pages[j], pages[current]];
    pagesChanged(pages, 'ترتيب الصفحات');
    setActive(j);
  };

  const applyBrand = (b) => {
    const t = themeFromBrand(b, { numerals: doc.theme.numerals });
    const kit = { id: b.id, name: b.name, handle: b.handle, colors: b.colors ?? [], fonts: b.fonts ?? {}, voice: b.voice ?? {}, imagery: b.imagery ?? {}, constraints: b.constraints ?? [], version: b.version };
    const next = composeAll({ ...doc, brandId: b.id, brandKit: kit, theme: t, brand: { ...doc.brand, name: b.name ?? '', handle: b.handle ?? '' } }, s.layoutOptions());
    s.commit(bump(next), `تطبيق هوية ${b.name}`);
    setStatus({ tone: 'success', text: `طُبّقت هوية «${b.name}» على هذا التصميم فقط.` });
  };

  const uploadAsset = (el, dataUrl, name) => {
    try {
      const record = inlineAsset(dataUrl, { name, tags: [], provenance: { kind: 'user_upload', source: 'editor upload' } });
      try {
        studio?.assets.add(dataUrl, { name, provenance: { kind: 'user_upload', source: 'editor upload' } });
      } catch {
        /* the design still embeds it; the browser library is optional */
      }
      const withAsset = { ...doc, assets: { ...doc.assets, [record.id]: record } };
      const { doc: next } = applyPatches(withAsset, [{ pageId: page.id, elementId: el.id, action: 'replace_asset', payload: { assetId: record.id, force: true } }], { scope: 'graphic', ...s.layoutOptions() });
      s.commit(next, `استبدال ${el.name ?? 'صورة'}`);
    } catch (err) {
      setStatus({ tone: 'error', text: err.message });
    }
  };

  function sendCommand(text) {
    const t0 = performance.now();
    const r = runCommand(doc, text, { pageId: page.id, brand, ...s.layoutOptions() });
    studio?.ledger.record({ kind: r.local ? 'local.edit' : 'needs.assistant', durationMs: Math.round(performance.now() - t0), designId: doc.id, note: r.intent });
    if (r.intent === 'undo') return s.undo(), say({ text, reply: r.reply });
    if (r.intent === 'redo') return s.redo(), say({ text, reply: r.reply });
    if (r.local && r.doc !== doc) {
      s.commit(r.doc, text);
      return say({ text, reply: r.reply });
    }
    const request = r.needs && r.needs !== 'clarify' ? JSON.stringify({ request: text, needs: r.needs, designId: doc.id, revision: doc.revision, target: r.target, targets: r.targets }, null, 1) : null;
    say({ text, reply: r.reply, tone: r.needs === 'clarify' ? 'error' : 'needs', options: r.options, request, intent: r.intent });
  }

  const pickOption = (msg, option) => {
    if (option.hex) return sendCommand(`${msg.text} ${option.hex}`);
    const p = doc.pages.find((x) => x.id === option.pageId);
    const el = p?.elements.find((e) => e.id === option.elementId);
    if (!el) return;
    setActive(doc.pages.indexOf(p));
    setSelected(el.id);
    if (['art', 'art-placeholder', 'photo'].includes(el.role)) {
      const request = JSON.stringify({ request: msg.text, needs: 'asset', designId: doc.id, revision: doc.revision, target: { pageId: p.id, elementId: el.id, slot: el.slot, currentAssetId: el.assetId ?? null } }, null, 1);
      say({ text: option.label, reply: `سيُولَّد رسم جديد لـ«${el.name}» وحده. أرسل الطلب للمساعد، أو استبدله بصورة من لوحة «العناصر».`, tone: 'needs', request });
    } else {
      setTab('layers');
      say({ text: option.label, reply: `حدّدت «${el.name}». عدّله من لوحة «العناصر» أو أعد الأمر.` });
    }
  };

  // Dragging an element: moves the node live, commits one move patch.
  const onPointerDown = (e, el) => {
    e.stopPropagation();
    setSelected(el.id);
    if (el.locked) return;
    const node = e.currentTarget;
    const scale = node.getBoundingClientRect().width / el.frame.width;
    const start = { x: e.clientX, y: e.clientY };
    let delta = { x: 0, y: 0 };
    const move = (ev) => {
      delta = { x: (ev.clientX - start.x) / scale, y: (ev.clientY - start.y) / scale };
      node.style.translate = `${delta.x}px ${delta.y}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      node.style.translate = '';
      if (Math.abs(delta.x) + Math.abs(delta.y) > 2) patch([{ pageId: page.id, elementId: el.id, action: 'move', payload: { dx: Math.round(delta.x), dy: Math.round(delta.y) } }], `تحريك ${el.name ?? ''}`);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Arrow keys nudge the selected element; Delete hides it.
  useEffect(() => {
    const onKey = (e) => {
      if (!selected || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const step = e.shiftKey ? 16 : 4;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        patch([{ pageId: page.id, elementId: selected, action: 'move', payload: { dx: d[0], dy: d[1] } }], 'تحريك');
      } else if (e.key === 'Delete') {
        patch([{ pageId: page.id, elementId: selected, action: 'hide', payload: { hidden: true } }], 'إخفاء');
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- export -------------------------------------------------------------
  const nodes = () => [...stripRef.current.querySelectorAll('.slide-root')];
  const filenames = doc.pages.map((p, i) => slideFilename(i, compositionOf(p.composition.id).role));
  const exportOptions = { fontId: [doc.theme.fonts.heading, doc.theme.fonts.body], background: doc.theme.colors.bg, scale: 1, width: format.width, height: format.height };
  const progress = (i, n) => setStatus({ tone: 'info', text: `جارٍ تصدير الصفحة ${fmt(i + 1)} من ${fmt(n)}…` });
  async function runExport(job, done) {
    if (!report.passed && !window.confirm(`فحص الجودة وجد ${report.errors} مشكلات. التصدير رغم ذلك؟`)) return;
    setBusy(true);
    setSelected(null);
    try {
      const t0 = performance.now();
      await job();
      studio?.ledger.record({ kind: 'export', tool: 'browser', durationMs: Math.round(performance.now() - t0), designId: doc.id });
      setStatus({ tone: 'success', text: done });
    } catch (err) {
      console.error(err);
      setStatus({ tone: 'error', text: `فشل التصدير: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  const storyStage = useMemo(() => {
    if (!reelOpen) return null;
    const chrome = { ...doc.chrome, pagination: { ...doc.chrome.pagination, enabled: false }, swipe: { ...doc.chrome.swipe, enabled: false } };
    return setFormat({ ...doc, chrome }, 'story', s.layoutOptions());
  }, [reelOpen, doc, s]);

  const scale = Math.min(1, Math.max(0.1, Math.min((stage.width - STAGE_PADDING) / format.width, (stage.height - STAGE_PADDING) / format.height)));
  const tone = { info: 'bg-indigo-50 text-indigo-800', success: 'bg-emerald-50 text-emerald-800', error: 'bg-red-50 text-red-800' };
  const pageIndexOf = (id) => doc.pages.findIndex((p) => p.id === id);

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-100 text-zinc-900 lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-indigo-600 text-lg font-extrabold text-white">ب</span>
          <div className="leading-tight">
            <h1 className="text-base font-extrabold">بصيرة · الاستوديو</h1>
            <p className="text-xs text-zinc-500">
              عناصر مستقلة · <bdi dir="ltr">{`${format.width}×${format.height}`}</bdi>
              {brand ? ` · ${brand.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-60" role="group" aria-label="المقاس">
            <Segmented
              value={format.id}
              onChange={(id) => s.commit(bump(setFormat(doc, id, s.layoutOptions())), `المقاس ${FORMATS[id].ratio}`)}
              options={Object.values(FORMATS).map((f) => ({ value: f.id, label: fmt(f.ratio) }))}
            />
          </div>
          <Button variant="ghost" onClick={s.undo} disabled={!s.canUndo} aria-label="تراجع" title="تراجع (Ctrl+Z)">
            <Icon name="reset" size={16} />
          </Button>
          <Button variant="ghost" onClick={s.redo} disabled={!s.canRedo} aria-label="إعادة" title="إعادة (Ctrl+Shift+Z)">
            <span className="inline-block -scale-x-100">
              <Icon name="reset" size={16} />
            </span>
          </Button>
          <Button variant={phone ? 'primary' : 'secondary'} onClick={() => setPhone((p) => !p)} aria-pressed={phone}>
            معاينة الهاتف
          </Button>
          <Menu
            label="تصدير"
            icon="download"
            variant="primary"
            disabled={busy}
            items={[
              { label: 'الصفحة الحالية PNG', description: ltr(filenames[current]), onSelect: () => runExport(() => exportSlidePng(nodes()[current], filenames[current], exportOptions), `تم تنزيل الصفحة ${fmt(current + 1)}.`) },
              { label: 'كل الصفحات ZIP', description: 'ملفات مرقّمة بترتيب النشر', onSelect: () => runExport(() => exportCarouselZip(nodes(), exportOptions, filenames, progress), `تم تنزيل ${fmt(doc.pages.length)} صفحات في ZIP.`) },
              { label: 'PDF لينكدإن', description: 'صفحة لكل شريحة', onSelect: () => runExport(() => exportCarouselPdf(nodes(), exportOptions, { title: doc.brief || 'تصميم', author: doc.brand.name || 'بصيرة' }, progress), 'تم تنزيل ملف PDF.') },
              { label: 'فيديو ريلز', description: 'قصة ٩:١٦ متحركة', onSelect: () => setReelOpen(true) },
            ]}
          />
          {onClassic && (
            <Button variant="ghost" onClick={onClassic}>
              المحرر الكلاسيكي
            </Button>
          )}
        </div>
      </header>

      {status && (
        <div role="status" className={`flex items-center justify-between px-4 py-2 text-sm ${tone[status.tone]}`}>
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
          <nav className="flex overflow-x-auto border-b border-zinc-200" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 grow border-b-2 px-3 py-3 text-sm font-bold whitespace-nowrap transition ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}
              >
                {t.label}
                {t.id === 'quality' && (report.errors + domOverflow.length > 0) && <span className="ms-1 rounded-full bg-red-600 px-1.5 text-[11px] text-white">{fmt(report.errors + domOverflow.length)}</span>}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'content' && <ContentFields page={page} index={current} onContent={onContent} onComposition={onComposition} />}
            {tab === 'layers' && (
              <LayersPanel
                page={page}
                colors={theme.colors}
                selected={selected}
                onSelect={setSelected}
                onPatch={(patches) => patch(patches, 'تعديل عنصر')}
                onUploadAsset={uploadAsset}
                onError={(text) => setStatus({ tone: 'error', text })}
              />
            )}
            {tab === 'quality' && (
              <QualityPanel
                report={report}
                domOverflow={domOverflow}
                pageIndexOf={pageIndexOf}
                onRelayout={s.relayout}
                onJump={(pageId, elementId) => {
                  setActive(pageIndexOf(pageId));
                  setSelected(elementId ?? null);
                }}
              />
            )}
            {tab === 'algorithm' && (
              <AlgorithmPanel
                studio={studio}
                doc={doc}
                onJump={(pageId) => {
                  setActive(pageIndexOf(pageId));
                  setSelected(null);
                }}
              />
            )}
            {tab === 'taste' && <TastePanel studio={studio} doc={doc} onApplyBrand={applyBrand} onStatus={setStatus} />}
            {tab === 'history' && (
              <HistoryPanel studio={studio} doc={doc} history={s.history} report={report} selected={selected} onUndo={s.undo} onRedo={s.redo} onRestore={(d, label) => d && s.commit(composeAll({ ...d, assets: { ...doc.assets, ...d.assets }, revision: doc.revision + 1 }, s.layoutOptions()), label)} onStatus={setStatus} />
            )}
          </div>
        </aside>

        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div ref={stageRef} className="relative h-[60vh] lg:h-auto lg:min-h-0 lg:flex-1">
            <div className="absolute inset-0 grid place-items-center p-6">
              {phone ? (
                <div className="rounded-[44px] border-[10px] border-zinc-900 bg-zinc-900 shadow-2xl" style={{ width: 390 + 20 }}>
                  <SlideFrame scale={390 / format.width} width={format.width} height={format.height} className="rounded-[32px]">
                    <ScenePage doc={doc} page={page} />
                  </SlideFrame>
                </div>
              ) : (
                <SlideFrame scale={scale} width={format.width} height={format.height} className="rounded-sm shadow-xl shadow-zinc-900/10">
                  <ScenePage doc={doc} page={page} editing selected={selected} onSelect={setSelected} onPointerDown={onPointerDown} />
                </SlideFrame>
              )}
            </div>
          </div>
          <ChatBar onSend={sendCommand} onPick={pickOption} messages={messages} busy={busy} />
          <div className="border-t border-zinc-200 bg-white">
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="text-sm font-bold text-zinc-700">الصفحات ({fmt(doc.pages.length)})</span>
              <div className="flex gap-1.5">
                <Button variant="ghost" className="!px-2" onClick={() => movePage(1)} disabled={current >= doc.pages.length - 1} aria-label="نقل للأمام" title="نقل للأمام">
                  <Icon name="arrow" size={16} directional />
                </Button>
                <Button variant="ghost" className="!px-2" onClick={() => movePage(-1)} disabled={current === 0} aria-label="نقل للخلف" title="نقل للخلف">
                  <Icon name="arrowBack" size={16} directional />
                </Button>
                <Button variant="ghost" className="!px-2" onClick={removePage} disabled={doc.pages.length < 2} aria-label="حذف الصفحة" title="حذف الصفحة">
                  <Icon name="trash" size={16} />
                </Button>
                <Menu label="إضافة صفحة" icon="plus" variant="primary" placement="up" items={compositionList.map((c) => ({ label: c.label, description: c.description, onSelect: () => addPage(c.id) }))} />
              </div>
            </div>
            <div ref={stripRef} className="flex gap-4 overflow-x-auto px-4 pt-4 pb-4">
              {doc.pages.map((p, i) => {
                const flagged = report.issues.some((x) => x.pageId === p.id && x.severity === 'error') || domOverflow.some((o) => o.pageId === p.id);
                return (
                  <div key={p.id} className="relative shrink-0">
                    <SlideFrame scale={THUMB_HEIGHT / p.heightPx} width={p.widthPx} height={p.heightPx} className={`rounded-md ${i === current ? 'ring-2 ring-indigo-500 ring-offset-2' : 'ring-1 ring-zinc-300'}`}>
                      <ScenePage doc={doc} page={p} />
                    </SlideFrame>
                    <button type="button" onClick={() => setActive(i)} aria-label={`تحديد الصفحة ${i + 1}`} aria-current={i === current} className="absolute inset-0 rounded-md" />
                    <span className={`pointer-events-none absolute -top-2 -start-2 grid size-6 place-items-center rounded-full text-xs text-white ${flagged ? 'bg-amber-500' : 'bg-zinc-900'}`}>{flagged ? '!' : fmt(i + 1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
      {reelOpen && storyStage && (
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/60 text-sm text-white">جارٍ تحميل محرّك الفيديو…</div>}>
          <ReelDialog
            stage={storyStage.pages.map((p) => (
              <ScenePage key={p.id} doc={storyStage} page={p} />
            ))}
            words={doc.pages.map((p) => countWords(Object.fromEntries(contentTexts(p.composition.id, p.content).map((t) => [t.slot, t.text]))))}
            colors={doc.theme.colors}
            font={[doc.theme.fonts.heading, doc.theme.fonts.body]}
            numerals={doc.theme.numerals}
            onClose={() => setReelOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
