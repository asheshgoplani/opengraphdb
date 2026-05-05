#!/usr/bin/env bash
# F07 regression gate (EVAL-DOCS-COMPLETENESS-CYCLE15): CONTRIBUTING.md must
# declare the same coverage thresholds as scripts/coverage.sh actually
# enforces. The historical bug: CONTRIBUTING said "93% / 3000" while the
# script enforced "80% / 5000" (relaxed when the monolith split landed).
# A contributor reading CONTRIBUTING got a wrong picture of the bar.
#
# This gate parses both files and asserts the bolded "**N% line coverage,
# ≤ M uncovered lines**" claim in CONTRIBUTING.md matches the
# `--fail-under-lines N` / `--fail-uncovered-lines M` flags in
# scripts/coverage.sh.
set -euo pipefail

CONTRIBUTING="${1:-CONTRIBUTING.md}"
COVERAGE_SH="${2:-scripts/coverage.sh}"

if [[ ! -f "$CONTRIBUTING" ]]; then
  echo "check-contributing-coverage-claim: $CONTRIBUTING not found" >&2
  exit 2
fi
if [[ ! -f "$COVERAGE_SH" ]]; then
  echo "check-contributing-coverage-claim: $COVERAGE_SH not found" >&2
  exit 2
fi

ACTUAL_PCT=$(grep -oE -- '--fail-under-lines[[:space:]]+[0-9]+' "$COVERAGE_SH" \
              | grep -oE '[0-9]+' | head -1 || true)
ACTUAL_LINES=$(grep -oE -- '--fail-uncovered-lines[[:space:]]+[0-9]+' "$COVERAGE_SH" \
                | grep -oE '[0-9]+' | head -1 || true)

if [[ -z "$ACTUAL_PCT" || -z "$ACTUAL_LINES" ]]; then
  echo "ERROR (F07): cannot parse --fail-under-lines / --fail-uncovered-lines from $COVERAGE_SH" >&2
  exit 2
fi

# Match the bolded current claim. Accept either ASCII '<=' or the unicode
# '≤' as the inequality glyph. The bolding distinguishes the *current*
# declared gate from any historical numbers cited in surrounding prose
# (e.g. "lowered from the prior 93%/3000 value").
CLAIM=$(grep -oE '\*\*[0-9]+% line coverage,[[:space:]]*(≤|<=)[[:space:]]*[0-9]+ uncovered lines\*\*' \
         "$CONTRIBUTING" | head -1 || true)

if [[ -z "$CLAIM" ]]; then
  echo "ERROR (F07): CONTRIBUTING.md does not declare a coverage gate in the bolded form" >&2
  echo "  expected: **N% line coverage, ≤ M uncovered lines**" >&2
  echo "  found:    (no match in $CONTRIBUTING)" >&2
  exit 1
fi

CLAIMED_PCT=$(echo "$CLAIM" | grep -oE '[0-9]+%' | head -1 | tr -d '%')
CLAIMED_LINES=$(echo "$CLAIM" | grep -oE '[0-9]+ uncovered' | head -1 | grep -oE '[0-9]+')

if [[ "$CLAIMED_PCT" != "$ACTUAL_PCT" || "$CLAIMED_LINES" != "$ACTUAL_LINES" ]]; then
  echo "ERROR (F07): CONTRIBUTING.md coverage-gate claim drifted from $COVERAGE_SH" >&2
  echo "  CONTRIBUTING.md says: ${CLAIMED_PCT}% line coverage, <= ${CLAIMED_LINES} uncovered lines" >&2
  echo "  $COVERAGE_SH:        ${ACTUAL_PCT}% line coverage, <= ${ACTUAL_LINES} uncovered lines" >&2
  echo "  Fix: update the bolded claim in CONTRIBUTING.md, or (intentional change) update both together." >&2
  exit 1
fi

exit 0
