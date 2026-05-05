#!/usr/bin/env bash
# Red-green test for scripts/check-skills-copilot-removed.sh.
# Runs the gate against the live tree (expect green), then plants a copilot
# reference in a temp copy and confirms the gate flags it (expect red).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-skills-copilot-removed.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" ) || {
  echo "test FAILED: gate reported HITS on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted copilot reference should fail ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/skills/src"
cp "$REPO_ROOT/skills/README.md"    "$TMP/skills/README.md"
cp "$REPO_ROOT/skills/src/install.ts" "$TMP/skills/src/install.ts"

# Plant a copilot reference (case-insensitive should still catch).
printf '\n# VS Code Copilot — temp planted line for gate test\n' >> "$TMP/skills/README.md"

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted copilot reference" >&2
  exit 1
fi
echo "test: RED on planted reference (expected, exit=$RC)"

echo "test: PASS"
