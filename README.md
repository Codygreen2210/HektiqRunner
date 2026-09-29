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

Fields: name, price, currency, availability, brand, sku, model, rating, reviews, address, phone, hours, url, image, description, author, date.

## Status

Early and small. Works on pages that publish structured data. Pages that don't will return `unknown` for now.

Built by Cody Green, documenting the build in public.

MIT license.
