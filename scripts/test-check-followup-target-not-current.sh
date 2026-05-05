#!/usr/bin/env bash
# Regression test for scripts/check-followup-target-not-current.sh — the
# EVAL-DOCS-COMPLETENESS-CYCLE17.md F01 CI gate. Verifies (a) future
# minors pass, (b) current/past minors fail, (c) the eval-report SKIP
# allowlist holds, (d) "X.Y.Z follow-up" form is judged on its minor.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-followup-target-not-current.sh"

if [[ ! -f "$GATE" ]]; then
  echo "test: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

write_cargo() {
  cat > "$TMPDIR/Cargo.toml" <<EOF
[workspace]
members = ["x"]
[workspace.package]
version = "$1"
edition = "2021"
EOF
}

write_doc() {
  local relpath="$1"; shift
  mkdir -p "$(dirname "$TMPDIR/$relpath")"
  printf '%s\n' "$@" > "$TMPDIR/$relpath"
}

# -------- Case 1: workspace 0.5.1 + "v0.6.0 follow-up" → pass --------
write_cargo "0.5.1"
write_doc "documentation/COMPATIBILITY.md" \
  "Bolt v4/v5 negotiation is tracked as a v0.6.0 follow-up (slipped from v0.5)."

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 1: future minor (v0.6.0) should pass against workspace 0.5.1" >&2
  exit 1
fi
echo "ok case 1: workspace=0.5.1 + 'v0.6.0 follow-up' → pass"

# -------- Case 2: workspace 0.5.1 + "v0.5 follow-up" → fail --------
write_doc "documentation/COMPATIBILITY.md" \
  "Bolt v4/v5 negotiation is tracked as a v0.5 follow-up."

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 2: current minor (v0.5) should fail against workspace 0.5.1" >&2
  exit 1
fi
echo "ok case 2: workspace=0.5.1 + 'v0.5 follow-up' → fail"

# -------- Case 3: workspace 0.5.1 + "v0.5.0 follow-up" (patch form) → fail --------
write_doc "documentation/COMPATIBILITY.md" \
  "Bolt v4/v5 negotiation is tracked as a v0.5.0 follow-up."

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 3: current minor in X.Y.Z form (v0.5.0) should fail against workspace 0.5.1" >&2
  exit 1
fi
echo "ok case 3: workspace=0.5.1 + 'v0.5.0 follow-up' → fail"

# -------- Case 4: workspace 0.5.1 + "v0.4 follow-up" (past minor) → fail --------
write_doc "documentation/COMPATIBILITY.md" \
  "Some legacy follow-up text. Tracked as a v0.4 follow-up."

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 4: past minor (v0.4) should fail against workspace 0.5.1" >&2
  exit 1
fi
echo "ok case 4: workspace=0.5.1 + 'v0.4 follow-up' → fail"

# -------- Case 5: SKIP rule for EVAL-* reports --------
# Eval reports legitimately quote past drift wording verbatim — they must
# stay readable as historical record. The gate skips them.
write_doc "documentation/COMPATIBILITY.md" \
  "Bolt v4/v5 negotiation is tracked as a v0.6.0 follow-up (slipped from v0.5)."
write_doc "documentation/EVAL-DOCS-COMPLETENESS-CYCLE17.md" \
  "F01: 'tracked as a v0.5 follow-up' wording in 3 files contradicts shipped state."

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 5: EVAL-* report quoting old 'v0.5 follow-up' string should be skipped" >&2
  exit 1
fi
echo "ok case 5: EVAL-* path is skipped (historical drift wording preserved)"

# -------- Case 6: workspace 0.6.0 promotes 'v0.6.0 follow-up' to a fail --------
# When the project ships 0.6.0, the existing "v0.6.0 follow-up" wording
# in BENCHMARKS.md / SECURITY-FOLLOWUPS.md / etc. becomes drift. The
# gate must catch the moment the workspace.package.version crosses it.
write_cargo "0.6.0"
write_doc "documentation/COMPATIBILITY.md" \
  "Bolt v4/v5 negotiation is tracked as a v0.6.0 follow-up (slipped from v0.5)."

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 6: workspace=0.6.0 should make 'v0.6.0 follow-up' a fail" >&2
  exit 1
fi
echo "ok case 6: workspace=0.6.0 promotes prior 'v0.6.0 follow-up' to fail"

# -------- Case 7: workspace 0.5.1 + only legitimate future tokens → pass --------
write_cargo "0.5.1"
write_doc "documentation/COMPATIBILITY.md" \
  "Re-baseline tracked as a v0.6.0 follow-up alongside the next perf-relevant change." \
  "Hybrid retrieval ergonomics: a v1.0.0 follow-up after the 0.x line stabilises."

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 7: only future minors should pass" >&2
  exit 1
fi
echo "ok case 7: workspace=0.5.1 + only future minors → pass"

# -------- Case 8: line with both future + past tokens → fail (per-token judgement) --------
write_doc "documentation/COMPATIBILITY.md" \
  "Mixed line: v0.6.0 follow-up is fine but v0.5 follow-up is drift."

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 8: mixed-token line should fail because of the v0.5 token" >&2
  exit 1
fi
echo "ok case 8: per-token judgement catches the offender on a mixed line"

echo "all cases pass"
