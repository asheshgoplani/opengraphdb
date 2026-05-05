#!/usr/bin/env bash
# Red-green meta-test for scripts/check-cross-doc-benchmarks-mirror.sh.
# Locks the cycle-32 H1 + H2 + H3 cross-doc verbatim-mirror gate.
#
# (1) GREEN: gate green on the fixed (post-cycle-32) tree.
# (2) RED-H1: revert COOKBOOK Recipe 2 to the pre-fix `243 / 378 / 422 μs` +
#             `0.38 ms p95 is 200×` carry-forward — gate must flag.
# (3) RED-H2: revert COOKBOOK Recipe 3 to the pre-fix `38.8 / 44.2 / 113.2 ms`
#             + `3.4×` + `by 4 ms` carry-forward — gate must flag the 44.2 ms
#             p95 + the 4 ms miss (113.2 ms is within 1 % of 112.6 ms so will
#             not fire on its own; the 44.2 ms drift is what carries the bug).
# (4) RED-H3: revert MIGRATION § 5 Row 1 to the pre-fix `256 nodes/s` (vs
#             canonical 251 nodes/s, 1.99 % drift). Documents the gap the
#             existing 2 % cell-internal-consistency gate could not close.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-cross-doc-benchmarks-mirror.sh"
LIVE_BENCHMARKS="$REPO_ROOT/documentation/BENCHMARKS.md"
LIVE_COOKBOOK="$REPO_ROOT/documentation/COOKBOOK.md"
LIVE_MIGRATION="$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"

if [[ ! -x "$GATE" ]]; then
  echo "test FAILED: $GATE is not executable" >&2
  exit 2
fi
for f in "$LIVE_BENCHMARKS" "$LIVE_COOKBOOK" "$LIVE_MIGRATION"; do
  if [[ ! -f "$f" ]]; then
    echo "test FAILED: $f not found" >&2
    exit 2
  fi
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- (1) GREEN: clean tree ---
"$GATE" >/dev/null 2>&1 || {
  echo "test FAILED (GREEN): gate reported HITS on the clean post-cycle-32 tree" >&2
  "$GATE" >&2 || true
  exit 1
}
echo "test: GREEN on clean post-cycle-32 tree (expected)"

# --- (2) RED-H1: COOKBOOK Recipe 2 — pre-fix 243/378/422 μs + 0.38 ms ---
cp "$LIVE_COOKBOOK" "$TMP/COOKBOOK-h1.md"
python3 - "$TMP/COOKBOOK-h1.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
t = p.read_text(encoding='utf-8')
needle1 = '**204 / 233 / 246 μs**'
needle2 = '0.23 ms p95 is 343× under the 80 ms best-in-class threshold'
if needle1 not in t or needle2 not in t:
    raise SystemExit('fixture: H1 needles not found, COOKBOOK may have drifted')
t = t.replace(needle1, '**243 / 378 / 422 μs**')
t = t.replace(needle2, '0.38 ms p95 is 200× under the 80 ms best-in-class threshold')
p.write_text(t, encoding='utf-8')
PY

set +e
OUT_H1=$("$GATE" "$LIVE_BENCHMARKS" "$TMP/COOKBOOK-h1.md" "$LIVE_MIGRATION" 2>&1)
RC_H1=$?
set -e
if [[ $RC_H1 -eq 0 ]]; then
  echo "test FAILED (RED-H1): gate did not flag pre-fix Recipe 2 carry-forward" >&2
  echo "$OUT_H1" >&2
  exit 1
fi
if ! grep -q '"243 μs"' <<<"$OUT_H1"; then
  echo "test FAILED (RED-H1): gate output missing 243 μs token attribution:" >&2
  echo "$OUT_H1" >&2
  exit 1
fi
if ! grep -q 'row 8' <<<"$OUT_H1"; then
  echo "test FAILED (RED-H1): gate output missing row 8 attribution:" >&2
  echo "$OUT_H1" >&2
  exit 1
fi
echo "test: RED-H1 on pre-fix COOKBOOK Recipe 2 carry-forward (expected, exit=$RC_H1)"

# --- (3) RED-H2: COOKBOOK Recipe 3 — pre-fix 44.2 ms + 4 ms + 3.4× ---
cp "$LIVE_COOKBOOK" "$TMP/COOKBOOK-h2.md"
python3 - "$TMP/COOKBOOK-h2.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
t = p.read_text(encoding='utf-8')
needle1 = '**38.8 / 46.7 / 112.6 ms**'
needle2 = 'p95 of 47 ms beats the 150 ms competitive threshold by 3.2×'
needle3 = 'misses the 40 ms best-in-class bar by 7 ms'
for n in (needle1, needle2, needle3):
    if n not in t:
        raise SystemExit(f'fixture: H2 needle not found: {n!r}')
t = t.replace(needle1, '**38.8 / 44.2 / 113.2 ms**')
t = t.replace(needle2, 'p95 of 44 ms beats the 150 ms competitive threshold by 3.4×')
t = t.replace(needle3, 'misses the 40 ms best-in-class bar by 4 ms')
p.write_text(t, encoding='utf-8')
PY

set +e
OUT_H2=$("$GATE" "$LIVE_BENCHMARKS" "$TMP/COOKBOOK-h2.md" "$LIVE_MIGRATION" 2>&1)
RC_H2=$?
set -e
if [[ $RC_H2 -eq 0 ]]; then
  echo "test FAILED (RED-H2): gate did not flag pre-fix Recipe 3 carry-forward" >&2
  echo "$OUT_H2" >&2
  exit 1
fi
if ! grep -q '"44.2 ms"' <<<"$OUT_H2"; then
  echo "test FAILED (RED-H2): gate output missing 44.2 ms token attribution:" >&2
  echo "$OUT_H2" >&2
  exit 1
fi
if ! grep -q 'row 7' <<<"$OUT_H2"; then
  echo "test FAILED (RED-H2): gate output missing row 7 attribution:" >&2
  echo "$OUT_H2" >&2
  exit 1
fi
echo "test: RED-H2 on pre-fix COOKBOOK Recipe 3 carry-forward (expected, exit=$RC_H2)"

# --- (4) RED-H3: MIGRATION § 5 Row 1 — pre-fix 256 nodes/s ---
cp "$LIVE_MIGRATION" "$TMP/MIGRATION-h3.md"
python3 - "$TMP/MIGRATION-h3.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
t = p.read_text(encoding='utf-8')
needle = 'bulk ingest **251 nodes/s** vs Memgraph'
if needle not in t:
    raise SystemExit('fixture: H3 needle not found')
t = t.replace(needle, 'bulk ingest **256 nodes/s** vs Memgraph')
p.write_text(t, encoding='utf-8')
PY

set +e
OUT_H3=$("$GATE" "$LIVE_BENCHMARKS" "$LIVE_COOKBOOK" "$TMP/MIGRATION-h3.md" 2>&1)
RC_H3=$?
set -e
if [[ $RC_H3 -eq 0 ]]; then
  echo "test FAILED (RED-H3): gate did not flag pre-fix MIGRATION Row 1 256 nodes/s — this is the 1.99 % drift the existing 2 % cell-internal-consistency gate cannot close." >&2
  echo "$OUT_H3" >&2
  exit 1
fi
if ! grep -q '"256 nodes/s"' <<<"$OUT_H3"; then
  echo "test FAILED (RED-H3): gate output missing 256 nodes/s token attribution:" >&2
  echo "$OUT_H3" >&2
  exit 1
fi
if ! grep -q '§ 5 Row 1' <<<"$OUT_H3"; then
  echo "test FAILED (RED-H3): gate output missing § 5 Row 1 attribution:" >&2
  echo "$OUT_H3" >&2
  exit 1
fi
echo "test: RED-H3 on pre-fix MIGRATION § 5 Row 1 256 nodes/s (expected, exit=$RC_H3)"

echo "test: PASS"
