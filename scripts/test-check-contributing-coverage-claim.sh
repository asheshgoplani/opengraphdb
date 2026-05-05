#!/usr/bin/env bash
# Red-green test for scripts/check-contributing-coverage-claim.sh.
#
# Pins F07 from EVAL-DOCS-COMPLETENESS-CYCLE15: CONTRIBUTING.md once told
# contributors the gate was 93% / 3000 lines while scripts/coverage.sh
# actually enforced 80% / 5000. The gate must:
#   (red)   reject a CONTRIBUTING.md whose bolded claim drifts from coverage.sh
#   (green) accept a CONTRIBUTING.md whose bolded claim matches coverage.sh
#   (red)   reject a CONTRIBUTING.md that ships no bolded claim at all
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK="$REPO_ROOT/scripts/check-contributing-coverage-claim.sh"

if [[ ! -x "$CHECK" ]]; then
  echo "FAIL: $CHECK is not executable / does not exist." >&2
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Fixture coverage.sh — the actual gate the workspace ships today.
cat > "$TMPDIR/coverage.sh" <<'EOF'
#!/usr/bin/env bash
cargo llvm-cov \
  --workspace \
  --lib \
  --fail-under-lines 80 \
  --fail-uncovered-lines 5000
EOF

# RED case 1: drifted claim (the original F07 bug shape).
cat > "$TMPDIR/CONTRIBUTING-bad.md" <<'EOF'
## Coverage Gate
The gate (declared in `scripts/coverage.sh`): **93% line coverage, ≤ 3000 uncovered lines** as of v0.4.0.
EOF
if "$CHECK" "$TMPDIR/CONTRIBUTING-bad.md" "$TMPDIR/coverage.sh" >/dev/null 2>&1; then
  echo "FAIL (red-drift): drifted CONTRIBUTING.md should have triggered the gate but did not." >&2
  exit 1
fi
echo "PASS (red-drift): drifted 93%/3000 claim correctly rejected."

# GREEN case: aligned claim matches the actual gate.
cat > "$TMPDIR/CONTRIBUTING-good.md" <<'EOF'
## Coverage Gate
Coverage gate (declared in `scripts/coverage.sh`): **80% line coverage, ≤ 5000 uncovered lines** workspace-wide. Threshold lowered from the prior 93%/3000 ogdb-core/cli value when the monolith split landed.
EOF
if ! "$CHECK" "$TMPDIR/CONTRIBUTING-good.md" "$TMPDIR/coverage.sh" >/dev/null 2>&1; then
  echo "FAIL (green): aligned CONTRIBUTING.md should pass the gate but did not." >&2
  exit 1
fi
echo "PASS (green): aligned 80%/5000 claim correctly accepted."

# RED case 2: no bolded claim at all — gate must refuse to silently pass.
cat > "$TMPDIR/CONTRIBUTING-missing.md" <<'EOF'
## Coverage Gate
We have a gate. It is good. It runs in CI.
EOF
if "$CHECK" "$TMPDIR/CONTRIBUTING-missing.md" "$TMPDIR/coverage.sh" >/dev/null 2>&1; then
  echo "FAIL (red-missing): CONTRIBUTING.md without a bolded claim should fail." >&2
  exit 1
fi
echo "PASS (red-missing): missing claim correctly rejected."

echo "All cases passed."
