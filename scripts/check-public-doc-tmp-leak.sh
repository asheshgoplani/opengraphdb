#!/usr/bin/env bash
# C2-B4 regression gate: forbid `/tmp/...md` references in user-facing docs.
# A reader who isn't the author on their original laptop gets a 404.
#
# Phase-B M-10 extension: ALSO forbid `/Users/<name>/` and `/home/<name>/`
# absolute paths leaking into shipped code (crates/, scripts/, frontend/src/,
# Dockerfile). The author's home directory has no business in a build artifact
# or runtime config — same usability bug as /tmp/...md, broader surface.
# Bare `/home/` (no user component) is allowed (rare but legitimate root path).
set -euo pipefail

# --- Part 1: /tmp/...md in user-facing docs (original gate) ---
PATTERN='/tmp/[^[:space:]]+\.md'
SEARCH_PATHS=(documentation docs README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)

EXISTING=()
for p in "${SEARCH_PATHS[@]}"; do
  [[ -e "$p" ]] && EXISTING+=("$p")
done

DOC_HITS=""
if [[ ${#EXISTING[@]} -gt 0 ]]; then
  # Allow shell-snippet env-var assignments (FOO=/tmp/bar.md) and stdout redirects
  # (`>/tmp/bar.md` / `> /tmp/bar.md`) — those are runnable instructions, not citations.
  DOC_HITS=$(grep -RnE "$PATTERN" "${EXISTING[@]}" 2>/dev/null | grep -vE '=/tmp/' | grep -vE '>[[:space:]]*/tmp/' || true)
fi

# --- Part 2 (M-10): user-home leaks in shipped code ---
USER_PATH_PATTERN='/(Users|home)/[A-Za-z0-9_.-]+/'
USER_SEARCH_PATHS=(crates scripts frontend/src Dockerfile)
USER_EXISTING=()
for p in "${USER_SEARCH_PATHS[@]}"; do
  [[ -e "$p" ]] && USER_EXISTING+=("$p")
done

USER_HITS=""
if [[ ${#USER_EXISTING[@]} -gt 0 ]]; then
  # `--include` filters keep the scan scoped to source/config files —
  # binary/data fixtures elsewhere would be noise. Excludes the gate's own
  # meta-test fixtures.
  USER_HITS=$(grep -RnE "$USER_PATH_PATTERN" "${USER_EXISTING[@]}" \
    --include='*.rs' --include='*.ts' --include='*.tsx' \
    --include='*.js' --include='*.jsx' --include='*.json' \
    --include='*.toml' --include='*.yaml' --include='*.yml' \
    --include='*.sh' --include='*.py' --include='Dockerfile*' \
    2>/dev/null \
    | grep -vE 'scripts/test-check-public-doc-tmp-leak\.sh' \
    | grep -vE 'scripts/check-public-doc-tmp-leak\.sh' \
    || true)
fi

EXIT=0
if [[ -n "$DOC_HITS" ]]; then
  echo "$DOC_HITS" >&2
  echo "ERROR: /tmp/...md leaked into a public doc (see lines above)" >&2
  echo "       Public docs must cite a public URL or in-repo path, not a private /tmp/ scratch file." >&2
  EXIT=1
fi
if [[ -n "$USER_HITS" ]]; then
  echo "$USER_HITS" >&2
  echo "ERROR: /Users/<name>/ or /home/<name>/ absolute path leaked into shipped code (see lines above)" >&2
  echo "       Replace with \$HOME, a relative path, or a config-driven value." >&2
  EXIT=1
fi
exit $EXIT
