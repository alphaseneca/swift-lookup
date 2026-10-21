#!/usr/bin/env node
// Builds site/ from data/swift-codes.json: a static mirror of the /v1 API,
// one JSON file per resource. Responses match the Worker's envelope shape
// ({ data } / { data, pagination }) so client code can treat either source
// the same way.
"use strict";

const fs = require("fs");
const path = require("path");

const [, , dataPath, metaPath, institutionsNpPath, outDir] = process.argv;
if (!dataPath || !metaPath || !institutionsNpPath || !outDir) {
  console.error(
    "usage: build-site.js <swift-codes.json> <meta.json> <institutions-np.json> <out-dir>"
  );
  process.exit(1);
}

const records = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const institutionsNp = JSON.parse(fs.readFileSync(institutionsNpPath, "utf8"));

fs.rmSync(outDir, { recursive: true, force: true });
const v1 = path.join(outDir, "v1");
fs.mkdirSync(path.join(v1, "codes"), { recursive: true });
fs.mkdirSync(path.join(v1, "countries"), { recursive: true });
fs.mkdirSync(path.join(v1, "institutions"), { recursive: true });
// Serve files as-is; skip Jekyll processing (slow over ~34k files, unneeded).
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

const writeJson = (p, body) => fs.writeFileSync(p, JSON.stringify(body));

writeJson(path.join(v1, "dump.json"), { data: records });
writeJson(path.join(v1, "meta.json"), { data: meta });

for (const r of records) {
  writeJson(path.join(v1, "codes", `${r.swiftCode}.json`), { data: r });
}

const byCountry = new Map();
for (const r of records) {
  if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
  byCountry.get(r.countryCode).push(r);
}

// Country-specific domestic institution directories (NCHL codes, not
// SWIFT/BIC). Currently just Nepal.
const institutionsByCountry = new Map([["NP", institutionsNp]]);

const toUnified = (country) => [
  ...(byCountry.get(country) || []).map((r) => ({
    name: r.bank,
    countryCode: r.countryCode,
    codeSystem: "SWIFT",
    code: r.swiftCode,
  })),
  ...(institutionsByCountry.get(country) || []).map((i) => ({
    name: i.name,
    countryCode: i.countryCode,
    codeSystem: "NCHL",
    code: i.institutionCode,
  })),
];

const allCountryCodes = new Set([...byCountry.keys(), ...institutionsByCountry.keys()]);
const countryList = [];
for (const code of allCountryCodes) {
  const banks = byCountry.get(code) || [];
  const name = banks[0]?.country ?? code;
  const total = banks.length;
  fs.mkdirSync(path.join(v1, "countries", code), { recursive: true });
  writeJson(path.join(v1, "countries", `${code}.json`), {
    data: { code, name, bankCount: total, hasInstitutionDirectory: institutionsByCountry.has(code) },
  });
  if (banks.length > 0) {
    writeJson(path.join(v1, "countries", code, "codes.json"), {
      data: banks,
      pagination: { total, limit: total, offset: 0, hasMore: false },
    });
  }
  const unified = toUnified(code);
  writeJson(path.join(v1, "countries", code, "banks.json"), {
    data: unified,
    pagination: { total: unified.length, limit: unified.length, offset: 0, hasMore: false },
  });
  countryList.push({ code, name, bankCount: total, hasInstitutionDirectory: institutionsByCountry.has(code) });
}
countryList.sort((a, b) => a.code.localeCompare(b.code));
writeJson(path.join(v1, "countries.json"), { data: countryList });

for (const inst of institutionsNp) {
  writeJson(path.join(v1, "institutions", `${inst.institutionCode}.json`), { data: inst });
}
writeJson(path.join(v1, "countries", "NP", "institutions.json"), {
  data: institutionsNp,
  pagination: { total: institutionsNp.length, limit: institutionsNp.length, offset: 0, hasMore: false },
});

fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html>
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
<p>Static mirror. SWIFT/BIC code &rarr; bank name + country. ${records.length.toLocaleString()} records, ${countryList.length} countries. No query params &mdash; every path is a real file.</p>
<table>
<tr><td><code>GET /v1/countries/&lt;CC&gt;/banks.json</code></td><td><b>Every bank in a country</b>, e.g. <a href="v1/countries/NP/banks.json">v1/countries/NP/banks.json</a> &mdash; SWIFT + domestic combined</td></tr>
<tr><td><code>GET /v1/codes/&lt;CODE&gt;.json</code></td><td>e.g. <a href="v1/codes/DEUTDE.json">v1/codes/DEUTDE.json</a></td></tr>
<tr><td><code>GET /v1/countries/&lt;CC&gt;/codes.json</code></td><td>SWIFT codes only, e.g. <a href="v1/countries/NP/codes.json">v1/countries/NP/codes.json</a></td></tr>
<tr><td><code>GET /v1/countries/&lt;CC&gt;.json</code></td><td>e.g. <a href="v1/countries/NP.json">v1/countries/NP.json</a></td></tr>
<tr><td><code>GET /v1/countries.json</code></td><td>all ${countryList.length} countries</td></tr>
<tr><td><code>GET /v1/dump.json</code></td><td>all ${records.length} SWIFT/BIC records</td></tr>
<tr><td><code>GET /v1/meta.json</code></td><td>dataset info</td></tr>
</table>
<p>Nepal only, separate from SWIFT &mdash; domestic NCHL institution codes (${institutionsNp.length} banks/finance companies, not microfinance):</p>
<table>
<tr><td><code>GET /v1/institutions/&lt;CODE&gt;.json</code></td><td>e.g. <a href="v1/institutions/NP0101.json">v1/institutions/NP0101.json</a></td></tr>
<tr><td><code>GET /v1/countries/NP/institutions.json</code></td><td>all ${institutionsNp.length} Nepal institutions</td></tr>
</table>
<p>SWIFT/BIC and NCHL are different identifier systems. The combined
<code>banks.json</code> doesn't deduplicate &mdash; a bank with both
appears twice, tagged by <code>codeSystem</code>.</p>
<footer>
  By <a href="https://github.com/alphaseneca">alphaseneca</a>.
  Data: <a href="https://github.com/lobax/banknames">lobax/banknames</a>, from the ISO 9362 Registration Authority's public BIC directory.
  <a href="https://github.com/alphaseneca/swift-lookup">Source</a>.
</footer>
`
);

console.log(`${records.length} code files, ${countryList.length} country files -> ${outDir}`);
