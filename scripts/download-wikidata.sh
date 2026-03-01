#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$ROOT_DIR/data/cache"

mkdir -p "$CACHE_DIR"

LAUREATES_JSON="$CACHE_DIR/nobel-laureates.json"

if [ -f "$LAUREATES_JSON" ]; then
  echo "Already cached: $LAUREATES_JSON"
  exit 0
fi

echo "Downloading Nobel Prize laureates from Nobel Prize API..."
curl -L -o "$LAUREATES_JSON" "https://api.nobelprize.org/2.1/laureates?limit=2000"

echo "Nobel Prize data cached at: $LAUREATES_JSON"
