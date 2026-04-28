#!/usr/bin/env bash
set -euo pipefail

CHANGELOG_FILE="CHANGELOG.md"

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  echo "Missing $CHANGELOG_FILE"
  exit 1
fi

if ! grep -qE '^## \[Unreleased\]' "$CHANGELOG_FILE"; then
  echo "CHANGELOG.md must contain a '## [Unreleased]' section."
  exit 1
fi

if ! grep -qE '^### (Added|Changed|Fixed|Removed|Security)' "$CHANGELOG_FILE"; then
  echo "CHANGELOG.md should use standard section headings (Added/Changed/Fixed/Removed/Security)."
  exit 1
fi

# Ensure Unreleased has at least one bullet item.
unreleased_block="$(
  awk '
    /^## \[Unreleased\]/ { in_block=1; next }
    /^## \[/ && in_block { in_block=0 }
    in_block { print }
  ' "$CHANGELOG_FILE"
)"

if ! grep -Eq '^[[:space:]]*-[[:space:]]+' <<<"$unreleased_block"; then
  echo "Unreleased section in CHANGELOG.md must contain at least one bullet entry."
  exit 1
fi
