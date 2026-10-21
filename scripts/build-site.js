#!/usr/bin/env node
// Builds site/ from data/swift-codes.json: one JSON file per route.
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
fs.mkdirSync(path.join(outDir, "country"), { recursive: true });
// Serve files as-is; skip Jekyll processing (slow over ~34k files, unneeded).
fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

fs.writeFileSync(path.join(outDir, "dump.json"), JSON.stringify(records));
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

for (const r of records) {
  fs.writeFileSync(path.join(outDir, `${r.swiftCode}.json`), JSON.stringify(r));
}

const byCountry = new Map();
for (const r of records) {
  if (!byCountry.has(r.countryCode)) byCountry.set(r.countryCode, []);
  byCountry.get(r.countryCode).push(r);
}
const countryIndex = [];
for (const [code, banks] of byCountry) {
  fs.writeFileSync(path.join(outDir, "country", `${code}.json`), JSON.stringify(banks));
  countryIndex.push({ code, name: banks[0].country, bankCount: banks.length });
}
countryIndex.sort((a, b) => a.code.localeCompare(b.code));
fs.writeFileSync(path.join(outDir, "countries.json"), JSON.stringify(countryIndex, null, 2));

fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html>
<meta charset="utf-8">
<title>swiftlookup</title>
<style>body{font:14px/1.5 monospace;max-width:640px;margin:3rem auto;padding:0 1rem}</style>
<h1>swiftlookup</h1>
<p>Static. No query params. Built ${meta.builtAt}.</p>
<ul>
<li><code>GET /&lt;CODE&gt;.json</code> — e.g. <a href="DEUTDE.json">DEUTDE.json</a></li>
<li><code>GET /country/&lt;CC&gt;.json</code> — e.g. <a href="country/NP.json">country/NP.json</a></li>
<li><code>GET /countries.json</code> — ${countryIndex.length} countries</li>
<li><code>GET /dump.json</code> — all ${records.length} records</li>
<li><code>GET /meta.json</code></li>
</ul>
`
);

console.log(`${records.length} code files, ${countryIndex.length} country files -> ${outDir}`);
