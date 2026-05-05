#!/usr/bin/env bash
# Regression test for scripts/check-benchmarks-version.sh — the
# EVAL-PERF-RELEASE.md Finding 1 CI gate (extended in cycle-15 per F05/F09
# to also cover the § 2 table column header, with a (carry-fwd …)
# escape-hatch for perf-no-op patch releases).
#
# Verifies:
#   1. clean repo (headline + table header match WS_VERSION) → pass
#   2. headline drift → fail
#   3. missing headline → fail
#   4. cycle-15 F09 regression: headline matches but table column header
#      shows an older version with NO (carry-fwd) marker → fail
#   5. carry-fwd escape-hatch: column header shows older version WITH a
#      (carry-fwd …) marker → pass
#   6. missing § 2 table column header row → fail
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

write_cargo() {
  local ver="$1"
  cat > "$TMPDIR/Cargo.toml" <<EOF
[workspace]
members = ["x"]
[workspace.package]
version = "$ver"
edition = "2021"
EOF
}

# Case 1: matching versions (headline + table header) → exit 0
write_cargo "0.4.0"
cat > "$TMPDIR/documentation/BENCHMARKS.md" <<'EOF'
# OpenGraphDB 0.4.0 — Competitive Benchmark Baseline

| # | Metric | OpenGraphDB 0.4.0 | Neo4j |
|---|---|---|---|
| 1 | foo | 1 | 2 |
EOF

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 1: matching versions should pass" >&2
  bash "$GATE" "$TMPDIR" || true
  exit 1
fi
echo "ok case 1: matching versions (headline+table=0.4.0) → pass"

# Case 2: headline drift → exit 1
cat > "$TMPDIR/documentation/BENCHMARKS.md" <<'EOF'
# OpenGraphDB 0.3.0 — Competitive Benchmark Baseline

| # | Metric | OpenGraphDB 0.3.0 | Neo4j |
|---|---|---|---|
| 1 | foo | 1 | 2 |
EOF

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 2: drifted headline should fail" >&2
  exit 1
fi
echo "ok case 2: drifted headline (ws=0.4.0, headline=0.3.0) → fail"

# Case 3: missing headline → exit 1
echo "no version here" > "$TMPDIR/documentation/BENCHMARKS.md"

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 3: missing headline should fail" >&2
  exit 1
fi
echo "ok case 3: missing headline → fail"

# Case 4 (cycle-15 F09 regression): headline matches WS_VERSION but the
# § 2 table column header silently shows an older version with NO
# (carry-fwd) marker. This is the exact drift cycle-15 caught in tree.
cat > "$TMPDIR/documentation/BENCHMARKS.md" <<'EOF'
# OpenGraphDB 0.4.0 — Competitive Benchmark Baseline

Some prose.

| # | Metric | OpenGraphDB 0.3.0 | Neo4j |
|---|---|---|---|
| 1 | foo | 1 | 2 |
EOF

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 4: column header drift (no carry-fwd marker) should fail" >&2
  exit 1
fi
echo "ok case 4: column header drift (headline=0.4.0, col=0.3.0, no carry-fwd) → fail"

# Case 5: carry-fwd escape-hatch. Headline = WS, column header shows
# the WS version *and* an older N=5 reference inside a (carry-fwd …)
# annotation — perf-no-op patch release pattern (e.g. 0.5.1 carrying
# 0.4.0 N=5). Should pass.
cat > "$TMPDIR/documentation/BENCHMARKS.md" <<'EOF'
# OpenGraphDB 0.4.0 — Competitive Benchmark Baseline

Some prose.

| # | Metric | OpenGraphDB 0.4.0 (carry-fwd 0.3.0 N=5) | Neo4j |
|---|---|---|---|
| 1 | foo | 1 | 2 |
EOF

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 5: carry-fwd escape-hatch should pass" >&2
  bash "$GATE" "$TMPDIR" || true
  exit 1
fi
echo "ok case 5: column header carries (carry-fwd 0.3.0 N=5) → pass"

# Case 6: missing § 2 table column header row → exit 1.
cat > "$TMPDIR/documentation/BENCHMARKS.md" <<'EOF'
# OpenGraphDB 0.4.0 — Competitive Benchmark Baseline

Body without any markdown table column header.
EOF

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 6: missing table column header should fail" >&2
  exit 1
fi
echo "ok case 6: missing table column header → fail"

echo "all cases pass"
