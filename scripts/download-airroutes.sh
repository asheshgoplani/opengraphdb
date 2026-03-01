#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$ROOT_DIR/data/cache"

mkdir -p "$CACHE_DIR"

NODES_CSV="$CACHE_DIR/air-routes-latest-nodes.csv"
EDGES_CSV="$CACHE_DIR/air-routes-latest-edges.csv"

BASE_URL="https://raw.githubusercontent.com/krlawrence/graph/master/sample-data"

if [ -f "$NODES_CSV" ]; then
  echo "Already cached: $NODES_CSV"
else
  echo "Downloading air-routes-latest-nodes.csv..."
  curl -L -o "$NODES_CSV" "$BASE_URL/air-routes-latest-nodes.csv"
fi

if [ -f "$EDGES_CSV" ]; then
  echo "Already cached: $EDGES_CSV"
else
  echo "Downloading air-routes-latest-edges.csv..."
  curl -L -o "$EDGES_CSV" "$BASE_URL/air-routes-latest-edges.csv"
fi

echo "Air Routes dataset cached at: $CACHE_DIR/"
