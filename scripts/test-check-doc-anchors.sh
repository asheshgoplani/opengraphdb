#!/usr/bin/env bash
# Red-green test for scripts/check-doc-anchors.sh.
# GREEN: live tree (every crates/<crate>/src/lib.rs::<symbol> citation in
# user-facing docs resolves to a real symbol).
# RED: a TMP git repo with a doc that cites a fabricated symbol — the
# C2-H6 rotted-citation shape the gate was written to catch.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-doc-anchors.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported errors on clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted bogus anchor in a fresh git repo ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git init -q "$TMP"
mkdir -p "$TMP/crates/ogdb-core/src" "$TMP/documentation"
echo 'fn real_fn() {}' > "$TMP/crates/ogdb-core/src/lib.rs"
cat > "$TMP/documentation/sample.md" <<'MD'
See `crates/ogdb-core/src/lib.rs::definitely_not_a_real_symbol_xyz` for details.
MD
( cd "$TMP" && git -c user.email=t@t -c user.name=t add . >/dev/null \
            && git -c user.email=t@t -c user.name=t commit -q -m init )

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag bogus anchor" >&2
  exit 1
fi
echo "test: RED on bogus-anchor fixture (expected, exit=$RC)"

echo "test: PASS"
