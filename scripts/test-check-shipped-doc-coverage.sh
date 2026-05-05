#!/usr/bin/env bash
# Red-green test for scripts/check-shipped-doc-coverage.sh.
# GREEN: live tree — `cargo doc -D missing_docs` passes, no rogue
# `#![allow(missing_docs)]` outside the three ratchet crates, every
# shipped lib.rs starts with a `//!` block in the first 50 lines.
# RED: a planted `crates/_test_planted_b1/src/lib.rs` containing
# `#![allow(missing_docs)]`. Workspace.members is an explicit list (not
# a glob), so the planted dir is invisible to `cargo doc --workspace`,
# but the B1 grep walks `$ROOT/crates --include='lib.rs'` and catches it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-shipped-doc-coverage.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# The gate's first action is `cargo doc ...` — without cargo it cannot
# meaningfully run, so the test is a no-op in toolchain-less environments.
if ! command -v cargo >/dev/null 2>&1; then
  echo "test: cargo unavailable; skipping (gate requires cargo)" >&2
  exit 0
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted non-workspace crate with #![allow(missing_docs)] ---
PLANTED_DIR="$REPO_ROOT/crates/_test_planted_b1"
trap 'rm -rf "$PLANTED_DIR"' EXIT

mkdir -p "$PLANTED_DIR/src"
cat > "$PLANTED_DIR/src/lib.rs" <<'RS'
#![allow(missing_docs)]
// planted by scripts/test-check-shipped-doc-coverage.sh — should be
// removed by trap on exit. Not a workspace member (no Cargo.toml) so
// cargo doc ignores it; B1's grep on $ROOT/crates does not.
RS

set +e
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag planted #![allow(missing_docs)] outside ratchet crates (B1)" >&2
  exit 1
fi
echo "test: RED on planted-allow fixture (expected, exit=$RC)"

echo "test: PASS"
