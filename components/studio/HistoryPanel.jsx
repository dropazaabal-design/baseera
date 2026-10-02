import { useState } from 'react';
import { Button, Section, TextArea } from '../ui';
import { parseFeedback } from '../../lib/studio/memory.js';

const STATUS = { candidate: 'مرشّح', used: 'مستخدم', approved: 'معتمد', rejected: 'مرفوض' };

// Undo history of this session, and the design's versions in the library.
// Saving after the quality gate makes a candidate; only the creator's
// explicit approval makes it "approved" — exporting or saying nothing never
// does. Feedback is tied to aspects and elements, and a rejection for a
// topic stays scoped to that topic.
export default function HistoryPanel({ studio, doc, history, report, selected, onUndo, onRedo, onRestore, onStatus }) {
  const [feedback, setFeedback] = useState('');
  const [version, setVersion] = useState(0);
  const meta = studio?.library.meta(doc.id);
  const refresh = () => setVersion((v) => v + 1);
  const run = (fn, text) => {
    try {
      fn();
      refresh();
      onStatus({ tone: 'success', text });
    } catch (err) {
      onStatus({ tone: 'error', text: err.message });
    }
  };

  return (
    <div key={version}>
      <Section title="التراجع والإعادة">
        <div className="flex gap-2">
          <Button onClick={onUndo} disabled={!history.past.length}>
            تراجع ({history.past.length})
          </Button>
          <Button onClick={onRedo} disabled={!history.future.length}>
            إعادة ({history.future.length})
          </Button>
        </div>
        <ol className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-zinc-600">
          {[...history.past].reverse().slice(0, 15).map((h, i) => (
            <li key={i} className="truncate">
              {h.label || 'تعديل'}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="المكتبة والنسخ" aside={meta && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{STATUS[meta.status]}</span>}>
        {!studio && <p className="text-xs text-zinc-500">التخزين في المتصفح غير متاح هنا.</p>}
        {studio && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  run(() => {
                    const { revision } = studio.library.save(doc, { label: history.lastLabel ?? 'حفظ من المحرر', quality: report });
                    if (!report.passed) throw new Error(`حُفظت النسخة ${revision} للسجل، لكنها لم تجتز فحص الجودة فلن تُقترح لإعادة الاستخدام.`);
                  }, 'حُفظت نسخة في المكتبة بعد فحص الجودة.')
                }
              >
                حفظ نسخة
              </Button>
              <Button
                variant="primary"
                disabled={!meta || !report.passed}
                title={!report.passed ? 'أصلح مشكلات الجودة أولًا' : undefined}
                onClick={() => run(() => studio.library.approve(doc.id, 'اعتمده صاحب الحساب من المحرر (زر «اعتمد هذا التصميم»)'), 'اعتُمد التصميم.')}
              >
                اعتمد هذا التصميم
              </Button>
            </div>
            {meta && (
              <ol className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {[...meta.versions].reverse().map((v) => (
                  <li key={v.revision} className="flex items-center gap-2">
                    <span className="font-bold">ن{v.revision}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-600">{v.label}</span>
                    {v.quality && <span className={v.quality.passed ? 'text-emerald-700' : 'text-red-700'}>{v.quality.passed ? 'اجتاز' : 'لم يجتز'}</span>}
                    <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => onRestore(studio.library.get(doc.id, v.revision), `استعادة النسخة ${v.revision}`)}>
                      استعادة
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Section>

      {studio && meta && (
        <Section title="رأيك في التصميم">
          <TextArea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="مثال: أحب الجرافيك لكن الخط صغير" />
          <Button
            variant="secondary"
            disabled={!feedback.trim()}
            onClick={() =>
              run(() => {
                const parsed = parseFeedback(feedback);
                const elementIds = selected ? [selected] : [];
                for (const a of parsed.aspects) {
                  studio.library.addFeedback(doc.id, { verdict: a.sentiment > 0 ? 'like' : a.sentiment < 0 ? 'dislike' : 'note', aspects: [a.aspect], elementIds, text: feedback, ...(parsed.scope === 'topic' && { scope: { concepts: meta.concepts } }) });
                  if (a.aspect === 'text.size' && a.fix) {
                    studio.memory.observe(doc.creatorId, { key: 'text.size', value: a.fix === 'increase' ? 'larger' : 'smaller', scope: { brandId: doc.brandId, platform: doc.intent.platform }, designId: doc.id, evidence: feedback });
                  }
                }
                if (!parsed.aspects.length) studio.library.addFeedback(doc.id, { verdict: 'note', elementIds, text: feedback });
                if (parsed.scope === 'topic' && parsed.aspects.some((a) => a.sentiment < 0 && ['style', 'layout', 'graphics'].includes(a.aspect))) {
                  studio.library.setStatus(doc.id, 'rejected', { scope: { concepts: meta.concepts }, reason: feedback });
                }
                setFeedback('');
              }, 'سُجّلت الملاحظة على عناصرها. لإصلاح الخط مع إبقاء الجرافيك: اكتب في المحادثة «كبّر النص».')
            }
          >
            سجّل الملاحظة
          </Button>
          {meta.feedback.length > 0 && (
            <ul className="space-y-0.5 text-xs text-zinc-600">
              {meta.feedback.slice(-5).map((f, i) => (
                <li key={i}>
                  {f.verdict === 'like' ? '👍' : f.verdict === 'dislike' ? '👎' : '•'} {f.aspects?.join('، ')} — {f.text}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
