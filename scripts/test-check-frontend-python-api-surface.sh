#!/usr/bin/env bash
# Red-green meta-test for scripts/check-frontend-python-api-surface.sh.
#
#   GREEN: live tree (after HIGH-1 + HIGH-2 fix) passes.
#   RED:   planted TSX with `\`schema = db.schema_catalog()\`` in a Python
#          template literal trips (cycle-30 HIGH-1 shape — Rust-only method).
#   RED:   planted TSX with `db.insert_node(labels=, props=)` trips
#          (cycle-30 HIGH-2 shape — wrong method name + wrong kwarg).
#   RED:   planted TSX with `db.rag_hybrid_search(…)` trips (cycle-30 HIGH-2
#          second bug — Rust-core method, never bridged to Python).
#   GREEN: planted TSX with only valid binding methods (`db.create_node`,
#          `db.query`, `db.vector_search`, `db.text_search`,
#          `db.create_vector_index`, `db.create_fulltext_index`) passes.
#   GREEN: planted TSX where the broken call lives ONLY inside a
#          TS `// …` line comment must NOT trip — the comment-strip carve-out
#          is load-bearing (matches the sibling bash-blocks gate).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-frontend-python-api-surface.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN on live tree (after HIGH-1 + HIGH-2 fix) ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate flagged the live frontend tree (after HIGH-1+HIGH-2 fix)" >&2
  ( cd "$REPO_ROOT" && "$GATE" ) || true
  exit 1
}
echo "test: GREEN on live tree (expected)"

# Build a planted-fixture sandbox that mirrors the layout the gate expects:
# fixture-root/{frontend/src/<…>.tsx, crates/ogdb-python/src/lib.rs, scripts/…}.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p \
  "$TMP/frontend/src" \
  "$TMP/crates/ogdb-python/src" \
  "$TMP/scripts"
cp "$REPO_ROOT/crates/ogdb-python/src/lib.rs" "$TMP/crates/ogdb-python/src/lib.rs"
cp "$GATE" "$TMP/scripts/check-frontend-python-api-surface.sh"
chmod +x "$TMP/scripts/check-frontend-python-api-surface.sh"

run_planted() {
  local label="$1"
  local expected_rc="$2"
  set +e
  ( cd "$TMP" && "$TMP/scripts/check-frontend-python-api-surface.sh" >/tmp/out.$$ 2>&1 )
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

# --- RED: schema_catalog (cycle-30 HIGH-1) ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import opengraphdb as ogdb
db = ogdb.Database.open("x.ogdb")
schema = db.schema_catalog()
`
export const Planted = () => SNIPPET
TSX
run_planted "RED schema_catalog" 1

# --- RED: insert_node (cycle-30 HIGH-2 first bug) ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import opengraphdb as ogdb
db = ogdb.Database.open("x.ogdb")
db.insert_node(labels=["Doc"], props={"title": "x"})
`
export const Planted = () => SNIPPET
TSX
run_planted "RED insert_node" 1

# --- RED: rag_hybrid_search (cycle-30 HIGH-2 second bug) ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import opengraphdb as ogdb
db = ogdb.Database.open("x.ogdb")
hits = db.rag_hybrid_search(text="q", vector=[], k=10)
`
export const Planted = () => SNIPPET
TSX
run_planted "RED rag_hybrid_search" 1

# --- GREEN: only valid binding methods ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
const SNIPPET = `import opengraphdb as ogdb
db = ogdb.Database.open("x.ogdb")
db.create_vector_index("v", "Doc", "embedding", 384, "cosine")
db.create_fulltext_index("t", ["body"], "Doc")
db.create_node(labels=["Doc"], properties={"title": "x"})
for row in db.query("MATCH (n) RETURN n"):
    pass
db.vector_search("v", [0.0]*384, 10)
db.text_search("t", "q", 10)
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN valid binding methods" 0

# --- GREEN: broken call in `//` line comment must not trip ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
// db.schema_catalog() does not exist on the binding — narrative prose only.
const SNIPPET = `import opengraphdb as ogdb
db = ogdb.Database.open("x.ogdb")
db.create_node(labels=["Doc"], properties={"title": "x"})
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN ts comment carve-out" 0

# --- GREEN: broken call in `/* */` block comment must not trip ---
cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
/* db.insert_node was the cycle-30 bug — kept here only as a doc reference. */
const SNIPPET = `import opengraphdb as ogdb
db = ogdb.Database.open("x.ogdb")
db.create_node(labels=["Doc"], properties={"title": "x"})
`
export const Planted = () => SNIPPET
TSX
run_planted "GREEN block-comment carve-out" 0

echo "test-check-frontend-python-api-surface: ok"
