#!/usr/bin/env bash
# Phase B H-21 red-path backfill for the cycle-19 widening of
# check-install-demo-path-matches-binary-default.sh covering
# init_agent.rs + skill bundle wrappers + skill bundle references.
# Plants a clean-shaped scaffold + a stale ~/.opengraphdb token in a
# skill wrapper script and asserts the gate fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-install-demo-path-matches-binary-default.sh"

if [[ ! -f "$GATE" ]]; then
  echo "FAIL: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/scripts" \
         "$TMPDIR/crates/ogdb-cli/src" \
         "$TMPDIR/skills/opengraphdb/scripts" \
         "$TMPDIR/skills/opengraphdb/references"

cat > "$TMPDIR/scripts/install.sh" <<'EOF'
#!/usr/bin/env sh
set -eu
OGDB_HOME="${OGDB_HOME:-$HOME/.ogdb}"
EOF

cat > "$TMPDIR/crates/ogdb-cli/src/lib.rs" <<'EOF'
fn default_demo_db_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{home}/.ogdb/demo.ogdb")
}
EOF

cat > "$TMPDIR/crates/ogdb-cli/src/init_agent.rs" <<'EOF'
fn resolve_db_path() -> std::path::PathBuf {
    let mut p = std::path::PathBuf::from(std::env::var("HOME").unwrap());
    p.push(".ogdb");
    p.push("demo.ogdb");
    p
}
EOF

# Clean wrappers/refs except for one stale skill wrapper carrying the
# ~/.opengraphdb path token — exactly the F02 surface the cycle-19 widen
# is meant to catch.
cat > "$TMPDIR/skills/opengraphdb/scripts/ogdb-serve-http.sh" <<'EOF'
#!/usr/bin/env sh
OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"
OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"
EOF

cat > "$TMPDIR/skills/opengraphdb/scripts/ogdb-mcp-stdio.sh" <<'EOF'
#!/usr/bin/env sh
OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"
EOF

cat > "$TMPDIR/skills/opengraphdb/references/debugging.md" <<'EOF'
# Debugging
ogdb info ~/.ogdb/demo.ogdb
EOF

cat > "$TMPDIR/skills/opengraphdb/references/common-recipes.md" <<'EOF'
# Recipes
ogdb import ~/.ogdb/demo.ogdb ./docs/
EOF

set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "FAIL: gate must reject stale ~/.opengraphdb in skill wrapper but exited 0" >&2
  exit 1
fi

echo "ok: planted skill wrapper with stale ~/.opengraphdb → gate exits $rc (non-zero)"
