#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE19 F01/F02/F03 meta-test:
# the widened section of `scripts/check-install-demo-path-matches-binary-default.sh`
# asserts that init_agent.rs + skill bundle wrappers + skill bundle references
# carry zero `.opengraphdb` filesystem-path tokens, exempting only the
# legit `mcp.opengraphdb.<tool>` API namespace and `mcpServers.opengraphdb`
# jq config-key path. This meta-test plants violations into a synthetic
# tree and asserts the gate catches each surface (red), and confirms a
# clean tree passes (green).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-install-demo-path-matches-binary-default.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$GATE" ]]; then
  echo "test: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

write_install_sh() {
  mkdir -p "$TMPDIR/scripts"
  cat > "$TMPDIR/scripts/install.sh" <<'EOF'
#!/usr/bin/env sh
set -eu
OGDB_HOME="${OGDB_HOME:-$HOME/.ogdb}"
EOF
}

write_lib_rs() {
  mkdir -p "$TMPDIR/crates/ogdb-cli/src"
  cat > "$TMPDIR/crates/ogdb-cli/src/lib.rs" <<'EOF'
fn default_demo_db_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{home}/.ogdb/demo.ogdb")
}
EOF
}

write_clean_init_agent() {
  cat > "$TMPDIR/crates/ogdb-cli/src/init_agent.rs" <<'EOF'
fn resolve_db_path() -> std::path::PathBuf {
    let mut p = std::path::PathBuf::from(std::env::var("HOME").unwrap());
    p.push(".ogdb");
    p.push("demo.ogdb");
    p
}
EOF
}

write_clean_skill_bundle() {
  mkdir -p "$TMPDIR/skills/opengraphdb/scripts"
  mkdir -p "$TMPDIR/skills/opengraphdb/references"
  cat > "$TMPDIR/skills/opengraphdb/scripts/ogdb-serve-http.sh" <<'EOF'
#!/usr/bin/env sh
OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"
EOF
  cat > "$TMPDIR/skills/opengraphdb/scripts/ogdb-mcp-stdio.sh" <<'EOF'
#!/usr/bin/env sh
OGDB_DB="${OGDB_DB:-$HOME/.ogdb/demo.ogdb}"
EOF
  cat > "$TMPDIR/skills/opengraphdb/references/debugging.md" <<'EOF'
# Debugging
ogdb info ~/.ogdb/demo.ogdb
const s = await mcp.opengraphdb.browse_schema();
cat ~/.claude.json | jq .mcpServers.opengraphdb
EOF
  cat > "$TMPDIR/skills/opengraphdb/references/common-recipes.md" <<'EOF'
# Recipes
ogdb import ~/.ogdb/demo.ogdb ./docs/
const r = await mcp.opengraphdb.execute_cypher({});
EOF
}

scaffold_clean() {
  rm -rf "$TMPDIR"/{scripts,crates,skills}
  write_install_sh
  write_lib_rs
  write_clean_init_agent
  write_clean_skill_bundle
}

# -------- Case 1: clean synthetic tree → pass --------
scaffold_clean
if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 1: clean tree should pass" >&2
  bash "$GATE" "$TMPDIR" >&2 || true
  exit 1
fi
echo "ok case 1: clean synthetic tree → pass"

# -------- Case 2: stale init_agent.rs → fail (F01 surface) --------
scaffold_clean
cat >> "$TMPDIR/crates/ogdb-cli/src/init_agent.rs" <<'EOF'
fn other() {
    let p = home_dir().unwrap().join(".opengraphdb");
}
EOF
if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 2: stale init_agent.rs (F01) should fail" >&2
  exit 1
fi
echo "ok case 2: stale init_agent.rs (~/.opengraphdb) → fail"

# -------- Case 3: stale skill wrapper script → fail (F02 surface) --------
scaffold_clean
cat >> "$TMPDIR/skills/opengraphdb/scripts/ogdb-serve-http.sh" <<'EOF'
OGDB_LOG_DIR="${OGDB_LOG_DIR:-$HOME/.opengraphdb}"
EOF
if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 3: stale skill script (F02) should fail" >&2
  exit 1
fi
echo "ok case 3: stale skill script (~/.opengraphdb) → fail"

# -------- Case 4: stale skill reference doc → fail (F03 surface) --------
scaffold_clean
cat >> "$TMPDIR/skills/opengraphdb/references/debugging.md" <<'EOF'
ogdb stats ~/.opengraphdb/demo.ogdb
EOF
if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 4: stale skill reference (F03) should fail" >&2
  exit 1
fi
echo "ok case 4: stale skill reference (~/.opengraphdb) → fail"

# -------- Case 5: API-namespace usage alone → pass (exempt) --------
scaffold_clean
cat >> "$TMPDIR/skills/opengraphdb/references/common-recipes.md" <<'EOF'
const a = await mcp.opengraphdb.stats();
const b = await mcp.opengraphdb.create_node({});
EOF
if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 5: legit mcp.opengraphdb.* API namespace must NOT trip the gate" >&2
  bash "$GATE" "$TMPDIR" >&2 || true
  exit 1
fi
echo "ok case 5: legit mcp.opengraphdb.<tool> API namespace → pass"

# -------- Case 6: jq config path → pass (exempt) --------
scaffold_clean
cat >> "$TMPDIR/skills/opengraphdb/references/debugging.md" <<'EOF'
cat ~/.claude.json | jq .mcpServers.opengraphdb
EOF
if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 6: legit mcpServers.opengraphdb jq path must NOT trip the gate" >&2
  bash "$GATE" "$TMPDIR" >&2 || true
  exit 1
fi
echo "ok case 6: legit mcpServers.opengraphdb jq config path → pass"

# -------- Case 7: live repo root passes (the post-cycle-19 fix is coherent) --------
if ! bash "$GATE" "$REPO_ROOT" >/dev/null 2>&1; then
  echo "FAIL case 7: live repo root must pass after the cycle-19 F01/F02/F03 sweep" >&2
  bash "$GATE" "$REPO_ROOT" >&2 || true
  exit 1
fi
echo "ok case 7: live repo root → pass (post-cycle-19 sweep coherent)"

echo "all cases pass"
