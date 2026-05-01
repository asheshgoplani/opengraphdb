#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE3 B2 regression gate.
#
# Every publishable crate's lib.rs must start with a `//!` crate-root
# rustdoc block (after any optional initial comment / shebang). Without
# it, docs.rs renders the workspace README on the crate page but no
# crate-specific landing copy. Cycle 2 added `//!` to 6 crates but
# missed ogdb-core, ogdb-cli, and ogdb-node — the three highest-impact
# surfaces.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
fail=0

# All publishable crates (mirrors test-crate-metadata.sh PUBLISHABLE).
CRATES=(
  ogdb-types
  ogdb-vector
  ogdb-algorithms
  ogdb-text
  ogdb-temporal
  ogdb-import
  ogdb-export
  ogdb-core
  ogdb-bolt
  ogdb-cli
  ogdb-ffi
  ogdb-node
  ogdb-python
)

for crate in "${CRATES[@]}"; do
  src="$ROOT/crates/$crate/src/lib.rs"
  [[ -f "$src" ]] || { echo "FAIL: $src missing" >&2; fail=1; continue; }
  # Look for `//!` anywhere in the first 30 lines (allow leading
  # # comment / cfg_attr lines to come first).
  if ! head -n 30 "$src" | grep -qE '^\s*//!'; then
    echo "FAIL: $crate/src/lib.rs missing //! crate-root rustdoc (B2)" >&2
    fail=1
  else
    echo "ok: $crate has crate-root //! rustdoc"
  fi
done

exit "$fail"
