#!/usr/bin/env bash
# Red-green test for scripts/check-binary-name.sh.
# GREEN: live tree passes. RED: a planted `opengraphdb <subcommand>`
# invocation in user-facing prose trips the gate (the C3-H5 bug shape).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-binary-name.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" ) || {
  echo "test FAILED: gate reported HITS on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted bare-binary invocation ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/documentation"
cat > "$TMP/documentation/sample.md" <<'EOF'
# Sample doc
Run `opengraphdb query 'MATCH (n) RETURN n'` to query the database.
EOF

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted 'opengraphdb query' invocation" >&2
  exit 1
fi
echo "test: RED on planted reference (expected, exit=$RC)"

echo "test: PASS"
