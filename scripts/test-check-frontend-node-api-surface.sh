#!/usr/bin/env bash
# Red-green meta-test for scripts/check-frontend-node-api-surface.sh.
#
#   GREEN: live tree (after HIGH-1+H2+H3 fix) passes.
#   RED:   planted TSX with `import { OgdbClient } from "opengraphdb"`
#          (cycle-31 HIGH-1 — fabricated symbol on real package).
#   RED:   planted TSX with `import { Database } from "@opengraphdb/mcp"`
#          (HIGH-1 mirror — real symbol, wrong package).
#   RED:   planted TSX with `new Database({ url: "..." })` (HIGH-2 — real
#          class, wrong ctor arg shape: object instead of positional string).
#   RED:   planted TSX with `new OpenGraphDBClient({ url: "..." })`
#          (HIGH-2 — real class, wrong ctor arg shape).
#   RED:   planted TSX with `const { nodes, edges } = await db.query(c)`
#          (HIGH-3 — fabricated return shape; query yields {columns, rows}).
#   GREEN: planted TSX with the corrected (HTTP-form) snippet.
#   GREEN: planted TSX with the corrected (embedded-form) snippet.
#   GREEN: broken import in `// ...` line comment must NOT trip
#          (comment-strip carve-out is load-bearing — same as the
#          python-api-surface gate).
#   GREEN: broken import in `/* ... */` block comment must NOT trip.
#   RED:   dead-gate sentinel — TSX with no imports / no `new` / no
#          query-destructures of the gated surfaces must fail with
#          `scanned 0` to prevent silent green-by-default regressions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-frontend-node-api-surface.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN on live tree ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate flagged the live frontend tree (after HIGH-1+H2+H3 fix)" >&2
  ( cd "$REPO_ROOT" && "$GATE" ) || true
  exit 1
}
echo "test: GREEN on live tree (expected)"

# Planted-fixture sandbox mirroring the layout the gate expects:
# fixture-root/{frontend/src/<…>.tsx, crates/ogdb-node/index.d.ts,
# mcp/src/client.ts, scripts/…}.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p \
  "$TMP/frontend/src" \
  "$TMP/crates/ogdb-node" \
  "$TMP/mcp/src" \
  "$TMP/scripts"
cp "$REPO_ROOT/crates/ogdb-node/index.d.ts" "$TMP/crates/ogdb-node/index.d.ts"
cp "$REPO_ROOT/mcp/src/client.ts" "$TMP/mcp/src/client.ts"
cp "$GATE" "$TMP/scripts/check-frontend-node-api-surface.sh"
chmod +x "$TMP/scripts/check-frontend-node-api-surface.sh"

run_planted() {
  local label="$1"
  local expected_rc="$2"
  set +e
  ( cd "$TMP" && "$TMP/scripts/check-frontend-node-api-surface.sh" >/tmp/out.$$ 2>&1 )
  local rc=$?
  set -e
  if [[ "$expected_rc" == "0" ]]; then
    if [[ "$rc" -ne 0 ]]; then
      echo "test FAILED: [$label] expected exit 0, got $rc" >&2
      cat /tmp/out.$$ >&2
      rm -f /tmp/out.$$
      exit 1
    fi
  else
    if [[ "$rc" -eq 0 ]]; then
      echo "test FAILED: [$label] expected non-zero, got 0 (false-negative)" >&2
      cat /tmp/out.$$ >&2
      rm -f /tmp/out.$$
      exit 1
    fi
  fi
  rm -f /tmp/out.$$
  echo "test: [$label] expected rc=$expected_rc — got rc=$rc"
}

# --- RED: HIGH-1 first form — fabricated symbol on real package ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { OgdbClient } from "opengraphdb"
const db = new OgdbClient("graph.ogdb")
`
export const Planted = () => SNIPPET
TSX
run_planted "RED HIGH-1 fake-symbol-real-package" 1

# --- RED: HIGH-1 second form — real symbol on wrong package ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { Database } from "@opengraphdb/mcp"
const db = new Database("graph.ogdb")
`
export const Planted = () => SNIPPET
TSX
run_planted "RED HIGH-1 real-symbol-wrong-package" 1

# --- RED: HIGH-2 first form — real class, object-arg ctor on Database ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { Database } from "opengraphdb"
const db = new Database({ url: "http://localhost:8080" })
`
export const Planted = () => SNIPPET
TSX
run_planted "RED HIGH-2 Database-object-ctor" 1

# --- RED: HIGH-2 second form — real class, object-arg ctor on OpenGraphDBClient ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { OpenGraphDBClient } from "@opengraphdb/mcp"
const db = new OpenGraphDBClient({ url: "http://localhost:8080" })
`
export const Planted = () => SNIPPET
TSX
run_planted "RED HIGH-2 OpenGraphDBClient-object-ctor" 1

# --- RED: HIGH-3 — destructure {nodes, edges} off .query(...) ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { OpenGraphDBClient } from "@opengraphdb/mcp"
const db = new OpenGraphDBClient("http://localhost:8080")
const { nodes, edges } = await db.query("MATCH (n) RETURN n")
`
export const Planted = () => SNIPPET
TSX
run_planted "RED HIGH-3 fake-query-return-shape" 1

# --- GREEN: corrected HTTP-form snippet (matches the live patch) ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { OpenGraphDBClient } from "@opengraphdb/mcp"
const db = new OpenGraphDBClient("http://localhost:8080")
const { columns, rows } = await db.query("MATCH (n) RETURN n")
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN HTTP-form correct-shape" 0

# --- GREEN: corrected embedded-form snippet ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import { Database } from "opengraphdb"
const db = new Database("graph.ogdb")
const rows = db.query("MATCH (n) RETURN n")
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN embedded-form correct-shape" 0

# --- GREEN: broken import inside `//` line comment must NOT trip ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
// import { OgdbClient } from "opengraphdb"  -- narrative prose only.
const SNIPPET = `import { Database } from "opengraphdb"
const db = new Database("graph.ogdb")
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN ts comment carve-out" 0

# --- GREEN: broken import inside `/* */` block comment must NOT trip ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
/* import { OgdbClient } from "opengraphdb"  -- doc reference only. */
const SNIPPET = `import { OpenGraphDBClient } from "@opengraphdb/mcp"
const db = new OpenGraphDBClient("http://localhost:8080")
const { columns, rows } = await db.query("MATCH (n) RETURN n")
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN block-comment carve-out" 0

# --- RED: dead-gate sentinel — fixture without imports/new/destructs of
# either gated package must fail with `scanned 0`. Mirror of the cycle-30
# python-api-surface dead-gate pattern (LOW-1 from the same eval extends
# this to the python gate; we land it directly here).
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `// nothing relevant here`
export const Planted = () => SNIPPET
TSX
set +e
( cd "$TMP" && "$TMP/scripts/check-frontend-node-api-surface.sh" >/tmp/out.$$ 2>&1 )
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "test FAILED: [RED dead-gate sentinel] expected non-zero, got 0" >&2
  cat /tmp/out.$$ >&2
  rm -f /tmp/out.$$
  exit 1
fi
if ! grep -q "scanned 0" /tmp/out.$$; then
  echo "test FAILED: [RED dead-gate sentinel] expected 'scanned 0' in stderr" >&2
  cat /tmp/out.$$ >&2
  rm -f /tmp/out.$$
  exit 1
fi
rm -f /tmp/out.$$
echo "test: [RED dead-gate sentinel] tripped with 'scanned 0' (expected)"

echo "test-check-frontend-node-api-surface: ok"
