#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$ROOT_DIR/data/cache"

mkdir -p "$CACHE_DIR"

BASE_URL="https://raw.githubusercontent.com/mathbeveridge/gameofthrones/master/data"

for season in 1 2 3 4 5 6 7 8; do
  for type in nodes edges; do
    FILE="got-s${season}-${type}.csv"
    TARGET="$CACHE_DIR/$FILE"
    if [ -f "$TARGET" ]; then
      echo "Already cached: $FILE"
    else
      echo "Downloading $FILE..."
      curl -L -o "$TARGET" "$BASE_URL/$FILE"
    fi
  done
done

echo "Game of Thrones dataset cached at: $CACHE_DIR/"
