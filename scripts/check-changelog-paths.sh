#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE17 F02 regression gate.
#
# Cycle-15 commit `8496878` advertised "fix docs/→documentation/ path refs"
# in CHANGELOG.md but missed two adjacent `[0.4.0] ### Added` bullets
# (L96-97: docs/COOKBOOK.md + docs/MIGRATION-FROM-NEO4J.md). Cycle-17 F02
# closes that hole. To prevent the same drift class from re-appearing,
# this gate greps every `(docs|documentation)/<File>.md` reference in
# CHANGELOG.md and asserts each path resolves on disk.
#
# Whitelisted paths (legitimate references that would otherwise fail):
#   docs/IMPLEMENTATION-LOG.md          - internal contributor log (per F02)
#   docs/TDD-METHODOLOGY.md             - contributor doc, exists  (per F02)
#   docs/VERSIONING.md                  - contributor doc, exists  (per F02)
#   docs/FULL-IMPLEMENTATION-CHECKLIST.md - removed in [0.4.0] § Removed;
#                                          referenced in historical [0.3.0]
#                                          and earlier sections that
#                                          accurately document its prior
#                                          existence and removal event.
#   docs/FRONTEND-SPEC.md               - removed in [0.4.0] § Removed;
#                                          historical reference in the
#                                          same § Removed bullet.
#   documentation/AI-NATIVE-FEATURES.md - removed in [0.5.0] § Removed
#                                          (was a Brainstorming dump per
#                                          cycle-2 docs eval C2-B1);
#                                          historical reference in that
#                                          § Removed bullet.
set -euo pipefail

CHANGELOG=${1:-CHANGELOG.md}

if [[ ! -f "$CHANGELOG" ]]; then
  echo "check-changelog-paths: $CHANGELOG not found" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

WHITELIST=(
  "docs/IMPLEMENTATION-LOG.md"
  "docs/TDD-METHODOLOGY.md"
  "docs/VERSIONING.md"
  "docs/FULL-IMPLEMENTATION-CHECKLIST.md"
  "docs/FRONTEND-SPEC.md"
  "documentation/AI-NATIVE-FEATURES.md"
)

is_whitelisted() {
  local path="$1"
  local entry
  for entry in "${WHITELIST[@]}"; do
    if [[ "$path" == "$entry" ]]; then
      return 0
    fi
  done
  return 1
}

# Extract every `(docs|documentation)/<Capital><non-ws>+\.md` token from the
# CHANGELOG. The capital-letter constraint matches the eval's regex and is
# narrow on purpose: subdir paths like `documentation/ai-integration/...md`
# (lowercase first char) are not policed by this gate (they're checked by
# `scripts/check-doc-anchors.sh`). The grep -oE -h returns one match per line.
mapfile -t MATCHES < <(grep -oE '(docs|documentation)/[A-Z][^[:space:]]*\.md' "$CHANGELOG" | sed -E 's/[`,.;:)]+$//' | sort -u)

if [[ ${#MATCHES[@]} -eq 0 ]]; then
  echo "check-changelog-paths: no doc paths found in $CHANGELOG (regex broken?)" >&2
  exit 2
fi

FAIL=0
CHECKED=0
for path in "${MATCHES[@]}"; do
  CHECKED=$((CHECKED + 1))
  if [[ -f "$REPO_ROOT/$path" ]]; then
    continue
  fi
  if is_whitelisted "$path"; then
    continue
  fi
  echo "check-changelog-paths: $CHANGELOG references '$path' but the file does not exist" >&2
  echo "       (and it is not in the historical-removal whitelist)." >&2
  FAIL=1
done

if [[ $FAIL -ne 0 ]]; then
  exit 1
fi

echo "ok ($CHECKED unique doc paths checked; all resolve or whitelisted)"
exit 0
