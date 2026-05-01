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

# C2-A3 (BLOCKER): the SPA build step must carry NODE_OPTIONS=4096 so
# macOS / Windows runners do not OOM in vite. Mirror of `ci.yml` fix
# from commit 91d26f2.
awk '
  /Build SPA dist for include_dir/ { found = 1 }
  found && /NODE_OPTIONS.*4096/ { print "yes"; found = 0 }
  /^[[:space:]]*-[[:space:]]*name:/ && !/Build SPA dist/ { found = 0 }
' "$WORKFLOW" | grep -q yes \
  || fail "release.yml SPA build step must set NODE_OPTIONS=--max-old-space-size=4096 (C2-A3)"
ok "release.yml SPA build sets NODE_OPTIONS=4096"

# --- 2. release.sh exists & is a shippable driver ----------------------------
[[ -f "$SCRIPT" ]] || fail "missing $SCRIPT (Finding 4)"
[[ -x "$SCRIPT" ]] || fail "$SCRIPT must be executable"
ok "release.sh present and executable"

grep -qE "cargo (auditable )?build.*--release|cargo build|CARGO_BUILD=\(cargo (auditable )?build\)" "$SCRIPT" \
  || fail "release.sh must call 'cargo build --release' (or 'cargo auditable build --release')"
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
