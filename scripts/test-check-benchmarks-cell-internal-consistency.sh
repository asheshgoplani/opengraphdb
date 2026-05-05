#!/usr/bin/env bash
# Red-green meta-test for scripts/check-benchmarks-cell-internal-consistency.sh.
#
# (1)  GREEN-1:  gate green on BENCHMARKS.md alone (single-arg, backward-compat path).
# (1b) GREEN-2:  gate green on the default 4-file mirror scan (no-arg path).
# (2)  RED-A:    cycle-28 F02 stale Row 7 § 3 value (45.4 ms) planted in BENCHMARKS.md.
# (3)  RED-B:    cycle-28 F03 stale Row 10 verdict operand (1.88 μs + 91 000× / 27 000×)
#                planted in BENCHMARKS.md.
# (4)  RED-C:    cycle-29 F01 stale Row 10 back-reference ("the headline 91 000× ratio")
#                planted in BENCHMARKS.md.
# (5)  RED-D:    cycle-30 F01 partial-sweep replay — stale back-reference planted inside
#                `skills/opengraphdb/references/benchmarks-snapshot.md` Row 10 verdict.
# (6)  RED-E:    cycle-30 F01 partial-sweep replay — synthetic numbered row with stale
#                back-reference planted inside `skills/opengraphdb/SKILL.md`. SKILL.md
#                ships no numbered row tables today, so the fixture injects a benign
#                synthetic row purely to confirm the gate scans the file at all.
# (7)  RED-F:    cycle-30 F02 partial-sweep replay — Row 13 bullet drift planted inside
#                `documentation/MIGRATION-FROM-NEO4J.md` (0.38/0.32/28.0 → 0.41/0.30/26.3),
#                cross-checked against canonical BENCHMARKS.md row 13 via CHECK A.
# (8)  RED-G:    cycle-31 F01 — Row 7 multi-line bullet *continuation* drift planted inside
#                `documentation/MIGRATION-FROM-NEO4J.md` (46.7 → 45.4 ms on the wrapped line).
#                Locks the new parse_bullets continuation accumulator: pre-fix this drift
#                was invisible to CHECK A because b['text'] was just the bullet header line.
# (9)  RED-H:    cycle-31 F01 — Row 10 multi-line bullet continuation back-reference drift
#                in MIGRATION (`headline\n  128 000× ratio` → `91 000× ratio`). Locks the
#                new bullet back-reference scan against canonical row 10 verdict primaries.
# (10) RED-I:    cycle-31 F02 — SKILL.md "Performance you can expect" perf-table cell drift
#                (Enrichment row 46.7 ms → 45.4 ms). Locks the new CHECK D parse_perf_table
#                + label-to-row map: pre-fix SKILL.md had zero substantive coverage.
# (11) RED-K:    cycle-32 F02 — MIGRATION § 1 feature-bullet drift planted into a generic
#                bullet that cites `(BENCHMARKS row 13)` but doesn't open with `- **Row N**`
#                (`~28 MB` → `~26.3 MB`). Pre-cycle-32 parse_bullets only matched
#                `- **Row N**` headers, so feature bullets escaped. Locks the new
#                parse_feature_bullets sibling parser.
# (12) RED-L:    cycle-32 F03 — SKILL.md perf-table verdict-column drift (`343× under
#                threshold` → `200× under threshold` on the row mapped to canonical
#                BENCHMARKS row 8). Pre-cycle-32 CHECK D scanned only cells[1] (OGDB),
#                so verdict-column multipliers mirroring canonical headlines escaped.
#                Locks the new CHECK D verdict-multiplier scan against canonical
#                row's verdict primary multipliers.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-benchmarks-cell-internal-consistency.sh"
LIVE="$REPO_ROOT/documentation/BENCHMARKS.md"
SKILL="$REPO_ROOT/skills/opengraphdb/SKILL.md"
SNAPSHOT="$REPO_ROOT/skills/opengraphdb/references/benchmarks-snapshot.md"
MIGRATION="$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"

if [[ ! -x "$GATE" ]]; then
  echo "test FAILED: $GATE is not executable" >&2
  exit 2
fi
for f in "$LIVE" "$SKILL" "$SNAPSHOT" "$MIGRATION"; do
  if [[ ! -f "$f" ]]; then
    echo "test FAILED: $f not found" >&2
    exit 2
  fi
done

# --- (1) GREEN-1: BENCHMARKS.md alone (single-arg path) ---
"$GATE" "$LIVE" >/dev/null 2>&1 || {
  echo "test FAILED: gate reported HITS on a clean BENCHMARKS.md" >&2
  "$GATE" "$LIVE" >&2 || true
  exit 1
}
echo "test: GREEN-1 on clean BENCHMARKS.md alone (expected)"

# --- (1b) GREEN-2: default 4-file mirror scan (no-arg path) ---
"$GATE" >/dev/null 2>&1 || {
  echo "test FAILED: gate reported HITS on a clean default 4-file scan" >&2
  "$GATE" >&2 || true
  exit 1
}
echo "test: GREEN-2 on clean 4-file mirror scan (expected)"

# --- (2) RED-A: plant F02 stale Row 7 § 3 in BENCHMARKS.md ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp "$LIVE" "$TMP/BENCHMARKS-redA.md"
python3 - "$TMP/BENCHMARKS-redA.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = '**Row 7 — Enrichment p95 = 46.7 ms (0.4.0 N=5 median, carried forward to 0.5.1).**'
if needle not in text:
    raise SystemExit(f'fixture: needle not found, file may have drifted: {needle!r}')
text = text.replace(
    needle,
    '**Row 7 — Enrichment p95 = 45.4 ms (N=5 median).**'
)
p.write_text(text, encoding='utf-8')
PY

set +e
"$GATE" "$TMP/BENCHMARKS-redA.md" >/dev/null 2>&1
RC_A=$?
set -e
if [[ $RC_A -eq 0 ]]; then
  echo "test FAILED (RED-A): gate did not flag a planted stale Row 7 § 3 value in BENCHMARKS.md" >&2
  exit 1
fi
echo "test: RED-A on planted Row 7 § 3 stale value in BENCHMARKS.md (expected, exit=$RC_A)"

# --- (3) RED-B: plant F03 Row 10 verdict drift in BENCHMARKS.md ---
cp "$LIVE" "$TMP/BENCHMARKS-redB.md"
python3 - "$TMP/BENCHMARKS-redB.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = (
    'batch p95 of 1.34 μs is ≈ 128 000× faster than Cohere Rerank 3.5 '
    '(171.5 ms, [ZeroEntropy article]'
    '(https://www.zeroentropy.dev/articles/lightning-fast-reranking-with-zerank-1)) '
    'and ≈ 37 000× under the best-in-class bar.'
)
if needle not in text:
    raise SystemExit(f'fixture: needle not found, file may have drifted: {needle!r}')
text = text.replace(
    needle,
    'batch p95 of 1.88 μs is 91 000× faster than Cohere Rerank 3.5 '
    '(171.5 ms, [ZeroEntropy article]'
    '(https://www.zeroentropy.dev/articles/lightning-fast-reranking-with-zerank-1)) '
    'and 27 000× under the best-in-class bar.'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_B=$("$GATE" "$TMP/BENCHMARKS-redB.md" 2>&1)
RC_B=$?
set -e
if [[ $RC_B -eq 0 ]]; then
  echo "test FAILED (RED-B): gate did not flag a planted Row 10 verdict-operand drift in BENCHMARKS.md" >&2
  echo "$OUT_B" >&2
  exit 1
fi
if ! grep -q 'multiplier operand "1.88μs"' <<<"$OUT_B"; then
  echo "test FAILED (RED-B): gate output missing operand-not-in-headline error:" >&2
  echo "$OUT_B" >&2
  exit 1
fi
echo "test: RED-B on planted Row 10 verdict drift in BENCHMARKS.md (expected, exit=$RC_B)"

# --- (4) RED-C: plant F01 stale back-reference in BENCHMARKS.md ---
cp "$LIVE" "$TMP/BENCHMARKS-redC.md"
python3 - "$TMP/BENCHMARKS-redC.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = 'so the headline 128 000× ratio is best read as'
if needle not in text:
    raise SystemExit(f'fixture: needle not found, file may have drifted: {needle!r}')
text = text.replace(
    needle,
    'so the headline 91 000× ratio is best read as'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_C=$("$GATE" "$TMP/BENCHMARKS-redC.md" 2>&1)
RC_C=$?
set -e
if [[ $RC_C -eq 0 ]]; then
  echo "test FAILED (RED-C): gate did not flag a planted stale Row 10 back-reference in BENCHMARKS.md" >&2
  echo "$OUT_C" >&2
  exit 1
fi
if ! grep -q 'back-reference multiplier "91 000×"' <<<"$OUT_C"; then
  echo "test FAILED (RED-C): gate output missing back-reference error:" >&2
  echo "$OUT_C" >&2
  exit 1
fi
echo "test: RED-C on planted Row 10 back-reference in BENCHMARKS.md (expected, exit=$RC_C)"

# --- (5) RED-D: plant cycle-30 F01 partial-sweep replay in benchmarks-snapshot.md ---
cp "$SNAPSHOT" "$TMP/snapshot-redD.md"
python3 - "$TMP/snapshot-redD.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = (
    '✅ WIN — 128 000× faster than Cohere Rerank 3.5, 37 000× under best-in-class bar. '
    'Caveat: synthetic'
)
if needle not in text:
    raise SystemExit(f'fixture: needle not found, file may have drifted: {needle!r}')
text = text.replace(
    needle,
    '✅ WIN — 128 000× faster than Cohere Rerank 3.5, 37 000× under best-in-class bar. '
    'The headline 91 000× ratio is the cycle-29 partial-sweep stale value. '
    'Caveat: synthetic'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_D=$("$GATE" "$LIVE" "$TMP/snapshot-redD.md" 2>&1)
RC_D=$?
set -e
if [[ $RC_D -eq 0 ]]; then
  echo "test FAILED (RED-D): gate did not flag a planted Row 10 back-reference in benchmarks-snapshot.md" >&2
  echo "$OUT_D" >&2
  exit 1
fi
if ! grep -q 'back-reference multiplier "91 000×"' <<<"$OUT_D"; then
  echo "test FAILED (RED-D): gate output missing back-reference error:" >&2
  echo "$OUT_D" >&2
  exit 1
fi
if ! grep -q 'snapshot-redD' <<<"$OUT_D"; then
  echo "test FAILED (RED-D): gate output missing benchmarks-snapshot.md path attribution:" >&2
  echo "$OUT_D" >&2
  exit 1
fi
echo "test: RED-D on planted Row 10 back-reference in benchmarks-snapshot.md (expected, exit=$RC_D)"

# --- (6) RED-E: plant synthetic numbered row with stale back-ref in SKILL.md ---
# SKILL.md ships no numbered row tables today; this fixture injects a synthetic
# `| 99 | … |` row purely to confirm the gate scans the file. CHECK C will fire
# on the planted "headline 91 000× ratio" back-reference because the row's
# primary multiplier is "100× faster".
cp "$SKILL" "$TMP/SKILL-redE.md"
python3 - "$TMP/SKILL-redE.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
anchor = '| Point read `neighbors()` p50 / p95 / p99 @ 10k nodes |'
if anchor not in text:
    raise SystemExit(f'fixture: anchor line not found: {anchor!r}')
synthetic_row = (
    '| 99 | Synthetic fixture row | **1.0 μs** | n/a |'
    ' ✅ WIN — 100× faster than competitor (100 μs);'
    ' headline 91 000× ratio is the cycle-30 partial-sweep stale value. |\n'
)
text = text.replace(anchor, synthetic_row + anchor, 1)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_E=$("$GATE" "$LIVE" "$TMP/SKILL-redE.md" 2>&1)
RC_E=$?
set -e
if [[ $RC_E -eq 0 ]]; then
  echo "test FAILED (RED-E): gate did not flag a planted synthetic row in SKILL.md" >&2
  echo "$OUT_E" >&2
  exit 1
fi
if ! grep -q 'back-reference multiplier "91 000×"' <<<"$OUT_E"; then
  echo "test FAILED (RED-E): gate output missing back-reference error:" >&2
  echo "$OUT_E" >&2
  exit 1
fi
if ! grep -q 'SKILL-redE' <<<"$OUT_E"; then
  echo "test FAILED (RED-E): gate output missing SKILL.md path attribution:" >&2
  echo "$OUT_E" >&2
  exit 1
fi
echo "test: RED-E on planted synthetic row in SKILL.md (expected, exit=$RC_E)"

# --- (7) RED-F: revert Row 13 bullet in MIGRATION-FROM-NEO4J.md to stale figures ---
cp "$MIGRATION" "$TMP/MIGRATION-redF.md"
python3 - "$TMP/MIGRATION-redF.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = (
    '- **Row 13** — scaling tier 10 k nodes: read p95 = **0.38 μs**, load =\n'
    '  **0.32 s**, RSS = **28.0 MB**, file = **39.4 MB**'
)
if needle not in text:
    raise SystemExit('fixture: needle not found, file may have drifted')
text = text.replace(
    needle,
    '- **Row 13** — scaling tier 10 k nodes: read p95 = **0.41 μs**, load =\n'
    '  **0.30 s**, RSS = **26.3 MB**, file = **39.4 MB**'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_F=$("$GATE" "$LIVE" "$TMP/MIGRATION-redF.md" 2>&1)
RC_F=$?
set -e
if [[ $RC_F -eq 0 ]]; then
  echo "test FAILED (RED-F): gate did not flag a planted Row 13 bullet drift in MIGRATION-FROM-NEO4J.md" >&2
  echo "$OUT_F" >&2
  exit 1
fi
if ! grep -q '§ 3 row 13' <<<"$OUT_F"; then
  echo "test FAILED (RED-F): gate output missing CHECK A row 13 attribution:" >&2
  echo "$OUT_F" >&2
  exit 1
fi
if ! grep -q 'MIGRATION-redF' <<<"$OUT_F"; then
  echo "test FAILED (RED-F): gate output missing MIGRATION-FROM-NEO4J.md path attribution:" >&2
  echo "$OUT_F" >&2
  exit 1
fi
echo "test: RED-F on planted Row 13 bullet drift in MIGRATION-FROM-NEO4J.md (expected, exit=$RC_F)"

# --- (8) RED-G: plant cycle-31 F01 Row 7 continuation-line drift in MIGRATION ---
# Pre-cycle-31 parse_bullets only captured the bullet header line, so the
# headline numbers `38.8 / 46.7 / 112.6 ms` on the wrapped continuation line
# were invisible to CHECK A. After the fix, the continuation accumulator
# folds the wrapped line into b['text'] and CHECK A flags the planted 45.4 ms.
cp "$MIGRATION" "$TMP/MIGRATION-redG.md"
python3 - "$TMP/MIGRATION-redG.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = (
    '- **Row 7** — enrichment round-trip p50 / p95 / p99 =\n'
    '  **38.8 / 46.7 / 112.6 ms**'
)
if needle not in text:
    raise SystemExit('fixture: needle not found, file may have drifted')
text = text.replace(
    needle,
    '- **Row 7** — enrichment round-trip p50 / p95 / p99 =\n'
    '  **38.8 / 45.4 / 112.6 ms**'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_G=$("$GATE" "$LIVE" "$TMP/MIGRATION-redG.md" 2>&1)
RC_G=$?
set -e
if [[ $RC_G -eq 0 ]]; then
  echo "test FAILED (RED-G): gate did not flag a planted Row 7 continuation-line drift in MIGRATION-FROM-NEO4J.md" >&2
  echo "$OUT_G" >&2
  exit 1
fi
if ! grep -q '§ 3 row 7' <<<"$OUT_G"; then
  echo "test FAILED (RED-G): gate output missing CHECK A row 7 attribution:" >&2
  echo "$OUT_G" >&2
  exit 1
fi
if ! grep -q '45.4 ms' <<<"$OUT_G"; then
  echo "test FAILED (RED-G): gate output missing planted 45.4 ms token:" >&2
  echo "$OUT_G" >&2
  exit 1
fi
if ! grep -q 'MIGRATION-redG' <<<"$OUT_G"; then
  echo "test FAILED (RED-G): gate output missing MIGRATION path attribution:" >&2
  echo "$OUT_G" >&2
  exit 1
fi
echo "test: RED-G on planted Row 7 continuation-line drift in MIGRATION-FROM-NEO4J.md (expected, exit=$RC_G)"

# --- (9) RED-H: plant cycle-31 F01 Row 10 continuation back-reference drift in MIGRATION ---
# Replays cycle-29 F01 (the 91 000× back-reference) inside MIGRATION's wrapped
# Row 10 bullet. Pre-cycle-31, CHECK C only operated on numbered-row tables
# (which MIGRATION lacks), and CHECK A doesn't see "× ratio" tokens. The new
# bullet back-reference scan compares against canonical row 10 verdict
# primaries [128000, 37000].
cp "$MIGRATION" "$TMP/MIGRATION-redH.md"
python3 - "$TMP/MIGRATION-redH.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = 'so the headline\n  128 000× ratio against Cohere Rerank 3.5'
if needle not in text:
    raise SystemExit('fixture: needle not found, file may have drifted')
text = text.replace(
    needle,
    'so the headline\n  91 000× ratio against Cohere Rerank 3.5'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_H=$("$GATE" "$LIVE" "$TMP/MIGRATION-redH.md" 2>&1)
RC_H=$?
set -e
if [[ $RC_H -eq 0 ]]; then
  echo "test FAILED (RED-H): gate did not flag a planted Row 10 continuation back-reference in MIGRATION-FROM-NEO4J.md" >&2
  echo "$OUT_H" >&2
  exit 1
fi
if ! grep -q 'back-reference multiplier "91 000×"' <<<"$OUT_H"; then
  echo "test FAILED (RED-H): gate output missing back-reference 91 000× error:" >&2
  echo "$OUT_H" >&2
  exit 1
fi
if ! grep -q 'row 10 bullet' <<<"$OUT_H"; then
  echo "test FAILED (RED-H): gate output missing bullet-scope row 10 attribution:" >&2
  echo "$OUT_H" >&2
  exit 1
fi
if ! grep -q 'MIGRATION-redH' <<<"$OUT_H"; then
  echo "test FAILED (RED-H): gate output missing MIGRATION path attribution:" >&2
  echo "$OUT_H" >&2
  exit 1
fi
echo "test: RED-H on planted Row 10 continuation back-reference in MIGRATION-FROM-NEO4J.md (expected, exit=$RC_H)"

# --- (10) RED-I: plant cycle-31 F02 SKILL.md perf-table cell drift ---
# SKILL.md's "Performance you can expect" perf-table at lines 281-285 had zero
# substantive coverage pre-cycle-31 because parse_rows requires cells[0] to
# be an integer and parse_bullets requires `- **Row N**` — the perf table
# uses neither. After the fix, parse_perf_table maps the human label
# "Enrichment round-trip `t_persist`" to canonical row 7 and CHECK D flags
# the planted 45.4 ms (the canonical cycle-15 stale value).
cp "$SKILL" "$TMP/SKILL-redI.md"
python3 - "$TMP/SKILL-redI.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = '`t_persist` p95 (100 docs × 10ent + 15edge) | **46.7 ms**'
if needle not in text:
    raise SystemExit('fixture: needle not found, file may have drifted')
text = text.replace(
    needle,
    '`t_persist` p95 (100 docs × 10ent + 15edge) | **45.4 ms**'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_I=$("$GATE" "$LIVE" "$TMP/SKILL-redI.md" 2>&1)
RC_I=$?
set -e
if [[ $RC_I -eq 0 ]]; then
  echo "test FAILED (RED-I): gate did not flag a planted SKILL.md perf-table cell drift" >&2
  echo "$OUT_I" >&2
  exit 1
fi
if ! grep -q 'perf-table label' <<<"$OUT_I"; then
  echo "test FAILED (RED-I): gate output missing CHECK D perf-table attribution:" >&2
  echo "$OUT_I" >&2
  exit 1
fi
if ! grep -q '45.4 ms' <<<"$OUT_I"; then
  echo "test FAILED (RED-I): gate output missing planted 45.4 ms token:" >&2
  echo "$OUT_I" >&2
  exit 1
fi
if ! grep -q 'SKILL-redI' <<<"$OUT_I"; then
  echo "test FAILED (RED-I): gate output missing SKILL.md path attribution:" >&2
  echo "$OUT_I" >&2
  exit 1
fi
echo "test: RED-I on planted SKILL.md perf-table cell drift (expected, exit=$RC_I)"

# --- (11) RED-K: plant cycle-32 F02 MIGRATION feature-bullet drift ---
# § 1 "Three deployment modes" bullet `- **Edge / on-device** — single binary,
# ~28 MB RSS at the 10 k-node tier (BENCHMARKS row 13).` doesn't open with
# `- **Row N**`, so pre-cycle-32 parse_bullets returned empty for it and the
# `~26 MB` mirror of canonical row 13's 28.0 MB headline escaped silently.
# After the fix, parse_feature_bullets captures any bullet whose body cites
# `(BENCHMARKS row N)` and feeds it through CHECK A.
cp "$MIGRATION" "$TMP/MIGRATION-redK.md"
python3 - "$TMP/MIGRATION-redK.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = (
    '- **Edge / on-device** — single binary, ~28 MB RSS at the 10 k-node tier\n'
    '  (BENCHMARKS row 13).'
)
if needle not in text:
    raise SystemExit('fixture: needle not found, file may have drifted')
text = text.replace(
    needle,
    '- **Edge / on-device** — single binary, ~26.3 MB RSS at the 10 k-node tier\n'
    '  (BENCHMARKS row 13).'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_K=$("$GATE" "$LIVE" "$TMP/MIGRATION-redK.md" 2>&1)
RC_K=$?
set -e
if [[ $RC_K -eq 0 ]]; then
  echo "test FAILED (RED-K): gate did not flag a planted feature-bullet drift in MIGRATION-FROM-NEO4J.md" >&2
  echo "$OUT_K" >&2
  exit 1
fi
if ! grep -q '§ 3 row 13' <<<"$OUT_K"; then
  echo "test FAILED (RED-K): gate output missing CHECK A row 13 attribution:" >&2
  echo "$OUT_K" >&2
  exit 1
fi
if ! grep -q '26.3 MB' <<<"$OUT_K"; then
  echo "test FAILED (RED-K): gate output missing planted 26.3 MB token:" >&2
  echo "$OUT_K" >&2
  exit 1
fi
if ! grep -q 'MIGRATION-redK' <<<"$OUT_K"; then
  echo "test FAILED (RED-K): gate output missing MIGRATION path attribution:" >&2
  echo "$OUT_K" >&2
  exit 1
fi
echo "test: RED-K on planted feature-bullet drift in MIGRATION-FROM-NEO4J.md (expected, exit=$RC_K)"

# --- (12) RED-L: plant cycle-32 F03 SKILL.md verdict-column multiplier drift ---
# SKILL.md perf-table verdict cell `🟡 343× under threshold; NDCG deferred`
# mirrors canonical row 8's `343× under the 80 ms best-in-class bar` primary
# multiplier. Pre-cycle-32 CHECK D only scanned cells[1] (OGDB column), so a
# stale `200×` mirror in the verdict column escaped silently. After the fix,
# CHECK D scans cells[3] verdict primary multipliers against canonical row's
# verdict primaries.
cp "$SKILL" "$TMP/SKILL-redL.md"
python3 - "$TMP/SKILL-redL.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding='utf-8')
needle = '🟡 343× under threshold; NDCG deferred'
if needle not in text:
    raise SystemExit('fixture: needle not found, file may have drifted')
text = text.replace(
    needle,
    '🟡 200× under threshold; NDCG deferred'
)
p.write_text(text, encoding='utf-8')
PY

set +e
OUT_L=$("$GATE" "$LIVE" "$TMP/SKILL-redL.md" 2>&1)
RC_L=$?
set -e
if [[ $RC_L -eq 0 ]]; then
  echo "test FAILED (RED-L): gate did not flag a planted verdict-column multiplier drift in SKILL.md" >&2
  echo "$OUT_L" >&2
  exit 1
fi
if ! grep -q 'perf-table verdict for label' <<<"$OUT_L"; then
  echo "test FAILED (RED-L): gate output missing CHECK D verdict-cell attribution:" >&2
  echo "$OUT_L" >&2
  exit 1
fi
if ! grep -q 'multiplier "200×"' <<<"$OUT_L"; then
  echo "test FAILED (RED-L): gate output missing planted 200× multiplier:" >&2
  echo "$OUT_L" >&2
  exit 1
fi
if ! grep -q 'SKILL-redL' <<<"$OUT_L"; then
  echo "test FAILED (RED-L): gate output missing SKILL.md path attribution:" >&2
  echo "$OUT_L" >&2
  exit 1
fi
echo "test: RED-L on planted SKILL.md verdict-column multiplier drift (expected, exit=$RC_L)"

echo "test: PASS"
