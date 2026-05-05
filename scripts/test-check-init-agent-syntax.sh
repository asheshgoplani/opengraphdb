#!/usr/bin/env bash
# Red-green test for scripts/check-init-agent-syntax.sh.
# Runs the gate against the live tree (expect green), then plants a bareword
# `ogdb init --agent claude` reference in a temp copy and confirms the gate
# flags it (expect red).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-init-agent-syntax.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" ) || {
  echo "test FAILED: gate reported HITS on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted bareword reference should fail ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/sample.md" <<'EOF'
# Sample doc

Run this:

```bash
ogdb init --agent claude
```

Done.
EOF

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted 'ogdb init --agent claude' reference" >&2
  exit 1
fi
echo "test: RED on planted reference (expected, exit=$RC)"

# --- GREEN: corrected --agent --agent-id form must pass ---
cat > "$TMP/sample.md" <<'EOF'
# Sample doc

Run this:

```bash
ogdb init --agent --agent-id claude
```

Or this:

```bash
ogdb init --agent
```
EOF

( cd "$TMP" && "$GATE" ) || {
  echo "test FAILED: gate flagged the corrected '--agent --agent-id claude' form" >&2
  exit 1
}
echo "test: GREEN on corrected form (expected)"

echo "test: PASS"
