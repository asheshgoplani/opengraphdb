#!/usr/bin/env bash
# check-bundle-budget.sh
#
# Asserts the gzipped size of frontend/dist-app/assets/index-*.js stays
# under 180 KB. The budget exists so a careless `import` of a heavy lib
# (D3, monaco, all of Material UI, etc.) doesn't silently bloat the SPA's
# initial paint without anyone noticing.
#
# Usage:
#   bash scripts/check-bundle-budget.sh                # uses repo root
#   bash scripts/check-bundle-budget.sh /path/to/root  # explicit root
#   BUDGET_KB=200 bash scripts/check-bundle-budget.sh  # override budget
#
# Exit codes:
#   0  pass — bundle exists and is under budget
#   1  fail — bundle exists but exceeds budget
#   2  config error (missing tools, ambiguous match)
#  77  skip — dist-app not built yet (CI should build first; local dev
#             often hasn't built, so we don't fail-hard on missing dist)
set -euo pipefail

BUDGET_KB="${BUDGET_KB:-180}"
BUDGET_BYTES=$(( BUDGET_KB * 1024 ))

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
DIST_DIR="$ROOT/frontend/dist-app/assets"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "check-bundle-budget: skip — $DIST_DIR not present (run \`npm run build:app\` first)" >&2
  exit 0  # green-skip: CI builds dist in a separate job; this gate only fires when assets present
fi

# Find the entry chunk. Vite emits `index-<hash>.js` (8-char alnum hash) for
# the SPA entry. After the multi-entry build (slice S7), the same dir also
# contains `index-app-<hash>.js` and `index-marketing-<hash>.js` as named
# entries. Only the bare `index-<hash>.js` is the cold-load entry we budget;
# the named ones are sub-budgets we don't gate yet.
# Match `index-<hash>.js` only (8-12 alnum hash). Exclude `index-app-*`,
# `index-marketing-*`, and any other `index-<word>-<hash>.js` named entries.
# Use bash globs + extglob negation rather than find -regex for portability;
# find -regex's behavior depends on -regextype which differs across systems.
shopt -s nullglob extglob
MATCHES=("$DIST_DIR"/index-+([A-Za-z0-9_]).js)
shopt -u extglob
if [[ ${#MATCHES[@]} -eq 0 ]]; then
  echo "check-bundle-budget: no $DIST_DIR/index-*.js found" >&2
  exit 1
fi
if [[ ${#MATCHES[@]} -gt 1 ]]; then
  echo "check-bundle-budget: ambiguous — multiple index-*.js in $DIST_DIR:" >&2
  printf '  %s\n' "${MATCHES[@]}" >&2
  exit 2
fi
ENTRY="${MATCHES[0]}"

if ! command -v gzip >/dev/null 2>&1; then
  echo "check-bundle-budget: gzip not on PATH" >&2
  exit 2
fi

# Measure gzip size with default level (matches `vite build` precompression
# default; per-tool tweaks won't shift it more than a few percent).
GZIPPED_BYTES=$(gzip -c -- "$ENTRY" | wc -c | tr -d ' ')

if [[ -z "$GZIPPED_BYTES" || "$GZIPPED_BYTES" -le 0 ]]; then
  echo "check-bundle-budget: failed to measure gzip size of $ENTRY" >&2
  exit 2
fi

GZIPPED_KB=$(( (GZIPPED_BYTES + 1023) / 1024 ))

if [[ "$GZIPPED_BYTES" -gt "$BUDGET_BYTES" ]]; then
  echo "check-bundle-budget: BUDGET EXCEEDED" >&2
  echo "  entry:     $ENTRY" >&2
  echo "  gzip size: ${GZIPPED_KB} KB (${GZIPPED_BYTES} bytes)" >&2
  echo "  budget:    ${BUDGET_KB} KB (${BUDGET_BYTES} bytes)" >&2
  echo "" >&2
  echo "Fix: investigate what was imported — \`npx vite-bundle-visualizer\`" >&2
  echo "or set BUDGET_KB= to a higher value if the growth is intentional and" >&2
  echo "approved." >&2
  exit 1
fi

echo "check-bundle-budget: ok (entry=$(basename "$ENTRY") gzip=${GZIPPED_KB} KB / ${BUDGET_KB} KB budget)"
