#!/usr/bin/env node
// Hektiq Runner as an MCP tool server (stdio). No dependencies:
// speaks newline-delimited JSON-RPC, which is all MCP stdio needs.
import { createInterface } from 'node:readline';
import { Runner, SUPPORTED_FIELDS } from './runner.js';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOOK_TOOL = {
  name: 'look_at_page',
  description: 'Take a screenshot of a web page (or local .html file) and list visible problems: sideways scrolling, broken images, '
    + 'script errors, low-contrast text, tiny tap targets, unlabeled buttons. Use it to check your own work. Needs Playwright installed.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Page URL or local file path' },
      view: { type: 'string', enum: ['phone-light', 'phone-dark', 'desktop-light', 'desktop-dark'], description: 'Defaults to phone-light' },
    },
    required: ['url'],
  },
};

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
  if (method === 'tools/list') return { tools: [TOOL, LOOK_TOOL] };
  if (method === 'tools/call' && params?.name === LOOK_TOOL.name) {
    const { url, view = 'phone-light' } = params.arguments ?? {};
    try {
      const { look, VIEWS } = await import('./look.js');
      const pick = VIEWS.filter((v) => v.name === view);
      const dir = mkdtempSync(join(tmpdir(), 'look-'));
      const r = await look(url, { outDir: dir, views: pick.length ? pick : VIEWS.slice(0, 1) });
      const v = r.views[0];
      return { content: [
        { type: 'text', text: JSON.stringify({ url: r.url, view: v.view, status: v.status, title: v.title, issues: v.issues }) },
        { type: 'image', mimeType: 'image/jpeg', data: readFileSync(v.screenshot).toString('base64') },
      ] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Could not look at ${url}: ${e.message}` }], isError: true };
    }
  }
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
