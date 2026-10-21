#!/usr/bin/env bash
# Rebuilds data/swift-codes.json and site/ from the latest upstream sources.
#
# Sources:
#   - lobax/banknames (MIT) — bank code -> name, parsed from the ISO 9362
#     Registration Authority's public BIC directory PDF.
#     https://github.com/lobax/banknames
#   - lukes/ISO-3166-Countries-with-Regional-Codes (MIT) — ISO 3166-1
#     alpha-2 -> country name.
#
# Intended to be run periodically to pick up registry updates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Fetching latest lobax/banknames release metadata..."
RELEASE_JSON="$WORK_DIR/release.json"
curl -sf -m 20 "https://api.github.com/repos/lobax/banknames/releases/latest" -o "$RELEASE_JSON"

TAG=$(python3 -c "import json;print(json.load(open('$RELEASE_JSON'))['tag_name'])")
ZIP_URL=$(python3 -c "import json;d=json.load(open('$RELEASE_JSON'));print([a['browser_download_url'] for a in d['assets'] if a['name'].endswith('.zip')][0])")
echo "  release: $TAG"
echo "  asset:   $ZIP_URL"

echo "Downloading bank name archive..."
curl -sfL -m 60 -o "$WORK_DIR/banknames.zip" "$ZIP_URL"
unzip -q -o "$WORK_DIR/banknames.zip" -d "$WORK_DIR/banknames"

echo "Downloading ISO 3166-1 country names..."
curl -sf -m 20 \
  "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json" \
  -o "$WORK_DIR/iso_countries.json"

echo "Merging into data/swift-codes.json..."
python3 "$SCRIPT_DIR/merge.py" \
  --banks-dir "$WORK_DIR/banknames/banks" \
  --iso-countries "$WORK_DIR/iso_countries.json" \
  --release-tag "$TAG" \
  --out "$ROOT_DIR/data/swift-codes.json" \
  --out-meta "$ROOT_DIR/data/meta.json"

echo "Generating static site..."
node "$SCRIPT_DIR/build-site.js" "$ROOT_DIR/data/swift-codes.json" "$ROOT_DIR/data/meta.json" "$ROOT_DIR/site"

echo "Done."
