#!/usr/bin/env bash
# Regression gate for eval/rust-quality §5 (HIGH) + cycle-2 docs eval C2-H3.
#
# Two layers:
#
# 1) Strict pub-item doc coverage on the 7 monolith-split sibling crates.
#    Each of these has `#![warn(missing_docs)]` at its root; we run
#    `cargo doc` with `RUSTDOCFLAGS=-D missing_docs` so the warn-level
#    is upgraded to a hard error in CI. Adding a `pub` field / variant /
#    fn / struct / enum without a doc comment fails this layer.
#
# 2) Crate-root description presence on the 6 publishable user-facing
#    crates (ogdb-core, ogdb-cli, ogdb-bolt, ogdb-ffi, ogdb-python,
#    ogdb-node). These crates ship to docs.rs with the workspace README
#    inherited as the rendered page, so an empty crate root means the
#    docs.rs landing has no description, no quickstart, no link to the
#    project. The strict missing_docs gate is NOT applied here yet —
#    cycle 2 only required the crate-root //! to land. Future cycles
#    will ratchet missing_docs onto these crates as the public API
#    settles.
set -euo pipefail

# Layer 1: strict pub-item doc coverage on the monolith-split siblings.
RUSTDOCFLAGS="-D missing_docs" \
  cargo doc --no-deps \
    -p ogdb-types \
    -p ogdb-vector \
    -p ogdb-text \
    -p ogdb-temporal \
    -p ogdb-algorithms \
    -p ogdb-import \
    -p ogdb-export

# Layer 2: crate-root //! must exist on every publishable crate so docs.rs
# doesn't render an empty landing.
EXIT=0
for crate in ogdb-core ogdb-cli ogdb-bolt ogdb-ffi ogdb-python ogdb-node; do
  src="crates/$crate/src/lib.rs"
  if [[ ! -f "$src" ]]; then
    echo "ERROR: expected $src but file is missing" >&2
    EXIT=1
    continue
  fi
  if ! head -50 "$src" | grep -qE '^//!'; then
    echo "ERROR: $src has no crate-level //! doc — docs.rs will render an empty landing" >&2
    echo "       Add a 5-20 line crate-doc at the top of the file (see ogdb-core for shape)." >&2
    EXIT=1
  fi
done

if [[ $EXIT -ne 0 ]]; then
  exit $EXIT
fi
echo "OK: shipped library crates have full pub-item doc coverage AND every publishable crate has a crate-root //! doc."
