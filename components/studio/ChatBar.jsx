import { useState } from 'react';
import Icon from '../Icon';
import { Button } from '../ui';

const EXAMPLES = ['كبّر العنوان قليلًا', 'غيّر الرسم الرابع فقط', 'حوّل الخلفية إلى الأزرق من هويتي', 'اختصر النص مع إبقاء الرسالة', 'اقفل العنوان', 'وزّع البنود في عمودين'];

// «عدّل بالمحادثة»: Arabic instructions become targeted edits. Local edits
// apply at once (undoable); edits that need the assistant (new artwork,
// rewriting) produce a precise request to send to it, and ambiguous ones
// ask which element was meant.
export default function ChatBar({ onSend, onPick, messages, busy }) {
  const [text, setText] = useState('');
  const send = (value = text) => {
    const t = value.trim();
    if (!t || busy) return;
    onSend(t);
    setText('');
  };
  const last = messages.slice(-3);
  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3">
      {last.length > 0 && (
        <div className="mb-2 max-h-40 space-y-1.5 overflow-y-auto" aria-live="polite">
          {last.map((m) => (
            <div key={m.id} className="text-sm">
              <p className="text-zinc-500">
                <span className="font-bold text-zinc-700">أنت:</span> {m.text}
              </p>
              <p className={m.tone === 'needs' ? 'text-amber-800' : m.tone === 'error' ? 'text-red-700' : 'text-emerald-800'}>{m.reply}</p>
              {m.options?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {m.options.map((o) => (
                    <button
                      key={`${o.pageId}/${o.elementId ?? o.hex}`}
                      type="button"
                      onClick={() => onPick(m, o)}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800 hover:bg-indigo-100"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {m.request && (
                <details className="mt-1 text-xs text-zinc-600">
                  <summary className="cursor-pointer">الطلب الدقيق للمساعد</summary>
                  <pre dir="ltr" className="mt-1 max-h-32 overflow-auto rounded bg-zinc-50 p-2 text-[11px] leading-snug">{m.request}</pre>
                  <Button variant="ghost" className="mt-1 !px-2 !py-1 text-xs" onClick={() => navigator.clipboard?.writeText(m.request)}>
                    <Icon name="copy" size={14} /> نسخ
                  </Button>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          dir="rtl"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="عدّل بالمحادثة: «كبّر العنوان قليلًا»، «غيّر الرسم الرابع فقط»…"
          aria-label="عدّل بالمحادثة"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <Button variant="primary" type="submit" disabled={busy || !text.trim()}>
          تنفيذ
        </Button>
      </form>
      {!messages.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setText(e)} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
