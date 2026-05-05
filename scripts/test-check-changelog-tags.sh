#!/usr/bin/env bash
# C15-F01 regression test: scripts/check-changelog-tags.sh must reject a
# CHANGELOG.md whose footer is missing a slot for a `## [X.Y.Z]` heading.
# Pre-fix the gate ignored heading-vs-footer drift; this test pins the new
# reconciliation loop so the v0.5.0 / v0.5.1 footer-drift class can't recur.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATE="$SCRIPT_DIR/check-changelog-tags.sh"
SOURCE_CHANGELOG="$REPO_ROOT/CHANGELOG.md"

if [[ ! -x "$GATE" ]]; then
  echo "ERROR: $GATE not executable" >&2
  exit 1
fi
if [[ ! -f "$SOURCE_CHANGELOG" ]]; then
  echo "ERROR: $SOURCE_CHANGELOG not found" >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

TMP_CHANGELOG="$TMPDIR/CHANGELOG.md"
cp "$SOURCE_CHANGELOG" "$TMP_CHANGELOG"

# Sanity: real CHANGELOG passes the gate (gate must run from repo root for git tag lookups).
if ! ( cd "$REPO_ROOT" && bash "$GATE" "$TMP_CHANGELOG" ) >/dev/null 2>&1; then
  echo "FAIL: gate rejected the unmodified CHANGELOG.md (expected pass)" >&2
  exit 1
fi

# Pick a heading entry that has a matching footer; delete the footer; assert gate fails.
VICTIM=$(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$TMP_CHANGELOG" | head -n1 | sed -E 's/^## \[([^]]+)\].*/\1/')
if [[ -z "$VICTIM" ]]; then
  echo "FAIL: could not find any `## [X.Y.Z]` heading in $TMP_CHANGELOG" >&2
  exit 1
fi

# Remove the matching `[VICTIM]: …` footer line.
sed -i.bak "/^\[${VICTIM}\]:/d" "$TMP_CHANGELOG"
if grep -qE "^\[${VICTIM}\]:" "$TMP_CHANGELOG"; then
  echo "FAIL: failed to delete footer entry for [$VICTIM]" >&2
  exit 1
fi

set +e
( cd "$REPO_ROOT" && bash "$GATE" "$TMP_CHANGELOG" ) >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "FAIL: gate accepted CHANGELOG with missing footer entry for [$VICTIM] (expected non-zero exit)" >&2
  exit 1
fi

echo "OK: heading-vs-footer reconciliation gate rejected missing [$VICTIM] footer (exit=$RC)"
exit 0
