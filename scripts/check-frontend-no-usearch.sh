#!/usr/bin/env bash
# EVAL-FRONTEND-CYCLE34 F1 (HIGH): the shipped vector ANN backend is
# `instant-distance` (pure-Rust HNSW), not `usearch` — see
# crates/ogdb-vector/Cargo.toml + crates/ogdb-core/src/lib.rs HNSW_*
# constants + ARCHITECTURE.md. The `usearch` literal cycle-2 scrubbed
# from AIIntegrationSection.tsx + embeddings-hybrid-rrf.md survived in
# FeaturesSection.tsx until cycle-34 caught it (1H carry-forward from
# cycle-33's cosmos.gl removal).
#
# This gate locks the family closed: any `usearch` literal in the
# landing-component tree fails CI. Same idiom as
# scripts/check-token-sacred-blue.sh.
set -euo pipefail

LANDING_DIR="frontend/src/components/landing"

if [[ ! -d "$LANDING_DIR" ]]; then
  echo "check-frontend-no-usearch: $LANDING_DIR not found (run from repo root)" >&2
  exit 2
fi

HITS=$(grep -rni 'usearch' "$LANDING_DIR" --include='*.tsx' 2>/dev/null || true)

if [[ -n "$HITS" ]]; then
  echo "check-frontend-no-usearch: found 'usearch' in $LANDING_DIR (the shipped vector backend is instant-distance — see ARCHITECTURE.md):" >&2
  echo "$HITS" >&2
  exit 1
fi

exit 0
