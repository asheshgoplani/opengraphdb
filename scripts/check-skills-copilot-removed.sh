#!/usr/bin/env bash
# F06 regression gate: skills/README.md and skills/src/install.ts must not
# mention copilot. Commit 10c0d3a converged the SKILL.md compatibility metadata
# and the ogdb init agent table on six agents (no copilot); the npm-package
# surface (README + install.ts) had drifted in the opposite direction. This
# gate locks the two surfaces together.
set -euo pipefail

PATHS=(skills/README.md skills/src/install.ts)

MISSING=()
for p in "${PATHS[@]}"; do
  [[ -e "$p" ]] || MISSING+=("$p")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "check-skills-copilot-removed: expected files not found: ${MISSING[*]}" >&2
  exit 2
fi

HITS=$(grep -inE 'copilot' "${PATHS[@]}" 2>/dev/null || true)

if [[ -n "$HITS" ]]; then
  echo "check-skills-copilot-removed: found copilot references in npm-package surface (must match SKILL.md compatibility metadata):" >&2
  echo "$HITS" >&2
  exit 1
fi

exit 0
