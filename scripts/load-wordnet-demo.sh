#!/usr/bin/env bash
# Load the W3C WordNet 2.0 RDF dataset into a local OpenGraphDB file.
# Usage: bash scripts/load-wordnet-demo.sh [DB_PATH]
#
# Default DB_PATH: $HOME/.ogdb/wordnet.ogdb
#
# Steps:
#   1. download W3C wn20basic.zip (8.5 MB, RDF/XML)
#   2. unzip into a temp dir
#   3. import via `ogdb import-rdf`
#   4. print a sample hypernym-chain query for verification
set -euo pipefail

DB_PATH="${1:-$HOME/.ogdb/wordnet.ogdb}"
URL="https://www.w3.org/2006/03/wn/wn20/download/wn20basic.zip"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

if ! command -v ogdb >/dev/null 2>&1; then
  echo "error: ogdb binary not on PATH. Install via:" >&2
  echo "  curl -fsSL https://github.com/asheshgoplani/opengraphdb/releases/latest/download/install.sh | sh" >&2
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"

if [[ ! -f "$DB_PATH" ]]; then
  echo "==> ogdb init $DB_PATH"
  ogdb init "$DB_PATH"
fi

echo "==> downloading $URL ($TMPDIR/wn20basic.zip)"
curl -fsSL "$URL" -o "$TMPDIR/wn20basic.zip"

echo "==> unzipping"
unzip -q "$TMPDIR/wn20basic.zip" -d "$TMPDIR"

# The zip ships several .rdf files; import-rdf accepts RDF/XML directly.
echo "==> importing RDF/XML files"
for f in "$TMPDIR"/*.rdf; do
  [[ -f "$f" ]] || continue
  echo "    -> $(basename "$f")"
  ogdb import-rdf "$DB_PATH" "$f"
done

echo "==> verifying load"
ogdb query "$DB_PATH" "MATCH (n) RETURN count(n) AS nodes"

echo
echo "Loaded WordNet into $DB_PATH"
echo "Try the recipes in documentation/recipes/wordnet-traversal.md"
