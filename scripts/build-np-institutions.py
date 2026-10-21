#!/usr/bin/env python3
"""Builds data/institutions-np.json from Nepal Rastra Bank's own BFI list.

NRB (Nepal Rastra Bank, the central bank) publishes a single dropdown at
nrb.org.np/bank-list/ covering every licensed Bank and Financial
Institution (BFI), with NRB's own numeric code per institution. This is
the regulator's own list -- unlike NCHL's clearing-house membership
(which excludes Class D microfinance institutions entirely), this
covers all four BFI classes: A (commercial banks), B (development
banks), C (finance companies), D (microfinance). NRB code prefix maps
to class: 11xxx=A, 12xxx=B, 13xxx=C, 14xxx=D.

The same dropdown also lists non-BFI categories NRB separately licenses
(payment service providers, card networks, infrastructure/leasing/
cooperative entities, foreign banks) -- deliberately excluded here,
since they're a different regulatory population from "Bank and
Financial Institution".

This is NOT merged with swift-codes.json: NRB codes and SWIFT/BIC codes
are different identifier systems for different purposes (domestic
licensing vs. international correspondent banking), and most
institutions here have no SWIFT code at all.
"""
import argparse
import json
import re
import sys
import urllib.request

NRB_URL = "https://www.nrb.org.np/bank-list/"
OPTION_RE = re.compile(r'<option\s+value="(\d+)"[^>]*>\s*([^<]+?)\s*</option>', re.S)
CLASS_BY_PREFIX = {"11": "A", "12": "B", "13": "C", "14": "D"}


def fetch_html(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def extract_institutions(html):
    records = []
    for nrb_code, name in OPTION_RE.findall(html):
        bfi_class = CLASS_BY_PREFIX.get(nrb_code[:2])
        if not bfi_class:
            continue  # not a Bank/Financial Institution (payment provider, etc.)
        records.append(
            {
                "institutionCode": "NP" + nrb_code,
                "nrbCode": nrb_code,
                "name": re.sub(r"\s+", " ", name.strip()),
                "class": bfi_class,
                "countryCode": "NP",
                "codeSystem": "NRB",
            }
        )
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    print(f"Fetching {NRB_URL} ...", file=sys.stderr)
    html = fetch_html(NRB_URL)

    records = extract_institutions(html)
    records.sort(key=lambda r: r["nrbCode"])

    with open(args.out, "w") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

    by_class = {}
    for r in records:
        by_class[r["class"]] = by_class.get(r["class"], 0) + 1
    print(f"  {len(records)} institutions: {by_class}", file=sys.stderr)


if __name__ == "__main__":
    main()
