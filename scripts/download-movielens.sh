#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$ROOT_DIR/data/cache"

mkdir -p "$CACHE_DIR"

ZIP_PATH="$CACHE_DIR/ml-25m.zip"
MOVIES_CSV="$CACHE_DIR/ml-25m/movies.csv"

if [ -f "$MOVIES_CSV" ]; then
  echo "Already cached: $MOVIES_CSV"
  exit 0
fi

echo "Downloading MovieLens ml-25m dataset..."
curl -L -o "$ZIP_PATH" "https://files.grouplens.org/datasets/movielens/ml-25m.zip"

echo "Extracting movies.csv and ratings.csv..."
python3 -c "
import zipfile, os
cache = '$CACHE_DIR'
zip_path = '$ZIP_PATH'
with zipfile.ZipFile(zip_path, 'r') as z:
    for name in z.namelist():
        if name in ('ml-25m/movies.csv', 'ml-25m/ratings.csv', 'ml-25m/links.csv'):
            z.extract(name, cache)
            print(f'Extracted: {name}')
"

echo "MovieLens dataset cached at: $CACHE_DIR/ml-25m/"
