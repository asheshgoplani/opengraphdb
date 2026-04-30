#!/usr/bin/env bash
# Token-leak detector. Fails CI when raw Tailwind palette utilities slip back
# into frontend/src/components or frontend/src/pages.
#
# Catches:
#   - prefix-(white|black)            e.g. text-white, bg-black
#   - prefix-(white|black)/<shade>    e.g. text-white/50
#   - prefix-<color>-<shade>          e.g. text-slate-700, from-blue-500
#   - prefix-<color>-<shade>/<shade>  e.g. bg-indigo-600/40
# where prefix ∈ {text, bg, border, ring, outline, fill, stroke, from, to, via}
# and color ∈ Tailwind's full numbered palette.
#
# Lines may opt out by appending a "// allow-token-leak" trailing comment.
# Baseline ratchets DOWN per slice; never up.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LEAKS=$(grep -rEn '(text|bg|border|ring|outline|fill|stroke|from|to|via)-((white|black)(/[0-9]+)?|(slate|neutral|zinc|gray|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+(/[0-9]+)?)\b' \
        "$FRONTEND_DIR/src/components" "$FRONTEND_DIR/src/pages" \
        --include='*.tsx' --include='*.ts' \
        | grep -v '// allow-token-leak' || true)

COUNT=$(printf '%s' "$LEAKS" | grep -c . || true)

echo "Token leaks detected: $COUNT"
if [ "$COUNT" -gt 0 ]; then
  printf '%s\n' "$LEAKS"
fi

# Baseline recorded 2026-04-30 on branch fix/s0-token-leak-gate after expanding
# regex to cover shadeless white/black, slash-shade variants, full Tailwind
# numbered palette, and gradient prefixes (from/to/via).
# Ratchet this number DOWN as palette tokens replace raw utilities.
# 2026-04-30 fix/playground-table-tokens: ratcheted 290 → 277 after porting
# QueryResultTable + QueryResultSummary off `text-white/*` onto semantic
# foreground/muted-foreground tokens (light-mode invisibility fix).
BASELINE=277
test "$COUNT" -le "$BASELINE"
