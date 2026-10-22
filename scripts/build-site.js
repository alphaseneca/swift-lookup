#!/usr/bin/env node
// Builds site/ from data/: a static mirror of the /v1 API, one JSON file
// per resource. Responses match the Worker's envelope shape
// ({ data } / { data, pagination }) so client code can treat either
// source the same way. Mirrors worker/src/index.js's merge logic
// exactly -- see the comment there for the domain model this follows.
"use strict";

const fs = require("fs");
const path = require("path");
const openApiSpec = require("../worker/src/openapi.js");

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

const CODE_SYSTEMS_META = [
  { code: "SWIFT", name: "SWIFT/BIC", issuer: "ISO 9362 Registration Authority (iso9362.org)", scope: "global" },
  { code: "NRB", name: "Nepal Rastra Bank institution code", issuer: "Nepal Rastra Bank", scope: "NP" },
];

const claimedSwiftCodes = new Set(institutionsNp.map((i) => i.swiftCode).filter(Boolean));

const fromNrb = institutionsNp.map((i) => ({
  name: i.name,
  countryCode: i.countryCode,
  codes: i.swiftCode ? { NRB: i.institutionCode, SWIFT: i.swiftCode } : { NRB: i.institutionCode },
  attributes: { NRB: { class: i.class } },
}));

const fromSwiftOnly = records
  .filter((r) => !claimedSwiftCodes.has(r.swiftCode))
  .map((r) => ({ name: r.bank, countryCode: r.countryCode, codes: { SWIFT: r.swiftCode } }));

const institutions = [...fromNrb, ...fromSwiftOnly].sort(
  (a, b) => a.countryCode.localeCompare(b.countryCode) || a.name.localeCompare(b.name)
);

const countryNames = new Map();
for (const r of records) countryNames.set(r.countryCode, r.country);

const byCountry = new Map();
for (const inst of institutions) {
  if (!byCountry.has(inst.countryCode)) byCountry.set(inst.countryCode, []);
  byCountry.get(inst.countryCode).push(inst);
}

const codeSystemCounts = {};
for (const inst of institutions) {
  for (const system of Object.keys(inst.codes)) codeSystemCounts[system] = (codeSystemCounts[system] || 0) + 1;
}
const codeSystemsList = CODE_SYSTEMS_META.map((cs) => ({ ...cs, recordCount: codeSystemCounts[cs.code] || 0 }));

fs.rmSync(outDir, { recursive: true, force: true });
const v1 = path.join(outDir, "v1");
fs.mkdirSync(path.join(v1, "institutions"), { recursive: true });
fs.mkdirSync(path.join(v1, "countries"), { recursive: true });
// Serve files as-is; skip Jekyll processing (slow over ~34k files, unneeded).
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

const writeJson = (p, body) => fs.writeFileSync(p, JSON.stringify(body));

writeJson(path.join(v1, "dump.json"), { data: institutions });
writeJson(path.join(v1, "meta.json"), {
  data: { ...meta, recordCount: records.length, countryCount: byCountry.size, institutionCount: institutions.length },
});
writeJson(path.join(v1, "code-systems.json"), { data: codeSystemsList });
// Unwrapped, unlike every other file here: standard OpenAPI tooling
// expects the spec document itself at the path, not nested under "data".
writeJson(path.join(v1, "openapi.json"), openApiSpec);

for (const inst of institutions) {
  const body = { data: inst };
  if (inst.codes.SWIFT) writeJson(path.join(v1, "institutions", `${inst.codes.SWIFT}.json`), body);
  if (inst.codes.NRB) writeJson(path.join(v1, "institutions", `${inst.codes.NRB}.json`), body);
}

const countryList = [];
for (const [code, insts] of byCountry) {
  const systems = new Set();
  for (const inst of insts) for (const s of Object.keys(inst.codes)) systems.add(s);
  const entry = { code, name: countryNames.get(code) || code, institutionCount: insts.length, codeSystems: [...systems].sort() };
  fs.mkdirSync(path.join(v1, "countries", code), { recursive: true });
  writeJson(path.join(v1, "countries", `${code}.json`), { data: entry });
  writeJson(path.join(v1, "countries", code, "institutions.json"), {
    data: insts,
    pagination: { total: insts.length, limit: insts.length, offset: 0, hasMore: false },
  });
  countryList.push(entry);
}
countryList.sort((a, b) => a.code.localeCompare(b.code));
writeJson(path.join(v1, "countries.json"), { data: countryList });

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
<p>Static mirror. Look up a bank by any code it holds &mdash; SWIFT/BIC
or a national registry like Nepal Rastra Bank's &mdash; without caring
which. ${institutions.length.toLocaleString()} institutions, ${countryList.length} countries.
No query params here &mdash; every path is a real file; for search, fetch
<code>dump.json</code> once and filter client-side.</p>
<table>
<tr><td><code>GET /v1/institutions/&lt;CODE&gt;.json</code></td><td>e.g. <a href="v1/institutions/DEUTDE.json">v1/institutions/DEUTDE.json</a></td></tr>
<tr><td><code>GET /v1/countries/&lt;CC&gt;/institutions.json</code></td><td>e.g. <a href="v1/countries/NP/institutions.json">v1/countries/NP/institutions.json</a></td></tr>
<tr><td><code>GET /v1/countries/&lt;CC&gt;.json</code></td><td>e.g. <a href="v1/countries/NP.json">v1/countries/NP.json</a></td></tr>
<tr><td><code>GET /v1/countries.json</code></td><td>all ${countryList.length} countries</td></tr>
<tr><td><code>GET /v1/code-systems.json</code></td><td>what code systems exist</td></tr>
<tr><td><code>GET /v1/dump.json</code></td><td>all ${institutions.length} institutions</td></tr>
<tr><td><code>GET /v1/meta.json</code></td><td>dataset info</td></tr>
<tr><td><code>GET /v1/openapi.json</code></td><td>machine-readable <a href="https://www.openapis.org/">OpenAPI 3.1</a> spec</td></tr>
</table>
<footer>
  <a href="https://github.com/alphaseneca/swift-lookup">Source, data provenance, and license</a>.
</footer>
`
);

console.log(`${institutions.length} institutions, ${countryList.length} countries -> ${outDir}`);
