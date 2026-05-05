#!/usr/bin/env bash
# Red-green meta-test for scripts/check-readme-bash-blocks.sh.
#   GREEN: live tree (after F01 fix) passes.
#   RED:   planted README that re-introduces `ogdb import data.ttl`
#          (the F01 shape) trips the gate.
#   RED:   planted README that uses an unknown subcommand trips the gate.
#   GREEN: planted README using the canonical 2-step `init` + `import-rdf`
#          form passes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-readme-bash-blocks.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN on live tree ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate flagged the live README.md (after F01 fix)" >&2
  ( cd "$REPO_ROOT" && "$GATE" ) || true
  exit 1
}
echo "test: GREEN on live tree (expected)"

# Build a planted-fixture sandbox that mirrors the layout the gate expects:
# fixture-root/{README.md, crates/ogdb-cli/{src/lib.rs, tests/readme_cli_listing.rs}}.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/crates/ogdb-cli/src" "$TMP/crates/ogdb-cli/tests" "$TMP/scripts"
cp "$REPO_ROOT/crates/ogdb-cli/src/lib.rs" "$TMP/crates/ogdb-cli/src/lib.rs"
cp "$REPO_ROOT/crates/ogdb-cli/tests/readme_cli_listing.rs" \
   "$TMP/crates/ogdb-cli/tests/readme_cli_listing.rs"
cp "$GATE" "$TMP/scripts/check-readme-bash-blocks.sh"
chmod +x "$TMP/scripts/check-readme-bash-blocks.sh"

run_planted() {
  local label="$1"
  local expected_rc="$2"
  set +e
  ( cd "$TMP" && bash scripts/check-readme-bash-blocks.sh >/dev/null 2>&1 )
  local rc=$?
  set -e
  if [[ "$expected_rc" == "0" && $rc -ne 0 ]]; then
    echo "test FAILED ($label): expected GREEN but gate exited $rc" >&2
    ( cd "$TMP" && bash scripts/check-readme-bash-blocks.sh ) || true
    exit 1
  fi
  if [[ "$expected_rc" == "nonzero" && $rc -eq 0 ]]; then
    echo "test FAILED ($label): expected RED but gate exited 0" >&2
    exit 1
  fi
  echo "test: $label (rc=$rc, expected=$expected_rc)"
}

# --- RED: F01 shape — `ogdb import data.ttl` (1 positional, needs 2) ---
cat > "$TMP/README.md" <<'EOF'
# Sample

Run this:

```bash
ogdb import data.ttl
```
EOF
run_planted "RED on planted F01 shape" "nonzero"

# --- RED: unknown subcommand ---
cat > "$TMP/README.md" <<'EOF'
# Sample

```bash
ogdb totally-not-a-real-subcommand foo bar
```
EOF
run_planted "RED on unknown subcommand" "nonzero"

# --- GREEN: canonical fix (init + import-rdf, 2 positionals each) ---
cat > "$TMP/README.md" <<'EOF'
# Sample

```bash
ogdb init mydb.ogdb
ogdb import-rdf mydb.ogdb data.ttl
```
EOF
run_planted "GREEN on canonical 2-step RDF form" "0"

# --- GREEN: bare `ogdb --version` and non-bash blocks must not trigger ---
cat > "$TMP/README.md" <<'EOF'
# Sample

```bash
ogdb --version
```

```text
ogdb import data.ttl    # this lives in a `text` block, not `bash` — ignored
```
EOF
run_planted "GREEN on bare --version + non-bash block" "0"

echo "test: PASS"
