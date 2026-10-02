// Canva tools from the command line (bundled to the plugin as
// skills/canva-arabic/scripts/canva.mjs):
//   node canva.mjs <tool> [--key value]... [--args file.json]
// Tools: capabilities, inspect, build-design, apply-patch, import-editable,
// build-reel, apply-motion, preview, validate-arabic, export, record.
// Prints the tool's JSON result. Exit code 0 when ok, 2 when the tool
// stopped on purpose (unsupported, blocked, needs-input, failed), 1 on error.
import fs from 'node:fs';
import { TOOLS, TOOL_DEFS } from '../lib/studio/canva/tools.js';
import { nodeContext } from '../lib/studio/node/canvaContext.js';

const REPEATABLE = new Set(['commands', 'pages']);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}"`);
    const key = camel(a.slice(2));
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith('--') ? true : (i++, next);
    if (key === 'args') Object.assign(out, JSON.parse(fs.readFileSync(value, 'utf8')));
    else if (REPEATABLE.has(key)) out[key] = [...(out[key] ?? []), ...(key === 'pages' ? String(value).split(',').map(Number) : [value])];
    else if (key === 'expect' || key === 'record' || key === 'idea') out[key] = typeof value === 'string' && value.trim().startsWith('{') ? JSON.parse(value) : value;
    else out[key] = value === 'true' ? true : value === 'false' ? false : value;
  }
  return out;
}

const [name, ...rest] = process.argv.slice(2);
const toolName = name && `canva_${name.replace(/-/g, '_')}`;
if (!name || name === 'help' || !TOOLS[toolName]) {
  const list = Object.entries(TOOL_DEFS).map(([n, d]) => `  ${n.slice(6).replace(/_/g, '-').padEnd(16)} ${d.description.split('. ')[0]}.`);
  console.log(`usage: canva <tool> [--key value]... [--args file.json]\n\n${list.join('\n')}`);
  process.exit(name && name !== 'help' ? 1 : 0);
}

try {
  const result = await TOOLS[toolName](nodeContext(), parse(rest));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
} catch (err) {
  console.error(`canva ${name}: ${err.message}`);
  process.exit(1);
}
