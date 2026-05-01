#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE3 H11 regression gate.
#
# `dtolnay/rust-toolchain@stable` floats — re-runs of old PRs drift
# across rustc versions. Every workflow `uses:` line for the toolchain
# action must specify a fully-qualified version (e.g. `@1.88.0`).
# Comments in YAML are allowed to mention `@stable` (the eval/comment
# usage we keep for context); only `uses:` lines are checked.
#
# A `rust-toolchain.toml` at repo root is the durable pin for local /
# direnv / asdf setups; this gate keeps CI in lockstep.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

if [[ ! -f "$ROOT/rust-toolchain.toml" ]]; then
  echo "FAIL: rust-toolchain.toml missing at repo root (H11)" >&2
  exit 1
fi

bad=$(grep -RnE '^\s*-?\s*uses:\s*dtolnay/rust-toolchain@stable\b' "$ROOT/.github/workflows/" || true)
if [[ -n "$bad" ]]; then
  echo "FAIL: dtolnay/rust-toolchain@stable found — pin to MSRV (H11):" >&2
  echo "$bad" >&2
  exit 1
fi

# Every `uses: dtolnay/rust-toolchain@<X>` should match the channel
# declared in rust-toolchain.toml. Surface the mismatch loudly.
declared=$(awk -F'"' '/^channel/ {print $2}' "$ROOT/rust-toolchain.toml")
if [[ -z "$declared" ]]; then
  echo "FAIL: rust-toolchain.toml [toolchain].channel not parseable" >&2
  exit 1
fi
mismatch=$(grep -RnE '^\s*-?\s*uses:\s*dtolnay/rust-toolchain@' "$ROOT/.github/workflows/" \
  | grep -v "@$declared" || true)
if [[ -n "$mismatch" ]]; then
  echo "FAIL: dtolnay/rust-toolchain pin disagrees with rust-toolchain.toml channel ($declared):" >&2
  echo "$mismatch" >&2
  exit 1
fi

echo "ok: rust-toolchain pinned to $declared in every workflow (H11)"
