#!/usr/bin/env bash
set -euo pipefail

source "$HOME/.cargo/env"

if ! cargo llvm-cov --version >/dev/null 2>&1; then
  echo "cargo-llvm-cov is not installed."
  echo "Install with:"
  echo "  source \"\$HOME/.cargo/env\""
  echo "  cargo install cargo-llvm-cov"
  echo "  rustup component add llvm-tools-preview"
  exit 1
fi

# EVAL-RUST-QUALITY-CYCLE3 H5: cycle 1's gate measured only ogdb-core +
# ogdb-cli. Cycle-0 split-out crates (ogdb-vector, ogdb-types,
# ogdb-algorithms, ogdb-text, ogdb-temporal, ogdb-import, ogdb-export,
# ogdb-bolt) plus the binding crates (ogdb-ffi, ogdb-node, ogdb-python)
# were excluded — a regression in e.g. `temporal_filter_matches` showed
# up as 0% on the report because the crate wasn't measured. Switch to
# `--workspace --exclude` so any *new* shipped library crate is gated
# automatically, and harness crates (publish=false) are explicitly
# carved out.
#
# RATCHET: these thresholds are floors, not targets. Never lower them.
# Raise them as test coverage grows so coverage can only ever improve.
# The fail-under threshold is lower than the prior ogdb-core/cli value
# because the split crates have minimal tests (M14 tracks raising it).
cargo llvm-cov \
  --workspace \
  --exclude ogdb-bench \
  --exclude ogdb-e2e \
  --exclude ogdb-eval \
  --exclude ogdb-fuzz \
  --exclude ogdb-tck \
  --lib \
  --fail-under-lines 80 \
  --fail-uncovered-lines 5000
