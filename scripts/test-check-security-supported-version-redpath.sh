#!/usr/bin/env bash
# Phase B H-21 red-path backfill for
# scripts/check-security-supported-version.sh.
# Plants a synthetic SECURITY.md whose supported-minor row drifts from
# the workspace version and asserts the gate fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-security-supported-version.sh"

if [[ ! -f "$GATE" ]]; then
  echo "FAIL: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Fixture: workspace at 0.6.0, SECURITY.md still claims 0.4.x supported —
# the drift class F01 in EVAL-DOCS-COMPLETENESS-CYCLE15.
cat > "$TMPDIR/Cargo.toml" <<'EOF'
[workspace]
members = ["x"]
[workspace.package]
version = "0.6.0"
edition = "2021"
EOF

cat > "$TMPDIR/SECURITY.md" <<'EOF'
# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.4.x   | ✅        |
| < 0.4.0 | ❌        |
EOF

set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "FAIL: gate must reject ws=0.6.0 vs supported=0.4.x but exited 0" >&2
  exit 1
fi

echo "ok: planted ws=0.6.0 vs supported=0.4.x drift fixture → gate exits $rc (non-zero)"
