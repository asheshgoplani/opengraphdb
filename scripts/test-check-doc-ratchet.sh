#!/usr/bin/env bash
# Red-green test for scripts/check-doc-ratchet.sh.
# GREEN: live tree passes. RED: a TMP root with no crates/<name>/src/lib.rs
# tripping the "FAIL: $lib missing" branch for ogdb-core / ogdb-node / ogdb-python.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-doc-ratchet.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported FAIL on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: TMP root with no ratchet crate libs should fail ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag missing ratchet crate libs" >&2
  exit 1
fi
echo "test: RED on missing-libs fixture (expected, exit=$RC)"

echo "test: PASS"
