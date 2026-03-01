#!/usr/bin/env bash
set -euo pipefail

OGDB_DEMO_DB="${OGDB_DEMO_DB:-data/demo.ogdb}"
OGDB_BIN="${OGDB_BIN:-ogdb}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATASETS_DIR="$ROOT_DIR/datasets"

DATASET="${1:-all}"

# Validate dataset argument
case "$DATASET" in
  all|movielens|airroutes|got|wikidata)
    ;;
  *)
    echo "Usage: $0 [all|movielens|airroutes|got|wikidata]"
    echo ""
    echo "  all        Import all 4 datasets (default)"
    echo "  movielens  Import MovieLens movies and genres"
    echo "  airroutes  Import Air Routes airports and routes"
    echo "  got        Import Game of Thrones characters and interactions"
    echo "  wikidata   Import Nobel Prize laureates and categories"
    exit 1
    ;;
esac

# Determine which datasets to import
if [ "$DATASET" = "all" ]; then
  DATASETS_TO_IMPORT="movielens airroutes got wikidata"
else
  DATASETS_TO_IMPORT="$DATASET"
fi

# Check all required dataset files exist before starting
MISSING=0
for ds in $DATASETS_TO_IMPORT; do
  JSON="$DATASETS_DIR/${ds}.json"
  if [ ! -f "$JSON" ]; then
    echo "ERROR: Dataset not found: $JSON"
    echo "  To generate it, run:"
    echo "    bash scripts/download-${ds}.sh"
    echo "    python3 scripts/convert-${ds}.py"
    MISSING=1
  fi
done

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

echo "OpenGraphDB Demo Seed Script"
echo "Database: $OGDB_DEMO_DB"
echo "Datasets: $DATASETS_TO_IMPORT"
echo ""

# Idempotent: delete and recreate on every run.
if [ -f "$OGDB_DEMO_DB" ]; then
  echo "Removing existing database..."
  rm -f "$OGDB_DEMO_DB" "${OGDB_DEMO_DB}-wal" "${OGDB_DEMO_DB}-meta.json"
fi

mkdir -p "$(dirname "$OGDB_DEMO_DB")"

echo "Creating database..."
"$OGDB_BIN" init "$OGDB_DEMO_DB"

# Import each dataset and print summary
for ds in $DATASETS_TO_IMPORT; do
  JSON="$DATASETS_DIR/${ds}.json"
  echo ""
  echo "Importing $ds dataset..."

  # Print node/edge counts from JSON before importing
  COUNTS=$(python3 -c "
import json
data = json.load(open('$JSON'))
print(f'  Nodes: {len(data[\"nodes\"])}, Edges: {len(data[\"edges\"])}')
" 2>/dev/null || echo "  (counts unavailable)")
  echo "$COUNTS"

  "$OGDB_BIN" import "$OGDB_DEMO_DB" "$JSON"
  echo "  Done."
done

echo ""
echo "Seed complete. Start the server:"
echo "  $OGDB_BIN serve $OGDB_DEMO_DB --http"
echo ""
echo "Then open the frontend at http://localhost:5173/playground?mode=live"
