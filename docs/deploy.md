# Deploy

## Worker

```bash
npm run build-data
cd worker
npx wrangler login
npx wrangler deploy
```

Name: `swift-lookup` (`worker/wrangler.toml`) → `swift-lookup.<subdomain>.workers.dev`.

Custom domain (`worker/wrangler.toml`):

```toml
[[routes]]
pattern = "swiftlookup.dev/*"
custom_domain = true
```

Local dev: `npx wrangler dev`.

## Static site (`site/`)

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
