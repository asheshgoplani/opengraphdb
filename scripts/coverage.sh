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

cargo llvm-cov \
  --package ogdb-core \
  --package ogdb-cli \
  --lib \
  --fail-under-lines 98 \
  --fail-uncovered-lines 600
