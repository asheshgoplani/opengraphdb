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
./scripts/check-binary-name.sh
# EVAL-DOCS-COMPLETENESS-CYCLE4 H1..H5: design specification (DESIGN.md /
# ARCHITECTURE.md / README.md / SPEC.md / skills/) must not drift from
# the shipped implementation. Pinned source of truth is in `crates/`.
./scripts/check-design-vs-impl.sh
# EVAL-DOCS-COMPLETENESS-CYCLE6 H1+H2: every `use ogdb_core::`-led rust
# block in user-facing markdown must compile against the shipped
# ogdb-core surface. Closes the methodology hole the C5 audit walked
# into — grep gates catch named-method drift but are blind to
# signature drift (wrong arg count, missing `From` impl).
./scripts/check-doc-rust-blocks.sh

# C2-A7 (HIGH): npm package version must match workspace version.
./scripts/check-npm-version.sh
# C3-H2 (HIGH): mirror the npm gate for the PyPI wheel — pyproject.toml
# version must match workspace version. Caught the 0.1.0 drift cycle-2
# missed.
./scripts/check-pypi-version.sh

# C2-A8 (HIGH): cycle-1 added these structural lints but never wired them
# into CI. Without the wiring they're dead code — the next person to edit
# release.yml / Dockerfile / BENCHMARKS.md gets no early feedback. Run
# them here so `scripts/test.sh` is the single CI entry point.
./scripts/test-crate-metadata.sh
./scripts/test-release-workflow.sh
./scripts/test-dockerfile.sh
./scripts/test-check-benchmarks-version.sh
# C4-H2 (HIGH): the cycle-3 C3-H3 Criterion harness file landed but no
# CI job ran it. Without the bench-regression job in ci.yml, a perf fix
# being silently reverted by a bad merge stays invisible until the next
# manual baseline run — the exact failure mode C3-H3 was meant to close.
./scripts/test-ci-bench-regression.sh
# EVAL-RUST-QUALITY-CYCLE3 H11: every `uses: dtolnay/rust-toolchain@`
# in workflows must pin a fully-qualified version that matches
# rust-toolchain.toml's channel.
./scripts/check-rust-toolchain-pin.sh
# EVAL-RUST-QUALITY-CYCLE3 H12: every advisory ignore in deny.toml must
# carry a 're-evaluate by YYYY-MM-DD' that is still in the future.
./scripts/check-deny-expirations.sh
# EVAL-RUST-QUALITY-CYCLE3 H7: ogdb-node + ogdb-python feature-gate the
# `unsafe_op_in_unsafe_fn` allow. Hand-written unsafe in either crate
# would defeat the narrowing — fail CI in that case.
./scripts/check-bindings-no-handwritten-unsafe.sh
# EVAL-RUST-QUALITY-CYCLE3 B2: every publishable crate's lib.rs must
# start with a `//!` crate-root rustdoc block (docs.rs landing page).
./scripts/check-crate-root-docs.sh
# EVAL-RUST-QUALITY-CYCLE4 B1: forbid `|| echo "::warning::..."` swallow
# on cargo steps (cycle-3 cargo-semver-checks anti-pattern).
./scripts/check-no-advisory-swallow.sh
# EVAL-RUST-QUALITY-CYCLE4 H6 + B2: pin unsafe_op_in_unsafe_fn=deny and
# require new [workspace.lints.*] allows to be inventoried with a
# CYCLE<N> ratchet rationale.
./scripts/check-workspace-lint-pins.sh
# EVAL-RUST-QUALITY-CYCLE4 H4: assert that 'cargo test --workspace --doc'
# is wired into scripts/test.sh and ci.yml so doctests stay gated.
./scripts/check-doc-tests-wired.sh
# EVAL-RUST-QUALITY-CYCLE4 H5: bindings/c, bindings/go, proto must each
# carry a README so downstream FFI consumers don't land in opaque dirs.
./scripts/check-binding-readmes.sh
# EVAL-RUST-QUALITY-CYCLE4 H3: ratchet on undocumented pub items in
# ogdb-core / ogdb-node / ogdb-python — caps each at the cycle-4
# baseline, so new pub items must land with /// doc comments.
./scripts/check-doc-ratchet.sh

cargo fmt --all --check
cargo check --workspace
# NOTE: --all-targets + --all-features surfaces clippy::style violations that
# were always present but never gated; the cleanup is a separate slice.
# Reverting to the workspace-only gate until that slice lands keeps CI green.
cargo clippy --workspace -- -D warnings
# Advisory + license + bans gate. Deferrals must point at
# `documentation/SECURITY-FOLLOWUPS.md` per `deny.toml` ignore.
cargo deny check advisories licenses bans sources
# C3-H7 (HIGH): defense-in-depth. cargo-deny is the canonical gate, but
# cargo-audit reads RustSec advisories with a different parser + a
# different ignore-list shape — running both means a new advisory has to
# slip past *two* allowlist hops to land. Mirrors the deferrals in
# deny.toml so a green run here doesn't conflict.
if ! command -v cargo-audit >/dev/null 2>&1; then
  cargo install cargo-audit --locked
fi
cargo audit \
  --ignore RUSTSEC-2025-0020 \
  --ignore RUSTSEC-2026-0002 \
  --ignore RUSTSEC-2026-0097 \
  --deny warnings
# EVAL-RUST-QUALITY-CYCLE2 §H9 (HIGH): catch broken intra-doc links,
# malformed ```rust blocks, and dead links at PR time instead of after
# publishing to docs.rs. `--no-deps` keeps the gate fast (we don't
# care if our deps' docs warn).
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --all-features
cargo test --workspace --all-targets
# EVAL-RUST-QUALITY-CYCLE4 H4: --all-targets does NOT cover doctests
# (it expands to --lib --bins --tests --benches --examples). The //!
# quickstart in ogdb-core (and any future /// example on a pub item)
# needs --doc to actually run, otherwise an API rename silently breaks
# the docs.rs landing page without CI feedback.
cargo test --workspace --doc
