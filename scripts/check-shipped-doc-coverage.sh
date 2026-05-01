#!/usr/bin/env bash
# Regression gate for eval/rust-quality §5 (HIGH), EVAL-RUST-QUALITY-CYCLE2 §H8,
# and EVAL-DOCS-COMPLETENESS-CYCLE2 §C2-H3 (re-armed cycle-3 §C3-B1 after a
# merge regression dropped the Layer-2 check).
#
# Two layers:
#
# 1) Strict pub-item doc coverage on the monolith-split sibling crates and
#    every other library crate that does NOT yet carry the cycle-2 missing-docs
#    deferral. Each of these is hard-failed if a `pub` item lacks a `///`
#    comment via `RUSTDOCFLAGS=-D missing_docs`. The six publishable user-facing
#    crates (ogdb-core, ogdb-cli, ogdb-bolt, ogdb-ffi, ogdb-node, ogdb-python)
#    are excluded from Layer 1 because they each declare
#    `#![warn(missing_docs)]` paired with `#![allow(missing_docs)]` for now;
#    those allows are tracked as the cycle-3 forcing function and the gate is
#    re-armed once the public APIs settle. Five publish=false harnesses are
#    excluded because their pub items are intentionally undocumented internal
#    scaffolding (ogdb-bench, ogdb-e2e, ogdb-eval, ogdb-fuzz, ogdb-tck).
#
# 2) Crate-root //! presence on every publishable crate. These crates ship to
#    docs.rs with the workspace README inherited as the rendered page; an empty
#    crate root means the docs.rs landing has no description, no quickstart,
#    no link to the project. The cycle-2-rust merge overwrote the crate roots
#    of three of these crates and silently dropped this layer at the same time;
#    re-armed in cycle-3 §C3-B1 to make the regression unrepeatable.
set -euo pipefail

# Layer 1: strict pub-item doc coverage on the non-deferral library crates.
RUSTDOCFLAGS="-D missing_docs" \
  cargo doc --no-deps --workspace \
    --exclude ogdb-bench \
    --exclude ogdb-e2e \
    --exclude ogdb-eval \
    --exclude ogdb-fuzz \
    --exclude ogdb-tck \
    --exclude ogdb-core \
    --exclude ogdb-cli \
    --exclude ogdb-bolt \
    --exclude ogdb-ffi \
    --exclude ogdb-node \
    --exclude ogdb-python

# Layer 2: crate-root //! must exist on every publishable crate so docs.rs
# doesn't render an empty landing. This guards against the EXACT regression
# the cycle-3 audit caught (cycle-2-rust merge dropped //! from three of six
# publishable crates by overwriting the file roots).
EXIT=0
for crate in ogdb-core ogdb-cli ogdb-bolt ogdb-ffi ogdb-node ogdb-python; do
  src="crates/$crate/src/lib.rs"
  if [[ ! -f "$src" ]]; then
    echo "ERROR: expected $src but file is missing" >&2
    EXIT=1
    continue
  fi
  if ! head -50 "$src" | grep -qE '^//!'; then
    echo "ERROR: $src has no crate-level //! doc in the first 50 lines — docs.rs will render an empty landing" >&2
    echo "       Add a 5-20 line crate-doc at the top of the file (see ogdb-core for shape)." >&2
    EXIT=1
  fi
done

if [[ $EXIT -ne 0 ]]; then
  exit $EXIT
fi
echo "OK: shipped library crates (excluding cycle-2 deferrals) have full pub-item doc coverage AND every publishable crate has a crate-root //! doc."
