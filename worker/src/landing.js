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
<p>SWIFT/BIC code &rarr; bank name + country. ${meta.recordCount.toLocaleString()} records, ${meta.countryCount} countries.</p>
<table>
<tr><td><code>GET /v1/countries/:code/banks?q=</code></td><td><b>Every bank in a country</b>, SWIFT + domestic combined, searchable</td></tr>
<tr><td><code>GET /v1/codes/:code</code></td><td>Resolve a SWIFT/BIC code</td></tr>
<tr><td><code>GET /v1/codes?country=&q=&limit=&offset=</code></td><td>List/search SWIFT/BIC codes only</td></tr>
<tr><td><code>GET /v1/institutions/:code</code></td><td>Resolve a domestic institution code (NRB, Nepal only)</td></tr>
<tr><td><code>GET /v1/institutions?country=&q=&limit=&offset=</code></td><td>List/search domestic institutions only &mdash; name &rarr; code</td></tr>
<tr><td><code>GET /v1/countries</code></td><td>All countries</td></tr>
<tr><td><code>GET /v1/countries/:code</code></td><td>Single country info</td></tr>
<tr><td><code>GET /v1/dump</code></td><td>Full SWIFT/BIC dataset, unpaginated</td></tr>
<tr><td><code>GET /v1/meta</code></td><td>Dataset info</td></tr>
</table>
<p>SWIFT/BIC and NRB codes are different identifier systems (international
vs. domestic Nepal). <code>/v1/countries/:code/banks</code> combines them
but doesn't deduplicate &mdash; a bank with both appears twice, tagged by
<code>codeSystem</code>.</p>
<footer>
  By <a href="https://github.com/alphaseneca">alphaseneca</a>.
  Data: <a href="https://github.com/lobax/banknames">lobax/banknames</a>, from the ISO 9362 Registration Authority's public BIC directory.
  <a href="https://github.com/alphaseneca/swift-lookup">Source</a>.
</footer>
`;
}
