#!/usr/bin/env bash
# Phase B H-21 red-path backfill for scripts/check-benchmarks-version.sh.
# Plants a synthetic repo where workspace.package.version drifts from the
# headline in documentation/BENCHMARKS.md and asserts the gate exits non-zero.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-benchmarks-version.sh"

if [[ ! -x "$GATE" ]]; then
  echo "FAIL: $GATE missing or not executable" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/documentation"

# Fixture: workspace says 0.6.0, BENCHMARKS.md headline still 0.4.0 — exact
# shape of the F1 drift class this gate is meant to catch.
cat > "$TMPDIR/Cargo.toml" <<'EOF'
[workspace]
members = ["x"]
[workspace.package]
version = "0.6.0"
edition = "2021"
EOF

cat > "$TMPDIR/documentation/BENCHMARKS.md" <<'EOF'
# OpenGraphDB 0.4.0 — Competitive Benchmark Baseline

| # | Metric | OpenGraphDB 0.4.0 | Neo4j |
|---|---|---|---|
| 1 | foo | 1 | 2 |
EOF

set +e
bash "$GATE" "$TMPDIR" >/dev/null 2>&1
rc=$?
set -e

if [[ $rc -eq 0 ]]; then
  echo "FAIL: gate must reject ws=0.6.0 vs headline=0.4.0 drift but exited 0" >&2
  exit 1
fi

echo "ok: planted ws=0.6.0/headline=0.4.0 fixture → gate exits $rc (non-zero)"
