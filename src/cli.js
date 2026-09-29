#!/usr/bin/env node
// Usage: node src/cli.js <url> <field,field,...> [--full]
import { Runner, SUPPORTED_FIELDS } from './runner.js';

const [url, fieldArg, flag] = process.argv.slice(2);
if (!url || !fieldArg) {
  console.log(`Usage: node src/cli.js <url> <fields>\nFields: ${SUPPORTED_FIELDS.join(', ')}`);
  process.exit(1);
}

const out = await new Runner().run(url, fieldArg.split(',').map((s) => s.trim()));
if (flag === '--full') {
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const [f, v] of Object.entries(out.facts)) console.log(`${f}: ${v.value}  [${v.method}]`);
  for (const u of out.unknown) console.log(`${u.field}: unknown (${u.reason})`);
  const s = out.stats;
  console.log(`\npage ${(s.pageBytes / 1024).toFixed(1)} KB -> answer ${(s.contextBytes / 1024).toFixed(1)} KB (${s.reduction} smaller, ~${s.approxTokensSaved} tokens saved)`);
}
