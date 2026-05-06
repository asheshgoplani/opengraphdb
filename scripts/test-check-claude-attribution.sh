#!/usr/bin/env bash
# Red-green meta-test for scripts/check-claude-attribution.sh.
# GREEN: live tree (no Claude attribution in commits or tracked files).
# RED:   sandbox repo with a tracked file containing
#        `Co-Authored-By: Claude` trips the gate.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-claude-attribution.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported on a clean live tree" >&2
  exit 1
}
echo "test: GREEN on clean live tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Build a minimal git-tracked sandbox so the gate's `git ls-files` works.
mkdir -p "$TMP/scripts"
cp "$GATE" "$TMP/scripts/check-claude-attribution.sh"
chmod +x "$TMP/scripts/check-claude-attribution.sh"

cd "$TMP"
git init -q
git config user.email "test@example.com"
git config user.name "test"

cat > "$TMP/innocuous.md" <<'EOF'
# A perfectly normal doc with no leaked attribution.
EOF
git add scripts/check-claude-attribution.sh innocuous.md
git commit -qm "initial sandbox commit"

# --- GREEN inside sandbox ---
( cd "$TMP" && "$TMP/scripts/check-claude-attribution.sh" >/dev/null ) || {
  echo "test FAILED: sandbox green path failed" >&2
  exit 1
}
echo "test: GREEN on sandbox before plant (expected)"

# --- RED: plant a tracked file with a Claude co-author trailer ---
cat > "$TMP/leaked.md" <<'EOF'
Some notes.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
git add leaked.md
git commit -qm "plant fixture (no attribution in commit message itself)"

set +e
( cd "$TMP" && "$TMP/scripts/check-claude-attribution.sh" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted Co-Authored-By: Claude trailer" >&2
  exit 1
fi
echo "test: RED on planted Co-Authored-By trailer (expected, exit=$RC)"

# --- RED: a commit message containing the bot emoji also trips ---
rm "$TMP/leaked.md"
git add leaked.md 2>/dev/null || git rm -q leaked.md
git commit -qm "🤖 a planted commit message attribution"
set +e
( cd "$TMP" && "$TMP/scripts/check-claude-attribution.sh" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a 🤖 commit-message attribution" >&2
  exit 1
fi
echo "test: RED on planted 🤖 commit message (expected, exit=$RC)"

echo "test: PASS"
