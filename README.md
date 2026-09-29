# Hektiq Runner

Give AI only the facts it needs from a webpage, not the whole page.

When an AI looks something up, it usually swallows the entire page: menus, ads, footers, reviews. Hektiq Runner works like a parts runner: you say what you need, it brings back just that, with where it found it.

- Reads the free structured data sites already publish for search engines (JSON-LD, meta tags) first. No AI call needed for that.
- Every fact comes with its source and a confidence score.
- If it can't find something, it says `unknown` and why. It doesn't guess.
- Follow-up questions reuse what it already has, so it doesn't download the page again.

## Try it

Node 20 or newer, no install needed.

```
node src/cli.js https://some-store.com/product name,price,availability
```

Example output (sizes are illustrative, they vary by page):

```
name: PlayStation 5 Slim  [json-ld]
price: 499.99  [json-ld]
availability: in_stock  [json-ld]

page 312.4 KB -> answer 0.5 KB (99.8% smaller, ~79800 tokens saved)
```

Add `--full` for the JSON output an agent would receive.

Fields: name, price, currency, availability, brand, sku, model, rating, reviews, address, phone, hours, url, image, description, author, date, endDate, location, cookTime, totalTime, servings, ingredients, priceRange.

## Status

Early and small. Works best on pages that publish structured data. If a page is blocked or loads with JavaScript, it can fall back to a real browser (optional: `npm i playwright && npx playwright install chromium`). Without that, those pages return `unknown` with the reason.

Built by Cody Green, documenting the build in public.

MIT license.

## Use it as an AI tool (MCP)

Add this to your MCP client config (Claude Desktop, Claude Code, etc.):

```json
{ "mcpServers": { "hektiq-runner": { "command": "node", "args": ["/path/to/HektiqRunner/src/mcp.js"] } } }
```

The AI gets one tool, `get_facts(url, fields)`.

## Look at a page (screenshot checker)

Gives an AI eyes on a page. Takes phone and desktop screenshots in light and dark mode and lists problems a person would notice: sideways scrolling, broken images, script errors, hard-to-read text, tiny tap targets, buttons with no label.

```
npm i playwright && npx playwright install chromium
node src/look-cli.js https://example.com
```

Screenshots and `report.md` land in `shots/`. From your phone: GitHub → Actions → **Look at a page** → Run workflow, then results land in `results/look/`. As an MCP tool it's `look_at_page(url)`, which returns the issues plus the screenshot.
