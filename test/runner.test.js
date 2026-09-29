import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Runner } from '../src/runner.js';

const html = readFileSync(new URL('./fixtures/product.html', import.meta.url), 'utf8');
let fetches = 0;
const fakeFetch = async () => { fetches++; return { status: 200, text: async () => html }; };
const URL_ = 'https://example.com/ps5';

test('returns only requested fields from JSON-LD, with sources', async () => {
  const r = new Runner({ fetchImpl: fakeFetch });
  const out = await r.run(URL_, ['name', 'price', 'availability']);
  assert.deepEqual(Object.keys(out.facts), ['name', 'price', 'availability']);
  assert.equal(out.facts.name.value, 'PlayStation 5 Slim');
  assert.equal(out.facts.price.value, 499.99);
  assert.equal(out.facts.availability.value, 'in_stock');
  assert.equal(out.facts.price.method, 'json-ld');
  assert.equal(out.unknown.length, 0);
});

test('says unknown instead of guessing', async () => {
  const out = await new Runner({ fetchImpl: fakeFetch }).run(URL_, ['phone', 'bogus']);
  assert.deepEqual(out.unknown.map((u) => u.field), ['phone', 'bogus']);
  assert.deepEqual(out.facts, {});
});

test('follow-up reuses the page and known facts, no re-download', async () => {
  fetches = 0;
  const r = new Runner({ fetchImpl: fakeFetch });
  await r.run(URL_, ['price']);
  const out = await r.run(URL_, ['price', 'model', 'brand']);
  assert.equal(fetches, 1);
  assert.equal(out.stats.downloadedNow, 0);
  assert.equal(out.stats.reusedFields, 1);
  assert.equal(out.facts.model.value, 'CFI-2015');
  assert.equal(out.facts.brand.value, 'Sony');
});

test('bot walls and error pages return unknown, not fake facts', async () => {
  const wall = async () => ({ status: 403, text: async () => '<html><title>Just a moment...</title>' + 'x'.repeat(500) + '</html>' });
  const out = await new Runner({ fetchImpl: wall, browser: 'off' }).run(URL_, ['name', 'price']);
  assert.deepEqual(out.facts, {});
  assert.match(out.unknown[0].reason, /blocked/);
  const challenge = async () => ({ status: 200, text: async () => '<title>Human Verification</title>' + 'x'.repeat(500) });
  const out2 = await new Runner({ fetchImpl: challenge, browser: 'off' }).run(URL_, ['name']);
  assert.match(out2.unknown[0].reason, /bot-check/);
});

test('uses the browser only when the cheap fetch fails', async () => {
  let renders = 0;
  const renderImpl = async () => { renders++; return { status: 200, html }; };
  const empty = async () => ({ status: 202, text: async () => '' });
  const out = await new Runner({ fetchImpl: empty, renderImpl }).run(URL_, ['price']);
  assert.equal(out.facts.price.value, 499.99);
  assert.equal(out.facts.price.via, 'browser');
  await new Runner({ fetchImpl: fakeFetch, renderImpl }).run(URL_, ['price']);
  assert.equal(renders, 1); // good page never opened a browser
});

test('reports when browser fallback also fails', async () => {
  const renderImpl = async () => { throw new Error('timeout'); };
  const empty = async () => ({ status: 202, text: async () => '' });
  const out = await new Runner({ fetchImpl: empty, renderImpl }).run(URL_, ['price']);
  assert.match(out.unknown[0].reason, /browser fallback failed: timeout/);
});

test('falls back to meta tags when JSON-LD lacks a field', async () => {
  const out = await new Runner({ fetchImpl: fakeFetch }).run(URL_, ['description']);
  assert.equal(out.facts.description.method, 'meta');
});
