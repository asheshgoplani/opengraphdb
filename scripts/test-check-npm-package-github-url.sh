#!/usr/bin/env bash
# Red-green test for scripts/check-npm-package-github-url.sh.
# Runs the gate against the live tree (expect green), then plants a wrong-org
# URL in a temp copy and confirms the gate flags it (expect red).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-npm-package-github-url.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported HITS on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted wrong-org URL should fail ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Mirror the workspace into TMP so the gate can run from there with its own
# git remote. Use a worktree so .git is wired up; checkout HEAD into TMP.
git -C "$REPO_ROOT" worktree add --quiet --detach "$TMP" HEAD
trap 'git -C "$REPO_ROOT" worktree remove --force "$TMP" >/dev/null 2>&1 || true' EXIT

# Plant a fictitious-org URL in skills/package.json homepage.
node -e "
  const fs=require('fs');
  const p='$TMP/skills/package.json';
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  j.homepage='https://github.com/wrongOrg/wrongRepo/tree/main/skills';
  fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
"

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted wrong-org URL" >&2
  exit 1
fi
echo "test: RED on planted wrong-org URL (expected, exit=$RC)"

echo "test: PASS"
