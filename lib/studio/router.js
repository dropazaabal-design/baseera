import { normalizeArabic, toWesternDigits } from './arabic.js';
import { VERSIONS } from './budget.js';
import { conceptFit, extractConcepts } from './concepts.js';

// Request understanding and route choice. Decides, before any AI call, how
// much of a design can come from what already exists:
//   reuse      a library design fits (format, density, metaphor, taste):
//              reuse its layout and assets, vary within the identity
//   partial    the layout fits but some artwork does not: generate only
//              the missing assets
//   recompose  a related layout exists: adapt it, generate the key art
//   new        nothing fits, or the creator asked for something new /
//              stronger graphics: a new visual direction (AI)
// Copy comes from the text cache only for an identical request with the
// same memory and brand; otherwise the assistant writes it.
// The current request always wins over memory.

const ORDINAL_WORDS = { واحد: 1, واحده: 1, اثنين: 2, اثنتين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثماني: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10 };

export function parseIntent(text) {
  const raw = String(text ?? '');
  const norm = normalizeArabic(raw);
  const has = (...forms) => forms.some((f) => norm.includes(normalizeArabic(f)));
  const intent = { mode: null, pages: null, destination: 'local', format: null, platform: null, quality: 'normal', fresh: false, items: null };

  if (has('بوست مفرد', 'منشور مفرد', 'منشور واحد', 'بوست واحد', 'صوره واحده', 'تصميم واحد', 'single post')) {
    intent.mode = 'post';
    intent.pages = 1;
  }
  // "كاروسيل من سبع شرائح", "٧ شرائح", "7 slides"
  // `norm` folds ئ→ي and ة→ه, so «شرائح» arrives as «شرايح».
  const pagesMatch = /(\d{1,2}|[؀-ۿ]+)\s*(?:شرايح|شريحه|سلايدات|سلايد|صفحات|صفحه|slides?)/.exec(toWesternDigits(norm));
  if (pagesMatch) {
    const n = /^\d+$/.test(pagesMatch[1]) ? Number(pagesMatch[1]) : ORDINAL_WORDS[pagesMatch[1]];
    if (n) intent.pages = n;
  }
  if (has('كاروسيل', 'كاروسل', 'شرائح', 'سلايدات', 'carousel')) {
    intent.mode = 'carousel';
    intent.pages = intent.pages && intent.pages > 1 ? intent.pages : intent.pages ?? null;
  }
  if (intent.mode === 'carousel' && intent.pages === 1) intent.pages = null;
  if (!intent.mode && intent.pages) intent.mode = intent.pages > 1 ? 'carousel' : 'post';

  if (has('كانفا', 'canva', 'كانڤا')) intent.destination = 'canva';
  if (has('جرافيك عالي', 'جرافيك عاليه', 'جوده عاليه', 'رسوم قويه', 'احترافي', 'بصريا قوي', 'جرافيك اقوي')) intent.quality = 'high';
  if (has('شي جديد', 'شيء جديد', 'شيئا جديدا', 'شيئًا جديدًا', 'فكره جديده', 'اتجاه جديد', 'تصميم جديد كليا', 'جرافيك اقوي', 'مختلف تماما')) intent.fresh = true;

  if (has('ستوري', 'قصه انستقرام', 'ريلز', '9:16')) intent.format = 'story';
  else if (has('مربع', '1:1')) intent.format = 'square';
  else if (has('4:5', 'عمودي')) intent.format = 'portrait';

  if (has('لينكد', 'linkedin')) intent.platform = 'linkedin';
  else if (has('انستقرام', 'انستغرام', 'انستا', 'instagram')) intent.platform = 'instagram';
  else if (has('تيك توك', 'tiktok')) intent.platform = 'tiktok';
  else if (has('تويتر', 'منصه اكس', ' x ')) intent.platform = 'x';

  const items = /(\d{1,2})\s*(?:نقاط|نقطه|بنود|بند|عادات|خطوات|نصائح|اسرار|اخطاء|طرق)/.exec(toWesternDigits(norm)) ?? new RegExp(`(${Object.keys(ORDINAL_WORDS).join('|')})\\s+(?:نقاط|بنود|عادات|خطوات|نصائح|اسرار|اخطاء|طرق)`).exec(norm);
  if (items) intent.items = /^\d+$/.test(items[1]) ? Number(items[1]) : ORDINAL_WORDS[items[1]];

  intent.concepts = extractConcepts(raw);
  return intent;
}

// Key for the copy cache: the same words asked by the same creator, with the
// same memory and brand state and copywriter version.
export function textCacheKey(cache, { request, creatorId, memoryRevision, brandVersion }) {
  return cache.key('text', { request: normalizeArabic(request) }, { creatorId, memoryRevision: memoryRevision ?? 0, brandVersion: brandVersion ?? 0, copy: VERSIONS.copy });
}

const REUSE = 0.72;
const RELATED = 0.5;

export function plan(request, { library, assets, memory, cache, creatorId = 'default', brandId, brief = {} }) {
  const intent = { ...parseIntent(request), ...brief.intent };
  const concepts = brief.concepts?.length ? brief.concepts : intent.concepts;
  const profile = memory?.profile(creatorId);
  const brand = brandId ? memory?.brand(brandId) : null;
  const instructions = Object.fromEntries(
    Object.entries({ format: intent.format, numerals: brief.numerals, 'font.heading': brief.font }).filter(([, v]) => v),
  );
  const mem = memory?.resolve(creatorId, { brandId, platform: intent.platform ?? undefined, format: intent.format ?? undefined, projectId: brief.projectId }, instructions);
  const format = intent.format ?? mem?.applied.format?.value ?? 'portrait';
  const reasons = [];

  // 1. Copy.
  const copyKey = cache ? textCacheKey(cache, { request, creatorId, memoryRevision: profile?.revision, brandVersion: brand?.version }) : null;
  const cachedCopy = cache && copyKey ? cache.get('text', copyKey) : null;

  // 2. Layout from the library.
  const candidates = library
    ? library.search({
        format,
        mode: intent.mode ?? undefined,
        brandId,
        creatorId,
        concepts,
        items: intent.items ?? brief.items,
        chars: brief.chars,
        pages: intent.pages ?? undefined,
        platform: intent.platform ?? undefined,
        preferences: { font: mem?.applied['font.heading']?.value, density: mem?.applied['text.density']?.value },
        limit: 5,
      })
    : [];
  const best = candidates[0];

  // An identical request already answered: the stored design is the answer
  // (copy, layout and art), with no generation, unless something new is asked.
  const previous = cachedCopy?.designId && library?.meta(cachedCopy.designId);
  let route;
  if (previous && !intent.fresh) {
    route = 'reuse';
    reasons.push(`الطلب نفسه نُفّذ سابقًا في «${previous.title}»: أعيد التصميم المحفوظ دون أي توليد.`);
  } else if (intent.fresh) {
    route = 'new';
    reasons.push('طلبت شيئًا جديدًا أو جرافيكًا أقوى: اتجاه بصري جديد بأصول جديدة.');
  } else if (best && best.score >= REUSE && best.parts.concept >= 0.5) {
    route = 'reuse';
    reasons.push(`تصميم «${best.title}» يناسب المقاس والكثافة والاستعارة (${best.score}).`);
  } else if (best && best.score >= RELATED) {
    route = 'recompose';
    reasons.push(`أقرب تصميم «${best.title}» (${best.score}) قريب لكنه لا يطابق المعنى تمامًا: أعيد تركيبه وأولّد الرسم الرئيسي.`);
  } else {
    route = 'new';
    reasons.push(candidates.length ? 'لا تصميم في المكتبة يناسب الفكرة بدرجة كافية.' : 'المكتبة لا تحوي تصاميم مناسبة لهذا المقاس بعد.');
  }

  // 3. Artwork: reuse insertable assets whose tags carry the topic's
  // concepts; generate the rest. High-quality requests get a new hero.
  const artNeeds = brief.art ?? [{ slot: 'art', concepts }];
  const recentlyUsed = new Set((library?.list() ?? []).filter((d) => d.lastUsed).sort((a, b) => (b.lastUsed > a.lastUsed ? 1 : -1)).slice(0, 3).flatMap((d) => d.assets));
  const pool = assets?.list({ usage: 'insertable' }) ?? [];
  const usedThisPlan = new Set();
  // A new direction or a high-quality request gets a new main visual; the
  // secondary art (item icons, cut-outs) still comes from the library when
  // an asset carries the same meaning.
  const primary = artNeeds[0]?.slot;
  const previousArt = previous ? previous.assets : null;
  const art = artNeeds.map((need) => {
    if (previousArt) return { slot: need.slot, source: 'library', assetIds: previousArt, why: 'من التصميم المحفوظ لهذا الطلب' };
    if ((route === 'new' || intent.quality === 'high') && need.slot === primary) {
      return { slot: need.slot, source: 'ai', why: route === 'new' ? 'اتجاه جديد' : 'جرافيك عالي الجودة: أصل جديد للرسم الرئيسي', spec: { concepts: need.concepts ?? concepts, style: brand?.imagery?.style ?? null } };
    }
    const scored = pool
      .filter((a) => !usedThisPlan.has(a.id))
      .map((a) => ({ a, fit: conceptFit(need.concepts ?? concepts, [...a.tags, ...extractConcepts(a.tags.join(' '))]) - (recentlyUsed.has(a.id) ? 0.25 : 0) }))
      .sort((x, y) => y.fit - x.fit);
    if (scored[0] && scored[0].fit >= 0.5) {
      usedThisPlan.add(scored[0].a.id);
      return { slot: need.slot, source: 'library', assetId: scored[0].a.id, why: `أصل موجود يحمل المعنى (${Math.round(scored[0].fit * 100)}٪)` };
    }
    return { slot: need.slot, source: 'ai', why: 'لا أصل في المكتبة يحمل هذا المعنى', spec: { concepts: need.concepts ?? concepts, style: brand?.imagery?.style ?? null } };
  });
  if (route === 'reuse' && art.some((a) => a.source === 'ai')) {
    route = 'partial';
    reasons.push('التوزيع مناسب، لكن بعض الرسوم لا تحمل معنى الموضوع: سأولّد هذه الرسوم فقط.');
  }

  const expected = {};
  if (!cachedCopy) expected['ai.copy'] = 1;
  if (route === 'new') expected['ai.concept'] = 1;
  const genArt = art.filter((a) => a.source === 'ai').length;
  if (genArt) expected['ai.asset'] = genArt;

  return {
    request,
    intent: { ...intent, format, concepts },
    route,
    reasons,
    memory: mem?.summary ?? '',
    applied: mem?.applied ?? {},
    suggestions: (mem?.suggestions ?? []).map((s) => ({ id: s.id, preference: s.preference, evidence: s.evidence })),
    copy: cachedCopy ? { source: 'cache', key: copyKey, value: cachedCopy } : { source: 'ai', key: copyKey },
    candidates: library ? library.brief(candidates) : [],
    reference: previous ? previous.id : route === 'new' ? null : best?.id ?? null,
    art,
    expectedAiCalls: expected,
  };
}
