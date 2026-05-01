#!/usr/bin/env bash
# Regression gate for eval/rust-quality §5 + EVAL-RUST-QUALITY-CYCLE2 §H8 +
# EVAL-RUST-QUALITY-CYCLE3 §B1 + EVAL-RUST-QUALITY-CYCLE4 §H3.
#
# Cycle 3 trimmed the `--exclude` list to the three crates that still
# carry `#![allow(missing_docs)]` (ogdb-core 41 kLoC, ogdb-node,
# ogdb-python). Cycle 4 H3 adds two complements:
#   1. ogdb-node / ogdb-python now declare the lint
#      (`#![warn(missing_docs)]`) so a future contributor sees the
#      warning at PR time even though the paired allow holds the
#      baseline. Cycle 3 had left both crates with NO declaration at
#      all (double-excluded).
#   2. scripts/check-doc-ratchet.sh caps the undocumented count per
#      crate at the cycle-4 baseline. New pub items must carry a
#      `///` doc comment OR the ratchet fails.
# The forcing function for closing the allow(s) remains the cycle-3
# N20 split of ogdb-core, plus per-PR documentation of the napi /
# pyo3 surfaces.
set -euo pipefail

RUSTDOCFLAGS="-D missing_docs" \
  cargo doc --no-deps --workspace \
    --exclude ogdb-bench \
    --exclude ogdb-e2e \
    --exclude ogdb-eval \
    --exclude ogdb-fuzz \
    --exclude ogdb-tck \
    --exclude ogdb-core \
    --exclude ogdb-node \
    --exclude ogdb-python
echo "OK: shipped library crates (excluding ogdb-core / ogdb-node / ogdb-python ratchet) have full pub-item doc coverage."

# EVAL-RUST-QUALITY-CYCLE3 B1: forbid any new `#![allow(missing_docs)]` at
# crate root. The three excluded crates above carry their own crate-scope
# allow until the ratchet closes; adding a new allow to ANY other crate
# fails this gate.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
allowed=$(grep -rln '#!\[allow(missing_docs)\]' "$ROOT/crates" --include='lib.rs' 2>/dev/null || true)
for f in $allowed; do
  case "$f" in
    "$ROOT/crates/ogdb-core/src/lib.rs"|"$ROOT/crates/ogdb-node/src/lib.rs"|"$ROOT/crates/ogdb-python/src/lib.rs")
      ;;
    *)
      echo "FAIL: $f introduces a new #![allow(missing_docs)] (B1)" >&2
      exit 1
      ;;
  esac
done
echo "ok: no new #![allow(missing_docs)] outside the three ratchet crates (B1)"

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
