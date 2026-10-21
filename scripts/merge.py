#!/usr/bin/env python3
"""Build data/swift-codes.json from upstream sources. See README.md."""
import argparse
import datetime
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--banks-dir", required=True)
    ap.add_argument("--iso-countries", required=True)
    ap.add_argument("--release-tag", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--out-meta", required=True)
    args = ap.parse_args()

    with open(args.iso_countries) as f:
        iso_list = json.load(f)
    country_names = {c["alpha-2"]: c["name"] for c in iso_list}

    records = []
    seen_codes = set()
    country_files = sorted(
        fn for fn in os.listdir(args.banks_dir) if fn.endswith(".json")
    )
    for fn in country_files:
        country_code = fn[:-5]
        with open(os.path.join(args.banks_dir, fn)) as f:
            banks = json.load(f)
        for bank_code, name in banks.items():
            bank_code = bank_code.strip().upper()
            if len(bank_code) != 4:
                continue
            swift_code = bank_code + country_code
            if swift_code in seen_codes:
                continue
            seen_codes.add(swift_code)
            records.append(
                {
                    "swiftCode": swift_code,
                    "bankCode": bank_code,
                    "countryCode": country_code,
                    "country": country_names.get(country_code, country_code),
                    "bank": name.strip(),
                }
            )

    records.sort(key=lambda r: r["swiftCode"])

    with open(args.out, "w") as f:
        json.dump(records, f, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "source": "lobax/banknames",
        "sourceLicense": "MIT",
        "sourceOrigin": "ISO 9362 Registration Authority public BIC directory (iso9362.org)",
        "sourceRelease": args.release_tag,
        "countryNamesSource": "lukes/ISO-3166-Countries-with-Regional-Codes",
        "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "recordCount": len(records),
        "countryCount": len(country_files),
        "swiftCodeFormat": "bankCode(4) + countryCode(2): first 6 chars of any SWIFT/BIC code",
        "knownLimitation": "1 name per bankCode+countryCode; if a code maps to multiple entities upstream, only the first is kept",
    }
    with open(args.out_meta, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  {len(records)} records across {len(country_files)} countries", file=sys.stderr)


if __name__ == "__main__":
    main()
