#!/usr/bin/env bash
# Red-green meta-test for scripts/check-benchmarks-cell-internal-consistency.sh.
#
# (1) GREEN: gate must pass against the live tree (post-cycle-28-F01F02F03 fixes).
# (2) RED-A:  plant the cycle-28 F02 stale Row 7 § 3 value (45.4 ms) into a
#             temp copy of BENCHMARKS.md and confirm the gate flags it.
# (3) RED-B:  plant the cycle-28 F03 stale Row 10 verdict operand (1.88 μs +
#             91 000× / 27 000× multipliers) and confirm the gate flags both
#             axes (operand-not-in-headline AND multiplier-divides-cleanly).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-benchmarks-cell-internal-consistency.sh"
LIVE="$REPO_ROOT/documentation/BENCHMARKS.md"

if [[ ! -x "$GATE" ]]; then
  echo "test FAILED: $GATE is not executable" >&2
  exit 2
fi
if [[ ! -f "$LIVE" ]]; then
  echo "test FAILED: $LIVE not found" >&2
  exit 2
fi

# --- (1) GREEN: live tree must pass ---
"$GATE" "$LIVE" >/dev/null 2>&1 || {
  echo "test FAILED: gate reported HITS on a clean tree" >&2
  "$GATE" "$LIVE" >&2 || true
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- (2) RED-A: plant F02 stale Row 7 § 3 ---
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
  echo "test FAILED (RED-A): gate did not flag a planted stale Row 7 § 3 value" >&2
  exit 1
fi
echo "test: RED-A on planted Row 7 § 3 stale value (expected, exit=$RC_A)"

# --- (3) RED-B: plant F03 Row 10 verdict drift ---
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
  echo "test FAILED (RED-B): gate did not flag a planted Row 10 verdict-operand drift" >&2
  echo "$OUT_B" >&2
  exit 1
fi
if ! grep -q 'multiplier operand "1.88μs"' <<<"$OUT_B"; then
  echo "test FAILED (RED-B): gate output missing operand-not-in-headline error:" >&2
  echo "$OUT_B" >&2
  exit 1
fi
echo "test: RED-B on planted Row 10 verdict drift (expected, exit=$RC_B)"

echo "test: PASS"
