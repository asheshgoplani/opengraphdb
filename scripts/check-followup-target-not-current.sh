#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE17.md F01 (HIGH): "tracked as a vX.Y
# follow-up" prose drifts the moment the named minor ships. Cycle-15
# F12 caught this for the HNSW backend swap (commit `ca82055` bumped
# "v0.5" → "v0.6.0 follow-up (slipped from v0.5)"); cycle-15 + cycle-16
# missed the parallel hit on Bolt v4/v5 negotiation in COMPATIBILITY.md
# § 4 + SPEC.md L634 + DESIGN.md L1628. By cycle-17 the workspace had
# shipped 0.5.0 and 0.5.1 without addressing it, so "v0.5 follow-up"
# became a published claim that was empirically false.
#
# This is a structural gate: walk every `vX.Y follow-up` /
# `vX.Y.Z follow-up` token in the user-facing docs and assert that the
# named minor is **strictly greater** than the workspace minor. A token
# whose minor matches or precedes the shipped minor either describes a
# follow-up that should already have landed (drift) or one that
# explicitly slipped — in which case the prose must call it out as
# "vN.M.P follow-up (slipped from vX.Y)" so the reader sees the slip.
#
# Usage: bash scripts/check-followup-target-not-current.sh [<repo-root>]
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CARGO_TOML="$ROOT/Cargo.toml"

if [[ ! -f "$CARGO_TOML" ]]; then
  echo "check-followup-target-not-current: missing $CARGO_TOML" >&2
  exit 2
fi

# Parse workspace.package.version → "X.Y.Z" → current_minor = "X.Y".
WS_VERSION=$(awk '
  /^\[workspace\.package\]/ { in_block = 1; next }
  /^\[/                     { in_block = 0 }
  in_block && /^[[:space:]]*version[[:space:]]*=/ {
    match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
  }
' "$CARGO_TOML")

if [[ -z "$WS_VERSION" ]]; then
  echo "check-followup-target-not-current: could not read workspace.package.version from $CARGO_TOML" >&2
  exit 2
fi

CUR_MAJOR=$(echo "$WS_VERSION" | cut -d. -f1)
CUR_MINOR=$(echo "$WS_VERSION" | cut -d. -f2)

# Scoped paths: only the user-facing top-level + documentation/.
TARGETS=()
for p in "$ROOT/documentation" "$ROOT/SPEC.md" "$ROOT/DESIGN.md" "$ROOT/ARCHITECTURE.md"; do
  [[ -e "$p" ]] && TARGETS+=("$p")
done
[[ ${#TARGETS[@]} -eq 0 ]] && { echo "check-followup-target-not-current: no targets to scan"; exit 0; }

# Skip historical eval reports — they quote past drift verbatim.
SKIP_RE='/EVAL-[A-Z0-9-]+\.md'

# Pattern matches: `vX.Y follow-up` or `vX.Y.Z follow-up`.
PATTERN='\bv[0-9]+\.[0-9]+(\.[0-9]+)?[[:space:]]+follow-up\b'

fail=0
HITS=$(grep -RnE "$PATTERN" "${TARGETS[@]}" 2>/dev/null \
       | grep -vE "$SKIP_RE" \
       || true)

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # Extract every "vX.Y(.Z)? follow-up" token from the matching line and
  # judge each independently — a single line can mention both
  # "v0.6.0 follow-up" and "v0.5 follow-up".
  while IFS= read -r token; do
    [[ -z "$token" ]] && continue
    ver=$(echo "$token" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?')
    tok_major=$(echo "$ver" | cut -d. -f1)
    tok_minor=$(echo "$ver" | cut -d. -f2)
    # Strictly greater than current (compare major then minor numerically).
    if (( tok_major < CUR_MAJOR )) || \
       { (( tok_major == CUR_MAJOR )) && (( tok_minor <= CUR_MINOR )); }; then
      echo "ERROR: '$token' references a minor (${tok_major}.${tok_minor}) that is not strictly greater than the workspace minor (${CUR_MAJOR}.${CUR_MINOR}, from $WS_VERSION):" >&2
      echo "  $line" >&2
      fail=1
    fi
  done < <(echo "$line" | grep -oE "$PATTERN")
done <<< "$HITS"

if (( fail == 0 )); then
  echo "check-followup-target-not-current: ok (workspace=${WS_VERSION}; all 'vX.Y follow-up' tokens name a future minor)"
fi

exit $fail
