#!/usr/bin/env bash
# Red-green test for scripts/check-workspace-lint-pins.sh.
# GREEN: live tree (Cargo.toml has unsafe_op_in_unsafe_fn = "deny" and the
# allow inventory matches the cycle-4 baseline).
# RED: a TMP Cargo.toml where unsafe_op_in_unsafe_fn is "warn" instead of
# "deny" — the H6 regression shape.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-workspace-lint-pins.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported FAIL on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted lint-table regression ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/Cargo.toml" <<'TOML'
[workspace]
members = []

[workspace.lints.rust]
unsafe_op_in_unsafe_fn = "warn"

[workspace.lints.clippy]
pedantic = "allow"
cast_possible_truncation = "allow"
duplicated_attributes = "allow"
only_used_in_recursion = "allow"
uninlined_format_args = "allow"
TOML

set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag unsafe_op_in_unsafe_fn = \"warn\"" >&2
  exit 1
fi
echo "test: RED on warn-instead-of-deny fixture (expected, exit=$RC)"

echo "test: PASS"
