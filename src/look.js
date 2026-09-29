// Screenshot checker: gives an AI "eyes" on a web page.
// Loads a page at phone and desktop sizes, light and dark, takes screenshots,
// and lists problems a person would notice. Needs Playwright (optional dependency).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VIEWS = [
  { name: 'phone-light', width: 390, height: 844, scheme: 'light', mobile: true },
  { name: 'phone-dark', width: 390, height: 844, scheme: 'dark', mobile: true },
  { name: 'desktop-light', width: 1280, height: 800, scheme: 'light', mobile: false },
  { name: 'desktop-dark', width: 1280, height: 800, scheme: 'dark', mobile: false },
];

// Runs inside the page. Keep it plain so it works on any site.
function inspect() {
  const vw = window.innerWidth, out = { issues: [] };
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return t ? `${s} "${t}"` : s;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };

  if (screen.width < 600 && !document.querySelector('meta[name=viewport]')) {
    out.issues.push({ kind: 'not-mobile-friendly', severity: 'high', detail: `no viewport tag, so phones shrink a ${vw}px-wide desktop layout to fit` });
  }
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1)
      .filter((el) => !el.parentElement || el.parentElement.getBoundingClientRect().right <= vw + 1).slice(0, 5).map(describe);
    out.issues.push({ kind: 'sideways-scroll', severity: 'high', detail: `page is ${sw}px wide on a ${vw}px screen`, where: wide });
  }
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && visible(i)).map((i) => i.currentSrc || i.src).slice(0, 5);
  if (broken.length) out.issues.push({ kind: 'broken-image', severity: 'high', detail: `${broken.length} image(s) failed to load`, where: broken });
  const noAlt = [...document.images].filter((i) => visible(i) && !i.hasAttribute('alt')).length;
  if (noAlt) out.issues.push({ kind: 'image-no-alt', severity: 'medium', detail: `${noAlt} image(s) have no alt text` });

  if (vw < 600) {
    const small = [...document.querySelectorAll('a[href], button, input, select, [role=button]')].filter(visible)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; });
    if (small.length) out.issues.push({ kind: 'small-tap-target', severity: 'medium', detail: `${small.length} control(s) smaller than 24px`, where: small.slice(0, 5).map(describe) });
  }
  const unlabeled = [...document.querySelectorAll('button, a[href]')].filter(visible)
    .filter((el) => !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img[alt]:not([alt=""])'));
  if (unlabeled.length) out.issues.push({ kind: 'unlabeled-control', severity: 'medium', detail: `${unlabeled.length} button/link(s) have no text a screen reader can say`, where: unlabeled.slice(0, 5).map(describe) });

  // Text that is hard to read: low contrast against its nearest solid background.
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c; } return [255, 255, 255]; };
  const low = [];
  for (const el of document.querySelectorAll('p, span, a, li, h1, h2, h3, h4, label, button, td')) {
    if (low.length >= 5 || !visible(el) || !(el.innerText || '').trim()) continue;
    if ([...el.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim())) continue;
    const fg = rgb(getComputedStyle(el).color), bg = bgOf(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
    if (ratio < 3) low.push(`${describe(el)} (${ratio.toFixed(1)}:1)`);
  }
  if (low.length) out.issues.push({ kind: 'low-contrast', severity: 'medium', detail: 'text that is hard to read against its background', where: low });

  out.title = document.title;
  out.height = document.documentElement.scrollHeight;
  return out;
}

export async function look(target, { outDir = 'shots', views = VIEWS, maxHeight = 2400, wait = 1500 } = {}) {
  let pw;
  try { pw = await import('playwright'); } catch { throw new Error('Playwright is not installed. Run: npm i playwright && npx playwright install chromium'); }
  const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(resolve(target)).href;
  mkdirSync(outDir, { recursive: true });
  const browser = await pw.chromium.launch();
  const report = { url, checkedAt: new Date().toISOString(), views: [] };
  try {
    for (const v of views) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [], failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('requestfailed', (r) => failed.push(`${r.url().slice(0, 100)} (${r.failure()?.errorText})`));
      const t0 = Date.now();
      let status = 0;
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        status = res?.status() ?? 200;
      } catch (e) { errors.push(`page did not load: ${e.message.split('\n')[0]}`); }
      await page.waitForTimeout(wait);
      const found = await page.evaluate(inspect).catch((e) => ({ issues: [], error: e.message }));
      if (errors.length) found.issues.unshift({ kind: 'script-error', severity: 'high', detail: `${errors.length} error(s) in the console`, where: [...new Set(errors)].slice(0, 5) });
      if (failed.length) found.issues.push({ kind: 'failed-request', severity: 'medium', detail: `${failed.length} file(s) failed to load`, where: failed.slice(0, 5) });
      if (status >= 400) found.issues.unshift({ kind: 'http-error', severity: 'high', detail: `page returned HTTP ${status}` });
      const file = `${outDir}/${v.name}.jpg`;
      const h = Math.min(maxHeight, found.height || v.height);
      await page.screenshot({ path: file, type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: v.width, height: h } });
      report.views.push({ view: v.name, status, loadMs: Date.now() - t0, title: found.title, pageHeight: found.height, screenshot: file, issues: found.issues });
      await ctx.close();
    }
  } finally { await browser.close(); }
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${outDir}/report.md`, toMarkdown(report));
  return report;
}

export function toMarkdown(r) {
  const lines = [`# Look: ${r.url}`, `Checked ${r.checkedAt}`, ''];
  for (const v of r.views) {
    lines.push(`## ${v.view} — ${v.issues.length ? `${v.issues.length} issue(s)` : 'no issues found'}`, `![${v.view}](${v.screenshot.split('/').pop()})`, '');
    for (const i of v.issues) {
      lines.push(`- **${i.kind}** (${i.severity}): ${i.detail}`);
      for (const w of i.where || []) lines.push(`  - ${w}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
