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

# C2-H9 regression gate: reject duplicate ### subsections within the same release
# block. Keep-a-Changelog format expects one section per category per release;
# the second occurrence is silently merged or dropped by parsers (GitHub release
# renderer, changelog tooling).
duplicates="$(
  awk '
    /^## \[/        { release=$0 }
    /^### [A-Z]/    { count[release "::" $0]++ }
    END {
      for (key in count)
        if (count[key] > 1)
          print key " (" count[key] " occurrences)"
    }
  ' "$CHANGELOG_FILE"
)"

if [[ -n "$duplicates" ]]; then
  echo "ERROR: CHANGELOG.md has duplicate ### subsections within the same release:" >&2
  printf '  %s\n' "$duplicates" >&2 | sed 's/::/ — /'
  echo "       Merge the duplicates into a single block per category per release." >&2
  exit 1
fi
