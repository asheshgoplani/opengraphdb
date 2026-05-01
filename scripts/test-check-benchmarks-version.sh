#!/usr/bin/env bash
# Regression test for scripts/check-benchmarks-version.sh — the EVAL-PERF-RELEASE.md
# Finding 1 CI gate. Verifies (a) clean repo passes, (b) drifted repo fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-benchmarks-version.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE not executable" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/documentation"

# Case 1: matching versions → exit 0
cat > "$TMPDIR/Cargo.toml" <<'EOF'
[workspace]
members = ["x"]
[workspace.package]
version = "0.4.0"
edition = "2021"
EOF
echo "# OpenGraphDB 0.4.0 — Competitive Benchmark Baseline" > "$TMPDIR/documentation/BENCHMARKS.md"

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 1: matching versions should pass" >&2
  exit 1
fi
echo "ok case 1: matching versions (0.4.0/0.4.0) → pass"

# Case 2: drifted versions → exit 1
echo "# OpenGraphDB 0.3.0 — Competitive Benchmark Baseline" > "$TMPDIR/documentation/BENCHMARKS.md"

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 2: drifted versions should fail" >&2
  exit 1
fi
echo "ok case 2: drifted versions (workspace=0.4.0, benchmarks=0.3.0) → fail"

# Case 3: missing headline → exit 1
echo "no version here" > "$TMPDIR/documentation/BENCHMARKS.md"

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 3: missing headline should fail" >&2
  exit 1
fi
echo "ok case 3: missing headline → fail"

echo "all cases pass"
