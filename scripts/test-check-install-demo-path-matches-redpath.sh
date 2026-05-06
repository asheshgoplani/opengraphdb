#!/usr/bin/env bash
# Phase B H-21 red-path backfill for
# scripts/check-install-demo-path-matches-binary-default.sh.
# Plants the cycle-17 91ee552 drift state (~/.opengraphdb in install.sh
# vs ~/.ogdb in the CLI default) and asserts the gate fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-install-demo-path-matches-binary-default.sh"

if [[ ! -f "$GATE" ]]; then
  echo "FAIL: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/scripts" "$TMPDIR/crates/ogdb-cli/src"

cat > "$TMPDIR/scripts/install.sh" <<'EOF'
#!/usr/bin/env sh
set -eu
OGDB_VERSION="${OGDB_VERSION:-latest}"
OGDB_HOME="${OGDB_HOME:-$HOME/.opengraphdb}"
EOF

cat > "$TMPDIR/crates/ogdb-cli/src/lib.rs" <<'EOF'
fn default_demo_db_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{home}/.ogdb/demo.ogdb")
}
EOF

set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "FAIL: gate must reject install=.opengraphdb vs cli=.ogdb but exited 0" >&2
  exit 1
fi

echo "ok: planted .opengraphdb/.ogdb drift fixture → gate exits $rc (non-zero)"
