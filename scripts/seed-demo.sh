#!/usr/bin/env bash
set -euo pipefail

OGDB_DEMO_DB="${OGDB_DEMO_DB:-data/demo.ogdb}"
OGDB_BIN="${OGDB_BIN:-ogdb}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATASETS_DIR="$ROOT_DIR/datasets"

echo "OpenGraphDB Demo Seed Script"
echo "Database: $OGDB_DEMO_DB"
echo ""

# Idempotent: delete and recreate on every run.
if [ -f "$OGDB_DEMO_DB" ]; then
  echo "Removing existing database..."
  rm -f "$OGDB_DEMO_DB" "${OGDB_DEMO_DB}-wal" "${OGDB_DEMO_DB}-meta.json"
fi

mkdir -p "$(dirname "$OGDB_DEMO_DB")"

echo "Creating database..."
"$OGDB_BIN" init "$OGDB_DEMO_DB"

echo "Importing movies dataset..."
"$OGDB_BIN" import "$OGDB_DEMO_DB" "$DATASETS_DIR/movies.json"
echo "  Done."

echo "Importing social dataset..."
"$OGDB_BIN" import "$OGDB_DEMO_DB" "$DATASETS_DIR/social.json"
echo "  Done."

echo "Importing fraud dataset..."
"$OGDB_BIN" import "$OGDB_DEMO_DB" "$DATASETS_DIR/fraud.json"
echo "  Done."

echo ""
echo "Seed complete. Start the server:"
echo "  $OGDB_BIN serve $OGDB_DEMO_DB --http"
echo ""
echo "Then open the frontend at http://localhost:5173/playground?mode=live"
