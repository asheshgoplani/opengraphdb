#!/usr/bin/env bash
# Red-green test for scripts/check-bindings-no-handwritten-unsafe.sh.
# GREEN: live tree (no hand-written `unsafe { ... }` or `unsafe fn` in
# crates/ogdb-node/src or crates/ogdb-python/src).
# RED:   planting either shape trips the gate (CYCLE3 H7 contract — the
# feature-gated allow on unsafe_op_in_unsafe_fn is only safe while the
# bindings carry no hand-written unsafe).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-bindings-no-handwritten-unsafe.sh"

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

mkdir -p "$TMP/crates/ogdb-node/src" "$TMP/crates/ogdb-python/src"
cat > "$TMP/crates/ogdb-node/src/lib.rs" <<'EOF'
pub fn safe_thing() {}
EOF
cat > "$TMP/crates/ogdb-python/src/lib.rs" <<'EOF'
pub fn safe_thing() {}
EOF

"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged a clean fixture" >&2
  exit 1
}
echo "test: GREEN on clean fixture (expected)"

# --- RED: planted `unsafe { ... }` block ---
cat > "$TMP/crates/ogdb-node/src/lib.rs" <<'EOF'
pub fn naughty() {
    unsafe { let _: u8 = *(0xDEAD as *const u8); }
}
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted 'unsafe { ... }' block" >&2
  exit 1
fi
echo "test: RED on planted unsafe block (expected, exit=$RC)"

# --- RED: planted `unsafe fn` ---
cat > "$TMP/crates/ogdb-node/src/lib.rs" <<'EOF'
pub fn safe_thing() {}
EOF
cat > "$TMP/crates/ogdb-python/src/lib.rs" <<'EOF'
pub unsafe fn naughty() {}
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag 'unsafe fn'" >&2
  exit 1
fi
echo "test: RED on planted 'unsafe fn' (expected, exit=$RC)"

echo "test: PASS"
