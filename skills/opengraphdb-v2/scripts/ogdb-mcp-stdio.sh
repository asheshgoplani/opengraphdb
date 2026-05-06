#!/usr/bin/env sh
# ogdb-mcp-stdio.sh — wrapper for the OGDB MCP server in stdio mode.
#
# Used by agents that register OGDB as an stdio MCP server. The wrapper
# handles default-db resolution and exec's into the binary so the agent's
# stdin/stdout owns the JSON-RPC stream.
set -eu

OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"

if [ ! -f "$OGDB_DB" ]; then
  if command -v ogdb >/dev/null 2>&1; then
    mkdir -p "$(dirname "$OGDB_DB")"
    ogdb init "$OGDB_DB" >&2
  else
    echo "ogdb binary not found on PATH" >&2
    exit 1
  fi
fi

exec ogdb mcp --stdio "$OGDB_DB"
