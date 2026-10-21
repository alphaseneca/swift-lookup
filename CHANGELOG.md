# Changelog

Factual record of changes, most recent first. See [README.md](README.md)
for current behavior; this file is for what changed and why.

## 2026-10-22 (2)

Independent design review (a fresh agent given full context, asked to
find real problems, not rubber-stamp). Fixed what it found:

- `/v1/countries` (and `/v1/countries/:code`, `/v1/countries/:code/banks`)
  were built from SWIFT data only — a country with a domestic institution
  directory but no SWIFT codes would 404 on all three, even though the
  static site builder already unioned both sources correctly. The Worker
  now matches it.
- `/v1/institutions?country=` 404'd for a country with no directory,
  while the equivalent `/v1/codes?country=` returned an empty page —
  inconsistent for the same kind of request (a query filter, not a
  resource path). Both now return an empty page; 404 stays reserved for
  `/v1/countries/:code`, where the country *is* the resource.
- Error responses (404, 429, etc.) inherited the same 1-hour
  `Cache-Control` as successful ones, so a cache could keep serving a
  stale 429 or 404 after it stopped being true. Errors now send
  `Cache-Control: no-store`.
- `/v1/meta` hardcoded its fields by hand instead of reading
  `data/meta.json`, so it was missing `builtAt` and could drift from
  whatever `merge.py` actually produces. Now spreads the real file.
- `?limit=0` was silently coerced to the default (25), since
  `parseInt(...) || DEFAULT` treats `0` as falsy. Fixed to check for
  `NaN` specifically.
- Added an `Allow` header on 405s and `Access-Control-Max-Age` on
  `OPTIONS` preflights (browsers can skip repeat preflights for a day).
- `build-data.sh` now also checks the SWIFT side of the NRB↔SWIFT
  crosswalk stays valid (it already checked the NRB side) — if
  `lobax/banknames` ever drops/renames one of the 20 SWIFT codes the
  crosswalk points to, the build fails loudly instead of silently
  serving a dead code.
- README's claim that `/v1/codes?country=&limit=200` is the dynamic
  equivalent of the static per-country file was only true for countries
  under the 200-record page cap — false for GB (3,588 codes) and
  similar. Reworded to say so.

Reviewed and intentionally left as-is: offset-based pagination (dataset
is an immutable per-deployment snapshot, sorted, so the usual concurrent-
write argument against it doesn't apply), fully open CORS (public
reference data, orthogonal to the per-IP rate limiter), bundling the
dataset into the Worker script rather than a database, and the
resource-oriented REST design over GraphQL/RPC/JSON:API (the static
mirror can't serve arbitrary queries without a server, which rules out
anything that needs flexible client-shaped queries).

## 2026-10-22

- `GET /v1/countries/:code/banks` returns one row per bank
  (`institutionCode` / `swiftCode`, either `null`), not one row per code
  system. Built from a hand-verified SWIFT↔NRB crosswalk
  (`SWIFT_CROSSWALK` in `build-np-institutions.py`), not name-matching —
  automated name-matching was tried first and rejected: it produced false
  positives (e.g. "Global IME Bank" matching its own unrelated "Global
  IME Laghubitta" microfinance subsidiary) and missed real matches
  ("Agricultural" vs. NRB's "Agriculture" Development Bank).
- Added `?q=` name/code search to `/v1/institutions`; `country` is now
  an optional filter there instead of required.
- Replaced the Nepal institution source: NCHL's clearing-house member
  list (53 institutions, commercial/development/finance only) with
  Nepal Rastra Bank's own published list (103, all 4 BFI classes
  including microfinance). NCHL's cheque-clearing and interbank-payment
  member lists were checked and found identical to each other — neither
  includes microfinance institutions at all.
- Added `GET /v1/countries/:code/banks`, combining SWIFT and domestic
  codes for a country in one call.
- Added a Nepal domestic institution directory as its own resource
  (`/v1/institutions`), separate from SWIFT/BIC — not every bank has a
  SWIFT code, only ones that do their own cross-border correspondent
  banking.
- Redesigned the API as resource-oriented (`/v1/codes`, `/v1/countries`,
  `/v1/institutions`) with consistent response envelopes
  (`{ data }` / `{ data, pagination }` / `{ error: { code, message } }`)
  and pagination. Dropped the earlier bare `/v1/:code` catch-all route,
  which shared a namespace with `meta`/`dump`/`search` and needed a
  reserved-word workaround.
- Versioned the API under `/v1`; added an HTML landing page at `/`;
  restored data-source attribution in `/v1/meta` (it had been dropped
  entirely in an earlier pass, then re-added alongside author credit).
- Fixed `wrangler.toml` warnings (`workers_dev`, `preview_urls` not set
  explicitly); removed the upstream data-source name from the live
  `/v1/meta` response (kept only in README/LICENSE, where attribution is
  actually required).
- Moved `wrangler.toml` to the repo root and committed `data/`, so a
  git-connected Cloudflare Workers Build (which runs `npx wrangler
  deploy` from the repo root with no custom build step) works without
  extra configuration.
- `build-data.sh` now reports the actual HTTP status and response body
  on a fetch failure instead of a bare non-zero exit; authenticates
  GitHub API calls in CI to avoid the 60/hour anonymous rate limit
  shared across GitHub-hosted runners.
- Dropped `docs/deploy.md` and the deployment detail it held; the
  README covers data, API shape, and layout only.
- Initial build: Cloudflare Worker + static JSON mirror for SWIFT/BIC
  code lookup, sourced from `lobax/banknames` (MIT), derived from the
  ISO 9362 Registration Authority's public BIC directory.
