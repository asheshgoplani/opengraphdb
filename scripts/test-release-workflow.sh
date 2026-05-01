#!/usr/bin/env bash
# Regression test for EVAL-PERF-RELEASE Findings 4 / 5 / 6 (BLOCKER):
# the release pipeline must (a) exist, (b) trigger on v* tags, (c) build
# the 5-target cross-platform matrix, and (d) upload binary artifacts to
# a GitHub Release. This test is a structural lint over the workflow YAML
# — it doesn't run the workflow, but it asserts the contract is wired.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
WORKFLOW="$ROOT/.github/workflows/release.yml"
SCRIPT="$ROOT/scripts/release.sh"
CI="$ROOT/.github/workflows/ci.yml"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok: $*"; }

# --- 1. release.yml exists & has the right shape -----------------------------
[[ -f "$WORKFLOW" ]] || fail "missing $WORKFLOW (Findings 4/5)"
ok "release.yml present"

grep -q "tags:" "$WORKFLOW" && grep -q "v\*" "$WORKFLOW" \
  || fail "release.yml must trigger on 'tags: v*' (Finding 5)"
ok "release.yml triggers on v* tags"

# Cross-platform matrix — must include the 5 targets the eval calls out.
for target in \
  x86_64-unknown-linux-gnu \
  aarch64-unknown-linux-gnu \
  x86_64-apple-darwin \
  aarch64-apple-darwin \
  x86_64-pc-windows-msvc; do
  grep -q "$target" "$WORKFLOW" \
    || fail "release.yml missing build target: $target (Finding 6)"
done
ok "release.yml covers all 5 cross-platform targets"

grep -q "softprops/action-gh-release\|gh release create\|gh release upload" "$WORKFLOW" \
  || fail "release.yml must upload assets to a GitHub Release (Findings 4/5)"
ok "release.yml uploads release assets"

# --- 2. release.sh exists & is a shippable driver ----------------------------
[[ -f "$SCRIPT" ]] || fail "missing $SCRIPT (Finding 4)"
[[ -x "$SCRIPT" ]] || fail "$SCRIPT must be executable"
ok "release.sh present and executable"

grep -q "cargo build --release" "$SCRIPT" \
  || fail "release.sh must call 'cargo build --release'"
grep -q "tar\|zip" "$SCRIPT" \
  || fail "release.sh must produce a .tar / .zip archive"
ok "release.sh builds + archives"

# --- 3. ci.yml has cross-platform matrix (Finding 6) -------------------------
grep -qE "macos-latest|macos-14" "$CI" \
  || fail "ci.yml must include macOS in the matrix (Finding 6)"
grep -q "windows-latest" "$CI" \
  || fail "ci.yml must include Windows in the matrix (Finding 6)"
ok "ci.yml has cross-platform matrix (linux/macos/windows)"

echo "all release-pipeline contract checks pass"
