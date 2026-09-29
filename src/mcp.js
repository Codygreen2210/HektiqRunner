#!/usr/bin/env node
// Hektiq Runner as an MCP tool server (stdio). No dependencies:
// speaks newline-delimited JSON-RPC, which is all MCP stdio needs.
import { createInterface } from 'node:readline';
import { Runner, SUPPORTED_FIELDS } from './runner.js';

const runner = new Runner(); // one per server, so follow-ups reuse pages
const TOOL = {
  name: 'get_facts',
  description: 'Get only the named fields from a webpage (e.g. price, availability) instead of the whole page. '
    + 'Each fact includes its source and confidence; missing fields come back as unknown with a reason. '
    + 'Asking again for the same URL reuses the page without re-downloading.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Page URL' },
      fields: { type: 'array', items: { type: 'string', enum: SUPPORTED_FIELDS } },
    },
    required: ['url', 'fields'],
  },
};

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle({ id, method, params }) {
  if (method === 'initialize') {
    return { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'hektiq-runner', version: '0.1.0' } };
  }
  if (method === 'tools/list') return { tools: [TOOL] };
  if (method === 'tools/call') {
    if (params?.name !== TOOL.name) throw Object.assign(new Error(`Unknown tool ${params?.name}`), { code: -32602 });
    const { url, fields } = params.arguments ?? {};
    try {
      const out = await runner.run(url, fields);
      return { content: [{ type: 'text', text: JSON.stringify(out) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Could not fetch ${url}: ${e.message}` }], isError: true };
    }
  }
  if (method === 'ping') return {};
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (msg.id === undefined) return; // notifications need no reply
  try { send({ id: msg.id, result: await handle(msg) }); }
  catch (e) { send({ id: msg.id, error: { code: e.code ?? -32603, message: e.message } }); }
});
