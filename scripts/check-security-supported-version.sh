#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE15.md F01 (BLOCKER): SECURITY.md "Supported
# Versions" table drifted to 0.4.x while the workspace shipped 0.5.x, so
# the policy as written declared the current line *unsupported* for
# security fixes. This gate fails the PR if the supported-row minor in
# SECURITY.md diverges from the workspace.package.version minor.
#
# Usage: bash scripts/check-security-supported-version.sh [--root <repo-root>]
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CARGO_TOML="$ROOT/Cargo.toml"
SECURITY_MD="$ROOT/SECURITY.md"

if [[ ! -f "$CARGO_TOML" ]]; then
  echo "check-security-supported-version: missing $CARGO_TOML" >&2
  exit 2
fi
if [[ ! -f "$SECURITY_MD" ]]; then
  echo "check-security-supported-version: missing $SECURITY_MD" >&2
  exit 2
fi

# Pull `workspace.package.version = "X.Y.Z"` out of the workspace root.
WS_VERSION=$(awk '
  /^\[workspace\.package\]/ { in_block = 1; next }
  /^\[/                     { in_block = 0 }
  in_block && /^[[:space:]]*version[[:space:]]*=/ {
    match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
  }
' "$CARGO_TOML")

if [[ -z "$WS_VERSION" ]]; then
  echo "check-security-supported-version: could not read workspace.package.version from $CARGO_TOML" >&2
  exit 2
fi

WS_MINOR=$(echo "$WS_VERSION" | cut -d. -f1-2)

# Find the supported row: a table line ending in "✅" with an "X.Y.x" version cell.
SUPPORTED_MINOR=$(grep -E '^\|[[:space:]]*[0-9]+\.[0-9]+\.x[[:space:]]*\|[[:space:]]*✅' "$SECURITY_MD" \
  | head -n1 \
  | grep -oE '[0-9]+\.[0-9]+' \
  | head -n1 || true)

if [[ -z "$SUPPORTED_MINOR" ]]; then
  echo "check-security-supported-version: could not find a 'X.Y.x | ✅' row in $SECURITY_MD" >&2
  echo "  expected a table row like '| 0.5.x   | ✅        |'" >&2
  exit 1
fi

# The cutoff row should be `< X.Y.0 | ❌`, with the same minor as the supported row.
CUTOFF_MINOR=$(grep -E '^\|[[:space:]]*<[[:space:]]*[0-9]+\.[0-9]+\.0[[:space:]]*\|[[:space:]]*❌' "$SECURITY_MD" \
  | head -n1 \
  | grep -oE '[0-9]+\.[0-9]+' \
  | head -n1 || true)

if [[ -z "$CUTOFF_MINOR" ]]; then
  echo "check-security-supported-version: could not find a '< X.Y.0 | ❌' row in $SECURITY_MD" >&2
  echo "  expected a table row like '| < 0.5.0 | ❌        |'" >&2
  exit 1
fi

if [[ "$SUPPORTED_MINOR" != "$WS_MINOR" ]]; then
  echo "check-security-supported-version: VERSION DRIFT" >&2
  echo "  workspace.package.version       = $WS_VERSION  (Cargo.toml, minor=$WS_MINOR)" >&2
  echo "  SECURITY.md supported row minor = $SUPPORTED_MINOR" >&2
  echo "" >&2
  echo "Fix: update SECURITY.md 'Supported Versions' table so the supported row reads" >&2
  echo "     '| ${WS_MINOR}.x   | ✅        |' and the cutoff reads '| < ${WS_MINOR}.0 | ❌        |'." >&2
  exit 1
fi

if [[ "$CUTOFF_MINOR" != "$WS_MINOR" ]]; then
  echo "check-security-supported-version: SUPPORTED/CUTOFF MINOR MISMATCH" >&2
  echo "  supported row minor = $SUPPORTED_MINOR" >&2
  echo "  cutoff row minor    = $CUTOFF_MINOR" >&2
  echo "" >&2
  echo "Fix: align both rows to ${WS_MINOR}." >&2
  exit 1
fi

echo "check-security-supported-version: ok ($WS_VERSION → ${WS_MINOR}.x supported)"
