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
This dataset keys on the first 6 characters (`BANK + COUNTRY`). Any 6, 8,
or 11-character code resolves by its first 6 characters.

Record shape:

```json
{"swiftCode":"DEUTDE","bankCode":"DEUT","countryCode":"DE","country":"Germany","bank":"DEUTSCHE BANK AG"}
```

### Limits

- 1 name per `bankCode+countryCode`. If a code maps to multiple entities
  upstream, only the first is kept. Example: `DEUTDE` → one specific
  Deutsche Bank entity, not necessarily the one you expect if that bank
  code is shared.
- Upstream last rebuilt 2026-07-01 (`v26.7`). Its monthly auto-rebuild has
  not run since.
- No city/branch-level data. A second dataset was checked for this and
  rejected: single commit, no license, no source.

Refresh:

```bash
npm run build-data
```

## Worker API

`worker/` — Cloudflare Worker. Dataset is bundled into the script (4.7 MB
raw / ~0.8 MB gzip; Workers allow 64 MB uncompressed per script, all
plans).

| Method & path | Returns |
|---|---|
| `GET /:code` | `{ swiftCode, bankCode, countryCode, country, bank }` or 404 |
| `GET /country/:code` | Banks in a country (ISO 3166-1 alpha-2) or 404 |
| `GET /countries` | `[{ code, name, bankCount }]` |
| `GET /search?q=&limit=` | Match on code, bank name, or country. `limit` default 25, max 200 |
| `GET /dump` | All 33,593 records |
| `GET /meta` | Dataset info |

CORS: `Access-Control-Allow-Origin: *` on every response.

### Rate limit

1,200 req / 60s per IP (`CF-Connecting-IP`). Cloudflare [Rate Limiting
binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
Over limit → `429` + `Retry-After: 60`.

Approximate, not a hard global cap: per-PoP, eventually consistent.

### Deploy

```bash
npm run build-data
cd worker
npx wrangler login
npx wrangler deploy
```

Name: `swift-lookup` (`worker/wrangler.toml`) → `swift-lookup.<subdomain>.workers.dev`.

Custom domain:

```toml
[[routes]]
pattern = "swiftlookup.dev/*"
custom_domain = true
```

Local dev: `npx wrangler dev`.

## Static site

`site/` — pre-generated JSON files. No query params; every path is a real
file.

```
site/
├── DEUTDE.json          { swiftCode, bankCode, countryCode, country, bank }
├── country/NP.json       banks in Nepal
├── countries.json        [{ code, name, bankCount }]
├── dump.json             all records
└── meta.json
```

No static `/search`. Fetch `dump.json` once, filter client-side.

### GitHub Pages

`.github/workflows/pages.yml` builds and deploys `site/` on push, monthly
schedule, and manual dispatch.

Setup: repo **Settings → Pages → Source → GitHub Actions**.

URL: `https://<user>.github.io/<repo>/`.

### Cloudflare Pages

Dashboard: **Workers & Pages → Create → Pages** → connect repo. Build
command `bash scripts/build-data.sh`, output dir `site`.

CLI:

```bash
npx wrangler pages deploy site --project-name=swift-lookup
```

URL: `https://swift-lookup.pages.dev/`.

## Layout

```
data/            generated: swift-codes.json, meta.json
scripts/
  build-data.sh    fetch + merge + build site
  merge.py         data/swift-codes.json builder
  build-site.js    site/ builder
site/            generated static output
worker/          Cloudflare Worker source
```

## License

Repo code: unlicensed (no license chosen yet).

| Source | License |
|---|---|
| [lobax/banknames](https://github.com/lobax/banknames) | MIT |
| [ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes) | MIT |
