#!/usr/bin/env bash
# Regression gate for eval/rust-quality §5 (HIGH) and EVAL-RUST-QUALITY-CYCLE2 §H8.
#
# Cycle 1 enumerated seven crates; cycle 2 inverts the list to
# `--workspace --exclude` so adding a future shipped library crate is
# automatically gated rather than silently skipped. Five crates are
# excluded because they are non-published harnesses (`publish = false`)
# whose pub items are intentionally undocumented internal scaffolding.
#
# ogdb-core, ogdb-cli, ogdb-bolt, ogdb-ffi, ogdb-node, ogdb-python all
# declare `#![warn(missing_docs)]` (B1/B2/H11) but pair it with
# `#![allow(missing_docs)]` for now because they each have undocumented
# public items predating cycle 2. The eval describes this as the cycle-3
# forcing function. Until those crates land their doc comments, they are
# excluded here. Removing them from the exclude list is the gating
# action that locks in the new docs.
set -euo pipefail

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
echo "OK: shipped library crates (excluding cycle-2 deferrals) have full pub-item doc coverage."

# Layer 2 (EVAL-FRONTEND-QUALITY-CYCLE3 H-2 / cycle-2-docs F26): every
# publishable crate's `src/lib.rs` must carry a `//!` crate-root doc within
# the first 50 lines. The cycle-2-rust merge at 141e6f7 silently dropped the
# `//!` block from ogdb-cli, ogdb-core, ogdb-node when it kept the
# `#![warn(missing_docs)]` block-comment from the rust branch. This guard
# stops that regression class from recurring: the head of every shipped
# lib.rs must contain at least one `//!` line, regardless of whether the
# crate is currently in the `--exclude` list above.
SHIPPED_CRATES=(
  ogdb-bolt
  ogdb-cli
  ogdb-core
  ogdb-ffi
  ogdb-node
  ogdb-python
)
fail=0
for crate in "${SHIPPED_CRATES[@]}"; do
  lib="crates/${crate}/src/lib.rs"
  if [[ ! -f "${lib}" ]]; then
    echo "ERROR: ${lib} not found (Layer 2 gate)"
    fail=1
    continue
  fi
  if ! head -50 "${lib}" | grep -q '^//!'; then
    echo "ERROR: ${lib} is missing a \`//!\` crate-root doc block in the first 50 lines."
    echo "       Cycle-3 H-2 requires every publishable crate's lib.rs to begin with"
    echo "       a \`//!\` block so rustdoc can render a crate landing page."
    fail=1
  fi
done
if [[ "${fail}" -ne 0 ]]; then
  exit 1
fi
echo "OK: every publishable crate's lib.rs starts with a //! doc block (Layer 2)."
