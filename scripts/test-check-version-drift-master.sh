#!/usr/bin/env bash
# Red-green meta-test for scripts/check-version-drift-master.sh.
#
# GREEN: live tree should pass (we just landed the gate alongside aligned
# version strings).
# RED:   plant a synthetic repo where one of the five non-canonical version
#        sources drifts from the workspace; the gate must flag it.
# GREEN: realign all sources in the planted fixture; the same gate passes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-version-drift-master.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported drift on a clean live tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Build a minimal fixture covering every source the gate inspects.
mkdir -p \
  "$TMP/frontend" \
  "$TMP/.claude-plugin" \
  "$TMP/npm/cli" \
  "$TMP/crates/ogdb-python" \
  "$TMP/crates/ogdb-node"

cat > "$TMP/Cargo.toml" <<'EOF'
[workspace.package]
version = "9.9.9"
EOF
cat > "$TMP/frontend/package.json" <<'EOF'
{ "name": "frontend", "version": "9.9.9" }
EOF
cat > "$TMP/.claude-plugin/plugin.json" <<'EOF'
{ "name": "opengraphdb", "version": "9.9.9" }
EOF
cat > "$TMP/npm/cli/package.json" <<'EOF'
{ "name": "@opengraphdb/cli", "version": "9.9.9" }
EOF
cat > "$TMP/crates/ogdb-python/pyproject.toml" <<'EOF'
[project]
name = "opengraphdb"
version = "9.9.9"
EOF
cat > "$TMP/crates/ogdb-node/package.json" <<'EOF'
{ "name": "@opengraphdb/node", "version": "9.9.9" }
EOF

# --- GREEN: aligned fixture passes ---
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged a fully-aligned 9.9.9 fixture" >&2
  exit 1
}
echo "test: GREEN on aligned fixture (expected)"

# --- RED: drift each source one at a time and confirm the gate fails ---
declare -a DRIFTS=(
  "frontend/package.json|{ \"name\": \"frontend\", \"version\": \"0.0.1\" }"
  ".claude-plugin/plugin.json|{ \"name\": \"opengraphdb\", \"version\": \"0.0.2\" }"
  "npm/cli/package.json|{ \"name\": \"@opengraphdb/cli\", \"version\": \"0.0.3\" }"
  "crates/ogdb-node/package.json|{ \"name\": \"@opengraphdb/node\", \"version\": \"0.0.4\" }"
)

restore() {
  case "$1" in
    "frontend/package.json")           echo '{ "name": "frontend", "version": "9.9.9" }' ;;
    ".claude-plugin/plugin.json")      echo '{ "name": "opengraphdb", "version": "9.9.9" }' ;;
    "npm/cli/package.json")            echo '{ "name": "@opengraphdb/cli", "version": "9.9.9" }' ;;
    "crates/ogdb-node/package.json")   echo '{ "name": "@opengraphdb/node", "version": "9.9.9" }' ;;
  esac
}

for entry in "${DRIFTS[@]}"; do
  IFS='|' read -r path body <<<"$entry"
  printf '%s\n' "$body" > "$TMP/$path"
  set +e
  "$GATE" "$TMP" >/dev/null 2>&1
  RC=$?
  set -e
  if [[ $RC -eq 0 ]]; then
    echo "test FAILED: gate did not flag drift in $path" >&2
    exit 1
  fi
  echo "test: RED on planted drift in $path (expected, exit=$RC)"
  printf '%s\n' "$(restore "$path")" > "$TMP/$path"
done

# Drift the TOML source on its own.
cat > "$TMP/crates/ogdb-python/pyproject.toml" <<'EOF'
[project]
name = "opengraphdb"
version = "0.0.5"
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag drift in crates/ogdb-python/pyproject.toml" >&2
  exit 1
fi
echo "test: RED on planted drift in crates/ogdb-python/pyproject.toml (expected, exit=$RC)"

# --- GREEN: realign and confirm the gate is happy again ---
cat > "$TMP/crates/ogdb-python/pyproject.toml" <<'EOF'
[project]
name = "opengraphdb"
version = "9.9.9"
EOF
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged the realigned fixture" >&2
  exit 1
}
echo "test: GREEN on realigned fixture (expected)"

echo "test: PASS"
