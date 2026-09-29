import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('MCP server lists get_facts and answers JSON-RPC', async () => {
  const p = spawn(process.execPath, [new URL('../src/mcp.js', import.meta.url).pathname]);
  const replies = [];
  p.stdout.on('data', (d) => replies.push(...d.toString().trim().split('\n').map((l) => JSON.parse(l))));
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'nope' },
  ];
  p.stdin.write(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
  await new Promise((r) => setTimeout(r, 300));
  p.kill();
  assert.equal(replies.length, 3); // notification gets no reply
  assert.equal(replies[0].result.serverInfo.name, 'hektiq-runner');
  assert.equal(replies[1].result.tools[0].name, 'get_facts');
  assert.equal(replies[2].error.code, -32601);
});
