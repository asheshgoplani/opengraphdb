#!/usr/bin/env bash
# Red-green test for scripts/check-rust-toolchain-pin.sh.
# GREEN: live tree (every dtolnay/rust-toolchain `uses:` line is fully
# pinned and matches rust-toolchain.toml's channel).
# RED:   `@stable` or a mismatched channel trips the gate (CYCLE3 H11 contract).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-rust-toolchain-pin.sh"

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

mkdir -p "$TMP/.github/workflows"
cat > "$TMP/rust-toolchain.toml" <<'EOF'
[toolchain]
channel = "1.88.0"
profile = "minimal"
EOF

# --- GREEN: matching pin ---
cat > "$TMP/.github/workflows/ci.yml" <<'EOF'
jobs:
  build:
    steps:
      - uses: dtolnay/rust-toolchain@1.88.0
EOF
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged an aligned 1.88.0 pin" >&2
  exit 1
}
echo "test: GREEN on aligned fixture (expected)"

# --- RED: @stable pin ---
cat > "$TMP/.github/workflows/ci.yml" <<'EOF'
jobs:
  build:
    steps:
      - uses: dtolnay/rust-toolchain@stable
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag @stable pin" >&2
  exit 1
fi
echo "test: RED on @stable pin (expected, exit=$RC)"

# --- RED: mismatched version ---
cat > "$TMP/.github/workflows/ci.yml" <<'EOF'
jobs:
  build:
    steps:
      - uses: dtolnay/rust-toolchain@1.70.0
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag mismatched 1.70.0 vs 1.88.0 pin" >&2
  exit 1
fi
echo "test: RED on mismatched pin (expected, exit=$RC)"

echo "test: PASS"
