#!/usr/bin/env bash
# Red-green test for scripts/check-doc-rust-blocks.sh.
# GREEN: live tree — every `use ogdb_core::`-led runnable rust block in
# user-facing markdown compiles against the shipped ogdb-core surface.
# RED: a temporarily-planted documentation/*.md whose `use ogdb_core::`
# block contains a deliberate E0308 — gate must flag the compile failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-doc-rust-blocks.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# Skip gracefully if cargo or python3 is unavailable — the gate itself
# silently skips in that case, so a RED run would be indistinguishable
# from GREEN.
if ! command -v cargo >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  echo "test: cargo or python3 unavailable; skipping (mirrors gate's own skip)" >&2
  exit 0
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 ) || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted markdown with a `use ogdb_core::`-led block that does
# not compile. Lives under documentation/ because the gate scans
# documentation/*.md (in addition to README.md / SPEC.md / DESIGN.md /
# ARCHITECTURE.md). Trap-based cleanup means a crash mid-test still
# removes the fixture.
PLANTED="$REPO_ROOT/documentation/_test_check_doc_rust_blocks_planted.md"
trap 'rm -f "$PLANTED"' EXIT

cat > "$PLANTED" <<'MD'
# Planted doc — temporary fixture for test-check-doc-rust-blocks.sh

This block matches the gate's "embedding sample" heuristic
(`use ogdb_core::` first non-comment line) so it gets compile-checked,
but contains a deliberate E0308 to force a non-zero exit.

```rust
use ogdb_core::Database;
fn main() {
    let _: u32 = "not-a-u32";
}
```
MD

set +e
( cd "$REPO_ROOT" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag planted non-compiling 'use ogdb_core::' block" >&2
  exit 1
fi
echo "test: RED on planted-bad-block fixture (expected, exit=$RC)"

echo "test: PASS"
