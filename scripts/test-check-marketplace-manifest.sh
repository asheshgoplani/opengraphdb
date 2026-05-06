#!/usr/bin/env bash
# Red-green meta-test for scripts/check-marketplace-manifest.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-marketplace-manifest.sh"

[[ -x "$GATE" ]] || { echo "test: $GATE not executable" >&2; exit 2; }

# --- GREEN: live tree ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) \
  || { echo "test FAILED: gate did not pass on the live tree" >&2; exit 1; }
echo "test: GREEN on live tree (expected)"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# --- RED 1: missing file ---
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed without marketplace.json" >&2; exit 1; }
echo "test: RED on missing file (expected, exit=$RC)"

# --- RED 2: reserved name ---
cat > "$TMP/marketplace.json" <<'EOF'
{ "name": "claude-plugins-official", "owner": {"name":"x"}, "plugins":[{"name":"p","source":"./"}] }
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed with reserved name" >&2; exit 1; }
echo "test: RED on reserved name (expected, exit=$RC)"

# --- RED 3: empty plugins array ---
cat > "$TMP/marketplace.json" <<'EOF'
{ "name": "ok-name", "owner": {"name":"x"}, "plugins":[] }
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed with empty plugins[]" >&2; exit 1; }
echo "test: RED on empty plugins (expected, exit=$RC)"

# --- RED 4: missing source on plugin entry ---
cat > "$TMP/marketplace.json" <<'EOF'
{ "name": "ok-name", "owner": {"name":"x"}, "plugins":[{"name":"p"}] }
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
[[ $RC -ne 0 ]] || { echo "test FAILED: gate passed without plugin.source" >&2; exit 1; }
echo "test: RED on missing source (expected, exit=$RC)"

echo "test: PASS"
