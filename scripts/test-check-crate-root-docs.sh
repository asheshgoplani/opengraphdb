#!/usr/bin/env bash
# Red-green test for scripts/check-crate-root-docs.sh.
# GREEN: live tree (every publishable crate's lib.rs starts with `//!`).
# RED:   stripping `//!` from any inventoried crate trips the gate
# (CYCLE3 B2 — docs.rs landing-page coverage).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-crate-root-docs.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Mirror the inventory in scripts/check-crate-root-docs.sh.
CRATES=(
  ogdb-types ogdb-vector ogdb-algorithms ogdb-text ogdb-temporal
  ogdb-import ogdb-export ogdb-core ogdb-bolt ogdb-cli
  ogdb-ffi ogdb-node ogdb-python
)
for c in "${CRATES[@]}"; do
  mkdir -p "$TMP/crates/$c/src"
  cat > "$TMP/crates/$c/src/lib.rs" <<EOF
//! # $c
//!
//! Crate-root rustdoc.
EOF
done

"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged a fixture with all //! present" >&2
  exit 1
}
echo "test: GREEN on full //! fixture (expected)"

# --- RED: strip //! from one crate ---
cat > "$TMP/crates/ogdb-core/src/lib.rs" <<'EOF'
// no crate-root docs at all
pub fn nope() {}
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a crate without //!" >&2
  exit 1
fi
echo "test: RED on missing //! (expected, exit=$RC)"

echo "test: PASS"
