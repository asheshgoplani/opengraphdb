#!/usr/bin/env bash
set -euo pipefail

source "$HOME/.cargo/env"

./scripts/changelog-check.sh
./scripts/workflow-check.sh
./scripts/check-crate-metadata.sh
./scripts/check-shipped-doc-coverage.sh
./scripts/check-public-doc-tmp-leak.sh
./scripts/check-changelog-tags.sh

cargo fmt --all --check
cargo check --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
# Advisory + license + bans gate. Deferrals must point at
# `documentation/SECURITY-FOLLOWUPS.md` per `deny.toml` ignore.
cargo deny check advisories licenses bans sources
cargo test --workspace --all-targets
