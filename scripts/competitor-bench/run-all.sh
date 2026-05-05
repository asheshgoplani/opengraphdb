#!/usr/bin/env bash
# Tier-1 Neo4j Community 5.x vs OpenGraphDB benchmark orchestrator.
#
# Per documentation/.planning/neo4j-comparison/PLAN.md §3.1:
#   - 10 k nodes + 9 999 edges, single-tx ingest.
#   - Point-read: 1 000 random ids.
#   - 2-hop:      1 000 random seeds, cap 100 results.
#   - N=5 measured iters, 1 warm-up discarded.
#   - Cold cache: drop_caches between iters.
#   - Lower-median across iters, p50/p95/p99 percentiles.
#
# Drives both engines through the per-engine Python adapters and writes one
# JSON per (engine, iter) under $RESULTS_DIR. Then invokes reduce.py to
# emit the markdown table for documentation/BENCHMARKS.md §2.2.
#
# Usage: scripts/competitor-bench/run-all.sh [results-dir]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
HERE="$ROOT/scripts/competitor-bench"
RESULTS_DIR="${1:-$HERE/results}"
mkdir -p "$RESULTS_DIR"

OGDB_BINARY="${OGDB_BINARY:-$ROOT/target/release/ogdb}"
OGDB_PORT="${OGDB_PORT:-18099}"
OGDB_DB_PATH="${OGDB_DB_PATH:-/tmp/competitor-bench-ogdb.ogdb}"

NEO4J_IMAGE="${NEO4J_IMAGE:-neo4j:5-community}"
NEO4J_CONTAINER="${NEO4J_CONTAINER:-competitor-bench-neo4j}"
NEO4J_BOLT_PORT="${NEO4J_BOLT_PORT:-7687}"
NEO4J_HEAP="${NEO4J_HEAP:-8G}"
NEO4J_PAGECACHE="${NEO4J_PAGECACHE:-4G}"
NEO4J_BOLT_URI="${NEO4J_BOLT_URI:-bolt://127.0.0.1:${NEO4J_BOLT_PORT}}"

N_ITERS="${N_ITERS:-5}"        # measured iters
N_WARMUP="${N_WARMUP:-1}"      # discarded warmup iters
N_NODES="${N_NODES:-10000}"
N_QUERIES="${N_QUERIES:-1000}"
PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
DRIVERS="$HERE/drivers"

if [[ ! -x "$PYTHON" ]]; then
  echo "python interpreter not executable: $PYTHON" >&2
  echo "create one with: python3 -m venv $ROOT/.venv && $ROOT/.venv/bin/pip install neo4j" >&2
  exit 2
fi

if [[ ! -x "$OGDB_BINARY" ]]; then
  echo "ogdb binary not executable: $OGDB_BINARY" >&2
  echo "build with: cargo build --release -p ogdb-cli" >&2
  exit 2
fi

drop_caches() {
  if sudo -n true >/dev/null 2>&1; then
    sudo -n sysctl -w vm.drop_caches=3 >/dev/null 2>&1 || true
  else
    echo "  [warn] sudo not passwordless; OS page cache not dropped" >&2
  fi
}

stop_neo4j() {
  docker stop "$NEO4J_CONTAINER" >/dev/null 2>&1 || true
  docker rm   "$NEO4J_CONTAINER" >/dev/null 2>&1 || true
}

start_neo4j() {
  stop_neo4j
  docker run -d --rm \
    --name "$NEO4J_CONTAINER" \
    -p "${NEO4J_BOLT_PORT}:7687" \
    -e NEO4J_AUTH=none \
    -e "NEO4J_dbms_memory_heap_max__size=${NEO4J_HEAP}" \
    -e "NEO4J_dbms_memory_heap_initial__size=${NEO4J_HEAP}" \
    -e "NEO4J_dbms_memory_pagecache_size=${NEO4J_PAGECACHE}" \
    "$NEO4J_IMAGE" >/dev/null
  # Wait for Bolt port to accept connections. neo4j logs "Started" but bolt
  # binds a few seconds later; poll instead of sleeping a fixed amount.
  for _attempt in $(seq 1 60); do
    if "$PYTHON" -c "
import socket, sys
s = socket.socket(); s.settimeout(0.5)
try:
    s.connect(('127.0.0.1', ${NEO4J_BOLT_PORT}))
    s.close(); sys.exit(0)
except Exception:
    sys.exit(1)
"; then
      # Bolt port open, but neo4j may still be booting. Probe with a trivial
      # query until it succeeds (or 60 s total).
      if "$PYTHON" -c "
from neo4j import GraphDatabase
import sys
try:
    d = GraphDatabase.driver('${NEO4J_BOLT_URI}')
    with d.session() as s: s.run('RETURN 1').consume()
    d.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
"; then
        return 0
      fi
    fi
    sleep 1
  done
  echo "  [error] neo4j container did not become ready" >&2
  docker logs "$NEO4J_CONTAINER" >&2 || true
  return 1
}

run_engine() {
  local engine="$1"
  local total=$((N_WARMUP + N_ITERS))

  echo "=== $engine: $N_WARMUP warmup + $N_ITERS measured iter(s); $N_NODES nodes / $N_QUERIES queries ==="
  for ((i = 0; i < total; i++)); do
    drop_caches
    local out="$RESULTS_DIR/${engine}-iter${i}.json"
    rm -f "$out"

    if [[ "$engine" == "neo4j" ]]; then
      start_neo4j
      "$PYTHON" "$DRIVERS/neo4j.py" \
        --iter "$i" --n-nodes "$N_NODES" --n-queries "$N_QUERIES" \
        --bolt-uri "$NEO4J_BOLT_URI" --out "$out" \
        --engine-version "$NEO4J_IMAGE"
      stop_neo4j
    else
      "$PYTHON" "$DRIVERS/opengraphdb.py" \
        --iter "$i" --n-nodes "$N_NODES" --n-queries "$N_QUERIES" \
        --binary "$OGDB_BINARY" --port "$OGDB_PORT" \
        --db-path "$OGDB_DB_PATH" --out "$out"
    fi

    local tag="warmup"
    [[ $i -ge $N_WARMUP ]] && tag="measured"
    echo "  iter $i ($tag) -> $out"
  done
}

case "${ONLY:-}" in
  ogdb)   run_engine opengraphdb ;;
  neo4j)  run_engine neo4j       ;;
  *)
          run_engine opengraphdb
          run_engine neo4j
          ;;
esac

echo
echo "=== reduce ==="
"$PYTHON" "$HERE/reduce.py" --results-dir "$RESULTS_DIR" --warmup-iters "$N_WARMUP"
