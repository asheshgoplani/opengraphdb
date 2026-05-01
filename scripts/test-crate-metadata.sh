#!/usr/bin/env bash
# EVAL-PERF-RELEASE.md Finding 7 (HIGH): every workspace crate must either
# (a) declare publish = false (dev/test rig), OR
# (b) carry the metadata cargo publish requires (description, repository,
#     homepage). Without this, `cargo publish --dry-run` rejects on first
#     attempt at v0.5.0 tag time — too late.
#
# This test enforces the contract; CI runs it (added in this commit).
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Crates that MUST have publish metadata (public API).
PUBLISHABLE=(
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

# Crates that MUST be marked publish = false (dev/test rigs).
INTERNAL=(
  ogdb-bench
  ogdb-eval
  ogdb-e2e
  ogdb-tck
  ogdb-fuzz
)

fail() { echo "FAIL: $*" >&2; exit 1; }

# Fields cargo publish requires for every publishable crate.
REQUIRED_FIELDS=(description repository homepage)

for crate in "${PUBLISHABLE[@]}"; do
  toml="$ROOT/crates/$crate/Cargo.toml"
  [[ -f "$toml" ]] || fail "$crate Cargo.toml missing"

  # Reject any explicit `publish = false` on a publishable crate.
  if grep -qE '^[[:space:]]*publish[[:space:]]*=[[:space:]]*false' "$toml"; then
    fail "$crate is marked publish=false but is in PUBLISHABLE list"
  fi

  for field in "${REQUIRED_FIELDS[@]}"; do
    # Accept either inline value OR `field.workspace = true`.
    if ! grep -qE "^[[:space:]]*${field}[[:space:]]*(=|\\.workspace[[:space:]]*=)" "$toml"; then
      fail "$crate missing required [package].$field (or $field.workspace = true)"
    fi
  done

  echo "ok: $crate has all required metadata"
done

for crate in "${INTERNAL[@]}"; do
  toml="$ROOT/crates/$crate/Cargo.toml"
  [[ -f "$toml" ]] || fail "$crate Cargo.toml missing"
  if ! grep -qE '^[[:space:]]*publish[[:space:]]*=[[:space:]]*false' "$toml"; then
    fail "$crate is internal but missing 'publish = false'"
  fi
  echo "ok: $crate is publish=false"
done

# Workspace package metadata block must define the shared fields.
ws="$ROOT/Cargo.toml"
for field in "${REQUIRED_FIELDS[@]}" repository keywords categories; do
  if ! awk -v f="$field" '
    /^\[workspace\.package\]/ { in_b = 1; next }
    /^\[/                     { in_b = 0 }
    in_b && $0 ~ "^[[:space:]]*"f"[[:space:]]*=" { print; exit }
  ' "$ws" | grep -q .; then
    fail "Cargo.toml [workspace.package] missing shared field: $field"
  fi
done
echo "ok: [workspace.package] has all shared metadata fields"

echo "all crate-metadata checks pass"
