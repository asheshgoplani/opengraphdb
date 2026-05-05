#!/usr/bin/env bash
# Red-green test for scripts/check-binding-readmes.sh.
# GREEN: live tree (bindings/c, bindings/go, proto each have README.md).
# RED:   removing a required README OR dropping a populated binding dir
# without a README trips the gate (CYCLE4 H5 contract).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-binding-readmes.sh"

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

mkdir -p "$TMP/bindings/c" "$TMP/bindings/go" "$TMP/proto"
echo 'C bindings.'   > "$TMP/bindings/c/README.md"
echo 'C entrypoint.' > "$TMP/bindings/c/example.c"
echo 'Go bindings.'  > "$TMP/bindings/go/README.md"
echo 'go-marker.'    > "$TMP/bindings/go/marker.go"
echo 'Protos.'       > "$TMP/proto/README.md"

"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged a complete fixture" >&2
  exit 1
}
echo "test: GREEN on complete fixture (expected)"

# --- RED: drop the C README ---
rm "$TMP/bindings/c/README.md"
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag missing bindings/c/README.md" >&2
  exit 1
fi
echo "test: RED on missing README (expected, exit=$RC)"

# --- RED: a new populated binding dir without README ---
echo 'C bindings.' > "$TMP/bindings/c/README.md"
mkdir -p "$TMP/bindings/rust-extra"
echo 'fn x() {}' > "$TMP/bindings/rust-extra/lib.rs"
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a populated binding without README" >&2
  exit 1
fi
echo "test: RED on populated binding without README (expected, exit=$RC)"

echo "test: PASS"
