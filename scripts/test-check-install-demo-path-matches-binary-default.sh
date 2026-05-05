#!/usr/bin/env bash
# Red-green test for scripts/check-install-demo-path-matches-binary-default.sh.
# GREEN: live tree (install.sh OGDB_HOME normalizes to the same dir as the
# binary's default_demo_db_path).
# RED: a TMP root where install.sh defaults to $HOME/.opengraphdb but the
# binary's default_demo_db_path lives under $HOME/.ogdb — the divergence
# the gate was written to catch.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-install-demo-path-matches-binary-default.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported FAIL on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted divergence between install.sh and lib.rs ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/scripts" "$TMP/crates/ogdb-cli/src"

cat > "$TMP/scripts/install.sh" <<'SH'
#!/usr/bin/env bash
OGDB_HOME="${OGDB_HOME:-$HOME/.opengraphdb}"
SH

cat > "$TMP/crates/ogdb-cli/src/lib.rs" <<'RS'
fn default_demo_db_path() -> String {
    let home = std::env::var("HOME").unwrap();
    format!("{home}/.ogdb/demo.ogdb")
}
RS

set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag divergent install.sh / lib.rs paths" >&2
  exit 1
fi
echo "test: RED on path-divergence fixture (expected, exit=$RC)"

echo "test: PASS"
