#!/usr/bin/env bash
# EVAL-PERF-RELEASE.md Finding 1 (BLOCKER): the workspace bumped to 0.4.0
# weeks before BENCHMARKS.md was updated, so the published baseline didn't
# describe the binary you'd download. This gate fails the PR if the
# workspace `version` (`crates/ogdb-core/Cargo.toml` → workspace.package.version)
# diverges from the BENCHMARKS.md headline.
#
# EVAL-PERF-RELEASE-CYCLE15.md F05/F09: the gate also covers the § 2 table
# column header (the load-bearing claim a reader sees when scanning the
# competitive comparison). A `(carry-fwd …)` marker on that header is the
# escape-hatch for perf-no-op patch releases that intentionally carry an
# older N=5 baseline forward.
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

# § 2 table column header check. The competitive-comparison table column
# names the OpenGraphDB version the numbers came from; a stale value here
# masquerades as the binary's released version even when the headline is
# correct. Find the markdown row that begins '| # | Metric |' and parse
# its OpenGraphDB X.Y.Z token.
TABLE_HEADER_LINE=$(grep -m1 -E '^\| # \| Metric \|' "$BENCHMARKS_MD" || true)
if [[ -z "$TABLE_HEADER_LINE" ]]; then
  echo "check-benchmarks-version: could not find § 2 table column header in $BENCHMARKS_MD" >&2
  echo "  expected: a row beginning with '| # | Metric |' that names the OpenGraphDB column" >&2
  exit 1
fi

TABLE_VERSION=$(echo "$TABLE_HEADER_LINE" | grep -oE 'OpenGraphDB [0-9]+\.[0-9]+\.[0-9]+' | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)
if [[ -z "$TABLE_VERSION" ]]; then
  echo "check-benchmarks-version: could not read OpenGraphDB X.Y.Z from § 2 table column header" >&2
  echo "  got: $TABLE_HEADER_LINE" >&2
  exit 1
fi

if [[ "$TABLE_VERSION" != "$WS_VERSION" ]]; then
  if echo "$TABLE_HEADER_LINE" | grep -q '(carry-fwd'; then
    echo "check-benchmarks-version: ok ($WS_VERSION; § 2 column header carries $TABLE_VERSION forward via (carry-fwd …) marker)"
    exit 0
  fi
  echo "check-benchmarks-version: TABLE COLUMN HEADER VERSION DRIFT" >&2
  echo "  workspace.package.version           = $WS_VERSION  (Cargo.toml)" >&2
  echo "  BENCHMARKS.md § 2 column header     = $TABLE_VERSION" >&2
  echo "" >&2
  echo "Fix: update the § 2 column header to '$WS_VERSION', OR — if the column" >&2
  echo "     intentionally carries an older N=5 baseline forward (e.g. perf-no-op" >&2
  echo "     patch release) — annotate it with a (carry-fwd …) marker, e.g." >&2
  echo "     'OpenGraphDB $WS_VERSION (carry-fwd $TABLE_VERSION N=5)'." >&2
  exit 1
fi

echo "check-benchmarks-version: ok ($WS_VERSION; headline + § 2 column header agree)"
