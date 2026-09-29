# Repo map

- `src/runner.js` — everything core.
  - `FIELD_PATHS` / `META_KEYS`: where each field lives in JSON-LD / meta tags. Add a field here.
  - `parseJsonLd(html)`, `parseMeta(html)`: pull structured data, no dependencies.
  - `extractField(field, parsed)`: JSON-LD (0.95) → meta (0.8) → HTML (0.4–0.75) → `<title>` for name (0.5).
  - `class Runner` → `run(url, fields)`: caches each page, reuses known facts on follow-ups, returns `{facts, unknown, stats}`.
- `src/mcp.js` — zero-dependency MCP stdio server, one tool: `get_facts(url, fields)`.
- `src/browser.js` — optional Playwright fallback (blocks images/fonts/css). Runner calls it only when fetch is blocked/empty.
- `src/cli.js` — `node src/cli.js <url> <fields> [--full]`.
- `scripts/live-test.js` + `.github/workflows/live-test.yml` — real-site test, run from GitHub Actions tab; results land in `results/live-test.md`.
- `test/runner.test.js` + `test/fixtures/` — offline tests with a fake fetch.

## Next steps (not built yet)
1. ~~MCP server~~ done: `src/mcp.js` (tool `get_facts`).
2. More fields and page types (recipes, events, local businesses).
3. ~~HTML fallback~~ done: `parseHtml` — microdata, <h1>, tel: links, <time>, dominant $ price (confidence 0.4–0.75).
4. ~~Browser fallback~~ done: `src/browser.js`, optional Playwright, only on blocked/empty fetch.
