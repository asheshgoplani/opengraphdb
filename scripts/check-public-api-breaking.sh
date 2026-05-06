#!/usr/bin/env bash
# Phase B M-12: unified wrapper for the three public-API breaking-change
# detectors (Rust / Python / Node). Runs each sub-check, aggregates exit
# status, and prints a single summary at the end.
#
# Each sub-script does its own BASE_SHA self-re-exec dance — see
# scripts/check-rust-public-api-diff.sh for the rationale. This wrapper
# does NOT need to re-exec itself, because all of the gate logic lives
# inside the sub-scripts; if a PR weakens this wrapper it can still skip
# steps, but the sub-scripts the wrapper invokes (or that CI invokes
# directly) will run their base-version selves.
#
# CI calls each sub-script directly so a sabotaged wrapper does not bypass
# any one check. This wrapper is for local + ad-hoc invocation.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ -z "${BASE_SHA:-}" ]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base HEAD origin/main)"
  else
    BASE_SHA="$(git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD)"
  fi
  export BASE_SHA
fi

echo "[check-public-api-breaking] BASE_SHA=$BASE_SHA"

failed=0

run_step() {
  local label="$1"
  local script="$2"
  echo "::group::$label"
  if bash "$script"; then
    echo "[$label] OK"
  else
    echo "[$label] FAILED" >&2
    failed=1
  fi
  echo "::endgroup::"
}

run_step "rust"   "scripts/check-rust-public-api-diff.sh"
run_step "python" "scripts/check-python-public-api-diff.sh"
run_step "node"   "scripts/check-node-public-api-diff.sh"

if [ "$failed" -ne 0 ]; then
  echo "[check-public-api-breaking] one or more sub-checks failed." >&2
  exit 1
fi

echo "[check-public-api-breaking] all sub-checks OK."
