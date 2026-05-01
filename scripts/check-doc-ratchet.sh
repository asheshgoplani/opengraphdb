#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE4 H3 regression gate.
#
# Three crates carry a paired `#![warn(missing_docs)] +
# #![allow(missing_docs)]` because their pub surface is too large
# to document in one cycle:
#
#   - ogdb-core (362 pub items, ~290 undocumented as of cycle 4)
#   - ogdb-node (~42 pub items, ~42 undocumented; napi-exported)
#   - ogdb-python (~24 pub items, ~24 undocumented; pyo3-exported)
#
# Without a ratchet, the allow defeats the gate — a new PR can add a
# pub item without a doc-comment and CI stays green. This script
# counts undocumented pub items per crate's `lib.rs` and fails if the
# count grows past the cycle-4 baseline. New pub items MUST land
# with a `///` doc comment within the four lines preceding them.
#
# Closing each crate's allow happens when its undocumented count
# reaches zero (drop the allow, ratchet becomes the warn gate).
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Cycle-4 baselines (max undocumented pub items allowed). Lowering a
# baseline number is encouraged; raising one fails the gate.
declare -A baseline=(
  [ogdb-core]=290
  [ogdb-node]=42
  [ogdb-python]=24
)

count_undocumented() {
  awk '
    /^[[:space:]]*\/\/\// { last_doc_line = NR; next }
    /^[[:space:]]*#\[/ { next }
    /^[[:space:]]*pub (fn|struct|enum|trait|type|const|use|mod) / {
      if (NR - last_doc_line > 4) undocumented++
    }
    END { print undocumented + 0 }
  ' "$1"
}

fail=0
for crate in "${!baseline[@]}"; do
  lib="$ROOT/crates/$crate/src/lib.rs"
  if [[ ! -f "$lib" ]]; then
    echo "FAIL: $lib missing (CYCLE4 H3)" >&2
    fail=1
    continue
  fi
  actual=$(count_undocumented "$lib")
  cap="${baseline[$crate]}"
  if [[ "$actual" -gt "$cap" ]]; then
    echo "FAIL: $crate has $actual undocumented pub items, baseline is $cap (CYCLE4 H3)" >&2
    echo "      Add a /// doc comment to the new pub item, OR lower the baseline in scripts/check-doc-ratchet.sh." >&2
    fail=1
  elif [[ "$actual" -lt "$cap" ]]; then
    echo "ok: $crate $actual/$cap undocumented (please lower baseline to $actual)"
  else
    echo "ok: $crate $actual/$cap undocumented"
  fi
done

exit "$fail"
