# Contributing

For using the API, see [README.md](README.md). This is for building,
running, deploying, or extending it.

## Layout

```
wrangler.toml    Worker config (deploy runs from repo root)
data/            committed, refreshed by build-data.sh
  swift-codes.json, meta.json     SWIFT/BIC source data
  institutions-np.json            Nepal Rastra Bank source data
scripts/
  build-data.sh             fetch + merge + build site
  merge.py                  data/swift-codes.json builder
  build-np-institutions.py  data/institutions-np.json builder (stdlib only)
  build-site.js             site/ builder; also builds the Institution/
                             CodeSystem merge for the static mirror
site/            generated static output, not committed
worker/
  src/index.js     routing; builds the same Institution/CodeSystem merge
                   dynamically
  src/landing.js   HTML landing page (served at /)
  src/openapi.js   OpenAPI 3.1 spec — single source for both delivery
                   modes, served at /v1/openapi.json
```

`data/` is committed specifically so a git-connected Cloudflare Workers
Build (`npx wrangler deploy` from the repo root, no custom build step)
works with zero configuration.

## Refreshing the data

```bash
npm run build-data
```

Pulls the latest `lobax/banknames` release and Nepal Rastra Bank's
current list, rebuilds `data/*.json` and `site/`. Commit the result.

## Deploying

**Worker:**

```bash
npx wrangler login   # one-time
npx wrangler deploy
```

Or git-connected (Cloudflare Workers Builds): connect this repo, leave
root directory as `/`, deploy command `npx wrangler deploy` (the
default) — no build command needed, since `data/` is already committed.

**Static mirror:**

- GitHub Pages: `.github/workflows/pages.yml` builds and deploys on
  push/schedule/manual dispatch. One-time: repo **Settings → Pages →
  Source → GitHub Actions**.
- Cloudflare Pages: connect the repo, build command
  `bash scripts/build-data.sh`, output directory `site`. Or
  `npx wrangler pages deploy site --project-name=<name>`.

## Validating the OpenAPI spec

```bash
npx @redocly/cli lint site/v1/openapi.json
```

Should always come back clean. If you add a route or response, add it
to `worker/src/openapi.js` (the one source both delivery modes serve)
and re-lint.

## Design decisions worth knowing before you change something

**The Institution/CodeSystem model, not parallel per-system endpoints.**
A bank is one `Institution` with a `codes` map (`{SWIFT, NRB, ...}`), not
two unrelated records you have to merge yourself. This replaced an
earlier version with separate `/v1/codes` and `/v1/institutions`
endpoints plus a bolted-on `/v1/countries/:code/banks` to merge them —
that accreted through incremental patches rather than being designed up
front, and it showed (two result rows for one bank, redundant ways to
get "banks in a country"). See CHANGELOG.md for the blow-by-blow.

**SWIFT↔NRB cross-referencing is a hand-verified, one-to-one table**
(`SWIFT_CROSSWALK` in `build-np-institutions.py`), not computed by name-
matching. Automated matching was tried and rejected: it produced real
false positives (two different banks sharing one word in their name both
matching) and missed real matches (spelling variants). A wrong automated
match silently attaches the wrong bank's code — worse than not having
one. `build-data.sh` validates both directions of the table (that every
`nrbCode` is still in NRB's list, and every `swiftCode` is still in
`swift-codes.json`) and fails the build if either goes stale.

**Adding another country**: check its central bank or equivalent
regulator first — every country has one, and it's the authoritative
source the same way NRB is for Nepal (an intermediary like a clearing
house may look complete and not be — NCHL's lists turned out to exclude
microfinance entirely).

What's actually generic (no code change) vs. what isn't:

- `CODE_SYSTEMS_META`, `codeSystemIndexes`, and `lookupInstitution()`'s
  dispatch loop in `worker/src/index.js` are generic. Add one entry to
  `CODE_SYSTEMS_META`, one matcher to `CODE_SYSTEM_MATCHERS` describing
  that system's code format (exact match, truncate-to-N-chars,
  whatever it needs — this part is inherently system-specific, formats
  differ by regulator), and the lookup/dispatch logic itself never
  changes.
- Merging that country's source data into the canonical `institutions`
  array is **not** generic and can't be — every regulator publishes
  differently, so it needs its own `build-<cc>-institutions.py` and its
  own merge block (the `fromNrb`/`fromSwiftOnly` pattern), the same way
  NRB's is specific to NRB's shape. If it also has SWIFT coverage, that
  means a hand-verified crosswalk, same as Nepal's — never a generic
  fuzzy-matching algorithm, same reasoning as above.

**Why REST-ish JSON, not GraphQL/JSON:API/RPC.** Covered by an
independent design review — see CHANGELOG.md. Short version: the static
mirror can't serve arbitrary queries without a server, which rules out
anything built around flexible client-shaped queries (GraphQL); the
response shape is flat 3-5 field records with one real relationship
(country → institutions), which doesn't justify JSON:API's linking/
compound-document machinery; and every operation here is already a
simple lookup or filter, which an RPC method-name layer wouldn't add
capability to.
