#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE18 F02: structural mirror gate for the
# BENCHMARKS verdict vocabulary.
#
# Cycle-17 e585f66 toned down the BENCHMARKS verdict legend
# (DIRECTIONAL WIN → DIRECTIONAL INDICATOR pending apples-to-apples;
# dropped "crushing" language; restructured the scorecard from
# "3 wins / 2 losses / 6 novel" to "1 verified WIN / 2 caveated WIN /
# 2 losses / 6 novel-or-directional") in documentation/BENCHMARKS.md
# but did not propagate to the three downstream surfaces that mirror
# the verdicts. This is the same partial-sweep class that cycle-17 F03
# caught at the headline-vs-column-header level — generalized here to
# the verdict-vocabulary axis.
#
# Rule: any token in the FORBIDDEN set must appear EITHER zero times
# across the BENCHMARKS-mirroring files (clean sweep) OR every
# occurrence must be on a line that carries the explicit
# `<!-- HISTORICAL -->` marker (intentional historical quote, e.g.
# CHANGELOG-style "previously this said X" attribution).
#
# Mirror files: BENCHMARKS.md (source), SKILL.md, benchmarks-snapshot.md,
# MIGRATION-FROM-NEO4J.md.
set -euo pipefail

FILES=(
  "documentation/BENCHMARKS.md"
  "skills/opengraphdb/SKILL.md"
  "skills/opengraphdb/references/benchmarks-snapshot.md"
  "documentation/MIGRATION-FROM-NEO4J.md"
)

FORBIDDEN=(
  'DIRECTIONAL WIN'
  'crushing'
  '3 wins / 2 losses / 6 novel'
)

MISSING=()
for p in "${FILES[@]}"; do
  [[ -e "$p" ]] || MISSING+=("$p")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "check-benchmarks-vocabulary-mirror: expected files not found: ${MISSING[*]}" >&2
  exit 2
fi

FAIL=0
for token in "${FORBIDDEN[@]}"; do
  for p in "${FILES[@]}"; do
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      if ! grep -q '<!-- HISTORICAL -->' <<<"$line"; then
        echo "check-benchmarks-vocabulary-mirror: FAIL — forbidden token '$token' in $p without <!-- HISTORICAL --> marker:" >&2
        echo "  $line" >&2
        FAIL=1
      fi
    done < <(grep -nF "$token" "$p" || true)
  done
done

if [[ $FAIL -ne 0 ]]; then
  echo >&2
  echo "Cycle-17 e585f66 retracted these tokens in documentation/BENCHMARKS.md." >&2
  echo "Mirror files must either drop the token or annotate the line as" >&2
  echo "an intentional historical reference with a trailing <!-- HISTORICAL --> marker." >&2
  exit 1
fi

echo "check-benchmarks-vocabulary-mirror: ok (no unmarked legacy verdict vocabulary across BENCHMARKS mirror files)"
exit 0
