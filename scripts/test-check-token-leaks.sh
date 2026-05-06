#!/usr/bin/env bash
# Red-green meta-test for scripts/check-token-leaks.sh.
# GREEN: the live tree must be clean of credential prefixes.
# RED:   a planted `sk-AAAA…20chars` in a fixture-tree scripts/leak.sh trips
#        the gate. We invoke the gate against an isolated TMP repo (chdir
#        into mktemp) so the planted secret never lands in the live tree.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-token-leaks.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Mirror the gate's expected directory layout in a sandbox so chdir-into-TMP
# exercises the same target list the live invocation uses.
mkdir -p "$TMP/scripts"
# Planted credential: a syntactically valid `sk-` prefix + 20 base62 chars.
# We assemble at runtime from concatenation so this very test file does NOT
# itself contain the trip pattern (which would fail the GREEN check above).
cat > "$TMP/scripts/leak.sh" <<EOF
#!/usr/bin/env bash
# Synthetic fixture credential — must trip check-token-leaks.
export OPENAI_KEY="sk-$(printf 'A%.0s' {1..20})BBBB"
EOF

# We need to invoke the gate from inside $TMP, but the gate resolves
# REPO_ROOT relative to its own location. Symlink the gate into $TMP/scripts
# so its `dirname/..` resolves to $TMP.
cp "$GATE" "$TMP/scripts/check-token-leaks.sh"
chmod +x "$TMP/scripts/check-token-leaks.sh"

set +e
( cd "$TMP" && "$TMP/scripts/check-token-leaks.sh" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted sk-… credential" >&2
  exit 1
fi
echo "test: RED on planted sk- credential (expected, exit=$RC)"

# --- GREEN inside sandbox once the planted file is removed ---
rm "$TMP/scripts/leak.sh"
( cd "$TMP" && "$TMP/scripts/check-token-leaks.sh" >/dev/null ) || {
  echo "test FAILED: sandbox green path did not pass after removing fixture" >&2
  exit 1
}
echo "test: GREEN on cleaned sandbox (expected)"

echo "test: PASS"
