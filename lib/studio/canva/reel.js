import { formatNumber } from '../../numerals.js';
import { plainText } from '../measure.js';
import { createDesign } from '../document.js';
import { clone, hashOf, now } from '../util.js';

// Idea or carousel → reel plan (1080×1920 scenes). Each scene stores its
// text, assets, composition, suggested duration, element motion and the
// transition into the next scene. The plan is built locally and costs no
// AI call; texts too long for a phone are flagged for rewriting, never cut.
//
// Craft rules:
//   - the hook is the first scene, short (≤ 7 words), on screen from the
//     first frame (its title enters within 0.3 s)
//   - one idea per scene; big Arabic titles and numbers
//   - durations follow the amount of text (≈ 3 words a second plus a beat)
//   - compositions alternate, so consecutive scenes do not look the same
//   - a closing scene that fits the content (save / follow / question)
//   - motion moves whole elements; Arabic is never animated letter by
//     letter, which would break its joined letters
//   - no music is added automatically

export const REEL_LIMITS = { hookWords: 7, titleWords: 11, subtitleWords: 14, minScene: 2, maxScene: 6, hook: [1.8, 2.6], cta: [2.5, 3.5], maxScenes: 9 };
const WORDS_PER_SECOND = 3;
export const MOTION_EFFECTS = ['pop', 'rise', 'fade'];
export const TRANSITIONS = ['cut', 'fade', 'push'];

const wordCount = (t) => plainText(t).split(/\s+/).filter(Boolean).length;
const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;

// Carousel document → neutral scene sources.
function scenesFromDoc(doc) {
  const out = [];
  doc.pages.forEach((p) => {
    const c = p.content ?? {};
    const id = p.composition.id;
    const art = typeof c.art === 'string' ? c.art : Array.isArray(c.art) ? c.art.find(Boolean) : null;
    if (id === 'hero' || id === 'collage' || id === 'statement') out.push({ role: out.length ? 'point' : 'hook', title: c.title, kicker: c.kicker, subtitle: c.subtitle, art, from: p.id });
    else if (id === 'list') {
      const start = Number(c.start) || 1;
      (c.items ?? []).forEach((item, i) => out.push({ role: 'point', number: start + i, title: item, art: c.itemArt?.[i] ?? null, from: p.id, parentTitle: c.title }));
    } else if (id === 'post') {
      out.push({ role: 'hook', title: c.hook, from: p.id, art });
      (c.points ?? []).forEach((pt, i) => out.push({ role: 'point', number: i + 1, title: pt, from: p.id, art: c.itemArt?.[i] ?? null }));
      if (c.cta) out.push({ role: 'cta', title: c.cta, from: p.id });
    } else if (id === 'comparison') {
      out.push({ role: 'point', kind: 'compare', title: c.title, beforeLabel: c.beforeLabel, before: c.before, afterLabel: c.afterLabel, after: c.after, from: p.id });
    } else if (id === 'quote') out.push({ role: 'point', kind: 'quote', title: c.quote, author: c.author, from: p.id });
    else if (id === 'numbered') out.push({ role: 'point', number: c.number, title: c.title, subtitle: c.subtitle, art, from: p.id });
    else if (id === 'outro') out.push({ role: 'cta', title: c.title, subtitle: c.subtitle, save: c.save, follow: c.follow, from: p.id });
  });
  if (out.length && out[0].role !== 'hook') out[0].role = 'hook';
  return out;
}

function scenesFromIdea(idea) {
  return [
    { role: 'hook', title: idea.hook, kicker: idea.kicker },
    ...(idea.points ?? []).map((pt, i) => (typeof pt === 'string' ? { role: 'point', number: i + 1, title: pt } : { role: 'point', number: pt.number ?? i + 1, title: pt.title, subtitle: pt.subtitle, art: pt.art })),
    ...(idea.cta ? [{ role: 'cta', title: idea.cta, subtitle: idea.ctaSubtitle, save: idea.save, follow: idea.follow }] : []),
  ];
}

// One scene source → composition + content for the story format.
function compose(src, i, numerals, previous) {
  if (src.role === 'hook') {
    return { composition: 'statement', variant: 'block', content: { ...(src.kicker && { kicker: src.kicker }), title: src.title ?? '' } };
  }
  if (src.role === 'cta') {
    return {
      composition: 'outro',
      content: { title: src.title ?? 'احفظه لوقت الحاجة', ...(src.subtitle && { subtitle: src.subtitle }), save: src.save ?? 'احفظه', follow: src.follow ?? 'تابعنا' },
    };
  }
  if (src.kind === 'compare') {
    return { composition: 'comparison', variant: 'rows', content: { title: src.title ?? '', beforeLabel: src.beforeLabel, before: (src.before ?? []).slice(0, 2), afterLabel: src.afterLabel, after: (src.after ?? []).slice(0, 2) } };
  }
  if (src.kind === 'quote') return { composition: 'quote', content: { quote: src.title ?? '', ...(src.author && { author: src.author }) } };
  if (src.number !== undefined && src.number !== null) {
    // Consecutive points alternate between the side-aligned and the
    // centred look; the number stays big in both.
    const variant = src.art ? 'art' : previous?.composition === 'numbered' && previous?.variant === 'type' ? 'center' : 'type';
    return { composition: 'numbered', variant, content: { number: typeof src.number === 'number' ? formatNumber(src.number, numerals) : String(src.number), title: src.title ?? '', ...(src.subtitle && { subtitle: src.subtitle }), ...(src.art && { art: src.art }) } };
  }
  return { composition: 'statement', variant: 'block', content: { title: src.title ?? '', ...(src.subtitle && { subtitle: src.subtitle }) } };
}

function motionFor(role, composition) {
  // Seconds from the scene start; whole elements only.
  if (role === 'hook') return [{ target: 'title', effect: 'pop', at: 0, duration: 0.3 }, { target: 'kicker', effect: 'fade', at: 0.1, duration: 0.3 }];
  if (role === 'cta') return [{ target: 'title', effect: 'rise', at: 0.1, duration: 0.4 }, { target: 'actions', effect: 'pop', at: 0.5, duration: 0.3 }];
  if (composition === 'numbered') return [{ target: 'number', effect: 'pop', at: 0, duration: 0.3 }, { target: 'title', effect: 'rise', at: 0.2, duration: 0.4 }, { target: 'subtitle', effect: 'fade', at: 0.5, duration: 0.4 }];
  return [{ target: 'kicker', effect: 'pop', at: 0, duration: 0.3 }, { target: 'title', effect: 'rise', at: 0.15, duration: 0.4 }, { target: 'subtitle', effect: 'fade', at: 0.45, duration: 0.4 }];
}

// source: a carousel DesignDocument, or an idea { hook, points[], cta }.
// → { plan, spec } where spec builds the 1080×1920 document.
export function planReel(source, { numerals = 'arab', theme, brand, brandId, creatorId = 'default', title } = {}) {
  const fromDoc = Boolean(source?.pages && source?.schemaVersion);
  const sources = (fromDoc ? scenesFromDoc(source) : scenesFromIdea(source)).filter((s) => plainText(s.title ?? '').trim());
  const issues = [];
  if (!sources.length) throw new Error('nothing to turn into a reel: no titles found');
  if (!sources.some((s) => s.role === 'cta')) sources.push({ role: 'cta', title: 'احفظه وارجع له', save: 'احفظه', follow: 'تابعنا' });
  if (sources.length > REEL_LIMITS.maxScenes) {
    issues.push({ code: 'reel.too-many-scenes', severity: 'warning', message: `${sources.length} مشاهد أكثر من ${REEL_LIMITS.maxScenes}: دمجت البنود الزائدة في آخر مشهد محتوى.` });
    const cta = sources.pop();
    sources.splice(REEL_LIMITS.maxScenes - 1);
    sources.push(cta);
  }
  const num = fromDoc ? source.theme?.numerals ?? numerals : numerals;
  const scenes = [];
  sources.forEach((src, i) => {
    const prev = scenes[i - 1];
    const comp = compose(src, i, num, prev);
    const texts = Object.entries(comp.content)
      .flatMap(([k, v]) => (typeof v === 'string' && !['art', 'number'].includes(k) ? [[k, v]] : Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => [k, x]) : []))
      .filter(([, v]) => v.trim());
    const words = texts.reduce((n, [, t]) => n + wordCount(t), 0) + (comp.content.number ? 1 : 0);
    const limit = src.role === 'hook' ? REEL_LIMITS.hookWords : REEL_LIMITS.titleWords;
    const titleText = comp.content.title ?? comp.content.quote ?? '';
    if (wordCount(titleText) > limit) {
      issues.push({ code: src.role === 'hook' ? 'reel.hook-long' : 'reel.text-long', severity: src.role === 'hook' ? 'error' : 'warning', scene: i + 1, message: `المشهد ${i + 1}: ${wordCount(titleText)} كلمة، والحد ${limit} للقراءة على الهاتف. أعد صياغته أقصر.`, target: limit });
    }
    if (comp.content.subtitle && wordCount(comp.content.subtitle) > REEL_LIMITS.subtitleWords) {
      issues.push({ code: 'reel.subtitle-long', severity: 'warning', scene: i + 1, message: `المشهد ${i + 1}: السطر الداعم ${wordCount(comp.content.subtitle)} كلمة؛ اختصره أو احذفه.`, target: REEL_LIMITS.subtitleWords });
    }
    const read = 0.8 + words / WORDS_PER_SECOND;
    const seconds = r1(src.role === 'hook' ? clamp(read, REEL_LIMITS.hook) : src.role === 'cta' ? clamp(read, REEL_LIMITS.cta) : clamp(read, [REEL_LIMITS.minScene, REEL_LIMITS.maxScene]));
    const transition = i === sources.length - 1 ? null : { type: i === 0 ? 'push' : i % 2 ? 'fade' : 'push', seconds: 0.3 };
    scenes.push({
      n: i + 1,
      role: src.role,
      composition: comp.composition,
      variant: comp.variant,
      content: comp.content,
      text: texts.map(([slot, t]) => ({ slot, text: t })),
      words,
      seconds,
      motion: motionFor(src.role, comp.composition),
      transition,
      assets: [comp.content.art].filter(Boolean),
      ...(src.from && { fromPage: src.from }),
    });
  });
  const total = r1(scenes.reduce((s, x) => s + x.seconds, 0));
  if (total > 60) issues.push({ code: 'reel.long', severity: 'warning', message: `المدة ${total} ثانية؛ الريلز القصيرة (15–35 ث) تُشاهد حتى النهاية أكثر.` });
  const plan = {
    kind: 'reel-plan',
    version: 1,
    format: { width: 1080, height: 1920, id: 'story' },
    title: title ?? (fromDoc ? source.brief : source.hook) ?? 'ريل',
    sourceDoc: fromDoc ? source.id : null,
    scenes,
    totalSeconds: total,
    numerals,
    audio: { added: false, note: 'لا موسيقى تلقائية: أضف الصوت بنفسك في Canva إن أردت.' },
    issues,
    createdAt: now(),
  };
  plan.fingerprint = hashOf(scenes.map(({ composition, variant, content, seconds, motion, transition }) => ({ composition, variant, content, seconds, motion, transition })));
  const spec = {
    creatorId,
    ...(brandId && { brandId }),
    brief: `ريل: ${plan.title}`,
    intent: { mode: 'carousel', format: 'story', platform: 'instagram', pages: scenes.length },
    ...(theme && { theme: clone(theme) }),
    ...(fromDoc && !theme && { theme: clone(source.theme) }),
    brand: fromDoc ? clone(source.brand) : brand ?? {},
    chrome: { pagination: { enabled: false }, swipe: { enabled: false } },
    assets: fromDoc ? Object.fromEntries(Object.entries(source.assets ?? {}).filter(([id]) => scenes.some((s) => s.assets.includes(id)))) : {},
    pages: scenes.map((s) => ({ composition: s.composition, ...(s.variant && { variant: s.variant }), content: s.content, ...(s.content.art && { keepArt: true }) })),
  };
  return { plan, spec };
}

// Plan + composed document: element ids per scene, for the motion sheet.
export function buildReel(source, options = {}) {
  const { plan, spec } = planReel(source, options);
  const doc = createDesign(spec, { measure: options.measure });
  plan.docId = doc.id;
  plan.scenes.forEach((s, i) => {
    const page = doc.pages[i];
    s.pageId = page.id;
    s.elements = page.elements.filter((e) => !e.hidden && (e.kind === 'text' || e.kind === 'image')).map((e) => ({ id: e.id, kind: e.kind, slot: e.slot ?? null, ...(e.kind === 'text' && { text: plainText(e.text) }) }));
    // Map motion targets to real element ids on the page.
    // A pill (background, icon, label) moves as one: every element of it.
    s.motion = s.motion
      .map((m) => {
        const els = m.target === 'actions' ? page.elements.filter((e) => e.id.startsWith('action-')) : page.elements.filter((e) => e.id === m.target || e.slot === m.target || e.id.startsWith(`${m.target}-`));
        return els.length ? { ...m, elementId: els.find((e) => e.kind === 'text')?.id ?? els[0].id, elementIds: els.map((e) => e.id) } : null;
      })
      .filter(Boolean);
  });
  return { plan, spec, doc };
}

// Status of a reel, one line per property that is easy to confuse. Each
// line moves forward only on its own evidence:
//   file / size       the exported file, probed from its bytes
//   totalDuration     the file's duration against the plan's total — it
//                     says nothing about how the time is split
//   sceneTiming       verified only with evidence of each scene's start and
//                     end (scene cuts detected in the file, or read from the
//                     destination); otherwise "unverified" with the reason
//   motion / transitions / audio   applied by whom, and what the file shows
export function reelStatus(plan, evidence = {}) {
  const video = evidence.video ?? null;
  const tol = Math.max(0.6, plan.scenes.length * 0.15);
  const defaults = plan.scenes.length * 5;
  const total = !video
    ? { state: 'unverified', reason: 'لا فيديو مصدَّر بعد.' }
    : typeof video.duration !== 'number'
      ? { state: 'unverified', reason: 'لم تُقرأ مدة الملف.' }
      : Math.abs(video.duration - plan.totalSeconds) <= tol
        ? { state: 'verified', seconds: video.duration, expected: plan.totalSeconds }
        : { state: 'mismatch', seconds: video.duration, expected: plan.totalSeconds, ...(Math.abs(video.duration - defaults) <= 0.6 && Math.abs(plan.totalSeconds - defaults) > 0.6 && { note: `الفيديو ${video.duration} ث = ${plan.scenes.length} صفحات × 5 ث الافتراضية: المدد لم تُضبط.` }) };
  return {
    scenes: evidence.canvaDesignId ? { state: 'created-in-canva', designId: evidence.canvaDesignId, pages: evidence.pages ?? null } : evidence.localDocId ? { state: 'created-locally', docId: evidence.localDocId } : { state: 'planned' },
    file: video ? { state: 'probed', format: video.format ?? null, codec: video.codec ?? null } : { state: 'not-exported' },
    size: !video ? { state: 'unverified', reason: 'لا ملف.' } : video.width === 1080 && video.height === 1920 ? { state: 'verified', size: '1080×1920' } : { state: 'mismatch', size: `${video.width}×${video.height}`, expected: '1080×1920' },
    totalDuration: total,
    sceneTiming: sceneTiming(plan, video, total, evidence.sceneCuts ?? null, evidence.sceneCutsSource ?? null),
    motion: evidence.motionApplied ? { state: 'reported-by-user', verified: false, note: 'المستخدم أكّد تطبيقها في Canva؛ ملف الفيديو وحده لا يثبتها.' } : { state: 'not-applied', note: 'الموصل لا يملك عملية حركة: الخطة مكتوبة في ملاحظات كل صفحة لتطبّقها في Canva (Animate).' },
    transitions: evidence.transitionsApplied ? { state: 'reported-by-user', verified: false } : { state: 'not-applied', note: 'الانتقالات تُضبط في Canva يدويًا حسب الخطة.' },
    audio: video
      ? video.hasAudio
        ? { state: 'present-in-file', ...(!evidence.audio && { note: 'في الملف مسار صوت لم يُطلب: راجعه (لا موسيقى تلقائية).' }) }
        : { state: 'absent-in-file', ...(evidence.audio && { note: 'قيل إن صوتًا أُضيف، والملف بلا مسار صوت.' }) }
      : evidence.audio
        ? { state: 'reported-by-user', verified: false }
        : { state: 'none', note: 'لم يُضف صوت (لا موسيقى تلقائية).' },
    // Summary kept for older callers: file probed and size checked only.
    video: video ? { state: video.width === 1080 && video.height === 1920 ? 'exported-verified' : 'exported-size-mismatch', duration: video.duration, size: `${video.width}×${video.height}`, hasAudio: video.hasAudio } : { state: 'not-exported' },
  };
}

// Scene boundaries in the plan: where each scene should end.
function planBoundaries(plan) {
  let t = 0;
  return plan.scenes.map((s) => (t = Math.round((t + s.seconds) * 100) / 100));
}

function sceneTiming(plan, video, total, cuts, source) {
  if (!video) return { state: 'unverified', reason: 'لا فيديو مصدَّر بعد.' };
  if (total.state === 'mismatch') return { state: 'mismatch', reason: 'المدة الإجمالية لا تطابق الخطة، فمدد المشاهد لا تطابقها.' };
  if (!Array.isArray(cuts)) return { state: 'unverified', reason: 'لا دليل على حدود المشاهد: مطابقة المدة الإجمالية لا تثبت مدة كل مشهد. شغّل كشف المشاهد على الملف (ffmpeg) أو مرّر sceneCuts.' };
  if (!cuts.length) return { state: 'unverified', reason: 'كاشف المشاهد لم يجد قطعًا (قد تكون الانتقالات ناعمة): لا حكم على مدد المشاهد.', source };
  const ends = planBoundaries(plan);
  const pool = [...cuts].map(Number).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const found = [];
  for (let i = 0; i < ends.length - 1; i++) {
    const tolerance = Math.max(0.35, plan.scenes[i].transition?.seconds ?? 0);
    let best = null;
    for (const c of pool) if (Math.abs(c - ends[i]) <= tolerance && (best === null || Math.abs(c - ends[i]) < Math.abs(best - ends[i]))) best = c;
    if (best !== null) pool.splice(pool.indexOf(best), 1);
    found.push(best);
  }
  const scenes = plan.scenes.map((s, i) => {
    const start = i === 0 ? 0 : found[i - 1];
    const end = i === plan.scenes.length - 1 ? video.duration : found[i];
    const seconds = start === null || end === null || start === undefined || end === undefined ? null : Math.round((end - start) * 100) / 100;
    const tolerance = Math.max(0.35, s.transition?.seconds ?? 0, plan.scenes[i - 1]?.transition?.seconds ?? 0);
    return { n: s.n, expected: s.seconds, seconds, ok: seconds !== null && Math.abs(seconds - s.seconds) <= tolerance };
  });
  const missing = found.map((f, i) => (f === null ? i + 1 : null)).filter(Boolean);
  if (missing.length) return { state: 'mismatch', reason: `لا قطع قرب نهاية المشهد ${missing.join('، ')} كما في الخطة.`, scenes, source, extraCuts: pool };
  const off = scenes.filter((x) => !x.ok);
  if (off.length) return { state: 'mismatch', reason: `مدة المشهد ${off.map((x) => x.n).join('، ')} تختلف عن الخطة.`, scenes, source, extraCuts: pool };
  return { state: 'verified', scenes, source, ...(pool.length && { extraCuts: pool }) };
}

// Speaker notes for one scene: the timing and motion the creator applies
// in Canva (also kept in the design, so the plan travels with it).
export function sceneNotes(scene, { numerals = 'arab' } = {}) {
  const n = (x) => formatNumber(String(x).replace('.', numerals === 'arab' ? '٫' : '.'), numerals);
  const effect = { pop: 'ظهور بارز (Pop)', rise: 'صعود (Rise)', fade: 'تلاشٍ (Fade)' };
  const lines = [`المشهد ${n(scene.n)} — ${scene.role === 'hook' ? 'الخطّاف' : scene.role === 'cta' ? 'الختام' : 'محتوى'} — المدة ${n(scene.seconds)} ث`];
  for (const m of scene.motion) lines.push(`• ${m.elementId ?? m.target}: ${effect[m.effect] ?? m.effect} عند ${n(m.at)} ث لمدة ${n(m.duration)} ث (للعنصر كاملًا، لا حرفًا حرفًا)`);
  if (scene.transition) lines.push(`• الانتقال للمشهد التالي: ${scene.transition.type === 'push' ? 'دفع (Push)' : scene.transition.type === 'fade' ? 'تلاشٍ (Dissolve)' : 'قطع'} ${n(scene.transition.seconds)} ث`);
  return lines.join('\n');
}
