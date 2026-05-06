#!/usr/bin/env bash
# Phase-B H-14: file-size gate for *.rs.
#
# Caps tracked Rust source files at 8000 lines so new growth is visible at
# PR time. The two known offenders (ogdb-core/src/lib.rs at ~41k, and
# ogdb-cli/src/lib.rs at ~17k) are exempted with explicit ratchet
# placeholders below — the exemption is the contract that the next
# refactor must shrink them, not erase the gate.
#
# TODO(2026-09-01): split crates/ogdb-core/src/lib.rs into submodules and
#                   remove from EXEMPT below; same for ogdb-cli.
# TODO(2026-09-01): once both exempts are gone, drop EXEMPT[] entirely and
#                   keep CAP at 8000 (or ratchet down).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CAP=8000

# Files exempt from the cap. Each entry is a tracked path (relative to
# REPO_ROOT). Adding here is a debt-acknowledgement, not a free pass —
# the TODO comment above is the ratchet contract.
EXEMPT=(
  'crates/ogdb-core/src/lib.rs'
  'crates/ogdb-cli/src/lib.rs'
)

is_exempt() {
  local path="$1"
  local e
  for e in "${EXEMPT[@]}"; do
    [[ "$path" == "$e" ]] && return 0
  done
  return 1
}

# Use git ls-files so we only inspect tracked sources (skips target/, etc).
VIOLATIONS=""
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  if is_exempt "$f"; then continue; fi
  lines=$(wc -l < "$f")
  if (( lines > CAP )); then
    VIOLATIONS+="$f: $lines lines (cap=$CAP)"$'\n'
  fi
done < <(git ls-files '*.rs')

if [[ -n "$VIOLATIONS" ]]; then
  echo "ERROR: *.rs files exceed the $CAP-line cap:" >&2
  printf '%s' "$VIOLATIONS" >&2
  echo >&2
  echo "Split the file into submodules. If the growth is unavoidable in" >&2
  echo "this slice, add the path to EXEMPT in scripts/check-file-size.sh" >&2
  echo "with a paired TODO(YYYY-MM-DD) ratchet date — review will weigh" >&2
  echo "whether the exemption is honest." >&2
  exit 1
fi

echo "check-file-size: ok (no *.rs file > $CAP lines outside ${#EXEMPT[@]} acknowledged exempt paths)"
