#!/usr/bin/env bash
# C2-B4 regression gate: forbid `/tmp/...md` references in user-facing docs.
# A reader who isn't the author on their original laptop gets a 404.
set -euo pipefail

PATTERN='/tmp/[^[:space:]]+\.md'
SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)

EXISTING=()
for p in "${SEARCH_PATHS[@]}"; do
  [[ -e "$p" ]] && EXISTING+=("$p")
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  exit 0
fi

# Allow shell-snippet env-var assignments (FOO=/tmp/bar.md) and stdout redirects
# (`>/tmp/bar.md` / `> /tmp/bar.md`) — those are runnable instructions, not citations.
HITS=$(grep -RnE "$PATTERN" "${EXISTING[@]}" 2>/dev/null | grep -vE '=/tmp/' | grep -vE '>[[:space:]]*/tmp/' || true)
if [[ -n "$HITS" ]]; then
  echo "$HITS" >&2
  echo "ERROR: /tmp/...md leaked into a public doc (see lines above)" >&2
  echo "       Public docs must cite a public URL or in-repo path, not a private /tmp/ scratch file." >&2
  exit 1
fi
