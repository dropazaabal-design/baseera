// The Canva tools as a local MCP server over stdio (newline-delimited
// JSON-RPC 2.0), bundled to the plugin as
// skills/canva-arabic/scripts/canva-mcp.mjs and declared in .mcp.json.
// The server never talks to Canva itself unless the Connect API token is
// configured: it plans, checks and records; the assistant runs the Canva
// connector's tools.
import readline from 'node:readline';
import { TOOLS, TOOL_DEFS } from '../lib/studio/canva/tools.js';
import { nodeContext } from '../lib/studio/node/canvaContext.js';

const SERVER = { name: 'baseera-canva', version: '1.5.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

let ctx = null;
const context = () => (ctx ??= nodeContext());

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return reply(id, { protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER });
  }
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return undefined;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: Object.entries(TOOL_DEFS).map(([name, d]) => ({ name, description: d.description, inputSchema: d.inputSchema })) });
  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) return fail(id, -32602, `unknown tool ${params?.name}`);
    try {
      const result = await tool(context(), params.arguments ?? {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], structuredContent: result, isError: !result.ok });
    } catch (err) {
      return reply(id, { content: [{ type: 'text', text: `${params.name}: ${err.message}` }], isError: true });
    }
  }
  if (id !== undefined) return fail(id, -32601, `method not found: ${method}`);
  return undefined;
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
  }
  handle(msg).catch((err) => msg.id !== undefined && fail(msg.id, -32603, err.message));
});
