#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE4 B1 regression gate.
#
# Cycle 3 wired cargo-semver-checks into CI but swallowed the failure
# with `cargo semver-checks ... || echo "::warning::..."`, so a real
# semver regression silently passed CI. Cycle 4 dropped the swallow.
# This gate fails if any future PR re-introduces the `|| echo
# "::warning::..."` pattern on a `cargo` step in `.github/workflows/`.
#
# The pattern catches the specific cycle-3 anti-pattern (a CI step that
# runs a cargo subcommand and pipes its non-zero exit into a benign
# GitHub annotation). It does not forbid `|| echo` everywhere — only
# when it neuters a cargo invocation's exit code into a warning.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

if [[ ! -d "$ROOT/.github/workflows" ]]; then
  echo "ok: no .github/workflows directory; skipping (B1)"
  exit 0
fi

# Match: a `cargo …` invocation followed (possibly across a backslash
# continuation) by `|| echo "::warning::"`. We grep for the swallow
# tail and reject it whenever the same logical step runs cargo.
hits=$(grep -RnE '\|\|[[:space:]]*echo[[:space:]]+["'\''][[:space:]]*::warning::' \
  "$ROOT/.github/workflows/" 2>/dev/null || true)
if [[ -z "$hits" ]]; then
  echo "ok: no advisory '|| echo \"::warning::...\"' swallow in workflows (B1)"
  exit 0
fi

# Filter to only flag lines whose surrounding step runs cargo. We
# inspect the 5 lines preceding each hit for a `cargo ` token.
fail=0
while IFS=: read -r path lineno _; do
  start=$(( lineno > 5 ? lineno - 5 : 1 ))
  context=$(sed -n "${start},${lineno}p" "$path")
  if grep -qE '(^|[[:space:]])cargo[[:space:]]' <<<"$context"; then
    echo "FAIL: $path:$lineno reintroduces a cargo '|| echo \"::warning::...\"' swallow (CYCLE4 B1)" >&2
    fail=1
  fi
done <<<"$hits"

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "ok: '|| echo \"::warning::...\"' lines in workflows do not wrap cargo steps (B1)"
