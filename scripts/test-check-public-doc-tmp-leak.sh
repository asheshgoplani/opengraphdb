#!/usr/bin/env bash
# Red-green test for scripts/check-public-doc-tmp-leak.sh.
# GREEN: live tree (no `/tmp/...md` citations leak into user-facing docs).
# RED:   a planted bare-`/tmp/foo.md` citation trips the gate; a
# `FOO=/tmp/x.md` env-assignment + `> /tmp/x.md` redirect remain allowed
# (C2-B4 — runnable shell snippets are not citations).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-public-doc-tmp-leak.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" ) || {
  echo "test FAILED: gate reported on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/documentation"

# --- GREEN: env-var assignment + stdout redirect are allowed shapes ---
cat > "$TMP/documentation/sample.md" <<'EOF'
Run with `OUT=/tmp/sample.md ogdb dump` then `cat foo > /tmp/sample.md`.
EOF
( cd "$TMP" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate flagged FOO=/tmp/x.md or > /tmp/x.md (allowed shapes)" >&2
  exit 1
}
echo "test: GREEN on env-assignment + redirect fixture (expected)"

# --- RED: bare /tmp/...md prose citation ---
cat > "$TMP/documentation/sample.md" <<'EOF'
See `/tmp/scratchpad-notes.md` for the full design discussion.
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a bare /tmp/...md citation" >&2
  exit 1
fi
echo "test: RED on planted /tmp citation (expected, exit=$RC)"

# --- M-10: extension — user-home path in shipped code ---
rm -f "$TMP/documentation/sample.md"
mkdir -p "$TMP/scripts" "$TMP/crates/foo/src" "$TMP/frontend/src"

# GREEN: bare `/home/` (no user) in scripts is allowed.
cat > "$TMP/scripts/ok.sh" <<'EOF'
#!/usr/bin/env bash
# Touches /home/ (no user) — allowed.
ls /home/ >/dev/null
EOF
( cd "$TMP" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate flagged bare /home/ (no user component)" >&2
  exit 1
}
echo "test: GREEN on bare /home/ (no user) — extension expected"

# RED-A: /home/<name>/ in a *.rs source file
cat > "$TMP/crates/foo/src/lib.rs" <<'EOF'
const PATH: &str = "/home/alice/datasets/movielens";
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag /home/alice/ in a *.rs source" >&2
  exit 1
fi
echo "test: RED on /home/<name>/ in *.rs (extension expected, exit=$RC)"

# RED-B: /Users/<name>/ in frontend code
rm "$TMP/crates/foo/src/lib.rs"
cat > "$TMP/frontend/src/Settings.tsx" <<'EOF'
const DEFAULT = "/Users/bob/.opengraphdb";
EOF
set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag /Users/bob/ in frontend tsx" >&2
  exit 1
fi
echo "test: RED on /Users/<name>/ in *.tsx (extension expected, exit=$RC)"

echo "test: PASS"
