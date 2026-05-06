#!/usr/bin/env bash
# Red-green meta-test for scripts/check-claude-plugin-manifest.sh.
# GREEN: the live tree passes (manifest exists, fields present).
# RED:   a fixture with broken JSON / missing name / missing version trips it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-claude-plugin-manifest.sh"

[[ -x "$GATE" ]] || { echo "test: $GATE not executable" >&2; exit 2; }

# --- GREEN: real repo passes ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) \
  || { echo "test FAILED: gate did not pass on the live tree" >&2; exit 1; }
echo "test: GREEN on live tree (expected)"

# --- RED 1: missing manifest ---
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.claude-plugin"
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed with no manifest" >&2; exit 1; }
echo "test: RED on missing manifest (expected, exit=$RC)"

# --- RED 2: broken JSON ---
echo "{ this is not json" > "$TMP/.claude-plugin/plugin.json"
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed with broken JSON" >&2; exit 1; }
echo "test: RED on broken JSON (expected, exit=$RC)"

# --- RED 3: missing required `name` ---
cat > "$TMP/.claude-plugin/plugin.json" <<'EOF'
{ "description": "no name field", "version": "0.1.0", "license": "MIT", "repository": "https://example.com" }
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed with missing name" >&2; exit 1; }
echo "test: RED on missing name (expected, exit=$RC)"

# --- RED 4: non-kebab-case name ---
cat > "$TMP/.claude-plugin/plugin.json" <<'EOF'
{ "name": "Has Spaces", "description": "x", "version": "0.1.0", "license": "MIT", "repository": "x" }
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed with non-kebab name" >&2; exit 1; }
echo "test: RED on non-kebab name (expected, exit=$RC)"

echo "test: PASS"
