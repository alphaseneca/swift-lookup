# swiftlookup

Look up a bank or financial institution by any code it holds — SWIFT/BIC,
or a national registry like Nepal Rastra Bank's — without needing to know
which system issued it. Public, no API key, no setup.

```bash
curl https://swift-lookup.workers.dev/v1/institutions/DEUTDE
curl https://swift-lookup.workers.dev/v1/institutions/NP11003
curl "https://swift-lookup.workers.dev/v1/institutions?q=nabil"
```

```json
{"data":{"name":"DEUTSCHE BANK AG","countryCode":"DE","codes":{"SWIFT":"DEUTDE"}}}
```

Also served as a static JSON file mirror (GitHub Pages / Cloudflare
Pages) with identical response shapes — see [Static mirror](#static-mirror).

## Concepts

An **institution** is a real bank. It's identified by zero or more
**codes**, each issued by one **code system**. Two code systems exist
today: **SWIFT/BIC** (global, for international correspondent banking —
most banks don't have one) and **NRB** (Nepal Rastra Bank's own registry,
covering every licensed domestic institution there, SWIFT or not). An
institution can hold a code in one system, both, or — for most of the
world, where only SWIFT exists — exactly one.

You never need to know which system a code belongs to:
`GET /v1/institutions/:code` resolves either kind, and returns the same
institution either way.

## Endpoints

| Method & path | Returns |
|---|---|
| `GET /v1/institutions/:code` | Resolve one code, any system → `{ data: Institution }` or 404 |
| `GET /v1/institutions?country=&q=&limit=&offset=` | List or search → `{ data: [Institution], pagination }`. No params = page through all 33,676 |
| `GET /v1/code-systems` | What code systems exist and what each covers → `{ data: [CodeSystem] }` |
| `GET /v1/countries` | All countries → `{ data: [Country] }` |
| `GET /v1/countries/:code` | One country → `{ data: Country }` or 404 |
| `GET /v1/dump` | Every institution, unpaginated → `{ data: [Institution] }` |
| `GET /v1/meta` | Dataset provenance/build info |
| `GET /v1/openapi.json` | This reference as a real [OpenAPI 3.1](https://www.openapis.org/) document, unwrapped |

**Institution**: `{ name, countryCode, codes: { SWIFT?, NRB? }, attributes?: { NRB?: { class } } }`.
`codes` has one key per system this institution has a code in.
`attributes` carries system-specific facts that don't generalize across
systems (e.g. NRB's A/B/C/D institution class) — present only when a
system contributed one.

**CodeSystem**: `{ code, name, issuer, scope, recordCount }`. `scope` is
`"global"` or an ISO 3166-1 alpha-2 country code.

**Country**: `{ code, name, institutionCount, codeSystems }`.

`q` matches substrings in an institution's name or any of its codes,
case-insensitive. `country` filters by ISO 3166-1 alpha-2. `limit`
defaults to 25, max 200. `offset` defaults to 0.

## Errors

```json
{"error":{"code":"NOT_FOUND","message":"no institution found for code \"ZZZZZZ\""}}
```

`code` is one of `NOT_FOUND`, `BAD_REQUEST`, `METHOD_NOT_ALLOWED`, `RATE_LIMITED`.

## Rate limit & CORS

1,200 requests/60 seconds per IP. Over the limit: `429` with
`Retry-After: 60`. This is approximate (per edge location, eventually
consistent), not a hard global cap. CORS is fully open
(`Access-Control-Allow-Origin: *`) — call this directly from a browser.

## Data

| | |
|---|---|
| Institutions | 33,676 (33,593 SWIFT + 103 NRB, 20 held by both) |
| Countries | 232 |
| SWIFT/BIC source | [ISO 9362 Registration Authority](https://www.iso9362.org/) public registry, via [lobax/banknames](https://github.com/lobax/banknames) (MIT), last rebuilt 2026-07-01 |
| NRB source | [Nepal Rastra Bank](https://www.nrb.org.np/bank-list/) — all 4 licensed BFI classes (commercial, development, finance, microfinance) |

**Known limitations:**

- A SWIFT/BIC code's name reflects whichever entity the official registry
  listed first for that bank+country — if one bank code covers multiple
  legal entities (e.g. a group's retail bank and its asset-management
  arm), you may get a sibling entity's name. This is how the upstream
  registry data is structured, not a lookup bug.
- SWIFT/NRB cross-referencing (the data behind `codes` having both keys)
  is a **hand-verified, one-to-one mapping** for all 20 Nepali banks that
  have both — not name-matching. Automated matching was tried and
  produced real false positives, so it isn't used.
- No city/branch-level detail.

## License

Repo code: MIT ([LICENSE](LICENSE)). Data: [lobax/banknames](https://github.com/lobax/banknames)
(MIT) and [ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes)
(MIT); Nepal Rastra Bank's institution list is public with no license stated.

## Static mirror

Same data, same shapes, no server: `.json` appended to each path, no
query strings (so no `q`/`country`/pagination params — fetch `dump.json`
once and filter client-side for search).

| Dynamic | Static |
|---|---|
| `GET /v1/institutions/:code` | `GET /v1/institutions/<CODE>.json` |
| `GET /v1/countries/:code/institutions` (via `?country=`) | `GET /v1/countries/<CC>/institutions.json` |
| `GET /v1/countries/:code` | `GET /v1/countries/<CC>.json` |
| `GET /v1/countries` | `GET /v1/countries.json` |
| `GET /v1/code-systems` | `GET /v1/code-systems.json` |
| `GET /v1/dump` | `GET /v1/dump.json` |
| `GET /v1/meta` | `GET /v1/meta.json` |
| `GET /v1/openapi.json` | `GET /v1/openapi.json` |

Running this yourself (building the data, deploying to a Worker, hosting
the static mirror): [CONTRIBUTING.md](CONTRIBUTING.md). Changelog: [CHANGELOG.md](CHANGELOG.md).
