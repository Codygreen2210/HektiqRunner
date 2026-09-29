// Hektiq Runner core: fetch a page, pull only the requested fields,
// cheapest source first, with a source for every fact. No AI calls.

const FIELD_PATHS = {
  name: ['name', 'headline'],
  price: ['offers.price', 'offers.lowPrice', 'price'],
  currency: ['offers.priceCurrency', 'priceCurrency'],
  availability: ['offers.availability', 'availability'],
  brand: ['brand.name', 'brand'],
  sku: ['sku', 'gtin13', 'gtin12', 'mpn'],
  model: ['model', 'mpn'],
  rating: ['aggregateRating.ratingValue'],
  reviews: ['aggregateRating.reviewCount'],
  address: ['address', 'location.address'],
  phone: ['telephone'],
  hours: ['openingHours', 'openingHoursSpecification'],
  url: ['url', 'offers.url'],
  image: ['image.url', 'image'],
  description: ['description'],
  author: ['author.name', 'author'],
  date: ['datePublished', 'startDate'],
};

const META_KEYS = {
  name: ['og:title', 'twitter:title'],
  price: ['product:price:amount', 'og:price:amount'],
  currency: ['product:price:currency', 'og:price:currency'],
  availability: ['product:availability', 'og:availability'],
  description: ['og:description', 'description'],
  image: ['og:image'],
  url: ['og:url'],
  author: ['author', 'article:author'],
  date: ['article:published_time'],
};

export const SUPPORTED_FIELDS = Object.keys(FIELD_PATHS);

function get(obj, path) {
  let v = obj;
  for (const k of path.split('.')) {
    if (Array.isArray(v)) v = v[0];
    if (v == null || typeof v !== 'object') return undefined;
    v = v[k];
  }
  return Array.isArray(v) && v.length === 1 ? v[0] : v;
}

function clean(field, v) {
  if (v == null || v === '') return undefined;
  if (typeof v === 'object' && !Array.isArray(v)) {
    if (field === 'address') {
      return ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode']
        .map((k) => v[k]).filter(Boolean).join(', ') || undefined;
    }
    return v.name ?? v['@id'] ?? JSON.stringify(v);
  }
  if (field === 'availability' && typeof v === 'string') {
    return v.replace(/^https?:\/\/schema\.org\//, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }
  if (field === 'price' && !isNaN(parseFloat(v))) return parseFloat(v);
  return v;
}

// Pull JSON-LD blocks and flatten @graph so each thing is one object.
export function parseJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const o = stack.shift();
        if (!o || typeof o !== 'object') continue;
        if (Array.isArray(o['@graph'])) stack.push(...o['@graph']);
        out.push(o);
      }
    } catch { /* bad JSON-LD on the page; skip it */ }
  }
  // Put the most useful types first.
  const rank = (o) => (/Product|LocalBusiness|Store|Restaurant|Event|Article|Recipe/.test(String(o['@type'])) ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

export function parseMeta(html) {
  const meta = {};
  const re = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = /(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && val && !(key in meta)) meta[key] = val;
  }
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  if (title) meta['<title>'] = title;
  return meta;
}

function extractField(field, parsed) {
  for (const obj of parsed.jsonld) {
    for (const p of FIELD_PATHS[field] || []) {
      const v = clean(field, get(obj, p));
      if (v !== undefined) return { value: v, method: 'json-ld', path: `${obj['@type']}.${p}`, confidence: 0.95 };
    }
  }
  for (const k of META_KEYS[field] || []) {
    const v = clean(field, parsed.meta[k]);
    if (v !== undefined) return { value: v, method: 'meta', path: k, confidence: 0.8 };
  }
  if (field === 'name' && parsed.meta['<title>']) {
    return { value: parsed.meta['<title>'], method: 'html-title', path: '<title>', confidence: 0.5 };
  }
  return null;
}

export class Runner {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.fetch = fetchImpl;
    this.pages = new Map(); // url -> parsed page, so follow-ups never re-download
  }

  async #load(url) {
    if (this.pages.has(url)) return { parsed: this.pages.get(url), fetched: false };
    const t0 = Date.now();
    const res = await this.fetch(url, { headers: { 'user-agent': 'HektiqRunner/0.1 (+https://github.com/Codygreen2210/HektiqRunner)' } });
    const html = await res.text();
    const parsed = {
      status: res.status,
      bytes: Buffer.byteLength(html),
      ms: Date.now() - t0,
      retrievedAt: new Date().toISOString(),
      jsonld: parseJsonLd(html),
      meta: parseMeta(html),
      known: {},
    };
    this.pages.set(url, parsed);
    return { parsed, fetched: true };
  }

  // Get only the fields asked for. Asking again later only fills in what's missing.
  async run(url, fields) {
    const { parsed, fetched } = await this.#load(url);
    const facts = {};
    const unknown = [];
    let reused = 0;
    for (const f of fields) {
      if (parsed.known[f]) { facts[f] = parsed.known[f]; reused++; continue; }
      if (!FIELD_PATHS[f]) { unknown.push({ field: f, reason: 'field not supported yet' }); continue; }
      const hit = extractField(f, parsed);
      if (hit) facts[f] = parsed.known[f] = hit;
      else unknown.push({ field: f, reason: parsed.status >= 400 ? `page returned HTTP ${parsed.status}` : 'page does not expose this in structured data' });
    }
    const answer = { source: new URL(url).hostname, url, retrievedAt: parsed.retrievedAt, facts, unknown };
    const contextBytes = Buffer.byteLength(JSON.stringify(answer));
    answer.stats = {
      pageBytes: parsed.bytes,
      downloadedNow: fetched ? parsed.bytes : 0,
      contextBytes,
      reduction: parsed.bytes > contextBytes ? `${(100 * (1 - contextBytes / parsed.bytes)).toFixed(1)}%` : 'n/a',
      approxTokensSaved: Math.max(0, Math.round((parsed.bytes - contextBytes) / 4)),
      reusedFields: reused,
      fetchMs: fetched ? parsed.ms : 0,
    };
    return answer;
  }
}
