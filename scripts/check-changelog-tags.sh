#!/usr/bin/env bash
# C2-B5 regression gate: every CHANGELOG footer URL must resolve to a real
# local tag. Footer entries that point at <not-yet-pushed> / <unreleased>
# placeholders are explicitly allowed (they document the gap; they don't
# 404 when clicked).
set -euo pipefail

CHANGELOG=${1:-CHANGELOG.md}

if [[ ! -f "$CHANGELOG" ]]; then
  echo "ERROR: $CHANGELOG not found" >&2
  exit 1
fi

EXIT=0

# Footer line shape: `[X.Y.Z]: <url-or-placeholder>` at the very start of a line.
while IFS= read -r line; do
  # Extract the version label and URL/placeholder body.
  label=$(printf '%s' "$line" | sed -nE 's/^\[([^]]+)\]:.*/\1/p')
  body=$(printf '%s' "$line" | sed -nE 's/^\[[^]]+\]:[[:space:]]*(.*)$/\1/p')

  # Skip the `[Unreleased]` slot — it's allowed to be either a real compare URL
  # or a placeholder; a real tag named "Unreleased" doesn't exist by design.
  if [[ "$label" == "Unreleased" ]]; then
    continue
  fi

  # Allow explicit placeholders.
  if [[ "$body" == \<*\> ]]; then
    continue
  fi

  # If it's a github compare URL, the second tag in the URL is the one this
  # entry claims to map to. Verify that tag exists locally.
  tag=$(printf '%s' "$body" | sed -nE 's|.*compare/[^/]+\.\.\.([^/]+)$|\1|p')
  if [[ -z "$tag" ]]; then
    # `releases/tag/X` shape.
    tag=$(printf '%s' "$body" | sed -nE 's|.*releases/tag/([^/[:space:]]+)$|\1|p')
  fi

  if [[ -z "$tag" ]]; then
    echo "ERROR: $CHANGELOG footer line has unrecognized URL shape: $line" >&2
    EXIT=1
    continue
  fi

  if ! git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
    echo "ERROR: $CHANGELOG footer points at tag '$tag' which does not exist locally:" >&2
    echo "       $line" >&2
    echo "       Either push the tag, cut the URL to a placeholder, or remove the entry." >&2
    EXIT=1
  fi
done < <(grep -E '^\[[^]]+\]:' "$CHANGELOG")

exit $EXIT
