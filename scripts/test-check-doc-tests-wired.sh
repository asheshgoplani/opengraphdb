#!/usr/bin/env bash
# Red-green test for scripts/check-doc-tests-wired.sh.
# GREEN: live tree passes (test.sh + ci.yml both run `cargo test --workspace --doc`).
# RED: a TMP root with a scripts/test.sh that omits the doctest invocation.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-doc-tests-wired.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported FAIL on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: TMP root with test.sh missing 'cargo test --workspace --doc' ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/scripts"
cat > "$TMP/scripts/test.sh" <<'SH'
#!/usr/bin/env bash
cargo test --workspace --all-targets
SH

set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a test.sh missing the --doc step" >&2
  exit 1
fi
echo "test: RED on missing-doctest fixture (expected, exit=$RC)"

echo "test: PASS"
