// Runs Hektiq Runner against real sites and writes results/live-test.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Runner } from '../src/runner.js';

const CASES = [
  ['https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/', 'name,author,rating,reviews,date,totalTime,servings'],
  ['https://www.bhphotovideo.com/c/product/1793602-REG/sony_1000040597_playstation_5_slim_console.html', 'name,price,currency,availability,brand,sku'],
  ['https://www.imdb.com/title/tt0111161/', 'name,rating,date,description'],
  ['https://www.eventbrite.com/d/la--new-orleans/events/', 'name,date,description'],
  ['https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html', 'name,price,availability'],
  ['https://www.bbc.com/news', 'name,description,image'],
  ['https://en.wikipedia.org/wiki/PlayStation_5', 'name,description,author,date'],
];

const lines = [`# Live test — ${new Date().toISOString()}`, ''];
let totalPage = 0, totalAnswer = 0;
for (const [url, fields] of CASES) {
  lines.push(`## ${new URL(url).hostname}`, `\`${fields}\``, '');
  try {
    const out = await new Runner().run(url, fields.split(','));
    for (const [f, v] of Object.entries(out.facts)) lines.push(`- **${f}**: ${String(v.value).slice(0, 120)} _(${v.method})_`);
    for (const u of out.unknown) lines.push(`- **${u.field}**: unknown — ${u.reason}`);
    const s = out.stats;
    lines.push('', `Page ${(s.pageBytes / 1024).toFixed(1)} KB → answer ${(s.contextBytes / 1024).toFixed(1)} KB (${s.reduction} smaller), ${s.fetchMs} ms via ${s.via}`, '');
    if (s.reduction !== 'n/a') { totalPage += s.pageBytes; totalAnswer += s.contextBytes; }
  } catch (e) {
    lines.push(`- fetch failed: ${e.message}`, '');
  }
}
lines.push(`**Total:** ${(totalPage / 1024).toFixed(0)} KB of pages → ${(totalAnswer / 1024).toFixed(1)} KB of answers`);
mkdirSync('results', { recursive: true });
writeFileSync('results/live-test.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
await (await import('../src/browser.js')).closeBrowser();
