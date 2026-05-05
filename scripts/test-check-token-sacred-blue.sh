#!/usr/bin/env bash
# Red-green test for scripts/check-token-sacred-blue.sh.
# GREEN: live tree (#5B9DFF only appears in the cinematic-surface allowlist).
# RED: a TMP scripts/ + frontend/src/ where the gate is copied alongside a
# planted .tsx file that uses the sacred hex outside the allowlist.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-token-sacred-blue.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN ---
"$GATE" >/dev/null || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted #5B9DFF leak outside the allowlist ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/scripts" "$TMP/frontend/src/components"
cp "$GATE" "$TMP/scripts/check-token-sacred-blue.sh"
chmod +x "$TMP/scripts/check-token-sacred-blue.sh"

cat > "$TMP/frontend/src/components/Stray.tsx" <<'TSX'
export const sacredLeak = '#5B9DFF';
TSX

set +e
"$TMP/scripts/check-token-sacred-blue.sh" >/dev/null 2>&1
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag #5B9DFF leak outside allowlist" >&2
  exit 1
fi
echo "test: RED on planted-leak fixture (expected, exit=$RC)"

echo "test: PASS"
