// Browser fallback: only used when a plain fetch is blocked or comes back empty.
// Playwright is optional. Install it only if you want this: npm i playwright && npx playwright install chromium
let browserPromise;

async function getBrowser() {
  let pw;
  try { pw = await import('playwright'); }
  catch { throw Object.assign(new Error('playwright not installed'), { code: 'NO_BROWSER' }); }
  browserPromise ??= pw.chromium.launch({ headless: true });
  return browserPromise;
}

export async function render(url, { timeoutMs = 20000 } = {}) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  });
  // Skip images, fonts, media and styles. The agent needs data, not pixels.
  await ctx.route('**/*', (r) => (['image', 'font', 'media', 'stylesheet'].includes(r.request().resourceType()) ? r.abort() : r.continue()));
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    return { html: await page.content(), status: res?.status() ?? 0 };
  } finally {
    await ctx.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = undefined;
}
