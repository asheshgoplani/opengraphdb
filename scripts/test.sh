#!/usr/bin/env bash
set -euo pipefail

source "$HOME/.cargo/env"

./scripts/changelog-check.sh
./scripts/workflow-check.sh

cargo fmt --all --check
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo test --workspace --all-targets
