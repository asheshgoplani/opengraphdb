#!/usr/bin/env bash
set -euo pipefail

CHANGELOG_FILE="CHANGELOG.md"

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  echo "Missing $CHANGELOG_FILE"
  exit 1
fi

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
