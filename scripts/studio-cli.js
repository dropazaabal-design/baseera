// `studio`: the design studio's command line, bundled into the plugin as
// skills/arabic-carousel/scripts/studio.mjs (Node 18+, no dependencies).
// Every command prints JSON. Data lives in ~/.baseera (or BASEERA_HOME, or
// --home DIR) and survives restarts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsStore, defaultHome } from '../lib/studio/node/fsStore.js';
import { openStudio, buildDesign, specAssetIds } from '../lib/studio/studio.js';
import { parseIntent, plan } from '../lib/studio/router.js';
import { checkDesign } from '../lib/studio/quality.js';
import { runCommand } from '../lib/studio/commands.js';
import { applyPatches, diffFingerprints, fingerprint } from '../lib/studio/patch.js';
import { designPrompts, promptsMarkdown } from '../lib/studio/prompts.js';
import { migrateCarousel } from '../lib/studio/document.js';
import { inlineAsset } from '../lib/studio/assets.js';
import { KITABWBS_PRESET, parseFeedback } from '../lib/studio/memory.js';
import { CanvaAdapter, planCreate, verifyCanva } from '../lib/studio/adapters/canva.js';
import { injectSeed, readSeed } from '../lib/studio/adapters/local.js';
import { renderArtSvg } from '../lib/studio/svg.js';
import { recolorSvg } from '../lib/studio/render.js';
import { exportSnapshot, importSnapshot } from '../lib/studio/store.js';
import { validateDocument } from '../lib/studio/contracts.js';
import { compositionList } from '../lib/studio/compositions.js';
import { STYLES } from '../lib/studio/styles/catalog.js';
import { LATER_ROLES, ROLE_OF, declinedWhy } from '../lib/studio/library/matrix.js';
import { setFormat } from '../lib/studio/document.js';
import { hashOf } from '../lib/studio/util.js';

const HELP = `studio — Arabic design studio (library, assets, memory, Canva)

  studio init                                   create the store (default ~/.baseera)
  studio intent "<request>"                     what the request asks for
  studio plan "<request>" [--brand ID] [--brief brief.json] [--project ID]
                                                route (reuse/partial/recompose/new), cache, memory
  studio compositions                           layouts and their content fields
  studio styles [--all]                         visual styles ready to use (status reusable), what
                                                each suits and declines; put { "style": { "id": … } } in a spec
  studio asset add FILE --kind generated|user_upload|licensed [--tags a,b] [--prompt TEXT]
                    [--source TEXT] [--model TEXT] [--rights TEXT] [--style TEXT] [--reference] [--parent ID]
  studio asset seed [DIR]                       import the starter illustrations
  studio asset list [--tags a,b] | asset verify ID|--all | asset show ID
  studio compose SPEC.json [--request TEXT] [--out design.json] [--html out.html] [--no-save]
  studio check DESIGN.json [--source source.json] [--readback readback.json] [--pages N] [--format F]
  studio edit DESIGN.json "<أمر>" [--page N] [--out FILE]   conversational edit (local when possible)
  studio patch DESIGN.json PATCHES.json [--scope graphic|text] [--out FILE]
  studio render DESIGN.json OUT.html             the offline editor with the design embedded
  studio prompts DESIGN.json [--out FILE.md] [--json]
                                                storyboard, ready copy and one generation prompt per
                                                slide (+ negative prompt), read from the design itself
  studio svg DESIGN.json OUTDIR                  page artwork (no text) as SVG
  studio format DESIGN.json portrait|square|story [--out FILE]
  studio save DESIGN.json [--status candidate|used] [--label TEXT] [--concepts a,b] [--metaphor TEXT]
  studio library list | show ID [--revision N] | history ID | revert ID REV | remix ID [--out FILE]
  studio search "<request>" [--format F] [--mode post|carousel] [--brand ID]
  studio feedback ID "<نص الملاحظة>" [--elements a,b] [--approve]
  studio memory show | remember KEY VALUE [--brand ID] [--platform P] [--format F] [--project ID] [--evidence TEXT]
                | forget RECORD | suggestions | confirm RECORD | fact KEY VALUE | observe KEY VALUE --design ID
                | import-results FILE.json|FILE.csv
  studio brand list | add BRAND.json | preset kitabwbs | show ID | approve-example BRAND DESIGN
  studio project new NAME [--brief TEXT] [--brand ID] | list | show ID | note ID TEXT | decide ID TEXT | resume ID
  studio workflow from DESIGN.json --name NAME | save WF.json | list | show ID | run ID INPUTS.json [--out spec.json]
  studio canva caps [--tools a,b,...] | plan DESIGN.json [--mode native|partial|image] [--page-size WxH]
               [--outdir DIR] | verify DESIGN.json READBACK.json [--plan PLAN.json]
  studio ledger report [--since ISO] | ledger add --kind KIND [--tool T] [--duration MS] [--tokens N] [--cost USD] [--note T]
  studio migrate CAROUSEL.json OUT.json          classic carousel → studio design
  studio backup FILE.json | restore FILE.json [--overwrite]

Global: --home DIR (store location), --creator ID (default "default").`;

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[key] = true;
      else {
        opt[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, opt };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

function templatePath() {
  const candidates = [process.env.BASEERA_TEMPLATE, path.join(here, '..', 'assets', 'carousel.html'), path.join(here, '..', 'claude-plugin', 'skills', 'arabic-carousel', 'assets', 'carousel.html')].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('editor template not found (set BASEERA_TEMPLATE)');
  return found;
}

// Designs on disk may be a design JSON or an HTML file with one embedded.
function loadDesign(file) {
  const text = fs.readFileSync(file, 'utf8');
  const doc = file.endsWith('.html') ? readSeed(text) : JSON.parse(text);
  if (!doc || doc.schemaVersion !== 2) throw new Error(`${file} is not a studio design (schemaVersion 2); classic carousels: studio migrate`);
  return doc;
}

function withAssets(studio, doc) {
  // Re-embed asset data from the store when a saved design lacks it.
  const ids = [...new Set(doc.pages.flatMap((p) => p.elements.filter((e) => e.kind === 'image').map((e) => e.assetId)))];
  const missing = ids.filter((id) => !doc.assets?.[id]?.dataUrl);
  if (!missing.length) return doc;
  return { ...doc, assets: { ...doc.assets, ...studio.assets.embed(missing) } };
}

function saveDesignFile(file, doc) {
  if (file.endsWith('.html')) fs.writeFileSync(file, injectSeed(fs.readFileSync(templatePath(), 'utf8'), doc));
  else writeJson(file, doc);
}

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const keys = head.split(',').map((k) => k.trim());
  return rows.map((r) => {
    const cells = r.split(',');
    const row = {};
    keys.forEach((k, i) => {
      const v = (cells[i] ?? '').trim();
      row[k] = v !== '' && !Number.isNaN(Number(v)) && k !== 'designId' ? Number(v) : v;
    });
    return row;
  });
}

export async function main(argv = process.argv.slice(2), out = (x) => process.stdout.write(`${typeof x === 'string' ? x : JSON.stringify(x, null, 2)}\n`)) {
  const { pos, opt } = parseArgs(argv);
  const [cmd, sub, ...rest] = pos;
  if (!cmd || cmd === 'help' || opt.help) return out(HELP);
  const home = typeof opt.home === 'string' ? opt.home : defaultHome();
  const store = new FsStore(home);
  const studio = openStudio(store, { session: typeof opt.session === 'string' ? opt.session : null });
  const creatorId = typeof opt.creator === 'string' ? opt.creator : 'default';

  switch (cmd) {
    case 'init':
      return out({ ok: true, home: store.root, designs: studio.library.list().length, assets: studio.assets.list().length });

    case 'intent':
      return out(parseIntent([sub, ...rest].join(' ')));

    case 'plan': {
      const request = [sub, ...rest].join(' ');
      const brief = typeof opt.brief === 'string' ? readJson(opt.brief) : {};
      return out(plan(request, { ...studio, creatorId, brandId: typeof opt.brand === 'string' ? opt.brand : brief.brandId, brief: { ...brief, projectId: opt.project ?? brief.projectId } }));
    }

    case 'compositions':
      return out(compositionList.map((c) => ({ id: c.id, label: c.label, type: c.type, description: c.description, variants: c.variants, capacity: c.capacity, fields: c.fields.map(({ key, label, type, required }) => ({ key, label, type, ...(required && { required }) })) })));

    case 'styles': {
      // Only reusable styles are offered as ready; --all lists every record
      // with its status. Compositions a style declines come with the reason.
      const list = STYLES.filter((st) => opt.all || st.status === 'reusable');
      return out(
        list.map((st) => ({
          id: st.id,
          name: st.name,
          status: st.status,
          purpose: st.purpose,
          modes: Object.keys(st.tokens),
          defaultMode: st.defaultMode ?? 'light',
          formats: st.formats,
          compositions: Object.keys(ROLE_OF).filter((c) => st.roles.includes(ROLE_OF[c])),
          declines: [
            ...Object.entries(st.notFor ?? {}).map(([role, why]) => ({ compositions: Object.keys(ROLE_OF).filter((c) => ROLE_OF[c] === role), why })),
            ...(() => {
              const later = Object.keys(ROLE_OF).filter((c) => LATER_ROLES.includes(ROLE_OF[c]) && !st.roles.includes(ROLE_OF[c]) && !st.notFor?.[ROLE_OF[c]]);
              return later.length ? [{ compositions: later, why: declinedWhy(st, later[0]) }] : [];
            })(),
          ],
        })),
      );
    }

    case 'asset': {
      if (sub === 'add') {
        const file = rest[0];
        if (!file) throw new Error('asset add FILE');
        const { record, duplicate } = studio.assets.add(new Uint8Array(fs.readFileSync(file)), {
          tags: list(opt.tags),
          provenance: { kind: opt.kind ?? 'user_upload', ...(typeof opt.source === 'string' && { source: opt.source }), ...(typeof opt.model === 'string' && { model: opt.model }), ...(typeof opt.rights === 'string' && { rightsNote: opt.rights }) },
          usage: opt.reference ? 'reference' : 'insertable',
          style: typeof opt.style === 'string' ? opt.style : undefined,
          name: typeof opt.name === 'string' ? opt.name : path.basename(file),
          parentId: typeof opt.parent === 'string' ? opt.parent : undefined,
          prompt: typeof opt.prompt === 'string' ? opt.prompt : undefined,
        });
        if ((opt.kind ?? '') === 'generated' && !duplicate) studio.ledger.record({ kind: 'ai.asset', tool: typeof opt.tool === 'string' ? opt.tool : 'assistant', note: record.id, durationMs: opt.duration ? Number(opt.duration) : null, tokens: opt.tokens ? Number(opt.tokens) : null, costUsd: opt.cost ? Number(opt.cost) : null });
        return out({ ok: true, duplicate, asset: record });
      }
      if (sub === 'seed') {
        // The starter illustrations shipped with the skill (see their manifest).
        const dir = rest[0] ?? [path.join(here, '..', 'assets', 'starter'), path.join(here, '..', 'claude-plugin', 'skills', 'arabic-carousel', 'assets', 'starter')].find((d) => fs.existsSync(d));
        const manifest = readJson(path.join(dir, 'manifest.json'));
        const added = manifest.assets.map((a) => {
          const { record, duplicate } = studio.assets.add(new Uint8Array(fs.readFileSync(path.join(dir, a.file))), { tags: a.tags, provenance: manifest.provenance, style: manifest.style, name: a.file });
          return { id: record.id, file: a.file, duplicate };
        });
        return out({ ok: true, added });
      }
      if (sub === 'list') return out(studio.assets.list({ tags: list(opt.tags), usage: opt.usage }));
      if (sub === 'show') return out(studio.assets.get(rest[0]) ?? { ok: false, error: 'not found' });
      if (sub === 'verify') {
        const ids = opt.all ? studio.assets.list().map((a) => a.id) : rest;
        const results = ids.map((id) => {
          const v = studio.assets.verify(id);
          return { id, ok: v.ok, ...(v.ok ? {} : { reason: v.reason, code: v.code }) };
        });
        return out({ ok: results.every((r) => r.ok), results });
      }
      throw new Error('asset add|list|show|verify');
    }

    case 'compose': {
      const spec = readJson(sub);
      spec.creatorId = spec.creatorId ?? creatorId;
      const request = typeof opt.request === 'string' ? opt.request : spec.request;
      const result = buildDesign(studio, spec, { request, save: !opt['no-save'], concepts: spec.concepts, metaphor: spec.metaphor });
      const outFile = typeof opt.out === 'string' ? opt.out : null;
      if (outFile) saveDesignFile(outFile, result.doc);
      if (typeof opt.html === 'string') fs.writeFileSync(opt.html, injectSeed(fs.readFileSync(templatePath(), 'utf8'), result.doc));
      return out({
        ok: result.quality.passed,
        designId: result.doc.id,
        revision: result.saved?.revision ?? result.doc.revision,
        reused: result.reused,
        layoutCache: result.layoutCache,
        pages: result.doc.pages.map((p, i) => ({ index: i + 1, id: p.id, composition: `${p.composition.id}/${p.layout?.variant ?? p.composition.variant}`, fits: p.layout?.fits, decisions: p.layout?.decisions?.map((d) => d.message) ?? [] })),
        quality: result.quality,
        files: [outFile, opt.html].filter((x) => typeof x === 'string'),
      });
    }

    case 'check': {
      const doc = withAssets(studio, loadDesign(sub));
      const report = checkDesign(doc, {
        source: typeof opt.source === 'string' ? readJson(opt.source) : undefined,
        readback: typeof opt.readback === 'string' ? readJson(opt.readback) : undefined,
        expectedPages: opt.pages ? Number(opt.pages) : undefined,
        expectedFormat: typeof opt.format === 'string' ? opt.format : undefined,
        verifyAsset: (a) => (studio.assets.get(a.id) ? studio.assets.verify(a.id) : { ok: true }),
      });
      studio.ledger.record({ kind: 'local.quality', designId: doc.id, note: `${report.errors} errors` });
      return out(report);
    }

    case 'edit': {
      const file = sub;
      const command = rest.join(' ');
      let doc = withAssets(studio, loadDesign(file));
      // An asset named in the command («غيّر الجرافيك الرابع a_…») comes from
      // the store: embed it so the patch can use it; unknown ids stay an error.
      const named = [...command.matchAll(/\b(a_[a-z0-9]{6,})\b/gi)].map((x) => x[1]).filter((id) => !doc.assets?.[id] && studio.assets.get(id));
      if (named.length) doc = { ...doc, assets: { ...doc.assets, ...studio.assets.embed(named) } };
      const pageIndex = opt.page ? Number(opt.page) - 1 : 0;
      const brand = doc.brandId ? studio.memory.brand(doc.brandId) : null;
      const before = fingerprint(doc);
      const t0 = Date.now();
      // A current page only when one is given: without it, ordinals such as
      // «الجرافيك الرابع» count across the whole design.
      const r = runCommand(doc, command, { pageId: opt.page ? doc.pages[pageIndex]?.id : undefined, brand });
      studio.ledger.record({ kind: r.local ? 'local.edit' : 'needs.assistant', durationMs: Date.now() - t0, designId: doc.id, note: `${r.intent}${r.needs ? ` → ${r.needs}` : ''}` });
      const changed = diffFingerprints(before, fingerprint(r.doc));
      if (r.local && r.doc !== doc) {
        const target = typeof opt.out === 'string' ? opt.out : file;
        saveDesignFile(target, r.doc);
        if (studio.library.meta(r.doc.id)) studio.library.save(r.doc, { label: command });
      }
      return out({ ok: r.local, intent: r.intent, reply: r.reply, needs: r.needs ?? null, target: r.target ?? null, targets: r.targets ?? null, options: r.options ?? null, changed, revision: r.doc.revision });
    }

    case 'patch': {
      const doc = withAssets(studio, loadDesign(sub));
      const patches = readJson(rest[0]);
      const { doc: next, changed } = applyPatches(doc, patches, { scope: opt.scope ?? 'any' });
      const target = typeof opt.out === 'string' ? opt.out : sub;
      saveDesignFile(target, next);
      if (studio.library.meta(next.id)) studio.library.save(next, { label: 'patch' });
      studio.ledger.record({ kind: 'local.edit', designId: next.id, note: `${changed.length} patches` });
      return out({ ok: true, changed, revision: next.revision });
    }

    case 'render': {
      const doc = withAssets(studio, loadDesign(sub));
      const problems = validateDocument(doc);
      if (problems.length) throw new Error(problems.map((p) => `${p.path} ${p.message}`).join('; '));
      fs.writeFileSync(rest[0], injectSeed(fs.readFileSync(templatePath(), 'utf8'), doc));
      studio.ledger.record({ kind: 'export', tool: 'html', designId: doc.id });
      return out({ ok: true, file: rest[0], pages: doc.pages.length, size: `${doc.pages[0].widthPx}×${doc.pages[0].heightPx}` });
    }

    case 'prompts': {
      const doc = withAssets(studio, loadDesign(sub));
      if (opt.json) return out(designPrompts(doc).map(({ colors, ...d }) => d));
      const md = promptsMarkdown(doc);
      if (typeof opt.out === 'string') {
        fs.writeFileSync(opt.out, `${md}\n`);
        return out({ ok: true, file: opt.out, slides: doc.pages.length });
      }
      return out(md);
    }

    case 'svg': {
      const doc = withAssets(studio, loadDesign(sub));
      fs.mkdirSync(rest[0], { recursive: true });
      const files = doc.pages.map((p, i) => {
        const f = path.join(rest[0], `${String(i + 1).padStart(2, '0')}-art.svg`);
        fs.writeFileSync(f, renderArtSvg(doc, p));
        return f;
      });
      return out({ ok: true, files });
    }

    case 'format': {
      const doc = withAssets(studio, loadDesign(sub));
      const next = setFormat({ ...doc, revision: doc.revision + 1 }, rest[0]);
      saveDesignFile(typeof opt.out === 'string' ? opt.out : sub, next);
      return out({ ok: true, format: rest[0], decisions: next.pages.map((p) => p.layout.decisions.map((d) => d.message)) });
    }

    case 'save': {
      const doc = withAssets(studio, loadDesign(sub));
      const quality = checkDesign(doc, { verifyAsset: (a) => studio.assets.verify(a.id) });
      const { meta, revision } = studio.library.save(doc, { status: opt.status, label: opt.label ?? '', quality, concepts: list(opt.concepts).length ? list(opt.concepts) : undefined, metaphor: opt.metaphor });
      return out({ ok: true, id: meta.id, revision, status: meta.status, quality: { passed: quality.passed, errors: quality.errors } });
    }

    case 'library': {
      if (sub === 'list') return out(studio.library.list());
      if (sub === 'show') return out(studio.library.meta(rest[0]));
      if (sub === 'history') return out(studio.library.meta(rest[0])?.versions ?? []);
      if (sub === 'revert') return out(studio.library.revert(rest[0], Number(rest[1])));
      if (sub === 'remix') {
        const doc = studio.library.remix(rest[0]);
        const full = withAssets(studio, doc);
        const quality = checkDesign(full);
        const saved = studio.library.save(full, { label: `نسخة من ${rest[0]}`, quality });
        if (typeof opt.out === 'string') saveDesignFile(opt.out, full);
        return out({ ok: quality.passed, id: doc.id, parent: doc.parent, revision: saved.revision, variants: doc.pages.map((p) => p.layout.variant), quality });
      }
      throw new Error('library list|show|history|revert|remix');
    }

    case 'search': {
      const request = [sub, ...rest].join(' ');
      const intent = parseIntent(request);
      const results = studio.library.search({ format: opt.format ?? intent.format ?? undefined, mode: opt.mode ?? intent.mode ?? undefined, brandId: opt.brand, concepts: intent.concepts, items: intent.items ?? undefined, creatorId });
      return out(results.map((r) => ({ id: r.id, title: r.title, score: r.score, parts: r.parts, why: r.why })));
    }

    case 'feedback': {
      const id = sub;
      const text = rest.join(' ');
      const meta = studio.library.meta(id);
      if (!meta) throw new Error(`no design ${id}`);
      const parsed = parseFeedback(text);
      const elementIds = list(opt.elements);
      for (const a of parsed.aspects) {
        studio.library.addFeedback(id, { verdict: a.sentiment > 0 ? 'like' : a.sentiment < 0 ? 'dislike' : 'note', aspects: [a.aspect], elementIds, text, ...(parsed.scope === 'topic' && { scope: { concepts: meta.concepts } }) });
      }
      if (!parsed.aspects.length) studio.library.addFeedback(id, { verdict: parsed.verdict === 'approved' ? 'approved' : 'note', elementIds, text });
      const actions = [];
      if (opt.approve || parsed.verdict === 'approved') {
        studio.library.approve(id, text);
        actions.push('اعتُمد التصميم بكلماتك.');
      }
      if (parsed.scope === 'topic' && parsed.aspects.some((a) => a.sentiment < 0 && ['style', 'layout', 'graphics'].includes(a.aspect))) {
        studio.library.setStatus(id, 'rejected', { scope: { concepts: meta.concepts }, reason: text });
        actions.push('رُفض هذا الأسلوب لهذا الموضوع فقط؛ يبقى متاحًا لمواضيع أخرى.');
      }
      for (const a of parsed.aspects) {
        if (a.aspect === 'text.size' && a.fix) {
          studio.memory.observe(meta.creatorId, { key: 'text.size', value: a.fix === 'increase' ? 'larger' : 'smaller', scope: { brandId: meta.brandId ?? undefined, platform: meta.platform }, designId: id, evidence: text });
          actions.push(`سُجّلت إشارة «${a.fix === 'increase' ? 'خط أكبر' : 'خط أصغر'}» (ضعيفة: لا تصبح تفضيلًا إلا إذا تكررت وأكّدتها). أصلح هذا التصميم بـ: studio edit … "${a.fix === 'increase' ? 'كبّر' : 'صغّر'} النص"`);
        }
        if (a.aspect === 'graphics' && a.sentiment > 0) actions.push('أُبقي الجرافيك كما هو، وسُجّل الإعجاب على عناصره.');
      }
      return out({ ok: true, parsed, actions });
    }

    case 'memory': {
      if (!sub || sub === 'show') return out(studio.memory.profile(creatorId));
      if (sub === 'remember') {
        const scope = { brandId: opt.brand, platform: opt.platform, format: opt.format, projectId: opt.project };
        return out(studio.memory.remember(creatorId, { key: rest[0], value: rest.slice(1).join(' '), scope, evidence: opt.evidence ?? '', preference: opt.text }));
      }
      if (sub === 'forget') return out({ ok: studio.memory.forget(creatorId, rest[0]) });
      if (sub === 'suggestions') return out(studio.memory.suggestions(creatorId));
      if (sub === 'confirm') return out(studio.memory.confirm(creatorId, rest[0]));
      if (sub === 'fact') {
        let value = rest.slice(1).join(' ');
        try {
          value = JSON.parse(value);
        } catch {
          /* plain text */
        }
        return out(studio.memory.setFact(creatorId, rest[0], value));
      }
      if (sub === 'observe') return out(studio.memory.observe(creatorId, { key: rest[0], value: rest.slice(1).join(' '), designId: opt.design, scope: { brandId: opt.brand, platform: opt.platform } }));
      if (sub === 'import-results') {
        const text = fs.readFileSync(rest[0], 'utf8');
        const rows = rest[0].endsWith('.csv') ? parseCsv(text) : JSON.parse(text);
        const n = studio.memory.importResults(creatorId, rows);
        return out({ ok: true, imported: n, summary: studio.memory.resultsSummary(creatorId) });
      }
      if (sub === 'resolve') return out(studio.memory.resolve(creatorId, { brandId: opt.brand, platform: opt.platform, format: opt.format, projectId: opt.project }));
      throw new Error('memory show|remember|forget|suggestions|confirm|fact|observe|import-results|resolve');
    }

    case 'brand': {
      if (!sub || sub === 'list') return out(studio.memory.brands(creatorId));
      if (sub === 'show') return out(studio.memory.brand(rest[0]));
      if (sub === 'add') return out(studio.memory.saveBrand(creatorId, readJson(rest[0])));
      if (sub === 'preset') {
        if (rest[0] !== 'kitabwbs') throw new Error('known presets: kitabwbs');
        const b = studio.memory.saveBrand(creatorId, KITABWBS_PRESET);
        const p = studio.memory.profile(creatorId);
        if (!p.facts.accounts.some((a) => a.handle === '@kitabwbs')) studio.memory.setFact(creatorId, 'accounts', [...p.facts.accounts, { platform: 'instagram', handle: '@kitabwbs', brandId: 'kitabwbs' }]);
        return out({ ok: true, brand: b, note: 'هوية «كتاب وبس» مضافة كخيار؛ لا تُطبَّق إلا على تصاميم هذا الحساب.' });
      }
      if (sub === 'approve-example') return out(studio.memory.linkApproved(rest[0], rest[1]));
      throw new Error('brand list|show|add|preset|approve-example');
    }

    case 'project': {
      if (sub === 'new') return out(studio.projects.create({ name: rest.join(' '), brief: opt.brief ?? '', creatorId, brandId: opt.brand ?? null }));
      if (sub === 'list') return out(studio.projects.list(creatorId));
      if (sub === 'show') return out(studio.projects.get(rest[0]));
      if (sub === 'note') return out(studio.projects.note(rest[0], rest.slice(1).join(' '), { designId: opt.design, elementIds: list(opt.elements) }));
      if (sub === 'decide') return out(studio.projects.decide(rest[0], rest.slice(1).join(' ')));
      if (sub === 'copy') return out(studio.projects.setCopy(rest[0], readJson(rest[1])));
      if (sub === 'resume') {
        const r = studio.projects.resume(rest[0], studio);
        return out({ ...r, designs: r.designs.map((d) => ({ designId: d.designId, revision: d.revision, role: d.role, found: Boolean(d.doc), status: d.meta?.status, pages: d.doc?.pages.length })) });
      }
      throw new Error('project new|list|show|note|decide|copy|resume');
    }

    case 'workflow': {
      if (sub === 'from') {
        const doc = loadDesign(rest[0]);
        const wf = studio.workflows.save(studio.workflows.fromDesign(doc, { name: opt.name }));
        return out(wf);
      }
      if (sub === 'save') return out(studio.workflows.save(readJson(rest[0])));
      if (sub === 'list') return out(studio.workflows.list());
      if (sub === 'show') return out(studio.workflows.get(rest[0], opt.version ? Number(opt.version) : undefined));
      if (sub === 'run') {
        const r = studio.workflows.run(rest[0], readJson(rest[1]));
        if (r.ok && typeof opt.out === 'string') writeJson(opt.out, { ...r.spec, creatorId });
        return out(r);
      }
      throw new Error('workflow from|save|list|show|run');
    }

    case 'canva': {
      const tools = list(opt.tools).length ? list(opt.tools) : ['create-design', 'resize-design', 'read-design', 'edit-design', 'create-upload-url', 'export-design'];
      const adapter = new CanvaAdapter({ tools });
      if (sub === 'caps') return out(await adapter.capabilities());
      if (sub === 'plan') {
        const doc = withAssets(studio, loadDesign(rest[0]));
        const outdir = typeof opt.outdir === 'string' ? opt.outdir : path.join(path.dirname(rest[0]), 'canva');
        fs.mkdirSync(outdir, { recursive: true });
        // Files to upload: assets recoloured for the page theme, and whole
        // page artwork for partial/image modes.
        const assetFiles = {};
        for (const page of doc.pages) {
          for (const el of page.elements.filter((e) => e.kind === 'image')) {
            const a = doc.assets[el.assetId];
            if (assetFiles[el.assetId]) continue;
            const ext = a.mediaType === 'image/svg+xml' ? 'svg' : a.mediaType.split('/')[1].replace('jpeg', 'jpg');
            const file = path.join(outdir, `${el.assetId}.${ext}`);
            let bytes = studio.assets.get(el.assetId) ? studio.assets.bytes(el.assetId) : Buffer.from(a.dataUrl.split(',')[1], 'base64');
            if (a.colorable) bytes = Buffer.from(recolorSvg(Buffer.from(bytes).toString('utf8'), doc.theme.colors));
            fs.writeFileSync(file, bytes);
            assetFiles[el.assetId] = file;
          }
        }
        const artFiles = {};
        doc.pages.forEach((p, i) => {
          const file = path.join(outdir, `page-${String(i + 1).padStart(2, '0')}-art.svg`);
          fs.writeFileSync(file, renderArtSvg(doc, p));
          artFiles[p.id] = file;
        });
        const size = typeof opt['page-size'] === 'string' ? opt['page-size'].split('x').map(Number) : null;
        const p = planCreate(doc, await adapter.capabilities(), { mode: opt.mode ?? 'native', title: doc.brief, pageSize: size ? { width: size[0], height: size[1] } : undefined, assetFiles, artFiles });
        writeJson(path.join(outdir, 'plan.json'), p);
        return out({ ok: p.ok, editability: p.editability, mode: p.mode, limitations: p.limitations, steps: p.steps.length, plan: path.join(outdir, 'plan.json') });
      }
      if (sub === 'verify') {
        const doc = loadDesign(rest[0]);
        const readback = readJson(rest[1]);
        const p = typeof opt.plan === 'string' ? readJson(opt.plan) : { editability: 'native', mode: 'native', limitations: [] };
        const r = verifyCanva(doc, readback, p);
        studio.ledger.record({ kind: 'canva.verify', designId: doc.id, note: `${r.issues.length} issues` });
        return out(r);
      }
      throw new Error('canva caps|plan|verify');
    }

    case 'ledger': {
      if (sub === 'add') {
        return out(studio.ledger.record({ kind: opt.kind, tool: opt.tool ?? null, durationMs: opt.duration ? Number(opt.duration) : null, tokens: opt.tokens ? Number(opt.tokens) : null, costUsd: opt.cost ? Number(opt.cost) : null, note: opt.note ?? '', designId: opt.design ?? null }));
      }
      return out(studio.ledger.report({ since: opt.since, session: opt.session }));
    }

    case 'migrate': {
      const v1 = readJson(sub);
      const doc = migrateCarousel(v1, { creatorId, inlineAsset: (url) => inlineAsset(url) });
      writeJson(rest[0], doc);
      return out({ ok: true, id: doc.id, pages: doc.pages.length, file: rest[0] });
    }

    case 'backup': {
      const snap = exportSnapshot(store);
      writeJson(sub, snap);
      return out({ ok: true, file: sub, files: Object.keys(snap.files).length, fingerprint: hashOf(snap).slice(0, 12) });
    }

    case 'restore':
      return out({ ok: true, written: importSnapshot(store, readJson(sub), { overwrite: Boolean(opt.overwrite) }) });

    default:
      throw new Error(`unknown command "${cmd}" (studio help)`);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: err.message, ...(err.problems && { problems: err.problems }) }, null, 2)}\n`);
    process.exit(1);
  });
}

export { specAssetIds };
