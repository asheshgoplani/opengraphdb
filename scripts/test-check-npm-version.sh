#!/usr/bin/env bash
# Red-green test for scripts/check-npm-version.sh.
# GREEN: live tree passes. RED: a fixture where Cargo workspace.package.version
# disagrees with crates/ogdb-node/package.json .version trips the gate (the
# C2-A7 0.1.0 vs 0.4.0 drift shape).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-npm-version.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported drift on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/crates/ogdb-node"
cat > "$TMP/Cargo.toml" <<'EOF'
[workspace.package]
version = "9.9.9"
EOF
cat > "$TMP/crates/ogdb-node/package.json" <<'EOF'
{
  "name": "opengraphdb",
  "version": "0.0.1"
}
EOF

# --- RED: mismatched fixture trips the gate ---
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a 9.9.9 vs 0.0.1 drift" >&2
  exit 1
fi
echo "test: RED on planted drift (expected, exit=$RC)"

# --- GREEN: aligning the versions makes the same gate pass ---
cat > "$TMP/crates/ogdb-node/package.json" <<'EOF'
{
  "name": "opengraphdb",
  "version": "9.9.9"
}
EOF
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged matching 9.9.9 versions" >&2
  exit 1
}
echo "test: GREEN on aligned fixture (expected)"

echo "test: PASS"
