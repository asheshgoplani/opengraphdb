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
# EVAL-DOCS-COMPLETENESS-CYCLE15 F01: SECURITY.md "Supported Versions"
# row minor must match the workspace minor.
./scripts/check-security-supported-version.sh
# EVAL-DOCS-COMPLETENESS-CYCLE15 F06: skills/README.md + skills/src/install.ts
# must not mention copilot (SKILL.md compatibility metadata is the truth).
./scripts/check-skills-copilot-removed.sh
# EVAL-DOCS-COMPLETENESS-CYCLE16 F02 (wired by EVAL-DOCS-COMPLETENESS-CYCLE17 F04):
# every */package.json must declare repository.url / homepage / bugs URLs that
# match `git remote get-url origin`. Sibling commit b994aa7 wired only the
# cycle-15 cluster; this gate (added by 09f9161) was the dead-code gap F04 closed.
./scripts/check-npm-package-github-url.sh
# EVAL-PERF-RELEASE Finding 1: documentation/BENCHMARKS.md headline + § 2 table
# column header must match workspace.package.version (the meta-test below runs
# the gate against a fixture; this invocation runs it against the real repo).
./scripts/check-benchmarks-version.sh
# Phase-3 STORY: sacred-blue (#5B9DFF) is reserved for the active traversal
# cinematic surface. Fail CI if the hex leaks outside the allowlisted files
# in frontend/src/graph/obsidian/.
./scripts/check-token-sacred-blue.sh
# EVAL-DOCS-COMPLETENESS-CYCLE15 F07: CONTRIBUTING.md coverage-gate claim
# must match scripts/coverage.sh's --fail-under-lines / --fail-uncovered-lines.
./scripts/check-contributing-coverage-claim.sh
# EVAL-DOCS-COMPLETENESS-CYCLE17 F01: every `vX.Y follow-up` /
# `vX.Y.Z follow-up` token in user-facing docs must name a minor strictly
# greater than the workspace.package.version minor — otherwise the prose
# is shipping a follow-up promise about a release that has already
# happened. Caught the cycle-15 + cycle-16 miss on Bolt v4/v5 negotiation
# in COMPATIBILITY.md/SPEC.md/DESIGN.md.
./scripts/check-followup-target-not-current.sh
# EVAL-DOCS-COMPLETENESS-CYCLE17 F02: every (docs|documentation)/<File>.md
# reference in CHANGELOG.md must resolve on disk (or be in the explicit
# historical-removal whitelist). Catches the cycle-15 8496878 typo class
# where docs/→documentation/ rename misses adjacent bullets.
./scripts/check-changelog-paths.sh
# EVAL-DOCS-COMPLETENESS-CYCLE18 F01: scripts/install.sh OGDB_HOME default
# must normalize to the same dir as crates/ogdb-cli/src/lib.rs::default_demo_db_path.
# When these diverge, the install.sh banner promise ("run `ogdb demo` to load
# MovieLens") silently sends the user to a different file from the one
# install.sh just created — the user-visible bug cycle-17's 91ee552 left in place.
./scripts/check-install-demo-path-matches-binary-default.sh
# EVAL-DOCS-COMPLETENESS-CYCLE18 F02: BENCHMARKS verdict vocabulary mirror
# gate. Cycle-17 e585f66 toned down the verdict legend in BENCHMARKS.md
# but left three downstream surfaces (SKILL.md, benchmarks-snapshot.md,
# MIGRATION-FROM-NEO4J.md) speaking in the retracted vocabulary. This
# gate asserts that any of {DIRECTIONAL WIN, crushing, "3 wins / 2
# losses / 6 novel"} appearing in a BENCHMARKS mirror file is annotated
# with a trailing <!-- HISTORICAL --> marker.
./scripts/check-benchmarks-vocabulary-mirror.sh
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
# EVAL-PERF-RELEASE-CYCLE15 F04: bash -n every `run: |` body in
# .github/workflows/*.yml so a stray `done`/`fi` can't slip past review.
./scripts/test-workflow-bash-syntax.sh
# EVAL-PERF-RELEASE-CYCLE15 F06: install.sh detect_target() must emit
# asset URLs matching release.yml::build.matrix triples + .tar.xz/.zip exts.
# Also closes EVAL-PERF-RELEASE-CYCLE16 F03: the release-tests.yaml
# install-sh-asset-url-template entry was documentation-only until wired here.
./scripts/test-install-detect-target.sh
# Meta-tests for the cycle-15 gates above (run after the gates so a
# breakage in the gate itself is visible separately from the surface it gates).
./scripts/test-check-security-supported-version.sh
./scripts/test-check-skills-copilot-removed.sh
./scripts/test-check-contributing-coverage-claim.sh
# EVAL-DOCS-COMPLETENESS-CYCLE17 F04: meta-test for check-npm-package-github-url.sh
# (added in cycle-16 09f9161, wired here alongside the gate it covers).
./scripts/test-check-npm-package-github-url.sh
# EVAL-DOCS-COMPLETENESS-CYCLE17 F04: structural meta-meta-test — every
# scripts/check-*.sh gate must be invoked directly from scripts/test.sh. Closes
# the cycle-15+16 class of gap (gate created, not wired) at the structural level.
./scripts/test-all-check-scripts-wired.sh
./scripts/test-check-followup-target-not-current.sh
./scripts/test-check-changelog-paths.sh
# EVAL-DOCS-COMPLETENESS-CYCLE18 F01: meta-test for the install-demo-path
# gate above (red-green: matching paths pass, ~/.opengraphdb-vs-~/.ogdb drift fails).
./scripts/test-check-install-demo-path-matches.sh
# EVAL-DOCS-COMPLETENESS-CYCLE19 F01/F02/F03: meta-test for the widened
# `.opengraphdb` scan added to the install-demo-path gate. Asserts stale
# tokens in init_agent.rs / skill bundle scripts / skill bundle references
# trip the gate, while the legit `mcp.opengraphdb.<tool>` API namespace +
# `mcpServers.opengraphdb` jq config-key path remain exempt.
./scripts/test-check-opengraphdb-path-coherence.sh
# EVAL-DOCS-COMPLETENESS-CYCLE18 F03: shipped *.md must not teach
# `ogdb init --agent <bareword>` — `--agent` is a SetTrue boolean, the agent id
# is selected by `--agent-id <ID>` (crates/ogdb-cli/src/lib.rs:227-246). A
# bareword after `--agent` silently slots into the positional db-path arg.
./scripts/check-init-agent-syntax.sh
./scripts/test-check-init-agent-syntax.sh
./scripts/test-check-benchmarks-vocabulary-mirror.sh
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
