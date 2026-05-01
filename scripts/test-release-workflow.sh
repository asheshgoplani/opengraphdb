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

# C4-H1 (HIGH): the `publish-crates` job must build the SPA before
# `cargo publish -p ogdb-cli`. `include_dir!("$CARGO_MANIFEST_DIR/../../frontend/dist-app")`
# tolerates a missing directory by emitting an empty `Dir`, so the
# publish silently succeeds with no embedded SPA — `cargo install ogdb-cli`
# then ships a binary whose UI routes serve the "SPA missing" stub.
# Enforce that the publish-crates block has the same `npm run build:app`
# step the `build` job has.
awk '
  /^[[:space:]]*publish-crates:[[:space:]]*$/ { in_block = 1 }
  in_block && /^[[:space:]]{2}[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ \
            && $0 !~ /publish-crates:/ { in_block = 0 }
  in_block && /npm run build:app/ { print "yes"; exit }
' "$WORKFLOW" | grep -q yes \
  || fail "release.yml publish-crates job must build the SPA (npm run build:app) before cargo publish (C4-H1)"
ok "release.yml publish-crates job builds the SPA before cargo publish"

# C4-H3 (HIGH): release.yml must have a `tests` gate job that runs
# `scripts/test.sh` (the structural-lint + fmt + clippy + deny + audit
# + doc + test gate `ci.yml` runs on push/PR). Without it, a maintainer
# who pushes `v0.5.0` against a red main silently builds and ships
# binaries on a broken tree.
grep -qE "^[[:space:]]*tests:[[:space:]]*$" "$WORKFLOW" \
  || fail "release.yml missing 'tests:' gate job (C4-H3)"
ok "release.yml has tests gate job"

awk '
  /^[[:space:]]*tests:[[:space:]]*$/ { in_block = 1; next }
  in_block && /^[[:space:]]{2}[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ { in_block = 0 }
  in_block && /scripts\/test\.sh/ { print "yes"; exit }
' "$WORKFLOW" | grep -q yes \
  || fail "release.yml tests job must run scripts/test.sh (C4-H3)"
ok "release.yml tests job runs scripts/test.sh"

# Every publish-path job (build, publish-crates, docker) must depend on
# the tests gate either directly or transitively — assert the direct
# dependency on `tests` for clarity (belt-and-braces against future
# graph re-wires).
for job in build publish-crates docker; do
  awk -v j="$job" '
    $0 ~ "^[[:space:]]*"j":[[:space:]]*$" { in_block = 1; next }
    in_block && /^[[:space:]]{2}[a-zA-Z][a-zA-Z0-9_-]*:[[:space:]]*$/ { in_block = 0 }
    in_block && /^[[:space:]]*needs:.*tests/ { print "yes"; exit }
  ' "$WORKFLOW" | grep -q yes \
    || fail "release.yml $job job must list 'tests' in its needs: (C4-H3)"
  ok "release.yml $job job needs the tests gate"
done

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
