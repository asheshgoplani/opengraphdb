#!/usr/bin/env bash
# Red-green meta-test for scripts/check-action-pins.sh.
# GREEN: live tree (every current `uses:` is allowlisted-by-tag or SHA-pinned).
# RED:   a fixture workflow with an unknown action @v1 trips the gate.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-action-pins.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported on a live tree (allowlist incomplete?)" >&2
  exit 1
}
echo "test: GREEN on live tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts" "$TMP/.github/workflows"
cp "$GATE" "$TMP/scripts/check-action-pins.sh"
chmod +x "$TMP/scripts/check-action-pins.sh"

# --- GREEN sandbox: only allowlisted-by-tag uses ---
cat > "$TMP/.github/workflows/ok.yml" <<'EOF'
name: ok
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@1.88.0
      - uses: actions/setup-node@v4
EOF
( cd "$TMP" && "$TMP/scripts/check-action-pins.sh" >/dev/null ) || {
  echo "test FAILED: sandbox green path failed for allowlisted tags" >&2
  exit 1
}
echo "test: GREEN on allowlisted-by-tag fixture (expected)"

# --- GREEN sandbox: SHA-pin for non-allowlisted action ---
cat > "$TMP/.github/workflows/sha.yml" <<'EOF'
name: sha
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: some/random-action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EOF
( cd "$TMP" && "$TMP/scripts/check-action-pins.sh" >/dev/null ) || {
  echo "test FAILED: gate flagged a 40-char SHA pin (which is the strictest, allowed shape)" >&2
  exit 1
}
echo "test: GREEN on SHA-pinned non-allowlisted action (expected)"

# --- RED: non-allowlisted action with a tag pin ---
cat > "$TMP/.github/workflows/bad.yml" <<'EOF'
name: bad
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: random-org/sketchy-action@v1
EOF
set +e
( cd "$TMP" && "$TMP/scripts/check-action-pins.sh" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag random-org/sketchy-action@v1 (not allowlisted, not SHA)" >&2
  exit 1
fi
echo "test: RED on tag-pinned non-allowlisted action (expected, exit=$RC)"

# --- RED: malformed `uses:` with no @ref at all ---
rm "$TMP/.github/workflows/bad.yml"
cat > "$TMP/.github/workflows/noref.yml" <<'EOF'
name: noref
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: some/action-with-no-ref
EOF
set +e
( cd "$TMP" && "$TMP/scripts/check-action-pins.sh" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a uses: with no @ref" >&2
  exit 1
fi
echo "test: RED on uses: without @ref (expected, exit=$RC)"

# --- GREEN: local path uses: (e.g. ./.github/actions/foo) is allowed ---
rm "$TMP/.github/workflows/noref.yml"
cat > "$TMP/.github/workflows/local.yml" <<'EOF'
name: local
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/local-helper
EOF
( cd "$TMP" && "$TMP/scripts/check-action-pins.sh" >/dev/null ) || {
  echo "test FAILED: gate flagged a local path uses: (expected to be allowed)" >&2
  exit 1
}
echo "test: GREEN on local-path uses: (expected)"

echo "test: PASS"
