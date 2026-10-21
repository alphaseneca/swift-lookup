#!/usr/bin/env bash
# Rebuilds data/swift-codes.json and site/ from the latest upstream sources.
#
# Sources:
#   - lobax/banknames (MIT) — bank code -> name, parsed from the ISO 9362
#     Registration Authority's public BIC directory PDF.
#     https://github.com/lobax/banknames
#   - lukes/ISO-3166-Countries-with-Regional-Codes (MIT) — ISO 3166-1
#     alpha-2 -> country name.
#   - Nepal Rastra Bank (nrb.org.np) — Nepal-only domestic institution
#     directory (NRB codes, not SWIFT/BIC). See build-np-institutions.py.
#
# Intended to be run periodically to pick up registry updates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# GET $1 into $2, extra curl args in $3+. On a non-2xx, prints an
# "::error::" annotation (visible via GitHub's public check-runs API, no
# token needed to read it) with the status and response body, then exits.
fetch() {
  local url="$1" out="$2"
  shift 2
  local code
  code=$(curl -s -L -m 30 -w "%{http_code}" -o "$out" "$@" "$url") || {
    echo "::error::GET $url failed to connect (curl exit $?)"
    exit 1
  }
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "::error::GET $url -> HTTP $code: $(head -c 300 "$out" | tr '\n' ' ')"
    exit 1
  fi
}

echo "Fetching latest lobax/banknames release metadata..."
RELEASE_JSON="$WORK_DIR/release.json"
# Unauthenticated api.github.com calls are capped at 60/hour per IP, shared
# across all GitHub Actions runners. Use GITHUB_TOKEN (set automatically in
# Actions) when present for the 5000/hour authenticated limit instead.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  fetch "https://api.github.com/repos/lobax/banknames/releases/latest" "$RELEASE_JSON" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}"
else
  fetch "https://api.github.com/repos/lobax/banknames/releases/latest" "$RELEASE_JSON"
fi

TAG=$(python3 -c "import json;print(json.load(open('$RELEASE_JSON'))['tag_name'])")
ZIP_URL=$(python3 -c "import json;d=json.load(open('$RELEASE_JSON'));print([a['browser_download_url'] for a in d['assets'] if a['name'].endswith('.zip')][0])")
echo "  release: $TAG"
echo "  asset:   $ZIP_URL"

echo "Downloading bank name archive..."
fetch "$ZIP_URL" "$WORK_DIR/banknames.zip"
unzip -q -o "$WORK_DIR/banknames.zip" -d "$WORK_DIR/banknames"

echo "Downloading ISO 3166-1 country names..."
fetch "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json" \
  "$WORK_DIR/iso_countries.json"

echo "Merging into data/swift-codes.json..."
python3 "$SCRIPT_DIR/merge.py" \
  --banks-dir "$WORK_DIR/banknames/banks" \
  --iso-countries "$WORK_DIR/iso_countries.json" \
  --release-tag "$TAG" \
  --out "$ROOT_DIR/data/swift-codes.json" \
  --out-meta "$ROOT_DIR/data/meta.json"

echo "Building Nepal institution directory (NRB, separate from SWIFT)..."
python3 "$SCRIPT_DIR/build-np-institutions.py" \
  --out "$ROOT_DIR/data/institutions-np.json"

# build-np-institutions.py already checks its SWIFT_CROSSWALK's nrbCode
# keys are still in NRB's list. Check the other side here, now that both
# files exist: every crosswalk swiftCode value must still resolve in
# swift-codes.json, or a hand-verified mapping could silently start
# pointing at a SWIFT code lobax/banknames has since dropped/renamed.
python3 -c "
import json, sys
inst = json.load(open('$ROOT_DIR/data/institutions-np.json'))
swift_codes = {r['swiftCode'] for r in json.load(open('$ROOT_DIR/data/swift-codes.json'))}
stale = [i['swiftCode'] for i in inst if i['swiftCode'] and i['swiftCode'] not in swift_codes]
if stale:
    print(f'::error::SWIFT_CROSSWALK references swiftCode(s) no longer in swift-codes.json: {stale}. lobax/banknames changed -- re-verify the crosswalk by hand.', file=sys.stderr)
    sys.exit(1)
"

echo "Generating static site..."
node "$SCRIPT_DIR/build-site.js" "$ROOT_DIR/data/swift-codes.json" "$ROOT_DIR/data/meta.json" \
  "$ROOT_DIR/data/institutions-np.json" "$ROOT_DIR/site"

echo "Done."
