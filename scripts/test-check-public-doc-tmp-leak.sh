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

echo "test: PASS"
