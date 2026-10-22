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

Must pass with zero errors or warnings. If you add a route or
response, add it to `worker/src/openapi.js` (the one source both
delivery modes serve) and re-lint.

## Design reference

**Resource model.** A bank is one `Institution` record with a `codes`
map (`{SWIFT, NRB, ...}`). Rationale: a bank's SWIFT code and national
registry code identify the same entity; treating them as separate
resources requires a dedicated endpoint to recombine them and produces
duplicate rows for any institution that has both.

**SWIFT↔NRB cross-referencing** uses a hand-verified, one-to-one table
(`SWIFT_CROSSWALK` in `build-np-institutions.py`), not automated name-
matching. Rationale: name-matching produces false positives (distinct
institutions sharing one word in their name) and misses matches
(spelling variants between sources). An incorrect automated match
silently attaches the wrong institution's code. `build-data.sh`
validates both directions of the table on every build — that each
`nrbCode` is still present in NRB's list, and each `swiftCode` is still
present in `swift-codes.json` — and fails the build if either has gone
stale.

**Adding a country**: use its central bank or equivalent regulator as
the primary source. An intermediary such as a clearing house may have
incomplete coverage — NRB's own list spans all 4 BFI classes; a
clearing-house list for the same country omits microfinance
institutions entirely.

Generic vs. not generic when adding a country:

- Generic (no code change required): `CODE_SYSTEMS_META`,
  `codeSystemIndexes`, and `lookupInstitution()`'s dispatch loop in
  `worker/src/index.js`. Add one entry to `CODE_SYSTEMS_META` and one
  matcher to `CODE_SYSTEM_MATCHERS` (that system's code format — exact
  match, truncate-to-N-chars, etc.); the dispatch loop requires no
  changes.
- Not generic: merging a country's source data into the canonical
  `institutions` array. Each regulator publishes data differently,
  requiring its own `build-<cc>-institutions.py` and merge block,
  following the `fromNrb`/`fromSwiftOnly` pattern. SWIFT cross-
  referencing, if applicable, requires a hand-verified crosswalk per
  the rule above, not an automated matching algorithm.

**Response format.** REST-ish JSON with `{ data }` / `{ data,
pagination }` / `{ error }` envelopes, not GraphQL, JSON:API, or RPC.
Rationale: the static mirror serves precomputed files and cannot
execute arbitrary queries, which rules out GraphQL's flexible client-
shaped queries. Records are flat (3–5 fields) with one relationship
(country → institutions), which does not justify JSON:API's linking/
compound-document machinery. Every operation is a lookup or filter,
which an RPC method-name layer would not add capability to.
