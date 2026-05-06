#!/usr/bin/env bash
# check-version-drift-master.sh
#
# Single source-of-truth gate for shipped version strings across the entire
# repo. Walks every place we declare a version on the wire and asserts they
# all agree with the Cargo workspace.package.version (the canonical value).
#
# This complements the per-language gates (check-npm-version.sh,
# check-pypi-version.sh) by catching drift in the *other* version-bearing
# files no single per-language gate covers:
#
#   - Cargo.toml                       [workspace.package].version
#   - frontend/package.json            (frontend is shipped as part of the
#                                       same release; bumping the workspace
#                                       must bump the frontend too)
#   - .claude-plugin/plugin.json       (claude-code marketplace manifest)
#   - npm/cli/package.json             (the standalone npm CLI wrapper)
#   - crates/ogdb-python/pyproject.toml
#   - crates/ogdb-node/package.json    (Node FFI binding — already covered
#                                       by check-npm-version.sh, included
#                                       here so the master gate is truly
#                                       exhaustive)
#
# Why a "master" gate when per-language ones exist:
#   The per-language gates were added piecemeal as drifts were discovered
#   in PR review. New version-bearing files keep getting added (plugin.json,
#   npm/cli) and a per-file gate has to be remembered each time. This gate
#   enumerates every source in one place so adding a new shipped version
#   string is a one-line edit here, not a new script.
#
# Usage: bash scripts/check-version-drift-master.sh [--root <repo-root>]

set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CARGO_TOML="$ROOT/Cargo.toml"

if [[ ! -f "$CARGO_TOML" ]]; then
  echo "check-version-drift-master: missing $CARGO_TOML" >&2
  exit 2
fi

# Canonical workspace version.
WS_VERSION=$(awk '
  /^\[workspace\.package\]/ { in_block = 1; next }
  /^\[/                     { in_block = 0 }
  in_block && /^[[:space:]]*version[[:space:]]*=/ {
    match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
  }
' "$CARGO_TOML")

if [[ -z "$WS_VERSION" ]]; then
  echo "check-version-drift-master: could not read workspace.package.version from $CARGO_TOML" >&2
  exit 2
fi

# Read .version from a JSON-ish file without pulling in jq.
read_json_version() {
  local file="$1"
  grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' "$file" \
    | head -n1 | grep -oE '"[^"]+"$' | tr -d '"'
}

# Read top-level `version = "X.Y.Z"` from a TOML file (first match in the
# document — for pyproject.toml this is the [project].version field).
read_toml_version() {
  local file="$1"
  awk '
    /^\[project\]/  { in_block = 1; next }
    /^\[/           { in_block = 0 }
    in_block && /^[[:space:]]*version[[:space:]]*=/ {
      match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
    }
  ' "$file"
}

# (label, file, reader)
SOURCES=(
  "frontend/package.json|$ROOT/frontend/package.json|json"
  ".claude-plugin/plugin.json|$ROOT/.claude-plugin/plugin.json|json"
  "npm/cli/package.json|$ROOT/npm/cli/package.json|json"
  "crates/ogdb-python/pyproject.toml|$ROOT/crates/ogdb-python/pyproject.toml|toml"
  "crates/ogdb-node/package.json|$ROOT/crates/ogdb-node/package.json|json"
)

drift=0
for entry in "${SOURCES[@]}"; do
  IFS='|' read -r label file kind <<<"$entry"
  if [[ ! -f "$file" ]]; then
    echo "check-version-drift-master: missing $file" >&2
    drift=1
    continue
  fi
  case "$kind" in
    json) v="$(read_json_version "$file")" ;;
    toml) v="$(read_toml_version "$file")" ;;
    *)    echo "check-version-drift-master: unknown reader '$kind' for $label" >&2; exit 2 ;;
  esac
  if [[ -z "$v" ]]; then
    echo "check-version-drift-master: could not read version from $label" >&2
    drift=1
    continue
  fi
  if [[ "$v" != "$WS_VERSION" ]]; then
    echo "check-version-drift-master: VERSION DRIFT" >&2
    echo "  workspace.package.version = $WS_VERSION  (Cargo.toml)" >&2
    echo "  $label = $v" >&2
    drift=1
  fi
done

if [[ "$drift" -ne 0 ]]; then
  echo "" >&2
  echo "Fix: bump every drifted source above to $WS_VERSION (or bump the" >&2
  echo "workspace if you actually meant the shipped version to change)." >&2
  exit 1
fi

echo "check-version-drift-master: ok ($WS_VERSION across $((${#SOURCES[@]} + 1)) sources)"
