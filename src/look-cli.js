#!/usr/bin/env node
// Usage: node src/look-cli.js <url or local .html file> [outDir]
import { look } from './look.js';

const [target, outDir = 'shots'] = process.argv.slice(2);
if (!target) { console.log('Usage: node src/look-cli.js <url|file.html> [outDir]'); process.exit(1); }
const r = await look(target, { outDir });
for (const v of r.views) {
  console.log(`${v.view}: ${v.issues.length ? v.issues.map((i) => `${i.kind} (${i.detail})`).join('; ') : 'no issues'}`);
}
console.log(`\nScreenshots and report in ${outDir}/`);
