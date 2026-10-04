import { useEffect, useMemo, useRef, useState } from 'react';
import { Section } from '../ui';
import { createEngine } from '../../lib/algorithm-intelligence/engine.js';
import { effectLine, reasonLines } from '../../lib/algorithm-intelligence/explainability/recommendation-reason.js';
import { PerformanceStore } from '../../lib/algorithm-intelligence/history/performance-store.js';
import { parseFacebook } from '../../lib/algorithm-intelligence/ingestion/facebook-insights.js';
import { parseInstagram } from '../../lib/algorithm-intelligence/ingestion/instagram-insights.js';
import { parseX } from '../../lib/algorithm-intelligence/ingestion/x-metrics.js';
import { SCORE_LABEL } from '../../lib/algorithm-intelligence/explainability/messages.js';

// Algorithm intelligence for the design being edited: per-platform fit
// scores with their reasons, recommendations and account evidence. Local
// and deterministic: it re-analyzes 450 ms after the last edit, reuses the
// result for unchanged content, and never calls an AI model (the semantic
// layer runs from the CLI when asked). Imported metrics stay in this
// browser's storage.

const PLATFORMS = [
  ['x', 'إكس'],
  ['instagram', 'إنستغرام'],
  ['facebook', 'فيسبوك'],
];
const PARSERS = { instagram: parseInstagram, facebook: parseFacebook, x: parseX };
const SCORE_KEYS = ['hook', 'share', 'save', 'conversation', 'retention'];
const PRIORITY = { high: ['عالية', 'bg-red-50 text-red-800'], medium: ['متوسطة', 'bg-amber-50 text-amber-900'], low: ['منخفضة', 'bg-zinc-100 text-zinc-700'] };
const CONF = { high: 'مرتفعة', medium: 'متوسطة', low: 'منخفضة' };

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ar', { useGrouping: false }) : '—');

function Bar({ value, tone = 'bg-indigo-600' }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, value ?? 0)}%` }} />
    </span>
  );
}

function Lines({ items, sign }) {
  if (!items.length) return <p className="text-xs text-zinc-500">لا شيء بارز.</p>;
  return (
    <ul className="space-y-1">
      {items.map((l) => (
        <li key={l.id} className="text-xs leading-relaxed text-zinc-700">
          <span className={`font-bold ${sign > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {sign > 0 ? '+' : '−'}
            {fmt(Math.abs(Math.round(l.points * 10) / 10))}
          </span>{' '}
          {l.label}
          {l.why.length ? <span className="text-zinc-500">: {l.why.join('، ')}</span> : null}
          <span className="ms-1 text-[10px] text-zinc-400">({l.provenanceLabel})</span>
        </li>
      ))}
    </ul>
  );
}

function PlatformDetails({ r, onJumpSlide }) {
  const e = r.explanation;
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
      <div className="grid grid-cols-5 gap-2">
        {SCORE_KEYS.filter((k) => typeof r.scores[k]?.score === 'number').map((k) => (
          <div key={k} className="space-y-1 text-center">
            <div className="text-[11px] text-zinc-500">{SCORE_LABEL[k].ar}</div>
            <div className="text-sm font-bold text-zinc-800">{fmt(r.scores[k].score)}</div>
            <Bar value={r.scores[k].score} />
          </div>
        ))}
      </div>
      <details open>
        <summary className="cursor-pointer text-xs font-bold text-zinc-800">لماذا هذه الدرجة؟</summary>
        <div className="mt-2">
          <Lines items={e.positives} sign={1} />
        </div>
      </details>
      <details open>
        <summary className="cursor-pointer text-xs font-bold text-zinc-800">ما الذي يضعفها؟</summary>
        <div className="mt-2">
          <Lines items={e.negatives} sign={-1} />
        </div>
      </details>
      <details open>
        <summary className="cursor-pointer text-xs font-bold text-zinc-800">تعديلات مقترحة ({fmt(r.recommendations.length)})</summary>
        <ul className="mt-2 space-y-2">
          {r.recommendations.length === 0 && <li className="text-xs text-zinc-500">لا ضعف مقيس يستدعي تعديلًا.</li>}
          {r.recommendations.map((rec) => (
            <li key={rec.id} className="rounded-md bg-zinc-50 p-2 text-xs leading-relaxed">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY[rec.priority][1]}`}>{PRIORITY[rec.priority][0]}</span>
                <span className="font-bold text-zinc-800">{rec.title}</span>
              </div>
              <p className="text-zinc-800">{rec.suggestedFix}</p>
              <p className="text-zinc-500">{rec.reason}</p>
              <p className="text-zinc-500">{effectLine(rec, 'ar')}</p>
              <ul className="mt-1 list-disc ps-4 text-[11px] text-zinc-500">
                {reasonLines(rec, 'ar').map((l, i) => (
                  <li key={i}>
                    {l.text} <span className="text-zinc-400">({l.provenanceLabel})</span>
                  </li>
                ))}
              </ul>
              {rec.rule === 'slide_overloaded' && (
                <button type="button" className="mt-1 text-[11px] font-bold text-indigo-700 hover:underline" onClick={() => onJumpSlide(rec.evidence[0].feature.match(/\[(\d+)\]/)?.[1])}>
                  اذهب إلى الشريحة
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-xs font-bold text-zinc-800">من بيانات حسابك</summary>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-zinc-700">
          {r.accountEvidence?.length ? r.accountEvidence.map((a, i) => <li key={i}>{a.effect === undefined || a.effect >= 0 ? '✓' : '⚠'} {a.statement.ar}</li>) : <li className="text-zinc-500">لا بيانات أداء كافية لهذا الحساب على هذه المنصة بعد.</li>}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-xs font-bold text-zinc-800">
          الثقة: {CONF[r.confidence.confidenceLabel]} ({fmt(r.confidence.confidence)})
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
          {r.confidence.reasons.map((x) => (
            <li key={x.code}>{x.ar}</li>
          ))}
          {r.notes.map((n) => (
            <li key={n.code}>• {n.text}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function AlgorithmPanel({ studio, doc, onJump }) {
  const account = doc.brand?.handle || doc.brandKit?.handle || 'default';
  const [historyVersion, setHistoryVersion] = useState(0);
  const engine = useMemo(() => createEngine({ studio, accountId: account }), [studio, account, historyVersion]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState('instagram');
  const [importPlatform, setImportPlatform] = useState('instagram');
  const [importNote, setImportNote] = useState(null);
  const cache = useRef(new Map());
  const timer = useRef(null);

  // Debounced, local analysis; unchanged content reuses its report.
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const features = engine.features(doc);
        const key = `${features.key}:${historyVersion}`;
        const hit = cache.current.get(key);
        if (hit) return setReport(hit);
        const r = engine.analyzeFeatures(features, { lang: 'ar', account });
        cache.current.set(key, r);
        if (cache.current.size > 30) cache.current.delete(cache.current.keys().next().value);
        setReport(r);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [doc, engine, account, historyVersion]);

  async function importFile(file) {
    if (!file || !studio) return;
    try {
      const text = await file.text();
      const rows = PARSERS[importPlatform](text, { filename: file.name });
      const res = new PerformanceStore(studio.store, account).upsert(rows, { source: file.name.endsWith('.csv') ? 'csv' : 'import' });
      setImportNote(`أُضيف ${fmt(res.added)} وحُدّث ${fmt(res.updated)} منشورًا (${fmt(res.total)} إجمالًا).`);
      setHistoryVersion((v) => v + 1);
    } catch (err) {
      setImportNote(`تعذّر الاستيراد: ${err.message}`);
    }
  }

  const jumpSlide = (n) => {
    const page = doc.pages[Number(n) - 1];
    if (page) onJump(page.id);
  };

  return (
    <Section title="ذكاء المنصات" aside={<span className="text-[11px] text-zinc-500">تقدير نسبي، لا احتمال انتشار</span>}>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      {!report && !error && <p className="text-xs text-zinc-500">جارٍ التحليل…</p>}
      {report && (
        <>
          <div className="flex items-end justify-between rounded-lg bg-zinc-50 px-3 py-2">
            <div>
              <div className="text-xs text-zinc-500">{report.overall.label}</div>
              <div className="text-2xl font-black text-zinc-900">{fmt(report.overall.score)}</div>
            </div>
            <div className="text-[11px] text-zinc-500">
              الحساب: {account === 'default' ? 'بلا حساب' : <bdi dir="ltr">{account}</bdi>}
            </div>
          </div>
          <ul className="space-y-2">
            {PLATFORMS.map(([id, label]) => {
              const r = report.platforms[id];
              return (
                <li key={id} className="space-y-2">
                  <button type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} className="w-full space-y-1 rounded-md px-2 py-1.5 text-start hover:bg-zinc-50">
                    <span className="flex items-center justify-between text-sm">
                      <span className="font-bold text-zinc-800">{label}</span>
                      <span className="font-black text-zinc-900">
                        {fmt(r.overall.score)}
                        <span className="ms-2 text-[11px] font-normal text-zinc-500">ثقة {CONF[r.confidence.confidenceLabel]}</span>
                      </span>
                    </span>
                    <Bar value={r.overall.score} />
                  </button>
                  {open === id && <PlatformDetails r={r} onJumpSlide={jumpSlide} />}
                </li>
              );
            })}
          </ul>
          {report.perSlide?.some((s) => s.warning) && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-zinc-800">كثافة الشرائح</h4>
              {report.perSlide
                .filter((s) => s.warning)
                .map((s) => (
                  <button key={s.slide} type="button" onClick={() => jumpSlide(s.slide)} className="block w-full rounded-md bg-amber-50/60 px-2 py-1 text-start text-xs text-amber-900 hover:bg-amber-50">
                    الشريحة {fmt(s.slide)}: {fmt(s.words)} كلمة (كثافة {fmt(s.densityScore)})
                    {s.recommendedWordReduction ? ` — احذف ${fmt(s.recommendedWordReduction)}` : ''}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      <details className="rounded-lg border border-zinc-200 px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-zinc-800">استيراد أداء منشوراتك</summary>
        <div className="mt-2 space-y-2 text-xs text-zinc-600">
          <p>ملف JSON من واجهات المنصات الرسمية أو CSV مُصدَّر. يبقى في هذا المتصفح فقط، ويُحسب منه خط أساس حسابك وأنماطه.</p>
          <div className="flex items-center gap-2">
            <select value={importPlatform} onChange={(ev) => setImportPlatform(ev.target.value)} className="rounded-md border border-zinc-300 px-2 py-1">
              {PLATFORMS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <input type="file" accept=".json,.csv" disabled={!studio} onChange={(ev) => importFile(ev.target.files?.[0])} className="min-w-0 flex-1 text-[11px]" />
          </div>
          {importNote && <p className="text-zinc-700">{importNote}</p>}
        </div>
      </details>
      {report && <p className="text-[11px] leading-relaxed text-zinc-500">{report.disclaimer}</p>}
    </Section>
  );
}
