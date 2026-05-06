#!/usr/bin/env bash
# release-publish-order.sh
#
# Single source of truth for the order in which the workspace's publishable
# crates must hit crates.io during a release.
#
# Two modes:
#   bash scripts/release-publish-order.sh             # prints the order, one crate per line
#   bash scripts/release-publish-order.sh --explain   # prints the order with a short comment per crate
#
# The release workflow (.github/workflows/release.yml) and the local
# pre-flight (scripts/release.sh) should both consume this list rather than
# inlining their own copy. Inlining was how the order drifted between
# infra files in past cycles — single-list-per-script is the fix.
#
# Why the order matters:
#   We declare intra-workspace dependencies with `path = "..."` (so local
#   `cargo build` works without a published crate) AND `version = "x.y.z"`
#   (so `cargo publish` rewrites the path-dep to a registry-dep on push).
#   When a fresh version is being cut, the registry doesn't have the new
#   `version = "x.y.z"` yet for the dependency. `cargo publish` therefore
#   fails with "no matching package named ... found" until the *dep* is
#   published first. So we publish strictly bottom-up: leaves first, then
#   anything that depends on them, then the binaries / FFI shells last.
#
# The order below is the topological sort of the workspace dep graph that
# the release pipeline currently uses. It was hand-validated against
# `cargo publish --dry-run` and is the one shape that works end-to-end.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Publish order. DO NOT REORDER without re-running `cargo publish --dry-run`
# for every crate; an out-of-order entry will break the release at the
# point of first divergence and leave crates.io in a half-published state.
# ──────────────────────────────────────────────────────────────────────────
PUBLISH_ORDER=(
  # Pure leaves — depend on no first-party crate.
  "ogdb-vector"      # vector index primitives; depended on by core, algorithms, text
  "ogdb-types"       # shared value/error/schema types; depended on by everything above core

  # Single-layer crates that depend only on the leaves above.
  "ogdb-algorithms"  # graph algos (BFS/PageRank/etc.); uses types
  "ogdb-text"        # full-text indexer; uses types + vector
  "ogdb-temporal"    # bitemporal helpers; uses types

  # I/O crates layered on top of types/temporal.
  "ogdb-import"      # ingest formats (CSV/Parquet/RDF); uses types, temporal
  "ogdb-export"      # serialize formats; uses types, temporal

  # Storage + query engine — the trunk that the binaries link against.
  "ogdb-core"        # storage engine + Cypher executor; uses every crate above

  # Network + binary crates — published last because they pull in core.
  "ogdb-bolt"        # Bolt protocol server; depends on core
  "ogdb-cli"         # `ogdb` binary; depends on core, bolt, import, export

  # FFI / language bindings — published after the binary because some of
  # them re-export CLI bits or use the same released-version pin.
  "ogdb-ffi"         # C ABI bindings; depends on core
  "ogdb-python"      # PyO3 Python wheel; depends on ffi/core
  "ogdb-node"        # napi-rs Node.js binding; depends on ffi/core
)

if [[ "${1:-}" == "--explain" ]]; then
  for crate in "${PUBLISH_ORDER[@]}"; do
    line=$(grep -E "\"$crate\"\s+#" "$0" || true)
    if [[ -n "$line" ]]; then
      printf '%s\n' "$line" | sed -E 's/^\s*"([^"]+)"\s+#\s*/\1\t/'
    else
      printf '%s\n' "$crate"
    fi
  done
  exit 0
fi

if [[ "${1:-}" == "--check" ]]; then
  # Sanity: every listed crate must exist as crates/<name>/Cargo.toml in the
  # repo. Catches typos and crates that were renamed/removed without
  # updating this list.
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  missing=0
  for crate in "${PUBLISH_ORDER[@]}"; do
    if [[ ! -f "$ROOT/crates/$crate/Cargo.toml" ]]; then
      echo "release-publish-order: missing crates/$crate/Cargo.toml" >&2
      missing=1
    fi
  done
  if [[ $missing -ne 0 ]]; then
    echo "release-publish-order: at least one crate in the publish order is not in the workspace." >&2
    exit 1
  fi
  echo "release-publish-order: ok (${#PUBLISH_ORDER[@]} crates, all present)"
  exit 0
fi

# Default: emit the order one-per-line so callers can `while read crate; do ...`.
printf '%s\n' "${PUBLISH_ORDER[@]}"
