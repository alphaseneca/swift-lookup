# swiftlookup

SWIFT/BIC code → bank name + country.

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
{"institutionCode":"NP11001","nrbCode":"11001","name":"Nepal Bank Limited","class":"A","countryCode":"NP","codeSystem":"NRB"}
```

An earlier version of this used NCHL's (the clearing house's) member list
instead, which only covers classes A–C (53 institutions) — NCHL has no
microfinance members in either of its clearing systems. NRB's own list,
pulled from the same page's HTML `<select>`, is the complete and
authoritative one. NRB's dropdown also lists non-BFI categories (payment
service providers, foreign banks, leasing companies, etc.) which are
deliberately excluded here — different regulatory population.

Adding another country means a new `build-<cc>-institutions.py` script
(format differs per regulator/clearing house — there's no standard) and
one entry in the Worker's `institutionsByCountry` map.

## API

Served two ways: `worker/` (Cloudflare Worker, dynamic — filtering,
search, pagination) and `site/` (pre-generated static JSON files, one
file per resource, no query params). Both versioned under `/v1`. `GET /`
is a plain HTML landing page, not part of the API.

| Method & path | Returns | Static equivalent |
|---|---|---|
| `GET /v1` | API info | — |
| `GET /v1/countries/:code/banks` | **Every bank in a country**, SWIFT + NRB combined, paginated | `/v1/countries/<CC>/banks.json` |
| `GET /v1/codes/:code` | `{ data: { swiftCode, bankCode, countryCode, country, bank } }` or 404 | `/v1/codes/<CODE>.json` |
| `GET /v1/codes?country=&q=&limit=&offset=` | SWIFT/BIC only. No params → first page of everything | — |
| `GET /v1/institutions/:code` | Domestic institution lookup (NRB, Nepal only) or 404 | `/v1/institutions/<CODE>.json` |
| `GET /v1/institutions?country=&limit=&offset=` | Domestic institutions only. `country` required | `/v1/countries/<CC>/institutions.json` |
| `GET /v1/countries` | `{ data: [{ code, name, bankCount, hasInstitutionDirectory }] }` | `/v1/countries.json` |
| `GET /v1/countries/:code` | Single country info, same shape | `/v1/countries/<CC>.json` |
| `GET /v1/dump` | `{ data: [...] }`, all 33,593 SWIFT/BIC records, unpaginated | `/v1/dump.json` |
| `GET /v1/meta` | `{ data: {...} }` | `/v1/meta.json` |

`/v1/countries/:code/banks` is the one to use for "give me all the banks
in country X" — it merges `/v1/codes?country=X` and
`/v1/institutions?country=X` into one list, each entry shaped
`{ name, countryCode, codeSystem, code }` where `codeSystem` is `"SWIFT"`
or `"NRB"`. **Not deduplicated**: a bank holding both a SWIFT code and an
NRB code (common for Nepal's commercial banks) appears once per system,
since there's no verified crosswalk between the two identifier spaces.
The two underlying endpoints stay available separately for consumers who
only want one code system.

Dynamic-only equivalent of the static country-codes file:
`GET /v1/codes?country=NP&limit=200`.

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
