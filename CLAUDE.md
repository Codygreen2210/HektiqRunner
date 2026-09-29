# Hektiq Runner — rules for Claude

Goal: hand AI agents only the facts they ask for from a webpage, cheapest method first, with a source for every fact. Say "unknown" instead of guessing.

## Keep usage low (Cody's usage is limited)
- Read REPO_MAP.md first. Don't read whole files when Grep finds the spot.
- Small diff edits (Edit tool), not full-file rewrites.
- Tests: `npm test` (quiet, dot output). Only dig into output when something fails.
- No new dependencies without a clear reason. Plain JS ESM, Node 20+, no build step.

## Rules
- Never delete files, branches, or anything in connected apps. Point it out and let Cody decide.
- Branches + PRs for changes after the first commit; Cody merges.
- Retrieval order: JSON-LD → meta tags → HTML → (later) browser. Never call an AI model when free structured data answers it.
- Every fact carries `method`, `path`, `confidence`. Missing = `unknown` with a reason.
- Plain, humble wording in docs. No hype, no "ship" language.

## Known limits
- The cloud sandbox blocks most outside sites (HTTP 403 from the proxy). Test with fixtures in `test/fixtures/`; live testing happens on Cody's laptop.
