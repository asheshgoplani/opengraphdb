#!/usr/bin/env bash
# Red-green test for scripts/check-changelog-paths.sh.
# Confirms the gate (a) passes on the live tree and (b) flags a planted
# typo that revives the cycle-15 `docs/COOKBOOK.md` 404.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-changelog-paths.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live CHANGELOG.md should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported HITS on the live CHANGELOG" >&2
  exit 1
}
echo "test: GREEN on live CHANGELOG (expected)"

# --- RED: revive the cycle-15 docs/→documentation/ typo ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp "$REPO_ROOT/CHANGELOG.md" "$TMP/CHANGELOG.md"

# Plant the exact regression class cycle-17 F02 fixed: a `docs/COOKBOOK.md`
# reference that should be `documentation/COOKBOOK.md`. We append it as a
# fresh bullet so the diff is unambiguous and the original lines remain
# a clean baseline.
printf '\n- `docs/COOKBOOK.md` planted by test-check-changelog-paths.sh\n' >> "$TMP/CHANGELOG.md"

set +e
( cd "$REPO_ROOT" && "$GATE" "$TMP/CHANGELOG.md" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted docs/COOKBOOK.md reference" >&2
  exit 1
fi
echo "test: RED on planted docs/COOKBOOK.md (expected, exit=$RC)"

echo "test: PASS"
