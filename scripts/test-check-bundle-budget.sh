#!/usr/bin/env bash
# Red-green meta-test for scripts/check-bundle-budget.sh.
#
# We don't trust a real `npm run build` in CI for this gate's regression
# test (it would couple the test to vite + node toolchain availability).
# Instead we plant a synthetic dist-app with a known-size index-*.js and
# point the gate at it via the explicit-root argument.
#
# - 200 KB index → expect FAIL (over the 180 KB default budget)
# - 50  KB index → expect PASS
# - missing dist → expect SKIP (exit 77)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-bundle-budget.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- SKIP: no dist-app present ---
mkdir -p "$TMP/frontend"
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -ne 77 ]]; then
  echo "test FAILED: missing dist-app should exit 77, got $RC" >&2
  exit 1
fi
echo "test: SKIP on missing dist-app (expected, exit=77)"

# Build a fixture with a 200 KB *highly-incompressible* index-*.js so the
# gzip output is also above the 180 KB budget. Pseudo-random bytes from
# /dev/urandom won't compress meaningfully, so 200 KB raw → ~200 KB gzip.
mkdir -p "$TMP/frontend/dist-app/assets"
HEAVY="$TMP/frontend/dist-app/assets/index-deadbeef.js"
dd if=/dev/urandom of="$HEAVY" bs=1024 count=200 status=none

# --- RED: 200 KB index trips the budget ---
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: 200 KB random index should have failed the 180 KB budget" >&2
  exit 1
fi
echo "test: RED on 200 KB index (expected, exit=$RC)"

# --- GREEN: shrink the same chunk to 50 KB and the gate passes ---
dd if=/dev/urandom of="$HEAVY" bs=1024 count=50 status=none
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: 50 KB random index should have fit under 180 KB" >&2
  exit 1
}
echo "test: GREEN on 50 KB index (expected)"

# --- AMBIGUOUS: two index-*.js trigger exit 2 ---
cp "$HEAVY" "$TMP/frontend/dist-app/assets/index-cafef00d.js"
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -ne 2 ]]; then
  echo "test FAILED: two matching entries should exit 2 (config error), got $RC" >&2
  exit 1
fi
echo "test: CONFIG-ERROR on ambiguous index match (expected, exit=2)"

echo "test: PASS"
