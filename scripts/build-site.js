#!/usr/bin/env node
// Builds site/ from data/swift-codes.json: one JSON file per route, under v1/.
"use strict";

const fs = require("fs");
const path = require("path");

const [, , dataPath, metaPath, outDir] = process.argv;
if (!dataPath || !metaPath || !outDir) {
  console.error("usage: build-site.js <swift-codes.json> <meta.json> <out-dir>");
  process.exit(1);
}

const records = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

const RESERVED = new Set(["meta", "dump", "countries", "country", "index"]);
for (const r of records) {
  if (RESERVED.has(r.swiftCode.toLowerCase())) {
    throw new Error(`swiftCode "${r.swiftCode}" collides with a reserved path`);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
const v1Dir = path.join(outDir, "v1");
fs.mkdirSync(path.join(v1Dir, "country"), { recursive: true });
// Serve files as-is; skip Jekyll processing (slow over ~34k files, unneeded).
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

fs.writeFileSync(path.join(v1Dir, "dump.json"), JSON.stringify(records));
fs.writeFileSync(path.join(v1Dir, "meta.json"), JSON.stringify(meta, null, 2));

for (const r of records) {
  fs.writeFileSync(path.join(v1Dir, `${r.swiftCode}.json`), JSON.stringify(r));
}

const byCountry = new Map();
for (const r of records) {
  if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
  byCountry.get(r.countryCode).push(r);
}
const countryIndex = [];
for (const [code, banks] of byCountry) {
  fs.writeFileSync(path.join(v1Dir, "country", `${code}.json`), JSON.stringify(banks));
  countryIndex.push({ code, name: banks[0].country, bankCount: banks.length });
}
countryIndex.sort((a, b) => a.code.localeCompare(b.code));
fs.writeFileSync(path.join(v1Dir, "countries.json"), JSON.stringify(countryIndex, null, 2));

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
<p>Static mirror. SWIFT/BIC code &rarr; bank name + country. ${records.length.toLocaleString()} records, ${countryIndex.length} countries. No query params — every path is a real file.</p>
<table>
<tr><td><code>GET /v1/&lt;CODE&gt;.json</code></td><td>e.g. <a href="v1/DEUTDE.json">v1/DEUTDE.json</a></td></tr>
<tr><td><code>GET /v1/country/&lt;CC&gt;.json</code></td><td>e.g. <a href="v1/country/NP.json">v1/country/NP.json</a></td></tr>
<tr><td><code>GET /v1/countries.json</code></td><td>all ${countryIndex.length} countries</td></tr>
<tr><td><code>GET /v1/dump.json</code></td><td>all ${records.length} records</td></tr>
<tr><td><code>GET /v1/meta.json</code></td><td>dataset info</td></tr>
</table>
<footer>
  By <a href="https://github.com/alphaseneca">alphaseneca</a>.
  Data: <a href="https://github.com/lobax/banknames">lobax/banknames</a>, from the ISO 9362 Registration Authority's public BIC directory.
  <a href="https://github.com/alphaseneca/swift-lookup">Source</a>.
</footer>
`
);

console.log(`${records.length} code files, ${countryIndex.length} country files -> ${outDir}`);
