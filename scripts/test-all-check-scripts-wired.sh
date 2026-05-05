#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE17 F04: structural meta-meta-test —
# every `scripts/check-*.sh` gate must be invoked from `scripts/test.sh`.
#
# The cycle-15+16 lesson is that creating a gate is half the job; wiring
# it is the other half. Cycle-16 created `check-npm-package-github-url.sh`
# and its meta-test, then sibling commit `b994aa7` (10 minutes later)
# wired only the cycle-15 cluster — leaving the new gate dead in CI.
#
# This test prevents that regression: it diffs the on-disk gate inventory
# against direct-invocation references in `scripts/test.sh`. Any
# unreferenced check script is a finding.
#
# A meta-test (`test-check-<name>.sh`) that runs the gate against a
# fixture in `mktemp -d` is NOT a substitute — it does not exercise the
# gate against the real repo. The gate itself must be wired.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_SH="$REPO_ROOT/scripts/test.sh"

if [[ ! -f "$TEST_SH" ]]; then
  echo "test-all-check-scripts-wired: $TEST_SH not found" >&2
  exit 2
fi

UNWIRED=$(comm -23 \
  <(cd "$REPO_ROOT" && ls scripts/check-*.sh | sort) \
  <(grep -oE 'scripts/check-[A-Za-z0-9-]+\.sh' "$TEST_SH" | sort -u))

if [[ -n "$UNWIRED" ]]; then
  echo "test-all-check-scripts-wired: FAIL — these check scripts exist but are not invoked from scripts/test.sh:" >&2
  printf '  %s\n' $UNWIRED >&2
  echo >&2
  echo "Add a direct './scripts/check-<name>.sh' invocation to scripts/test.sh." >&2
  echo "Wiring only the meta-test (test-check-<name>.sh) is insufficient — the" >&2
  echo "meta-test runs the gate against a fixture, not against the real repo." >&2
  exit 1
fi

echo "test-all-check-scripts-wired: ok (every scripts/check-*.sh is referenced from scripts/test.sh)"
