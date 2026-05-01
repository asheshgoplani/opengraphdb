#!/usr/bin/env bash
# Regression gate for eval/rust-quality §5 (HIGH).
#
# Every shipped library crate has `#![warn(missing_docs)]` at its
# root. This script runs `cargo doc` with `RUSTDOCFLAGS=-D
# missing_docs` so the warn-level is upgraded to a hard error in CI.
# If anyone adds a `pub` field / variant / fn / struct / enum without
# a doc comment, this fails.
set -euo pipefail

RUSTDOCFLAGS="-D missing_docs" \
  cargo doc --no-deps \
    -p ogdb-types \
    -p ogdb-vector \
    -p ogdb-text \
    -p ogdb-temporal \
    -p ogdb-algorithms \
    -p ogdb-import \
    -p ogdb-export
echo "OK: shipped library crates have full pub-item doc coverage."
