export function renderLanding(meta) {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>swiftlookup</title>
<style>
  body{font:15px/1.6 -apple-system,system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 1.5rem;color:#1a1a1a}
  code{background:#f2f2f2;padding:.15em .4em;border-radius:4px;font-size:.9em}
  table{width:100%;border-collapse:collapse;margin:1.5rem 0}
  td{padding:.4rem 0;border-bottom:1px solid #eee;vertical-align:top}
  td:first-child{font-family:monospace;white-space:nowrap;padding-right:1rem}
  a{color:#0969da;text-decoration:none}
  a:hover{text-decoration:underline}
  footer{margin-top:3rem;color:#666;font-size:.9em}
</style>
<h1>swiftlookup</h1>
<p>Look up a bank by any code it holds &mdash; SWIFT/BIC or a national
registry like Nepal Rastra Bank's &mdash; without caring which.
${meta.institutionCount.toLocaleString()} institutions, ${meta.countryCount} countries.</p>
<table>
<tr><td><code>GET /v1/institutions/:code</code></td><td>Resolve any code, any system</td></tr>
<tr><td><code>GET /v1/institutions?country=&q=&limit=&offset=</code></td><td>List or search institutions</td></tr>
<tr><td><code>GET /v1/code-systems</code></td><td>What code systems exist, and what each covers</td></tr>
<tr><td><code>GET /v1/countries</code></td><td>All countries</td></tr>
<tr><td><code>GET /v1/countries/:code</code></td><td>Single country info</td></tr>
<tr><td><code>GET /v1/dump</code></td><td>Every institution, unpaginated</td></tr>
<tr><td><code>GET /v1/meta</code></td><td>Dataset info</td></tr>
<tr><td><code>GET /v1/openapi.json</code></td><td>Machine-readable <a href="https://www.openapis.org/">OpenAPI 3.1</a> spec of everything above</td></tr>
</table>
<p>Every response is JSON: <code>{ data }</code> for one institution,
<code>{ data, pagination }</code> for a list, <code>{ error: { code,
message } }</code> on failure. Public, no key required, 1,200
requests/60s per IP.</p>
<footer>
  <a href="https://github.com/alphaseneca/swift-lookup">Source, data provenance, and license</a>.
</footer>
`;
}
