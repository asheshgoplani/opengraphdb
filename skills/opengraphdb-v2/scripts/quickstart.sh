#!/usr/bin/env bash
# OpenGraphDB master-skill quickstart.
# Idempotent — safe to re-run. Verifies the CLI flow end-to-end and (optionally)
# probes the HTTP/MCP server if a port is free.
#
# Steps:
#   1. Build the release binary if missing.
#   2. Init a fresh sample DB at $DB.
#   3. Create three nodes + two edges via the CLI.
#   4. Run a MATCH query and a count.
#   5. (Optional) start `ogdb serve --http` and curl /mcp/tools.
#   6. Print "You're ready" + cleanup hints.
#
# Usage:
#   bash skills/opengraphdb/scripts/quickstart.sh           # full
#   SKIP_SERVE=1 bash .../quickstart.sh                     # skip step 5
#   DB=/tmp/myname.ogdb bash .../quickstart.sh              # custom DB path

set -euo pipefail

DB="${DB:-/tmp/ogdb-quickstart.ogdb}"
PORT="${PORT:-18080}"                   # avoids the 8080 default
SKIP_SERVE="${SKIP_SERVE:-0}"

# Locate the repo root (two levels up from this script: scripts/ → opengraphdb/ → skills/ → repo)
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../.." &> /dev/null && pwd)"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[1;33m!\033[0m %s\n' "$*" >&2; }

step "1. Locate or build ogdb binary"
OGDB="$REPO_ROOT/target/release/ogdb"
if [[ ! -x "$OGDB" ]]; then
  warn "release binary missing at $OGDB — building (~2 min)"
  ( cd "$REPO_ROOT" && cargo build --release -p ogdb-cli )
fi
ok "binary: $OGDB"
"$OGDB" --version || true

step "2. Init fresh DB at $DB"
# Remove any prior copy so re-runs start clean.
rm -f "$DB" "$DB"-* 2>/dev/null || true
"$OGDB" init "$DB"
ok "initialized $DB"

step "3. Create 3 nodes + 2 edges"
A_OUT=$("$OGDB" create-node "$DB" --labels Person --props 'name=string:Alice;age=i64:30')
B_OUT=$("$OGDB" create-node "$DB" --labels Person --props 'name=string:Bob;age=i64:25')
C_OUT=$("$OGDB" create-node "$DB" --labels Company --props 'name=string:Acme')
A=$(printf '%s' "$A_OUT" | sed -n 's/^node_id=\([0-9]*\)$/\1/p')
B=$(printf '%s' "$B_OUT" | sed -n 's/^node_id=\([0-9]*\)$/\1/p')
C=$(printf '%s' "$C_OUT" | sed -n 's/^node_id=\([0-9]*\)$/\1/p')
ok "nodes: Alice=$A Bob=$B Acme=$C"
"$OGDB" add-edge "$DB" "$A" "$B" --type KNOWS                   > /dev/null
"$OGDB" add-edge "$DB" "$A" "$C" --type WORKS_AT                > /dev/null
ok "edges: ($A)-[:KNOWS]->($B), ($A)-[:WORKS_AT]->($C)"

step "4. Run MATCH (n) RETURN n + count"
"$OGDB" query "$DB" "MATCH (n:Person) RETURN n.name"
echo
"$OGDB" query "$DB" "MATCH (n) RETURN count(n) AS total"

step "5. HTTP / MCP server (optional)"
if [[ "$SKIP_SERVE" == "1" ]]; then
  warn "SKIP_SERVE=1 — skipping HTTP server probe"
elif command -v curl >/dev/null 2>&1 && ! ss -ltn 2>/dev/null | grep -qE "[:.]$PORT\b"; then
  ( "$OGDB" serve --http --port "$PORT" "$DB" >/tmp/ogdb-quickstart.log 2>&1 ) &
  SERVE_PID=$!
  trap 'kill "$SERVE_PID" 2>/dev/null || true' EXIT
  # Poll /health for up to 10s.
  for i in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null; then
    ok "server up on :$PORT"
    echo "  /mcp/tools (first 200 bytes):"
    curl -s -X POST "http://127.0.0.1:$PORT/mcp/tools" \
         -H 'Content-Type: application/json' -d '{}' | head -c 200
    echo
    kill "$SERVE_PID" 2>/dev/null || true
    wait "$SERVE_PID" 2>/dev/null || true
    trap - EXIT
  else
    warn "server failed to come up on :$PORT (log: /tmp/ogdb-quickstart.log)"
    kill "$SERVE_PID" 2>/dev/null || true
  fi
else
  warn "skipping server probe (curl missing, port $PORT busy, or no ss)"
fi

step "You're ready"
cat <<EOF
Next steps:
  - ogdb shell $DB                          # interactive Cypher
  - ogdb schema $DB --json                  # inspect labels / edge types
  - ogdb mcp --stdio $DB                    # wire to Claude Code / Cursor / Goose
  - ogdb serve --http --port $PORT $DB &    # restart HTTP server

Cleanup:
  rm -f $DB $DB-*
EOF
