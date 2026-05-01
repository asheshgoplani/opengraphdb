#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE4 H5 regression gate.
#
# bindings/c/, bindings/go/, proto/ ship consumer-facing surfaces
# (auto-generated C header, cgo wrapper, gRPC schema). Cycle-3 M19
# noted these had no README and proposed adding one each; only
# bindings/mcp/ landed before cycle 4. CYCLE4 H5 added the missing
# READMEs. This gate fails if any of them disappears, OR if a new
# top-level binding directory ships without a README.md.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

required=(
  "bindings/c/README.md"
  "bindings/go/README.md"
  "proto/README.md"
)
fail=0
for path in "${required[@]}"; do
  if [[ ! -f "$ROOT/$path" ]]; then
    echo "FAIL: $path missing (CYCLE4 H5)" >&2
    fail=1
  else
    echo "ok: $path present"
  fi
done

# Forbid a new top-level binding dir without a README. We only check
# directories under bindings/ that contain at least one tracked file
# (skip empty dirs and the auto-generated `target/`).
if [[ -d "$ROOT/bindings" ]]; then
  for dir in "$ROOT"/bindings/*/; do
    if [[ -d "$dir" ]] && [[ -n "$(find "$dir" -maxdepth 1 -type f -print -quit)" ]]; then
      if [[ ! -f "$dir/README.md" ]]; then
        echo "FAIL: $dir is a populated binding directory without README.md (CYCLE4 H5)" >&2
        fail=1
      fi
    fi
  done
fi

exit "$fail"
