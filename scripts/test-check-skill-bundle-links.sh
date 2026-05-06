#!/usr/bin/env bash
# Red-green meta-test for scripts/check-skill-bundle-links.sh.
# GREEN: clean tree (every relative .md link in skills/opengraphdb/ resolves).
# RED: a TMP repo with a planted skills/opengraphdb/SKILL.md that
# See-also-links a deleted documentation/ai-integration/cosmos-mcp-tool.md
# — exact cycle-34 H1 shape — and the gate must fail.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-skill-bundle-links.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted broken link in a fresh git repo ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git init -q "$TMP"
mkdir -p "$TMP/skills/opengraphdb" "$TMP/documentation/ai-integration"
# A real sibling so a control link resolves and proves the gate is
# actually walking links rather than no-op-passing.
cat > "$TMP/documentation/ai-integration/llm-to-cypher.md" <<'MD'
# stub
MD
cat > "$TMP/skills/opengraphdb/SKILL.md" <<'MD'
# stub skill

## See also

- [`documentation/ai-integration/llm-to-cypher.md`](../../documentation/ai-integration/llm-to-cypher.md) — control link (resolves).
- [`documentation/ai-integration/cosmos-mcp-tool.md`](../../documentation/ai-integration/cosmos-mcp-tool.md) — broken link (file deleted).
MD
( cd "$TMP" && git -c user.email=t@t -c user.name=t add . >/dev/null \
            && git -c user.email=t@t -c user.name=t commit -q -m init )

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag broken cosmos-mcp-tool link" >&2
  exit 1
fi
echo "test: RED on broken-link fixture (expected, exit=$RC)"

echo "test: PASS"
