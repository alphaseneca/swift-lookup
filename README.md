# swiftlookup

SWIFT/BIC code → bank name + country. See [CHANGELOG.md](CHANGELOG.md)
for what changed and why.

## Data

| | |
|---|---|
| Records | 33,593 |
| Countries | 232 |
| Source | [lobax/banknames](https://github.com/lobax/banknames) (MIT), release `v26.7` |
| Source origin | ISO 9362 Registration Authority public BIC directory (`iso9362.org`) |
| Country names | [ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes) (MIT) |

SWIFT/BIC format: `BANK(4) + COUNTRY(2) + LOCATION(2) [+ BRANCH(3)]`.
Dataset keys on the first 6 characters (`BANK + COUNTRY`). Any 6, 8, or
11-character code resolves by its first 6 characters.

Record shape:

```json
{"swiftCode":"DEUTDE","bankCode":"DEUT","countryCode":"DE","country":"Germany","bank":"DEUTSCHE BANK AG"}
```

Limits:

- **1 name per `bankCode+countryCode`.** A full SWIFT/BIC code also has a
  location code and optional branch code (chars 7–11), which can point to
  a different legal entity under the same bank+country, e.g. a bank's
  asset-management subsidiary vs. its main retail arm. The upstream data
  only keeps one name per 6-char prefix — whichever entity it saw first —
  so a lookup can occasionally return a sibling entity's name instead of
  the one you expected. Example: `HSBCGB` resolves to an HSBC asset-management
  entity, not "HSBC Bank plc", because that's what was first in the
  registry parse. Not a bug here — it's how the upstream dataset is built.
- Upstream last rebuilt 2026-07-01 (`v26.7`). Monthly auto-rebuild has not
  run since.
- No city/branch-level data.

Refresh:

```bash
npm run build-data
```

## Domestic institution directories (separate from SWIFT)

Not every bank has a SWIFT code — only institutions that do their own
cross-border correspondent banking get one. A country's full set of
licensed banks/financial institutions is a different, per-country dataset
with its own identifier scheme. Currently covers Nepal only.

| | |
|---|---|
| Country | Nepal (`NP`) |
| Records | 103 |
| Source | [Nepal Rastra Bank](https://www.nrb.org.np/bank-list/) (the central bank itself) |
| Code system | NRB's own numeric institution code, prefixed with country (`institutionCode`, e.g. `NP11001`) — **not** SWIFT/BIC |
| Coverage | All 4 licensed BFI classes: A=commercial (20), B=development (17), C=finance (16), D=microfinance (50). Matches NRB's published totals exactly. |

Record shape:

```json
{"institutionCode":"NP11001","nrbCode":"11001","name":"Nepal Bank Limited","class":"A","countryCode":"NP","codeSystem":"NRB","swiftCode":"NEBLNP"}
```

`swiftCode` is `null` for the ~80% of institutions with no SWIFT presence
(all of class B/C/D). For the 20 that have one, it comes from a **hand-
verified, one-to-one crosswalk** in `build-np-institutions.py`
(`SWIFT_CROSSWALK`), not a name-matching algorithm — automated matching
was tried and rejected: it produced false positives (e.g. "Global IME
Bank" matching its own unrelated "Global IME Laghubitta" microfinance
subsidiary on a shared word) and missed real matches ("Agricultural
Development Bank" vs. NRB's "Agriculture Development Bank"). A wrong
automated match would silently attach the wrong bank's SWIFT code —
worse than not having one.

3 of Nepal's 23 SWIFT entries have no NRB counterpart and stay
SWIFT-only (`institutionCode: null` in the combined view below):
`NRBLNP` (the central bank doesn't license itself), `SECTNP` (not a
bank), and `KDBLNP` (Kasthamandap Development Bank — has a real SWIFT
code but is genuinely absent from NRB's current list; possibly
renamed/merged, or NRB's list is incomplete — worth re-checking later).

An earlier version of this used NCHL's (the clearing house's) member list
instead, which only covers classes A–C (53 institutions) — NCHL has no
microfinance members in either of its clearing systems. NRB's own list,
pulled from the same page's HTML `<select>`, is the complete and
authoritative one. NRB's dropdown also lists non-BFI categories (payment
service providers, foreign banks, leasing companies, etc.) which are
deliberately excluded here — different regulatory population.

Adding another country: check its central bank first — every country
has one, and it's the same kind of authoritative source NRB is for
Nepal. Build a new `build-<cc>-institutions.py` script (format differs
per regulator, there's no standard) plus that country's own hand-
verified SWIFT crosswalk, and add one entry to the Worker's
`institutionsByCountry` map. Don't write a generic fuzzy-matching
algorithm — same reasoning as above.

## API

Served two ways: `worker/` (Cloudflare Worker, dynamic — filtering,
search, pagination) and `site/` (pre-generated static JSON files, one
file per resource, no query params). Both versioned under `/v1`. `GET /`
is a plain HTML landing page, not part of the API.

| Method & path | Returns | Static equivalent |
|---|---|---|
| `GET /v1` | API info | — |
| `GET /v1/countries/:code/banks?q=` | **Every bank in a country**, SWIFT + NRB combined, searchable by name | `/v1/countries/<CC>/banks.json` |
| `GET /v1/codes/:code` | `{ data: { swiftCode, bankCode, countryCode, country, bank } }` or 404 | `/v1/codes/<CODE>.json` |
| `GET /v1/codes?country=&q=&limit=&offset=` | SWIFT/BIC only. No params → first page of everything | — |
| `GET /v1/institutions/:code` | Domestic institution lookup (NRB, Nepal only) or 404 | `/v1/institutions/<CODE>.json` |
| `GET /v1/institutions?country=&q=&limit=&offset=` | Domestic institutions only. Both params optional — `q` searches by name or code | `/v1/countries/<CC>/institutions.json` |
| `GET /v1/countries` | `{ data: [{ code, name, bankCount, hasInstitutionDirectory }] }` | `/v1/countries.json` |
| `GET /v1/countries/:code` | Single country info, same shape | `/v1/countries/<CC>.json` |
| `GET /v1/dump` | `{ data: [...] }`, all 33,593 SWIFT/BIC records, unpaginated | `/v1/dump.json` |
| `GET /v1/meta` | `{ data: {...} }` | `/v1/meta.json` |

`/v1/countries/:code/banks` is the one to use for "give me all the banks
in country X" — **one row per bank**, not one per code system:

```json
{"name":"Nabil Bank Limited","countryCode":"NP","institutionCode":"NP11003","swiftCode":"NARBNP","class":"A"}
```

`institutionCode` and `swiftCode` are each `null` when that bank has no
code in that system. For a country with no domestic directory (anything
but Nepal right now), every row is just the SWIFT side,
`institutionCode: null`. This is correctness-critical, not cosmetic: it
depends on the hand-verified crosswalk above, not guesswork.
The two underlying endpoints stay available separately for consumers who
only want one code system.

`GET /v1/codes?country=NP&limit=200` gets the dynamic equivalent of the
static per-country file in one call for Nepal (23 codes). It's **not**
equivalent for a country with more than `MAX_LIMIT` (200) codes — GB has
3,588, US has 3,508 — where the static file is genuinely unpaginated but
the dynamic route needs multiple paginated requests (`offset` stepped by
200) to reconstruct the full list.

Errors: `{ error: { code, message } }` — `code` is one of `NOT_FOUND`,
`BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `RATE_LIMITED`.

Pagination: `limit` default 25, max 200. `offset` default 0.
`pagination: { total, limit, offset, hasMore }`.

CORS: `Access-Control-Allow-Origin: *`.

Rate limit (Worker only): 1,200 req / 60s per IP (`CF-Connecting-IP`).
Over limit → `429` + `Retry-After: 60`. Approximate, not a hard global cap.

## Layout

```
wrangler.toml    Worker config (deploy runs from repo root)
data/            committed, refreshed by build-data.sh
  swift-codes.json, meta.json
  institutions-np.json
scripts/
  build-data.sh             fetch + merge + build site
  merge.py                  data/swift-codes.json builder
  build-np-institutions.py  data/institutions-np.json builder (stdlib only)
  build-site.js             site/ builder
site/            generated static output, not committed
worker/
  src/index.js     routing
  src/landing.js   HTML landing page
```

## License

Repo code: MIT ([LICENSE](LICENSE)).

| Source | License |
|---|---|
| [lobax/banknames](https://github.com/lobax/banknames) | MIT |
| [ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes) | MIT |
| [Nepal Rastra Bank](https://www.nrb.org.np/bank-list/) BFI list | public, no explicit license stated |
