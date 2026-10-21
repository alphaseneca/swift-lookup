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

- 1 name per `bankCode+countryCode`. If a code maps to multiple entities
  upstream, only the first is kept.
- Upstream last rebuilt 2026-07-01 (`v26.7`). Monthly auto-rebuild has not
  run since.
- No city/branch-level data.

Refresh:

```bash
npm run build-data
```

## API

Served two ways: `worker/` (Cloudflare Worker, dynamic) and `site/`
(pre-generated static JSON files, no query params).

| Method & path | Returns | Static equivalent |
|---|---|---|
| `GET /:code` | `{ swiftCode, bankCode, countryCode, country, bank }` or 404 | `/<CODE>.json` |
| `GET /country/:code` | Banks in a country (ISO 3166-1 alpha-2) or 404 | `/country/<CC>.json` |
| `GET /countries` | `[{ code, name, bankCount }]` | `/countries.json` |
| `GET /search?q=&limit=` | Match on code, bank name, or country. `limit` default 25, max 200 | — |
| `GET /dump` | All 33,593 records | `/dump.json` |
| `GET /meta` | Dataset info | `/meta.json` |

CORS: `Access-Control-Allow-Origin: *`.

Rate limit (Worker only): 1,200 req / 60s per IP (`CF-Connecting-IP`).
Over limit → `429` + `Retry-After: 60`. Approximate, not a hard global cap.

Deployment: [docs/deploy.md](docs/deploy.md).

## Layout

```
data/            generated: swift-codes.json, meta.json
scripts/
  build-data.sh    fetch + merge + build site
  merge.py         data/swift-codes.json builder
  build-site.js    site/ builder
site/            generated static output
worker/          Cloudflare Worker source
docs/deploy.md   deployment steps
```

## License

Repo code: MIT ([LICENSE](LICENSE)).

| Source | License |
|---|---|
| [lobax/banknames](https://github.com/lobax/banknames) | MIT |
| [ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes) | MIT |
