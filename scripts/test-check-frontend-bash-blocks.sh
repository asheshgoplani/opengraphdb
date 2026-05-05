#!/usr/bin/env bash
# Red-green meta-test for scripts/check-frontend-bash-blocks.sh.
#   GREEN: live tree (after HIGH-1 + HIGH-2 fix) passes.
#   RED:   planted TSX with `const _ = 'ogdb serve --http'` trips
#          (the HIGH-1 shape — `path` Option<…> with required_unless_present
#          = "db_path" is satisfied by neither a positional nor `--db`).
#   RED:   planted TSX with `const _ = 'ogdb import datasets/movielens.json'`
#          trips (the HIGH-2 shape — 1 positional vs 2 required by
#          ImportCommand).
#   RED:   planted TSX with an unknown subcommand trips.
#   GREEN: planted TSX with the canonical fix shape passes.
#   GREEN: planted TSX where `ogdb serve --http` lives only inside JSX text
#          / inline `<code>` prose / a `// …` comment must NOT trip — those
#          are out of the gate's scope (the README gate scopes to fenced
#          ```bash blocks; this gate scopes to string literals only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-frontend-bash-blocks.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN on live tree (after HIGH-1 + HIGH-2 fix) ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate flagged the live frontend tree (after HIGH-1+HIGH-2 fix)" >&2
  ( cd "$REPO_ROOT" && "$GATE" ) || true
  exit 1
}
echo "test: GREEN on live tree (expected)"

# Build a planted-fixture sandbox that mirrors the layout the gate expects:
# fixture-root/{frontend/src/<...>.tsx, crates/ogdb-cli/{src/lib.rs, tests/readme_cli_listing.rs}}.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p \
  "$TMP/frontend/src" \
  "$TMP/crates/ogdb-cli/src" \
  "$TMP/crates/ogdb-cli/tests" \
  "$TMP/scripts"
cp "$REPO_ROOT/crates/ogdb-cli/src/lib.rs" "$TMP/crates/ogdb-cli/src/lib.rs"
cp "$REPO_ROOT/crates/ogdb-cli/tests/readme_cli_listing.rs" \
   "$TMP/crates/ogdb-cli/tests/readme_cli_listing.rs"
cp "$GATE" "$TMP/scripts/check-frontend-bash-blocks.sh"
chmod +x "$TMP/scripts/check-frontend-bash-blocks.sh"

run_planted() {
  local label="$1"
  local expected_rc="$2"
  set +e
  ( cd "$TMP" && bash scripts/check-frontend-bash-blocks.sh >/dev/null 2>&1 )
  local rc=$?
  set -e
  if [[ "$expected_rc" == "0" && $rc -ne 0 ]]; then
    echo "test FAILED ($label): expected GREEN but gate exited $rc" >&2
    ( cd "$TMP" && bash scripts/check-frontend-bash-blocks.sh ) || true
    exit 1
  fi
  if [[ "$expected_rc" == "nonzero" && $rc -eq 0 ]]; then
    echo "test FAILED ($label): expected RED but gate exited 0" >&2
    exit 1
  fi
  echo "test: $label (rc=$rc, expected=$expected_rc)"
}

# --- RED: HIGH-1 shape — `ogdb serve --http` with no positional and no --db ---
cat > "$TMP/frontend/src/Bad1.tsx" <<'EOF'
const SERVE_COMMAND = 'ogdb serve --http'
EOF
run_planted "RED on planted HIGH-1 shape (ogdb serve --http)" "nonzero"
rm "$TMP/frontend/src/Bad1.tsx"

# --- RED: HIGH-2 shape — `ogdb import datasets/movielens.json` (1 vs 2 positional) ---
cat > "$TMP/frontend/src/Bad2.tsx" <<'EOF'
export const IMPORT_CMD = 'ogdb import datasets/movielens.json'
EOF
run_planted "RED on planted HIGH-2 shape (ogdb import <one-arg>)" "nonzero"
rm "$TMP/frontend/src/Bad2.tsx"

# --- RED: unknown subcommand ---
cat > "$TMP/frontend/src/Bad3.tsx" <<'EOF'
const CMD = 'ogdb totally-not-a-real-subcommand foo bar'
EOF
run_planted "RED on unknown subcommand" "nonzero"
rm "$TMP/frontend/src/Bad3.tsx"

# --- GREEN: canonical fix shape (HIGH-1: positional present) ---
cat > "$TMP/frontend/src/Ok1.tsx" <<'EOF'
const SERVE_COMMAND = 'ogdb serve --http ~/.ogdb/demo.ogdb'
EOF
run_planted "GREEN on canonical HIGH-1 fix (positional path)" "0"
rm "$TMP/frontend/src/Ok1.tsx"

# --- GREEN: alternate canonical fix (HIGH-1: --db flag in place of positional) ---
cat > "$TMP/frontend/src/Ok2.tsx" <<'EOF'
const STEP = { command: 'ogdb serve --http --db data.ogdb' }
EOF
run_planted "GREEN on --db flag in place of positional" "0"
rm "$TMP/frontend/src/Ok2.tsx"

# --- GREEN: canonical HIGH-2 fix (2 positionals) ---
cat > "$TMP/frontend/src/Ok3.tsx" <<'EOF'
const IMPORT_CMD = 'ogdb import ~/.ogdb/demo.ogdb datasets/movielens.json'
EOF
run_planted "GREEN on canonical HIGH-2 fix (2 positionals)" "0"
rm "$TMP/frontend/src/Ok3.tsx"

# --- GREEN: out-of-scope shapes — JSX text / inline <code> prose / line comment ---
# These mirror the production sites we DELIBERATELY do not flag (HeroSection
# inline <code>, FeaturesSection markdown-in-prose, code-comment narrative).
cat > "$TMP/frontend/src/Prose.tsx" <<'EOF'
// Note: a fresh `ogdb serve --http` mid-import is fine here.
export function Prose() {
  // Marketing prose: the broken-shape literal is INSIDE a comment, must be skipped.
  const description = 'Embed it as a Rust crate, or run `ogdb serve --http` for a server.'
  return (
    <p>
      Run <code>ogdb serve --http</code> in your terminal.
      <pre>ogdb mcp --stdio</pre>
    </p>
  )
}
EOF
run_planted "GREEN on out-of-scope (JSX text / comment / prose-string)" "0"
rm "$TMP/frontend/src/Prose.tsx"

# --- GREEN: bare `ogdb --version` literal (global flag, not a subcommand) ---
cat > "$TMP/frontend/src/Version.tsx" <<'EOF'
const VERSION_CMD = 'ogdb --version'
EOF
run_planted "GREEN on bare --version literal" "0"
rm "$TMP/frontend/src/Version.tsx"

echo "test: PASS"
