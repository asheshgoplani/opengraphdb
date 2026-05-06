#!/usr/bin/env bash
# Phase B H-21 red-path backfill for
# scripts/check-followup-target-not-current.sh.
# Plants a synthetic SPEC.md that names a `vX.Y follow-up` whose minor
# is NOT strictly greater than the workspace minor, and asserts the gate
# rejects the drift.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-followup-target-not-current.sh"

if [[ ! -x "$GATE" ]]; then
  echo "FAIL: $GATE missing or not executable" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

cat > "$TMPDIR/Cargo.toml" <<'EOF'
[workspace]
members = ["x"]
[workspace.package]
version = "0.6.0"
edition = "2021"
EOF

# Fixture: workspace at 0.6.0, prose still claims "v0.5 follow-up" — the
# F12 drift shape the gate exists to catch.
cat > "$TMPDIR/SPEC.md" <<'EOF'
# Spec

The Bolt v4/v5 negotiation lands as a v0.5 follow-up.
EOF

set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "FAIL: gate must reject 'v0.5 follow-up' when ws=0.6.0 but exited 0" >&2
  exit 1
fi

echo "ok: planted ws=0.6.0 + 'v0.5 follow-up' prose → gate exits $rc (non-zero)"
