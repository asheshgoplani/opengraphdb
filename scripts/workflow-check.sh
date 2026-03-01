#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="docs/IMPLEMENTATION-LOG.md"
CHANGELOG_FILE="CHANGELOG.md"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Missing $LOG_FILE"
  exit 1
fi

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  echo "Missing $CHANGELOG_FILE"
  exit 1
fi

step_count="$(
  rg -n '^## [0-9]{4}-[0-9]{2}-[0-9]{2} — Step ' "$LOG_FILE" | wc -l | tr -d ' '
)"

changelog_bullet_count="$(
  grep -E '^[[:space:]]*-[[:space:]]+' "$CHANGELOG_FILE" | wc -l | tr -d ' '
)"

unreleased_added_count="$(
  awk '
    /^## \[Unreleased\]/ { in_unreleased=1; next }
    /^## \[/ && in_unreleased { in_unreleased=0 }
    in_unreleased { print }
  ' "$CHANGELOG_FILE" | grep -E '^[[:space:]]*-[[:space:]]+' | wc -l | tr -d ' '
)"

if [[ "$unreleased_added_count" -lt 1 ]]; then
  echo "CHANGELOG.md Unreleased section must contain at least one bullet."
  exit 1
fi

if [[ "$step_count" -gt "$changelog_bullet_count" ]]; then
  echo "Workflow drift detected: implementation steps ($step_count) exceed total changelog bullets ($changelog_bullet_count)."
  echo "Add missing changelog entries for implementation steps."
  exit 1
fi
