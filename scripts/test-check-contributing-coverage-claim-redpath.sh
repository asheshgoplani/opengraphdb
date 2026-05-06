#!/usr/bin/env bash
# Phase B H-21 red-path backfill for
# scripts/check-contributing-coverage-claim.sh.
# Plants a synthetic CONTRIBUTING.md whose bolded coverage claim drifts
# from the threshold declared in coverage.sh and asserts the gate fails.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$REPO_ROOT/scripts/check-contributing-coverage-claim.sh"

if [[ ! -x "$CHECK" ]]; then
  echo "FAIL: $CHECK missing or not executable" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

cat > "$TMPDIR/coverage.sh" <<'EOF'
#!/usr/bin/env bash
cargo llvm-cov \
  --workspace \
  --lib \
  --fail-under-lines 80 \
  --fail-uncovered-lines 5000
EOF

# Fixture: claim says 99%/100, but the gate enforces 80%/5000.
cat > "$TMPDIR/CONTRIBUTING-drift.md" <<'EOF'
## Coverage Gate
The gate (declared in `scripts/coverage.sh`): **99% line coverage, ≤ 100 uncovered lines** as of v0.6.0.
EOF

set +e
"$CHECK" "$TMPDIR/CONTRIBUTING-drift.md" "$TMPDIR/coverage.sh" >/dev/null 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "FAIL: gate must reject 99%/100 vs 80%/5000 drift but exited 0" >&2
  exit 1
fi

echo "ok: planted 99%/100 vs 80%/5000 drift fixture → gate exits $rc (non-zero)"
