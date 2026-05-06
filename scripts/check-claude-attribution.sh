#!/usr/bin/env bash
# Phase-B H-13: Claude-attribution gate.
#
# The user's global writing rule (CLAUDE.md TOP-PRIORITY) forbids any
# Claude-authored attribution shipping into git history or tracked files —
# emoji robot, `Co-Authored-By: Claude`, `Generated with Claude` strings
# are all out. This gate scans commit messages (`git log --all --grep`)
# AND the working tree (`git ls-files | xargs grep`) for the three
# canonical leak shapes.
#
# Excludes itself + its meta-test from the tree scan: those files
# necessarily mention the patterns in their own source/test fixtures.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Bail early if not a git repo (the meta-test sandbox handles this; live
# tree is always a git repo).
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "check-claude-attribution: not a git repo, skipping" >&2
  exit 0
fi

PATTERNS=(
  '🤖'
  'Co-Authored-By:.*[Cc]laude'
  'Generated with Claude'
)
COMBINED=$(IFS='|'; echo "${PATTERNS[*]}")

# --- 1. Commit-message scan ---
COMMIT_HITS=""
for pat in "${PATTERNS[@]}"; do
  hits=$(git log --all --grep="$pat" --format='%H %s' 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    COMMIT_HITS+="pattern: $pat"$'\n'"$hits"$'\n\n'
  fi
done

# --- 2. Tracked-file content scan ---
EXCLUDES=(
  'scripts/check-claude-attribution.sh'
  'scripts/test-check-claude-attribution.sh'
)
EXCLUDE_RE=$(IFS='|'; echo "${EXCLUDES[*]}")

# git ls-files emits NUL-safe via -z; pair with grep -z. We then filter via
# a second pass to drop the gate's own files + the meta-test.
FILE_LIST=$(git ls-files | grep -vE "^(${EXCLUDE_RE})\$" || true)

TREE_HITS=""
if [[ -n "$FILE_LIST" ]]; then
  # xargs -d'\n' to handle paths with spaces but not newlines (none expected
  # in this repo). --binary-files=without-match keeps the scan deterministic
  # in case a fixture binary slips in.
  TREE_HITS=$(printf '%s\n' "$FILE_LIST" \
    | xargs -d'\n' grep -nE --binary-files=without-match "$COMBINED" 2>/dev/null \
    || true)
fi

if [[ -n "$COMMIT_HITS" || -n "$TREE_HITS" ]]; then
  if [[ -n "$COMMIT_HITS" ]]; then
    echo "ERROR: Claude attribution in commit messages:" >&2
    printf '%s' "$COMMIT_HITS" >&2
  fi
  if [[ -n "$TREE_HITS" ]]; then
    echo "ERROR: Claude attribution in tracked files:" >&2
    echo "$TREE_HITS" >&2
  fi
  echo >&2
  echo "Per CLAUDE.md TOP-PRIORITY rules: never ship 🤖, Co-Authored-By:" >&2
  echo "Claude, or 'Generated with Claude' attributions. Sign as Ashesh" >&2
  echo "Goplani only. To rewrite history, see contrib docs (out of scope" >&2
  echo "for the gate)." >&2
  exit 1
fi

echo "check-claude-attribution: ok (no Claude attribution in commits or tree)"
