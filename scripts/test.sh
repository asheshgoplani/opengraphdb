#!/usr/bin/env bash
set -euo pipefail

source "$HOME/.cargo/env"

./scripts/changelog-check.sh
./scripts/workflow-check.sh
./scripts/check-crate-metadata.sh
./scripts/check-shipped-doc-coverage.sh
./scripts/check-public-doc-tmp-leak.sh
./scripts/check-changelog-tags.sh
./scripts/check-doc-anchors.sh

# C2-A7 (HIGH): npm package version must match workspace version.
./scripts/check-npm-version.sh

# C2-A8 (HIGH): cycle-1 added these structural lints but never wired them
# into CI. Without the wiring they're dead code — the next person to edit
# release.yml / Dockerfile / BENCHMARKS.md gets no early feedback. Run
# them here so `scripts/test.sh` is the single CI entry point.
./scripts/test-crate-metadata.sh
./scripts/test-release-workflow.sh
./scripts/test-dockerfile.sh
./scripts/test-check-benchmarks-version.sh
# EVAL-RUST-QUALITY-CYCLE3 H11: every `uses: dtolnay/rust-toolchain@`
# in workflows must pin a fully-qualified version that matches
# rust-toolchain.toml's channel.
./scripts/check-rust-toolchain-pin.sh

cargo fmt --all --check
cargo check --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
# Advisory + license + bans gate. Deferrals must point at
# `documentation/SECURITY-FOLLOWUPS.md` per `deny.toml` ignore.
cargo deny check advisories licenses bans sources
# EVAL-RUST-QUALITY-CYCLE2 §H9 (HIGH): catch broken intra-doc links,
# malformed ```rust blocks, and dead links at PR time instead of after
# publishing to docs.rs. `--no-deps` keeps the gate fast (we don't
# care if our deps' docs warn).
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --all-features
cargo test --workspace --all-targets
