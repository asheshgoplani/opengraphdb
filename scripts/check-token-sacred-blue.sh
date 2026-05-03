#!/usr/bin/env bash
# Phase-3 STORY — sacred-blue token gate.
#
# The hex `#5B9DFF` is reserved EXCLUSIVELY for the active traversal
# cinematic — lit source/target nodes, particle stream, active edge
# stroke, step-counter badge, demo button, replay pill. This script
# fails CI if `#5B9DFF` (case-insensitive) appears anywhere in
# `frontend/src/` outside the cinematic surface allowlist:
#
#   frontend/src/graph/obsidian/palette.ts          (single-source const)
#   frontend/src/graph/obsidian/traversal.ts        (driver)
#   frontend/src/graph/obsidian/edgeFlow.ts         (particle renderer)
#   frontend/src/graph/obsidian/StepCounterBadge.tsx
#   frontend/src/graph/obsidian/DemoPathButton.tsx
#   frontend/src/graph/obsidian/ObsidianGraph.tsx
#   frontend/src/graph/obsidian/pickDemoEndpoints.ts (no color, but allowed
#                                                     for symmetry)
#
# Why a discrete script + not a lint rule: the constraint is visual
# discipline ("only the lit path is cyan"), and ESLint plugins for hex
# token policy add too much config surface for a one-shot gate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../frontend" && pwd)"
SRC_DIR="$FRONTEND_DIR/src"

# Allowlist — files where the sacred hex (or its rgba variants) may
# legitimately appear. Keep this list short; growing it dilutes the
# discipline.
ALLOWLIST=(
  "graph/obsidian/palette.ts"
  "graph/obsidian/traversal.ts"
  "graph/obsidian/edgeFlow.ts"
  "graph/obsidian/StepCounterBadge.tsx"
  "graph/obsidian/DemoPathButton.tsx"
  "graph/obsidian/ObsidianGraph.tsx"
  "graph/obsidian/pickDemoEndpoints.ts"
)

# Collect candidate hits across the whole src tree.
HITS=$(grep -rni -E '#5B9DFF|rgba\(91,157,255' "$SRC_DIR" \
  --include='*.ts' --include='*.tsx' \
  --include='*.css' --include='*.scss' || true)

# Filter out allowlisted files.
VIOLATIONS=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  path="${line%%:*}"
  rel="${path#$SRC_DIR/}"
  ok=0
  for allowed in "${ALLOWLIST[@]}"; do
    if [ "$rel" = "$allowed" ]; then
      ok=1
      break
    fi
  done
  if [ "$ok" -eq 0 ]; then
    VIOLATIONS+="$line"$'\n'
  fi
done <<< "$HITS"

if [ -n "$VIOLATIONS" ]; then
  echo "ERROR: sacred-blue (#5B9DFF) leaked outside the traversal surface allowlist:"
  printf '%s' "$VIOLATIONS"
  echo
  echo "The cyan-blue accent is reserved for the active traversal path."
  echo "Move usage into one of the allowed files, or replace with a"
  echo "neutral white / AMBER token."
  exit 1
fi

echo "sacred-blue check OK: #5B9DFF appears only in the traversal surfaces."
