#!/usr/bin/env bash
# EVAL-PERF-RELEASE.md Finding 7 (HIGH) + EVAL-PERF-RELEASE-CYCLE2.md C2-A1
# (BLOCKER): every workspace crate must either
# (a) declare publish = false (dev/test rig), OR
# (b) carry the metadata cargo publish requires (description, repository,
#     homepage), AND every intra-workspace path-dep on a publishable crate
#     must declare `version = "..."` so `cargo publish` can resolve the dep
#     after the local checkout is gone.
#
# Why no `cargo publish --dry-run` companion gate: pre-bootstrap (before
# any crate has shipped to crates.io) `cargo publish --dry-run --no-verify`
# still resolves intra-workspace deps against the index and fails for
# every dep that isn't yet published. This script is the durable
# pre-bootstrap defense; once v0.5.0 ships, a follow-up patch can wire
# `cargo publish --dry-run` into release.yml as defense-in-depth.
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

  # C2-A1 (BLOCKER): every intra-workspace path-dep on a publishable crate
  # must declare `version = "..."`. `cargo publish` rejects path-only deps.
  bad=$(grep -E '^[[:space:]]*ogdb-[a-z-]+[[:space:]]*=[[:space:]]*\{[[:space:]]*path[[:space:]]*=' "$toml" \
        | grep -v 'version[[:space:]]*=' || true)
  if [[ -n "$bad" ]]; then
    fail "$crate has intra-workspace path-deps without version pins:"$'\n'"$bad"
  fi

  echo "ok: $crate has all required metadata"
done

for crate in "${INTERNAL[@]}"; do
  toml="$ROOT/crates/$crate/Cargo.toml"
  [[ -f "$toml" ]] || fail "$crate Cargo.toml missing"
  if ! grep -qE '^[[:space:]]*publish[[:space:]]*=[[:space:]]*false' "$toml"; then
    fail "$crate is internal but missing 'publish = false'"
  fi
  # EVAL-RUST-QUALITY-CYCLE3 H10: even publish=false harness crates need
  # rust-version metadata so `cargo metadata`-driven downstream tooling
  # (security scanners, release tooling, MSRV reports) sees a uniform
  # MSRV across every workspace member.
  if ! grep -qE '^[[:space:]]*rust-version[[:space:]]*(=|\.workspace[[:space:]]*=)' "$toml"; then
    fail "$crate missing required [package].rust-version (or rust-version.workspace = true)"
  fi
  echo "ok: $crate is publish=false with rust-version metadata"
done

# H10: every PUBLISHABLE crate must also carry rust-version metadata.
# (Most do via `rust-version.workspace = true`; this re-asserts the gate.)
for crate in "${PUBLISHABLE[@]}"; do
  toml="$ROOT/crates/$crate/Cargo.toml"
  if ! grep -qE '^[[:space:]]*rust-version[[:space:]]*(=|\.workspace[[:space:]]*=)' "$toml"; then
    fail "$crate missing required [package].rust-version"
  fi
done
echo "ok: every workspace crate carries rust-version metadata (H10)"

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
