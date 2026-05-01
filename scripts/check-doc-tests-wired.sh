#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE4 H4 regression gate.
#
# `cargo test --workspace --all-targets` does NOT exercise doctests
# (`--all-targets` expands to `--lib --bins --tests --benches --examples`,
# explicitly excluding `--doc`). The cycle-3 B2 patch added a `//!`
# quickstart doctest to ogdb-core's lib.rs but no `cargo test --doc`
# step was wired into CI — a future API rename would silently break
# the docs.rs landing page without CI feedback.
#
# This gate fails if `scripts/test.sh` no longer runs `cargo test
# --workspace --doc`, OR if `.github/workflows/ci.yml` no longer has
# a discrete doctest step.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# scripts/test.sh
test_sh="$ROOT/scripts/test.sh"
if [[ ! -f "$test_sh" ]]; then
  echo "FAIL: $test_sh missing" >&2
  exit 1
fi
if ! grep -qE 'cargo[[:space:]]+test[[:space:]]+--workspace[[:space:]]+--doc' "$test_sh"; then
  echo "FAIL: scripts/test.sh does not run 'cargo test --workspace --doc' (CYCLE4 H4)" >&2
  exit 1
fi
echo "ok: scripts/test.sh runs 'cargo test --workspace --doc' (H4)"

# .github/workflows/ci.yml — separate doctest step.
ci_yml="$ROOT/.github/workflows/ci.yml"
if [[ ! -f "$ci_yml" ]]; then
  echo "ok: .github/workflows/ci.yml missing; skipping CI step check"
  exit 0
fi
if ! grep -qE 'cargo[[:space:]]+test[[:space:]]+--workspace[[:space:]]+--doc' "$ci_yml"; then
  echo "FAIL: .github/workflows/ci.yml does not run 'cargo test --workspace --doc' as a discrete step (CYCLE4 H4)" >&2
  exit 1
fi
echo "ok: .github/workflows/ci.yml runs doctests as a discrete step (H4)"
