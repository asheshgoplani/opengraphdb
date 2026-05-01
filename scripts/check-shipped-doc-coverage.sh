#!/usr/bin/env bash
# Regression gate for eval/rust-quality §5 + EVAL-RUST-QUALITY-CYCLE2 §H8 +
# EVAL-RUST-QUALITY-CYCLE3 §B1.
#
# Cycle 3 trims the `--exclude` list to the three crates that still carry
# `#![allow(missing_docs)]` (ogdb-core 41 kLoC, ogdb-node, ogdb-python).
# ogdb-cli, ogdb-bolt, and ogdb-ffi have all of their pub items documented
# and now run under the gate. The remaining three are the cycle-N
# ratchet — see N20 (split ogdb-core into modules) for the path to
# closing them.
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
