import path from 'node:path';
import { runTool } from './process.js';
import { fileSha256, localFile } from './index.js';
import { timestamp } from './report.js';

// Edit-point review for a cut list on a source recording (a talk, an interview, a speaker clip):
// does each cut land in a pause, with room before the next word and after the last one?
// Energy in the speech band only (300–8000 Hz, sibilants included; 10 ms RMS around each edge against the local floor;
// room hum below 300 Hz would otherwise hide the quiet end of a word). It cannot tell speech from a
// breath or from music, and a pause it calls clear has not been listened to.
// The idea of snapping clip edges to speech boundaries with a little padding comes from
// open-source clippers (ViralMint, PurffleShorts); this implementation and its thresholds are Baseera's.
export const CUTS_VERSION = '1.0.0';
export const CUT_POLICY = { window: 1.0, frameMs: 10, edgeMs: 20, bandHz: [300, 8000], soundOverFloorDb: 10, cutOverFloorDb: 6, absoluteFloorDb: -60, minLead: 0.08, minTail: 0.12, continueWithin: 0.15 };
const SR = 24000;
const round = (n) => Math.round(n * 1000) / 1000;

/** Kept source ranges in playing order: [[a, b]], [{start, end}], [{in, out}], {ranges: []} or {edl: [{src: [a, b]}]}. */
export function parseRanges(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.ranges) ? data.ranges : Array.isArray(data?.edl) ? data.edl : null;
  if (!rows?.length) throw new Error('cuts must be a nonempty array of kept ranges, {ranges: []} or {edl: [{src: [a, b]}]}');
  return rows.map((row) => {
    const [start, end] = (Array.isArray(row) ? row : Array.isArray(row?.src) ? row.src : [row?.start ?? row?.in, row?.end ?? row?.out]).map(Number);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error('each kept range needs finite seconds with 0 <= start < end');
    return { start, end };
  });
}

const percentile = (values, p) => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
};

/** Pure measurement of one edge from 16 kHz mono samples starting at `offset` seconds. */
export function measureEdge(samples, offset, time, kind, policy = CUT_POLICY) {
  const size = Math.round(SR * policy.frameMs / 1000);
  const frames = [];
  for (let k = 0; k + size <= samples.length; k += size) {
    let sum = 0;
    for (let n = k; n < k + size; n++) sum += samples[n] * samples[n];
    const rms = Math.sqrt(sum / size);
    frames.push({ start: offset + k / SR, end: offset + (k + size) / SR, db: rms > 0 ? 20 * Math.log10(rms) : -120 });
  }
  if (frames.length < 5) throw new Error('not enough audio around the cut to measure it');
  // Digital silence (a file's padded start, a muted gap) is not the room's floor.
  const live = frames.map((frame) => frame.db).filter((db) => db > -100);
  const floor = live.length ? percentile(live, 0.1) : -120;
  const sound = Math.max(floor + policy.soundOverFloorDb, policy.absoluteFloorDb);
  const cutLimit = Math.max(floor + policy.cutOverFloorDb, policy.absoluteFloorDb);
  const near = frames.filter((frame) => Math.abs((frame.start + frame.end) / 2 - time) <= policy.edgeMs / 1000 + 1e-9);
  const level = Math.max(...near.map((frame) => frame.db));
  const after = frames.find((frame) => frame.start >= time - 1e-9 && frame.db > sound);
  const before = frames.filter((frame) => frame.end <= time + 1e-9 && frame.db > sound).at(-1);
  const toAfter = after ? after.start - time : null, toBefore = before ? time - before.end : null;
  // Kept side: the margin before the first sound (in) or after the last one (out).
  // Dropped side: sound right across the cut means the word likely continues there.
  const margin = kind === 'in' ? toAfter : toBefore, across = kind === 'in' ? toBefore : toAfter;
  const minimum = kind === 'in' ? policy.minLead : policy.minTail;
  const verdict = level > cutLimit ? 'sound-at-cut' : across !== null && across < policy.continueWithin ? 'sound-across-cut'
    : margin !== null && margin < minimum ? 'tight' : 'clear';
  return { floorDb: round(floor), levelDb: round(level), soundThresholdDb: round(sound), cutThresholdDb: round(cutLimit),
    [kind === 'in' ? 'leadS' : 'tailS']: margin === null ? null : round(margin), acrossS: across === null ? null : round(across), minimumS: minimum, verdict };
}

function message(edge) {
  const side = edge.kind === 'in' ? 'بداية القطعة' : 'نهاية القطعة';
  if (edge.verdict === 'sound-at-cut') return { message: `${side} تقع على صوت (${edge.levelDb} dB، والأرضية ${edge.floorDb} dB): كلمة أو نفَس أو موسيقى مقطوعة.`,
    recommendation: edge.kind === 'in' ? 'أرجِع نقطة البداية إلى الصمت الذي يسبق الصوت.' : 'أخّر نقطة النهاية إلى ما بعد انتهاء الصوت.' };
  if (edge.verdict === 'sound-across-cut') return edge.kind === 'in'
    ? { message: `صوت قبل نقطة البداية بـ${Math.round(edge.acrossS * 1000)} ملي ثانية في الجزء المحذوف: قد تبدأ القطعة من منتصف كلمة.`, recommendation: 'اسمع ما قبل البداية؛ إن كان أول الكلمة فأرجِع البداية إلى ما قبله.' }
    : { message: `صوت بعد نقطة النهاية بـ${Math.round(edge.acrossS * 1000)} ملي ثانية في الجزء المحذوف: قد تكون الكلمة الأخيرة مبتورة.`, recommendation: 'اسمع ما بعد النهاية؛ إن كان ذيل الكلمة فأخّر النهاية إلى ما بعده.' };
  if (edge.verdict === 'tight') return edge.kind === 'in'
    ? { message: `أول صوت بعد البداية بـ${Math.round(edge.leadS * 1000)} ملي ثانية فقط.`, recommendation: `أرجِع البداية حتى يسبق الصوتَ ${Math.round(edge.minimumS * 1000)} ملي ثانية على الأقل؛ بدايات الحروف الهامسة أخفض من العتبة.` }
    : { message: `آخر صوت قبل النهاية بـ${Math.round(edge.tailS * 1000)} ملي ثانية فقط.`, recommendation: `أخّر النهاية ${Math.round(edge.minimumS * 1000)} ملي ثانية على الأقل بعد الصوت حتى لا يُبتر ذيل الكلمة أو صداها.` };
  return { message: 'القصّ في صمت، مع هامش كافٍ.', recommendation: 'لا إجراء؛ اسمع الوصلة قبل الاعتماد.' };
}

export async function reviewCuts(file, { cutsData, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', timeoutMs = 120000, minLead, minTail, window } = {}) {
  const sourceFile = localFile(file);
  const policy = { ...CUT_POLICY, ...(minLead !== undefined && { minLead }), ...(minTail !== undefined && { minTail }), ...(window !== undefined && { window }) };
  for (const key of ['minLead', 'minTail', 'window']) if (!(policy[key] >= 0 && policy[key] <= 5)) throw new Error(`${key} must be between 0 and 5 seconds`);
  if (policy.window < 0.2) throw new Error('window must be at least 0.2 seconds');
  const ranges = parseRanges(cutsData);
  const { stdout } = await runTool(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', sourceFile]);
  const probe = JSON.parse(stdout);
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration ?? audio?.duration);
  if (!audio || !(duration > 0)) throw new Error('the source needs an audio stream with a finite duration');
  const source = { name: path.basename(sourceFile), sha256: await fileSha256(sourceFile) };
  const edges = [];
  for (const [index, range] of ranges.entries()) {
    if (range.end > duration + 0.05) throw new Error(`range ${index + 1} ends after the source (${round(duration)} s)`);
    for (const [kind, time] of [['in', range.start], ['out', range.end]]) {
      if ((kind === 'in' && time <= 0.02) || (kind === 'out' && time >= duration - 0.02)) continue;   // the media's own edge, not a cut
      const from = Math.max(0, time - policy.window), to = Math.min(duration, time + policy.window);
      const [low, high] = policy.bandHz;
      const pcm = await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(from), '-t', String(to - from), '-i', sourceFile,
        '-map', `0:${audio.index}`, '-af', `highpass=f=${low}:poles=2,highpass=f=${low}:poles=2,lowpass=f=${high}`, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { timeoutMs, raw: true });
      const view = new Int16Array(pcm.stdout.buffer, pcm.stdout.byteOffset, Math.floor(pcm.stdout.length / 2));
      const samples = Float32Array.from(view, (v) => v / 32768);
      const edge = { range: index + 1, kind, time: round(time), ...measureEdge(samples, from, time, kind, policy) };
      edges.push({ ...edge, ...message(edge) });
    }
  }
  const count = (verdict) => edges.filter((edge) => edge.verdict === verdict).length;
  return {
    kind: 'baseera-cut-review', version: CUTS_VERSION, ok: true, source, duration: round(duration), policy, ranges, edges,
    summary: { edges: edges.length, soundAtCut: count('sound-at-cut'), soundAcrossCut: count('sound-across-cut'), tight: count('tight'), clear: count('clear') },
    privacy: { networkRequests: false, mediaUploaded: false, originalModified: false },
    limitations: [
      'قياس طاقة فقط: لا يفرّق بين الكلام والنفَس والموسيقى، ولا يثبت أن الوصلة طبيعية بالسماع.',
      'بدايات الحروف الهامسة (س، ش، ف، هـ) قد تقع تحت العتبة؛ لذلك يُطلب هامش قبل أول صوت مقيس.',
      'الأرضية تُقاس محليًا حول كل قصّة (أدنى 10٪ من إطارات 10 ملي ثانية في نطاق الكلام)؛ الخلفية العالية ترفعها.',
      'صوت قريب على الجانب المحذوف قد يكون كلمة لاحقة منفصلة، لا ذيل الكلمة؛ الحكم يحتاج سماعًا.',
    ],
  };
}

export function cutsMarkdown(report) {
  const verdicts = { 'sound-at-cut': 'على صوت', 'sound-across-cut': 'صوت عبر القصّ', tight: 'هامش ضيق', clear: 'سليم' };
  const lines = ['# بصيرة — فحص نقاط القصّ', '',
    `الملف: ${report.source.name} · ${report.ranges.length} قطعة · ${report.summary.edges} نقطة قصّ: ${report.summary.soundAtCut} على صوت، ${report.summary.soundAcrossCut} بصوت عبر القصّ، ${report.summary.tight} بهامش ضيق، ${report.summary.clear} سليمة.`, '',
    '| القطعة | النقطة | التوقيت في المصدر | المستوى / الأرضية | الهامش | الحكم | الإجراء |', '|---|---|---|---|---|---|---|'];
  for (const edge of report.edges) {
    const margin = edge.leadS ?? edge.tailS;
    lines.push(`| ${edge.range} | ${edge.kind === 'in' ? 'بداية' : 'نهاية'} | ${timestamp(edge.time)} | ${edge.levelDb} / ${edge.floorDb} dB | ${margin === null || margin === undefined ? '—' : `${Math.round(margin * 1000)} ms`} | ${verdicts[edge.verdict]} | ${edge.recommendation} |`);
  }
  lines.push('', '## حدود الفحص', '', ...report.limitations.map((text) => `- ${text}`), '');
  return lines.join('\n');
}
