#!/usr/bin/env bash
# Red-green meta-test for scripts/check-frontend-no-usearch.sh.
# Runs the gate against the live tree (expect green), then plants a
# `usearch` literal in a temp copy of the landing tree and confirms the
# gate flags it (expect red).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-frontend-no-usearch.sh"

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

# --- RED: planted usearch reference should fail ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/frontend/src/components/landing"
cat > "$TMP/frontend/src/components/landing/Planted.tsx" <<'EOF'
export const PLANTED = 'vector similarity (usearch)'
EOF

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted usearch reference" >&2
  exit 1
fi
echo "test: RED on planted reference (expected, exit=$RC)"

echo "test: PASS"
