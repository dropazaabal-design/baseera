import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { Button, Segmented } from './ui';
import { FORMATS } from '../lib/formats.js';
import { captureReel, drawFrame, encodeReel, releaseReel } from '../lib/video.js';
import { downloadBlob } from '../lib/exportEngine.js';
import { formatNumber } from '../lib/numerals.js';
import useTimeline, { usePlayhead } from '../hooks/useTimeline.js';
import useBeforeUnload from '../hooks/useBeforeUnload.js';

const STORY = FORMATS.story;
const DURATIONS = [10, 14, 20, 30];
const CODEC_LABEL = { avc: 'MP4 · H.264', vp9: 'WebM · VP9', vp8: 'WebM · VP8', MediaRecorder: 'MediaRecorder' };

function Player({ scenes, timeline, accent, paused, fmt }) {
  const canvas = useRef(null);
  const { time, playing, setPlaying, seek } = usePlayhead(timeline.duration, paused);

  useEffect(() => {
    drawFrame(canvas.current.getContext('2d'), scenes, timeline, time, { accent, insetTop: STORY.inset.top });
  }, [scenes, timeline, time, accent]);

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <canvas ref={canvas} width={STORY.width} height={STORY.height} className="min-h-0 w-auto max-w-full flex-1 rounded-lg bg-black shadow-lg" />
      <div className="flex w-full max-w-xs items-center gap-3">
        <Button variant="ghost" className="!p-1.5" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}>
          {playing ? '❚❚' : '▶'}
        </Button>
        <input
          type="range"
          min={0}
          max={timeline.duration}
          step={1 / 30}
          value={time}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          className="flex-1 accent-indigo-600"
          aria-label="موضع المعاينة"
        />
        <span className="w-16 text-xs tabular-nums text-zinc-500">
          {fmt(time.toFixed(1))} / {fmt(timeline.duration)} ث
        </span>
      </div>
    </div>
  );
}

// `stage` renders the scenes as 9:16 .slide-root nodes (off-screen) with no
// slide counter or swipe prompt; `words` is the word count per scene. The
// classic editor passes its template slides, the studio its element pages.
export default function ReelDialog({ stage, words, colors, font, numerals, onClose }) {
  const stageRef = useRef(null);
  const abort = useRef(null);
  const [scenes, setScenes] = useState(null);
  const [phase, setPhase] = useState({ step: 'capturing', done: 0, total: words.length });
  const working = phase.step === 'capturing' || phase.step === 'encoding';
  useBeforeUnload(working);
  const fmt = (n) => formatNumber(n, numerals);

  // Capture once per opening. The dialog blocks the editor, so the slides
  // cannot change underneath the captured layers.
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    let captured;
    const nodes = [...stageRef.current.querySelectorAll('.slide-root')];
    captureReel(
      nodes,
      { fontId: font, background: colors.bg, width: STORY.width, height: STORY.height },
      (done, total) => setPhase({ step: 'capturing', done, total }),
      controller.signal,
    )
      .then((result) => {
        captured = result;
        setScenes(result);
        setPhase({ step: 'ready' });
      })
      .catch((err) => err.name !== 'AbortError' && setPhase({ step: 'error', message: err.message }));
    return () => {
      controller.abort();
      if (captured) releaseReel(captured);
    };
  }, []);

  const specs = useMemo(() => scenes?.map((s, i) => ({ layers: s.layers.length, words: words[i] })), [scenes, words]);
  const { timeline, duration, setDuration } = useTimeline(specs);
  const slow = timeline?.scenes.flatMap((s, i) => (s.tooFast ? [{ i, ...s }] : [])) ?? [];

  async function exportVideo() {
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ step: 'encoding', done: 0, total: Math.round(duration * 30) });
    try {
      const result = await encodeReel(scenes, timeline, {
        width: STORY.width,
        height: STORY.height,
        accent: colors.accent,
        insetTop: STORY.inset.top,
        onProgress: (done, total) => setPhase({ step: 'encoding', done, total }),
        signal: controller.signal,
      });
      const filename = `reel.${result.extension}`;
      downloadBlob(result.blob, filename);
      setPhase({ step: 'done', filename, codec: result.codec, size: result.blob.size });
    } catch (err) {
      setPhase(err.name === 'AbortError' ? { step: 'ready' } : { step: 'error', message: err.message });
    }
  }

  const percent = working && phase.total ? Math.round((phase.done / phase.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/60 p-4" role="dialog" aria-modal="true" aria-label="تصدير فيديو ريلز">
      {/* Off-screen 9:16 render of the slides, captured layer by layer. */}
      <div ref={stageRef} aria-hidden="true" className="pointer-events-none fixed top-0 left-[-20000px]">
        {stage}
      </div>

      <div className="flex h-[min(860px,94dvh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <div>
            <h2 className="text-base font-extrabold">فيديو ريلز</h2>
            <p className="text-xs text-zinc-500">
              <bdi dir="ltr">1080×1920</bdi> · ٣٠ إطارًا في الثانية · بلا صوت
            </p>
          </div>
          <Button variant="ghost" className="!p-1.5" onClick={onClose} disabled={working} aria-label="إغلاق">
            <Icon name="x" size={18} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 md:flex-row">
          <div className="relative min-h-[420px] min-w-0 flex-1">
            {scenes && <Player scenes={scenes} timeline={timeline} accent={colors.accent} paused={working} fmt={fmt} />}
            {working && (
              <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/85 backdrop-blur-sm">
                <div className="w-64 text-center" role="status" aria-live="polite">
                  <p className="mb-1 text-sm font-bold text-zinc-800">
                    {phase.step === 'capturing'
                      ? `تجهيز المشهد ${fmt(Math.min(phase.done + 1, phase.total))} من ${fmt(phase.total)}`
                      : `ترميز الإطار ${fmt(phase.done)} من ${fmt(phase.total)}`}
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-zinc-500">{fmt(percent)}٪</p>
                  <p className="mt-3 text-xs leading-relaxed text-amber-800">لا تغلق هذه الصفحة ولا تنتقل عنها حتى يكتمل التصدير.</p>
                  <Button variant="ghost" className="mt-2" onClick={() => abort.current?.abort()}>
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="w-full space-y-5 md:w-72">
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-zinc-600">مدة الفيديو</p>
              <Segmented
                value={duration}
                onChange={setDuration}
                options={DURATIONS.map((d) => ({ value: d, label: `${fmt(d)} ث` }))}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                المشهد الأول خطّاف سريع (ثانيتان) تكتمل حركته في أقل من ثانية، والأخير دعوة للإجراء.
              </p>
            </div>

            {slow.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                {slow.map((s) => (
                  <p key={s.i}>
                    الشريحة {fmt(s.i + 1)} تحتاج نحو {fmt(s.readTime.toFixed(1))} ث للقراءة وتظهر {fmt((s.end - s.start).toFixed(1))} ث فقط.
                  </p>
                ))}
                <p className="mt-1 font-bold">زِد المدة أو اختصر النص.</p>
              </div>
            )}

            {phase.step === 'done' && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
                <p>
                  تم تنزيل <bdi dir="ltr">{phase.filename}</bdi> ({CODEC_LABEL[phase.codec] ?? phase.codec}، {fmt((phase.size / 1048576).toFixed(1))} م.ب).
                </p>
                {phase.filename.endsWith('.webm') && <p className="mt-1">متصفحك لا يرمّز H.264، وإنستغرام يفضّل MP4. استعمل Chrome أو Edge أو Safari للحصول على MP4.</p>}
              </div>
            )}
            {phase.step === 'error' && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">فشل التصدير: {phase.message}</p>}

            <Button variant="primary" className="w-full" onClick={exportVideo} disabled={!scenes || working}>
              <Icon name="download" size={16} />
              تصدير الفيديو
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
