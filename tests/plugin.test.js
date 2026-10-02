import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contrastRatio } from '../lib/contrast.js';

const SKILL = 'claude-plugin/skills/arabic-carousel';
const EXAMPLE = path.join(SKILL, 'references/example.json');

function build(doc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-'));
  const input = path.join(dir, 'carousel.json');
  const output = path.join(dir, 'carousel.html');
  fs.writeFileSync(input, typeof doc === 'string' ? doc : JSON.stringify(doc));
  const run = spawnSync('python3', [path.join(SKILL, 'scripts/build_carousel.py'), input, output], { encoding: 'utf8' });
  const html = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : null;
  return { ...run, html };
}

const seedOf = (html) => html.match(/<script id="carousel-seed" type="application\/json">(.*?)<\/script>/s)[1];

test('the example carousel builds with no warnings and round-trips', () => {
  const run = build(fs.readFileSync(EXAMPLE, 'utf8'));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.includes('warning'), false, run.stdout);
  assert.deepEqual(JSON.parse(seedOf(run.html)), JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')));
});

test('text cannot close the embedding <script> tag', () => {
  const run = build({ slides: [{ template: 'cover', data: { title: '</script><script>alert(1)</script>' } }] });
  assert.equal(run.status, 0, run.stderr);
  const seed = seedOf(run.html);
  assert.equal(seed.includes('<'), false);
  assert.equal(JSON.parse(seed).slides[0].data.title, '</script><script>alert(1)</script>');
});

test('unknown templates, fields and wrong types are rejected', () => {
  const run = build({
    slides: [
      { template: 'poster', data: {} },
      { template: 'cover', data: { titel: 'خطأ إملائي في اسم الحقل' } },
      { template: 'listicle', data: { items: 'ليست قائمة' } },
    ],
    design: { font: 'arial' },
  });
  assert.equal(run.status, 1);
  for (const expected of ['slides[1].template', 'slides[2].data.titel', 'slides[3].data.items', 'design.font']) {
    assert.ok(run.stderr.includes(expected), `missing error for ${expected}:\n${run.stderr}`);
  }
  assert.equal(run.html, null);
});

test('Arabic copy problems produce warnings, not errors', () => {
  const run = build({ slides: [{ template: 'cover', data: { title: 'هل أنت مستعد?', subtitle: 'كلمة‏مع علامة ـــ' } }] });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Arabic punctuation/);
  assert.match(run.stdout, /tatweel/);
  assert.match(run.stdout, /bidi control/);
});

test('formats, governance and image placeholders are validated', () => {
  const ok = build({
    design: { format: 'story' },
    governance: { institutional: true, locked: true },
    slides: [{ template: 'quote', data: { quote: 'نص', author: 'اسم', photo: null } }],
  });
  assert.equal(ok.status, 0, ok.stderr);

  const bad = build({
    design: { format: 'landscape' },
    governance: { institutional: 'yes' },
    slides: [{ template: 'quote', data: { photo: 'https://example.com/a.png' } }],
  });
  assert.equal(bad.status, 1);
  for (const expected of ['design.format', 'governance.institutional', 'slides[1].data.photo']) {
    assert.ok(bad.stderr.includes(expected), `missing error for ${expected}:\n${bad.stderr}`);
  }
});

test('the ChatGPT/Codex manifest is complete and in sync with the Claude one', () => {
  const portable = JSON.parse(fs.readFileSync('claude-plugin/plugin.json', 'utf8'));
  const claude = JSON.parse(fs.readFileSync('claude-plugin/.claude-plugin/plugin.json', 'utf8'));
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(portable.name, claude.name);
  assert.equal(portable.version, claude.version);
  assert.match(portable.name, /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  const ui = portable.extensions['com.openai'].interface;
  for (const key of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) assert.ok(ui[key], key);
  for (const ref of [ui.composerIcon, ui.logo, ...ui.screenshots]) {
    assert.ok(ref.startsWith('./'), ref);
    assert.ok(fs.existsSync(path.join('claude-plugin', ref)), ref);
  }
  const icon = fs.readFileSync(path.join('claude-plugin', ui.logo));
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20), 'icon must be square');
  assert.ok(icon.readUInt32BE(16) >= 48);
});

// Limits from OpenAI's plugin upload validation; exceeding any of them makes
// ChatGPT reject the ZIP with a generic "Couldn't add plugin".
test('the ChatGPT interface block stays within OpenAI upload limits', () => {
  const ui = JSON.parse(fs.readFileSync('claude-plugin/plugin.json', 'utf8')).extensions['com.openai'].interface;
  assert.ok(ui.displayName.length <= 30, `displayName is ${ui.displayName.length} chars`);
  assert.ok(ui.shortDescription.length <= 30, `shortDescription is ${ui.shortDescription.length} chars`);
  assert.ok(ui.longDescription.length <= 4000);
  assert.ok(ui.developerName.length <= 80);
  assert.ok(ui.defaultPrompt.length <= 3 && ui.defaultPrompt.every((p) => p.length <= 128));
  assert.match(ui.brandColor, /^#[0-9A-Fa-f]{6}$/);
  assert.ok(contrastRatio(ui.brandColor, '#FFFFFF') >= 2);
});

test('the bundled studio CLI runs without dependencies and builds the shipped example', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-cli-'));
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [path.resolve(SKILL, 'scripts/studio.mjs'), ...args, '--home', home], { encoding: 'utf8', cwd: os.tmpdir() });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.startsWith('{') || r.stdout.startsWith('[') ? JSON.parse(r.stdout) : r.stdout;
  };
  assert.match(cli('help'), /studio — Arabic design studio/);
  const seeded = cli('asset', 'seed');
  assert.ok(seeded.added.length >= 12);
  cli('brand', 'preset', 'kitabwbs');
  const out = path.join(home, 'design.html');
  const r = cli('compose', path.resolve(SKILL, 'references/example-studio.json'), '--out', path.join(home, 'design.json'), '--html', out);
  assert.equal(r.ok, true, JSON.stringify(r.quality.issues));
  const html = fs.readFileSync(out, 'utf8');
  assert.equal(JSON.parse(seedOf(html).replace(/\\u003c/g, '<')).schemaVersion, 2);
});

test('every skill has frontmatter with a name and a description, and the studio CLI is referenced', () => {
  const dir = 'claude-plugin/skills';
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
    assert.match(front, new RegExp(`^name: ${name}$`, 'm'));
    assert.match(front, /^description: .{40,}/m);
    assert.ok(text.includes('studio'), `${name} does not use the studio CLI`);
  }
});

test('the bundled Canva tools run as a CLI and as the MCP server the plugin declares', () => {
  const canva = 'claude-plugin/skills/canva-arabic';
  const env = { ...process.env, BASEERA_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'canva-cli-')), CANVA_ACCESS_TOKEN: '' };
  const mcp = JSON.parse(fs.readFileSync('claude-plugin/.mcp.json', 'utf8')).mcpServers['baseera-canva'];
  assert.deepEqual(mcp.args, ['${CLAUDE_PLUGIN_ROOT}/skills/canva-arabic/scripts/canva-mcp.mjs']);
  assert.equal(mcp.env.CANVA_ACCESS_TOKEN, '${CANVA_ACCESS_TOKEN:-}', 'a reference to the user\'s variable, never a value');

  const caps = spawnSync(process.execPath, [path.resolve(canva, 'scripts/canva.mjs'), 'capabilities', '--schemas-file', path.resolve('tests/fixtures/canva-schema-2026-10-02.json'), '--capability', 'text.font-family'], { encoding: 'utf8', env, cwd: os.tmpdir() });
  assert.equal(caps.status, 0, caps.stderr);
  const font = JSON.parse(caps.stdout).capability;
  assert.equal(font.routes.connector.status, 'unsupported');
  assert.ok(font.routes.manual.status === 'supported');

  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ].map((m) => JSON.stringify(m)).join('\n');
  const server = spawnSync(process.execPath, [path.resolve(canva, 'scripts/canva-mcp.mjs')], { input: `${input}\n`, encoding: 'utf8', env, cwd: os.tmpdir() });
  const replies = server.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(replies[0].result.serverInfo.name, 'baseera-canva');
  assert.equal(replies[1].result.tools.length, 11);
  assert.ok(fs.readFileSync(path.join(canva, 'references/capabilities.md'), 'utf8').includes('اختبارات حية مؤرخة'));
});
