#!/usr/bin/env bash
# Regression test for C4-H2 (HIGH): the cycle-3 C3-H3 patch added the
# Criterion harness `crates/ogdb-bench/benches/throughput_benches.rs`
# but never wired a CI job to run it. Without the wiring the harness is
# dead code — the cycle-3 C3-B4 class of bug (a tested, merged perf fix
# silently reverted by a bad merge) stays invisible until the next
# manual `publish_baseline` run. This script asserts ci.yml has a
# `bench-regression` job that runs the throughput harness and compares
# against main with a hard fail on > 25 % regression.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CI="$ROOT/.github/workflows/ci.yml"
BENCH="$ROOT/crates/ogdb-bench/benches/throughput_benches.rs"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok: $*"; }

[[ -f "$CI" ]]    || fail "missing $CI"
[[ -f "$BENCH" ]] || fail "missing $BENCH (C3-H3 harness; C4-H2 requires it)"

# 1. ci.yml has a bench-regression job.
grep -qE "^[[:space:]]*bench-regression:[[:space:]]*$" "$CI" \
  || fail "ci.yml missing 'bench-regression:' job (C4-H2)"
ok "ci.yml has bench-regression job"

# 2. The job actually runs `cargo bench` on the throughput harness.
awk '
  /^[[:space:]]*bench-regression:[[:space:]]*$/ { in_block = 1; next }
  in_block && /^[[:space:]]{2}[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ { in_block = 0 }
  in_block && /cargo bench .* throughput_benches/ { print "yes"; exit }
' "$CI" | grep -q yes \
  || fail "bench-regression must run 'cargo bench -p ogdb-bench --bench throughput_benches' (C4-H2)"
ok "bench-regression runs the throughput_benches harness"

# 3. The job has a comparison step (critcmp or criterion-compare-action).
awk '
  /^[[:space:]]*bench-regression:[[:space:]]*$/ { in_block = 1; next }
  in_block && /^[[:space:]]{2}[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ { in_block = 0 }
  in_block && /(critcmp|criterion-compare-action)/ { print "yes"; exit }
' "$CI" | grep -q yes \
  || fail "bench-regression must compare baselines via critcmp or criterion-compare-action (C4-H2)"
ok "bench-regression compares baselines"

# 4. The compare step has a > 25 % fail threshold (the cheap stop-gap
#    the eval calls out).
awk '
  /^[[:space:]]*bench-regression:[[:space:]]*$/ { in_block = 1; next }
  in_block && /^[[:space:]]{2}[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ { in_block = 0 }
  in_block && /1\.25|25 *%/ { print "yes"; exit }
' "$CI" | grep -q yes \
  || fail "bench-regression must fail on > 25 % regression (1.25 ratio threshold) (C4-H2)"
ok "bench-regression has > 25 % fail threshold"

echo "all C4-H2 bench-regression contract checks pass"
