#!/usr/bin/env bash
# Regression test for scripts/check-install-demo-path-matches-binary-default.sh
# (the EVAL-DOCS-COMPLETENESS-CYCLE18.md F01 CI gate). Verifies:
#   (a) matching paths pass (green),
#   (b) the cycle-17 91ee552 drift state (~/.opengraphdb vs ~/.ogdb) fails (red),
#   (c) malformed/missing inputs error out distinctly (exit 2, not 1).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-install-demo-path-matches-binary-default.sh"

if [[ ! -f "$GATE" ]]; then
  echo "test: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

write_install_sh() {
  local install_dir="$1"
  mkdir -p "$TMPDIR/scripts"
  cat > "$TMPDIR/scripts/install.sh" <<EOF
#!/usr/bin/env sh
set -eu
OGDB_VERSION="\${OGDB_VERSION:-latest}"
OGDB_HOME="\${OGDB_HOME:-\$HOME/$install_dir}"
EOF
}

write_lib_rs() {
  local binary_dir="$1"
  mkdir -p "$TMPDIR/crates/ogdb-cli/src"
  cat > "$TMPDIR/crates/ogdb-cli/src/lib.rs" <<EOF
fn default_demo_db_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{home}/$binary_dir/demo.ogdb")
}
EOF
}

# -------- Case 1: matching paths (.ogdb == .ogdb) → pass --------
write_install_sh ".ogdb"
write_lib_rs ".ogdb"
if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 1: matching .ogdb paths should pass" >&2
  exit 1
fi
echo "ok case 1: matching .ogdb paths → pass"

# -------- Case 2: cycle-17 91ee552 drift (.opengraphdb vs .ogdb) → fail --------
# This is the literal pre-fix state on origin/main: install.sh writes to
# ~/.opengraphdb but ogdb demo defaults to ~/.ogdb.
write_install_sh ".opengraphdb"
write_lib_rs ".ogdb"
if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 2: drift (.opengraphdb vs .ogdb) should fail" >&2
  exit 1
fi
echo "ok case 2: cycle-17 drift state (.opengraphdb vs .ogdb) → fail"

# -------- Case 3: opposite drift (.ogdb vs .opengraphdb) → fail --------
write_install_sh ".ogdb"
write_lib_rs ".opengraphdb"
if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 3: reverse drift should fail" >&2
  exit 1
fi
echo "ok case 3: reverse drift (.ogdb vs .opengraphdb) → fail"

# -------- Case 4: missing install.sh → exit 2 (config error, not gate violation) --------
rm -f "$TMPDIR/scripts/install.sh"
write_lib_rs ".ogdb"
set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 2 ]]; then
  echo "FAIL case 4: missing install.sh should exit 2, got $rc" >&2
  exit 1
fi
echo "ok case 4: missing install.sh → exit 2"

# -------- Case 5: missing lib.rs → exit 2 --------
write_install_sh ".ogdb"
rm -f "$TMPDIR/crates/ogdb-cli/src/lib.rs"
set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 2 ]]; then
  echo "FAIL case 5: missing lib.rs should exit 2, got $rc" >&2
  exit 1
fi
echo "ok case 5: missing lib.rs → exit 2"

# -------- Case 6: install.sh present but malformed (no OGDB_HOME default line) → exit 2 --------
mkdir -p "$TMPDIR/crates/ogdb-cli/src"
cat > "$TMPDIR/scripts/install.sh" <<'EOF'
#!/usr/bin/env sh
echo "no OGDB_HOME default in this file"
EOF
write_lib_rs ".ogdb"
set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 2 ]]; then
  echo "FAIL case 6: malformed install.sh should exit 2, got $rc" >&2
  exit 1
fi
echo "ok case 6: malformed install.sh (no parsable default) → exit 2"

# -------- Case 7: lib.rs present but malformed (no default_demo_db_path) → exit 2 --------
write_install_sh ".ogdb"
cat > "$TMPDIR/crates/ogdb-cli/src/lib.rs" <<'EOF'
// no default_demo_db_path here
fn unrelated() {}
EOF
set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 2 ]]; then
  echo "FAIL case 7: malformed lib.rs should exit 2, got $rc" >&2
  exit 1
fi
echo "ok case 7: malformed lib.rs (no parsable default) → exit 2"

# -------- Case 8: real repo root passes (gate is consistent with the live source) --------
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if ! bash "$GATE" "$REPO_ROOT" >/dev/null 2>&1; then
  echo "FAIL case 8: gate must pass against the real repo root after the F01 fix" >&2
  bash "$GATE" "$REPO_ROOT" >&2 || true
  exit 1
fi
echo "ok case 8: real repo root passes the gate"

echo "all cases pass"
