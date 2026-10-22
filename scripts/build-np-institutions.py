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

NRB codes and SWIFT/BIC codes are different identifier systems for
different purposes (domestic licensing vs. international correspondent
banking). Most institutions here (all of class B/C/D) have no SWIFT
code at all, since only commercial banks do their own cross-border
correspondent banking.

SWIFT_CROSSWALK below is a hand-verified, one-to-one mapping from NRB
code to SWIFT code, checked by hand against both source lists as of
2026-10-21. Automated name-matching is not used: it produces false
positives (e.g. "Global IME Bank" and the unrelated "Global IME
Laghubitta" microfinance subsidiary match on a shared word) and misses
real matches (SWIFT: "Agricultural Development Bank"; NRB: "Agriculture
Development Bank").

Not present in NRB's current list, and therefore SWIFT-only with no
institutionCode counterpart (see worker/src/index.js, CODE_SYSTEM_MATCHERS):
  - NRBLNP (Nepal Rastra Bank): the central bank regulates BFIs; it is
    not itself a licensed BFI.
  - SECTNP (Samsung Nepal Services Private Limited): not a bank.
  - KDBLNP (Kasthamandap Development Bank): holds a SWIFT code but is
    absent from NRB's current list. Possibly renamed or merged since,
    or NRB's list is incomplete; subject to re-verification.

To add another country: use its central bank or equivalent regulator as
the primary source -- the authoritative list of licensed institutions,
the same role NRB fills for Nepal. Build that country's own hand-
verified crosswalk following this pattern. Do not use an automated
matching algorithm, per the rationale above.
"""
import argparse
import json
import re
import sys
import urllib.request

NRB_URL = "https://www.nrb.org.np/bank-list/"
OPTION_RE = re.compile(r'<option\s+value="(\d+)"[^>]*>\s*([^<]+?)\s*</option>', re.S)
CLASS_BY_PREFIX = {"11": "A", "12": "B", "13": "C", "14": "D"}

# nrbCode -> swiftCode (first 6 chars of the Nepali bank's SWIFT/BIC).
# Covers all 20 Class A commercial banks that have one; nothing else does.
SWIFT_CROSSWALK = {
    "11001": "NEBLNP",  # Nepal Bank Limited
    "11002": "RBBANP",  # Rastriya Banijya Bank
    "11003": "NARBNP",  # Nabil Bank Limited
    "11004": "NIBLNP",  # Nepal Investment Mega Bank Limited
    "11005": "SCBLNP",  # Standard Chartered Bank Nepal Limited
    "11006": "HIMANP",  # Himalayan Bank Limited
    "11007": "NSBINP",  # Nepal SBI Bank Limited
    "11009": "EVBLNP",  # Everest Bank Limited
    "11012": "NICENP",  # NIC ASIA Bank Limited
    "11014": "MBLNNP",  # Machhapuchchhre Bank Limited
    "11015": "KMBLNP",  # Kumari Bank Limited
    "11016": "LXBLNP",  # Laxmi Sunrise Limited
    "11017": "SIDDNP",  # Siddhartha Bank Limited
    "11018": "ADBLNP",  # Agriculture Development Bank
    "11019": "GLBBNP",  # Global IME Bank Limited
    "11020": "CTZNNP",  # Citizens Bank International Limited
    "11021": "PCBLNP",  # Prime Commercial Bank Limited
    "11025": "NMBBNP",  # NMB Bank Limited
    "11026": "PRVUNP",  # Prabhu Bank Limited
    "11032": "SNMANP",  # Sanima Bank Limited
}


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
                "swiftCode": SWIFT_CROSSWALK.get(nrb_code),
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

    found_codes = {r["nrbCode"] for r in records}
    stale = [c for c in SWIFT_CROSSWALK if c not in found_codes]
    if stale:
        print(
            f"::error::SWIFT_CROSSWALK references nrbCode(s) no longer in NRB's list: {stale}. "
            "NRB's bank-list page changed -- re-verify the crosswalk by hand.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(args.out, "w") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

    by_class = {}
    for r in records:
        by_class[r["class"]] = by_class.get(r["class"], 0) + 1
    with_swift = sum(1 for r in records if r["swiftCode"])
    print(f"  {len(records)} institutions: {by_class}, {with_swift} with a SWIFT code", file=sys.stderr)


if __name__ == "__main__":
    main()
