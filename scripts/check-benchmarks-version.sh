#!/usr/bin/env bash
# EVAL-PERF-RELEASE.md Finding 1 (BLOCKER): the workspace bumped to 0.4.0
# weeks before BENCHMARKS.md was updated, so the published baseline didn't
# describe the binary you'd download. This gate fails the PR if the
# workspace `version` (`crates/ogdb-core/Cargo.toml` → workspace.package.version)
# diverges from the BENCHMARKS.md headline.
#
# Usage: bash scripts/check-benchmarks-version.sh [--root <repo-root>]
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CARGO_TOML="$ROOT/Cargo.toml"
BENCHMARKS_MD="$ROOT/documentation/BENCHMARKS.md"

if [[ ! -f "$CARGO_TOML" ]]; then
  echo "check-benchmarks-version: missing $CARGO_TOML" >&2
  exit 2
fi
if [[ ! -f "$BENCHMARKS_MD" ]]; then
  echo "check-benchmarks-version: missing $BENCHMARKS_MD" >&2
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
  echo "check-benchmarks-version: could not read workspace.package.version from $CARGO_TOML" >&2
  exit 2
fi

# Pull the headline version from `# OpenGraphDB X.Y.Z — ...` (line 1).
HEADLINE_VERSION=$(head -n1 "$BENCHMARKS_MD" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)

if [[ -z "$HEADLINE_VERSION" ]]; then
  echo "check-benchmarks-version: could not read headline version from line 1 of $BENCHMARKS_MD" >&2
  echo "  expected: '# OpenGraphDB X.Y.Z — ...'" >&2
  echo "  got:      '$(head -n1 "$BENCHMARKS_MD")'" >&2
  exit 1
fi

if [[ "$WS_VERSION" != "$HEADLINE_VERSION" ]]; then
  echo "check-benchmarks-version: VERSION DRIFT" >&2
  echo "  workspace.package.version  = $WS_VERSION  (Cargo.toml)" >&2
  echo "  BENCHMARKS.md headline     = $HEADLINE_VERSION" >&2
  echo "" >&2
  echo "Fix: update documentation/BENCHMARKS.md headline + every X.Y.Z reference" >&2
  echo "     to match $WS_VERSION, OR re-baseline at the new version." >&2
  exit 1
fi

echo "check-benchmarks-version: ok ($WS_VERSION)"
