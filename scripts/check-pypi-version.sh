#!/usr/bin/env bash
# C3-H2 (HIGH): the Python wheel at crates/ogdb-python/pyproject.toml
# drifted to 0.1.0 while the workspace shipped 0.4.0 — same drift class
# as C2-A7 (npm), no equivalent gate. This script mirrors
# scripts/check-npm-version.sh: assert that
# `crates/ogdb-python/pyproject.toml` declares the same `version`
# as `[workspace.package]` in `Cargo.toml` at the repo root, so a
# `maturin publish` from CI ships the workspace version.
#
# Usage: bash scripts/check-pypi-version.sh [--root <repo-root>]
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CARGO_TOML="$ROOT/Cargo.toml"
PYPROJECT_TOML="$ROOT/crates/ogdb-python/pyproject.toml"

if [[ ! -f "$CARGO_TOML" ]]; then
  echo "check-pypi-version: missing $CARGO_TOML" >&2
  exit 2
fi
if [[ ! -f "$PYPROJECT_TOML" ]]; then
  echo "check-pypi-version: missing $PYPROJECT_TOML" >&2
  exit 2
fi

# Pull `workspace.package.version = "X.Y.Z"` out of the workspace root.
WS_VERSION=$(awk '
  /^\[workspace\.package\]/ { in_block = 1; next }
  /^\[/                     { in_block = 0 }
  in_block && /^[[:space:]]*version[[:space:]]*=/ {
    match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
  }
' "$CARGO_TOML")

if [[ -z "$WS_VERSION" ]]; then
  echo "check-pypi-version: could not read workspace.package.version from $CARGO_TOML" >&2
  exit 2
fi

# Pull `version = "X.Y.Z"` from `[project]` in pyproject.toml.
PYPI_VERSION=$(awk '
  /^\[project\]/ { in_block = 1; next }
  /^\[/          { in_block = 0 }
  in_block && /^[[:space:]]*version[[:space:]]*=/ {
    match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
  }
' "$PYPROJECT_TOML")

if [[ -z "$PYPI_VERSION" ]]; then
  echo "check-pypi-version: could not read [project].version from $PYPROJECT_TOML" >&2
  exit 1
fi

if [[ "$WS_VERSION" != "$PYPI_VERSION" ]]; then
  echo "check-pypi-version: VERSION DRIFT" >&2
  echo "  workspace.package.version            = $WS_VERSION  (Cargo.toml)" >&2
  echo "  crates/ogdb-python/pyproject.toml    = $PYPI_VERSION" >&2
  echo "" >&2
  echo "Fix: update crates/ogdb-python/pyproject.toml [project].version to $WS_VERSION." >&2
  exit 1
fi

echo "check-pypi-version: ok ($WS_VERSION)"
