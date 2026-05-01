#!/usr/bin/env bash
# C2-A7 (HIGH): the npm package shipped at crates/ogdb-node/package.json
# drifted to 0.1.0 while the workspace shipped 0.4.0. The local
# prepublishOnly gate catches it at npm publish time, but a CI gate at
# PR time stops the drift from re-landing in the first place.
#
# Usage: bash scripts/check-npm-version.sh [--root <repo-root>]
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CARGO_TOML="$ROOT/Cargo.toml"
PKG_JSON="$ROOT/crates/ogdb-node/package.json"

if [[ ! -f "$CARGO_TOML" ]]; then
  echo "check-npm-version: missing $CARGO_TOML" >&2
  exit 2
fi
if [[ ! -f "$PKG_JSON" ]]; then
  echo "check-npm-version: missing $PKG_JSON" >&2
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
  echo "check-npm-version: could not read workspace.package.version from $CARGO_TOML" >&2
  exit 2
fi

# Avoid pulling in jq just for one field.
NPM_VERSION=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$PKG_JSON" \
  | head -n1 | grep -oE '"[^"]+"$' | tr -d '"')

if [[ -z "$NPM_VERSION" ]]; then
  echo "check-npm-version: could not read .version from $PKG_JSON" >&2
  exit 1
fi

if [[ "$WS_VERSION" != "$NPM_VERSION" ]]; then
  echo "check-npm-version: VERSION DRIFT" >&2
  echo "  workspace.package.version       = $WS_VERSION  (Cargo.toml)" >&2
  echo "  crates/ogdb-node/package.json   = $NPM_VERSION" >&2
  echo "" >&2
  echo "Fix: update crates/ogdb-node/package.json .version to $WS_VERSION." >&2
  exit 1
fi

echo "check-npm-version: ok ($WS_VERSION)"
