#!/usr/bin/env sh
# ogdb-serve-http.sh — start the OGDB HTTP server (idempotent).
#
# If the configured port is already serving an OGDB endpoint we just print
# the URL and exit. Otherwise we spawn a background server and write its
# stdout/stderr to ~/.opengraphdb/server.log.
set -eu

OGDB_DB="${OGDB_DB:-$HOME/.opengraphdb/demo.ogdb}"
OGDB_PORT="${OGDB_PORT:-8765}"
OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"

mkdir -p "$OGDB_LOG_DIR"

# Health check: is something serving?
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 1 "http://127.0.0.1:${OGDB_PORT}/health" >/dev/null 2>&1; then
    echo "OGDB already up on http://127.0.0.1:${OGDB_PORT}/"
    exit 0
  fi
fi

if [ ! -f "$OGDB_DB" ]; then
  ogdb init "$OGDB_DB" >/dev/null
fi

nohup ogdb serve --http --port "$OGDB_PORT" "$OGDB_DB" \
  >"$OGDB_LOG_DIR/server.log" 2>&1 &
PID=$!
sleep 0.4

echo "OGDB started on http://127.0.0.1:${OGDB_PORT}/  (pid $PID, log $OGDB_LOG_DIR/server.log)"
