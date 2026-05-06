#!/usr/bin/env bash
# Red-green meta-test for scripts/check-skill-cypher-runs.sh.
#
# GREEN: clean tree (every in-scope ```cypher``` snippet runs).
# RED:   a temp tree with a planted SKILL.md that contains a known-broken
#        snippet (a `RETURN ... AS books ORDER BY books DESC` shape — the
#        exact alias-visibility lie this gate was built to catch). The
#        gate must fail with exit 1.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-skill-cypher-runs.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

OGDB_BIN="${OGDB_BIN:-$REPO_ROOT/target/release/ogdb}"
if [[ ! -x "$OGDB_BIN" ]]; then
  echo "test: ogdb binary not found at $OGDB_BIN — run cargo build --release -p ogdb-cli" >&2
  exit 2
fi

# --- GREEN ---
( cd "$REPO_ROOT" && OGDB_BIN="$OGDB_BIN" "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted lying snippet in a fresh tree ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/skills/opengraphdb" \
         "$TMP/skills/opengraphdb-v2" \
         "$TMP/documentation/recipes"

# A SKILL.md with the exact alias-visibility lie (`AS books ORDER BY books`).
# This is the failure mode H-9 / H-10 / C-4 caught by hand — the gate
# must catch it automatically.
cat > "$TMP/skills/opengraphdb/SKILL.md" <<'MD'
---
name: planted-broken
---

# stub

```cypher
MATCH (p:Person)-[:WROTE]->(b:Book)
RETURN p.name, count(b) AS books ORDER BY books DESC LIMIT 10
```
MD

# Pin the gate at the planted tree by overriding the extraction root.
RED_OUTPUT=$(
  cd "$TMP"
  CHECK_SKILL_CYPHER_ROOT="$TMP" OGDB_BIN="$OGDB_BIN" \
    bash "$GATE" 2>&1 || true
)

if grep -q "FAIL" <<< "$RED_OUTPUT" \
   && grep -qE "unbound variable|semantic analysis error|unsupported query" <<< "$RED_OUTPUT"; then
  echo "test: RED catches planted broken snippet (expected)"
else
  echo "test FAILED: gate did not flag the planted broken cypher" >&2
  echo "--- gate output ---" >&2
  echo "$RED_OUTPUT" >&2
  exit 1
fi

# --- RED #2: planted unsupported-query (UNION) ---
rm -f "$TMP/skills/opengraphdb/SKILL.md"
cat > "$TMP/skills/opengraphdb/SKILL.md" <<'MD'
---
name: planted-unsupported
---

# stub

```cypher
MATCH (p:Person) RETURN p.name
UNION
MATCH (b:Book) RETURN b.title
```
MD

RED2_OUTPUT=$(
  cd "$TMP"
  CHECK_SKILL_CYPHER_ROOT="$TMP" OGDB_BIN="$OGDB_BIN" \
    bash "$GATE" 2>&1 || true
)

if grep -q "FAIL" <<< "$RED2_OUTPUT" \
   && grep -qE "unsupported query" <<< "$RED2_OUTPUT"; then
  echo "test: RED catches planted UNION snippet (expected)"
else
  echo "test FAILED: gate did not flag the planted UNION cypher" >&2
  echo "--- gate output ---" >&2
  echo "$RED2_OUTPUT" >&2
  exit 1
fi

echo "test: all checks passed"
