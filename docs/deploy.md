# Deploy

## Worker

`wrangler.toml` is at the repo root; `data/swift-codes.json` is committed
(not generated at deploy time) so a plain git-connected build works with
no custom build command.

Manual:

```bash
npx wrangler login
npx wrangler deploy
```

Git-connected (Cloudflare Workers Builds): connect the repo, leave root
directory as `/`, deploy command `npx wrangler deploy` (default). No
build command needed — the data file is already in the repo.

Name: `swift-lookup` (`wrangler.toml`) → `swift-lookup.<subdomain>.workers.dev`.

Custom domain (`wrangler.toml`):

```toml
[[routes]]
pattern = "swiftlookup.dev/*"
custom_domain = true
```

Local dev: `npx wrangler dev`.

To refresh the committed data before a deploy: `npm run build-data`, then
commit `data/swift-codes.json`.

## Static site (`site/`)

Not committed — built fresh each time from `data/`.

### GitHub Pages

- Workflow: `.github/workflows/pages.yml` (push to `main`, monthly, manual dispatch)
- One-time: repo **Settings → Pages → Source → GitHub Actions**
- URL: `https://<user>.github.io/<repo>/`

### Cloudflare Pages

Dashboard: **Workers & Pages → Create → Pages** → connect repo.
Build command: `bash scripts/build-data.sh`. Output dir: `site`.

CLI:

```bash
npx wrangler pages deploy site --project-name=swift-lookup
```

URL: `https://swift-lookup.pages.dev/`.
