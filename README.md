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

## API

Served two ways: `worker/` (Cloudflare Worker, dynamic) and `site/`
(pre-generated static JSON files, no query params). Both versioned under
`/v1`. `GET /` is a plain HTML landing page, not part of the API.

| Method & path | Returns | Static equivalent |
|---|---|---|
| `GET /v1` | API info | — |
| `GET /v1/:code` | `{ swiftCode, bankCode, countryCode, country, bank }` or 404 | `/v1/<CODE>.json` |
| `GET /v1/country/:code` | Banks in a country (ISO 3166-1 alpha-2) or 404 | `/v1/country/<CC>.json` |
| `GET /v1/countries` | `[{ code, name, bankCount }]` | `/v1/countries.json` |
| `GET /v1/search?q=&limit=` | Match on code, bank name, or country. `limit` default 25, max 200 | — |
| `GET /v1/dump` | All 33,593 records | `/v1/dump.json` |
| `GET /v1/meta` | Dataset info | `/v1/meta.json` |

CORS: `Access-Control-Allow-Origin: *`.

Rate limit (Worker only): 1,200 req / 60s per IP (`CF-Connecting-IP`).
Over limit → `429` + `Retry-After: 60`. Approximate, not a hard global cap.

## Layout

```
wrangler.toml    Worker config (deploy runs from repo root)
data/            swift-codes.json, meta.json — committed, refreshed by build-data.sh
scripts/
  build-data.sh    fetch + merge + build site
  merge.py         data/swift-codes.json builder
  build-site.js    site/ builder
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
