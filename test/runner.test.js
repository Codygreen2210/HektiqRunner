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

test('falls back to meta tags when JSON-LD lacks a field', async () => {
  const out = await new Runner({ fetchImpl: fakeFetch }).run(URL_, ['description']);
  assert.equal(out.facts.description.method, 'meta');
});
