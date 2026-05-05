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

# EVAL-DOCS-COMPLETENESS-CYCLE17 F03: if every data row in § 2 carries the
# '2026-05-02 re-baseline' tag, the L5 "Measurement date:" headline must
# scope the run to "all N rows" rather than enumerate a stale subset.
# cycle-9 baselined rows 3-6+10, cycle-15 cf97159 extended to rows 7-14,
# cycle-16 f72f7cd extended to rows 1-2 — three consecutive cycles where
# the headline drifted behind the table. This gate locks that loop closed.
TABLE_ROWS=$(grep -cE '^\| +[0-9]+ +\|' "$BENCHMARKS_MD" || true)
TAGGED_ROWS=$(grep -cE '^\| +[0-9]+ +\|.*2026-05-02 re-baseline' "$BENCHMARKS_MD" || true)

if [[ "$TABLE_ROWS" -gt 0 && "$TABLE_ROWS" == "$TAGGED_ROWS" ]]; then
  HEADLINE_LINE=$(grep -m1 -E '^\*\*Measurement date:\*\*' "$BENCHMARKS_MD" || true)
  if [[ -z "$HEADLINE_LINE" ]]; then
    echo "check-benchmarks-version: could not find '**Measurement date:**' headline in $BENCHMARKS_MD" >&2
    exit 1
  fi
  if ! echo "$HEADLINE_LINE" | grep -qE "all $TABLE_ROWS rows"; then
    echo "check-benchmarks-version: HEADLINE-vs-TABLE SCOPE DRIFT" >&2
    echo "  every § 2 row ($TAGGED_ROWS / $TABLE_ROWS) carries the '2026-05-02 re-baseline' tag" >&2
    echo "  but the L5 headline does not say 'all $TABLE_ROWS rows':" >&2
    echo "  $HEADLINE_LINE" >&2
    echo "" >&2
    echo "Fix: replace any 'rows X, Y, Z, …' enumeration in the headline with" >&2
    echo "     'all $TABLE_ROWS rows in § 2' so the prose matches the table." >&2
    exit 1
  fi
fi

echo "check-benchmarks-version: ok ($WS_VERSION; headline + § 2 column header agree)"
