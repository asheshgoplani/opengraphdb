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

# Baseline ratcheted DOWN per Slice S3 (token-leak cleanup): semantic-token
# substitution swept playground + landing + page surfaces, leaving only the
# irreducible 2 (deliberate hero CTA escape hatches): planner-acknowledged
# marketing-only `bg-white text-slate-900` hero CTAs as residual leaks.
# Ratchet this number DOWN as palette tokens replace raw utilities; never UP.
BASELINE=2
test "$COUNT" -le "$BASELINE"
