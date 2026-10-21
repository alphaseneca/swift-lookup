#!/usr/bin/env python3
"""Builds data/institutions-np.json from NCHL's member/branch list.

NCHL (Nepal Clearing House Limited) runs Nepal's domestic cheque-clearing
and interbank payment systems. Its published branch list assigns every
member institution a 4-digit NCHL bank code -- unrelated to SWIFT/BIC.
This covers commercial banks, development banks, and finance companies
(53 as of the source checked). It does NOT cover microfinance
institutions, which aren't members of the cheque-clearing network.

This is intentionally NOT merged with swift-codes.json: NCHL codes and
SWIFT/BIC codes are different identifier systems for different purposes
(domestic clearing vs. international correspondent banking), and most
institutions here have no SWIFT code at all.
"""
import argparse
import datetime
import json
import re
import sys
import urllib.request

NCHL_URL = "https://nchl.com.np/wp-content/uploads/2026/01/Branches.pdf"
ROW_RE = re.compile(r"^(\d{4})\s+(\S+)\s+(.+?)\s+(\d+)\s+(.+)$")


def fetch_pdf(url, out_path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    with open(out_path, "wb") as f:
        f.write(data)


def extract_institutions(pdf_path):
    import pdfplumber

    institutions = {}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.split("\n"):
                m = ROW_RE.match(line.strip())
                if not m:
                    continue
                bank_code, short_code, name, _branch_code, _branch_name = m.groups()
                institutions[bank_code] = (short_code, name.strip())
    return institutions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-path", required=True, help="where to download/cache the NCHL PDF")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    print(f"Downloading {NCHL_URL} ...", file=sys.stderr)
    fetch_pdf(NCHL_URL, args.pdf_path)

    print("Parsing...", file=sys.stderr)
    institutions = extract_institutions(args.pdf_path)

    records = [
        {
            "institutionCode": "NP" + bank_code,
            "bankCode": bank_code,
            "shortName": short_code,
            "name": name,
            "countryCode": "NP",
            "codeSystem": "NCHL",
        }
        for bank_code, (short_code, name) in sorted(institutions.items())
    ]

    with open(args.out, "w") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

    print(f"  {len(records)} institutions", file=sys.stderr)


if __name__ == "__main__":
    main()
