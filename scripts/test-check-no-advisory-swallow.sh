#!/usr/bin/env bash
# Red-green test for scripts/check-no-advisory-swallow.sh.
# GREEN: live tree (no cargo step pipes its non-zero exit into a benign
# `::warning::` annotation).
# RED:   a `cargo …  || echo "::warning::…"` step trips the gate
# (CYCLE4 B1 — the cycle-3 cargo-semver-checks anti-pattern).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-no-advisory-swallow.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/.github/workflows"

# --- GREEN: a swallow exists but on a non-cargo step (gate is scoped) ---
cat > "$TMP/.github/workflows/ci.yml" <<'EOF'
jobs:
  build:
    steps:
      - run: |
          ls / || echo "::warning::ls failed"
EOF
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged a non-cargo '|| echo ::warning::' line" >&2
  exit 1
}
echo "test: GREEN on non-cargo swallow (expected)"

# --- RED: cargo step swallow ---
cat > "$TMP/.github/workflows/ci.yml" <<'EOF'
jobs:
  build:
    steps:
      - run: |
          cargo semver-checks check-release || echo "::warning::semver drift"
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag cargo '|| echo ::warning::' swallow" >&2
  exit 1
fi
echo "test: RED on cargo swallow (expected, exit=$RC)"

echo "test: PASS"
