#!/usr/bin/env bash
# Red-green test for scripts/check-crate-metadata.sh.
# GREEN: live tree (every publishable crate carries description / keywords /
# categories / repository).
# RED: a TMP single-crate workspace whose Cargo.toml declares NO description,
# keywords, categories, or repository — exactly the shape the gate fails on.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-crate-metadata.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# Skip if cargo is unavailable (the gate itself relies on `cargo metadata`).
if ! command -v cargo >/dev/null 2>&1; then
  echo "test: cargo unavailable; skipping (mirrors gate's own requirement)" >&2
  exit 0
fi

# --- GREEN ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: minimal crate without crates.io metadata ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/src"
cat > "$TMP/Cargo.toml" <<'TOML'
[package]
name = "ogdb-meta-test-fixture"
version = "0.0.1"
edition = "2021"
TOML
echo 'pub fn main() {}' > "$TMP/src/lib.rs"

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a publishable crate without description/keywords/categories/repository" >&2
  exit 1
fi
echo "test: RED on missing-metadata fixture (expected, exit=$RC)"

echo "test: PASS"
