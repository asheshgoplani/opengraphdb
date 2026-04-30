#!/usr/bin/env bash
# Token-leak detector. Fails CI when raw Tailwind palette utilities
# (text-/bg-/border-/ring- with white|slate|indigo|sky|emerald|cyan|red|amber)
# slip back into frontend/src/components or frontend/src/pages.
#
# Lines may opt out by appending a "// allow-token-leak" trailing comment.
# Baseline ratchets DOWN per slice; never up.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LEAKS=$(grep -rEn '(text|bg|border|ring)-(white|slate|indigo|sky|emerald|cyan|red|amber)-[0-9]+(/[0-9]+)?\b' \
        "$FRONTEND_DIR/src/components" "$FRONTEND_DIR/src/pages" \
        --include='*.tsx' --include='*.ts' \
        | grep -v '// allow-token-leak' || true)

COUNT=$(printf '%s' "$LEAKS" | grep -c . || true)

echo "Token leaks detected: $COUNT"
if [ "$COUNT" -gt 0 ]; then
  printf '%s\n' "$LEAKS"
fi

# Baseline recorded 2026-04-30 on branch fix/s0-token-leak-gate.
# Ratchet this number DOWN as palette tokens replace raw utilities.
BASELINE=126
test "$COUNT" -le "$BASELINE"
