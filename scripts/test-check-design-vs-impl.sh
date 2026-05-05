#!/usr/bin/env bash
# Red-green test for scripts/check-design-vs-impl.sh.
# GREEN: live tree (no design/impl drift).
# RED: a TMP CWD with a planted DESIGN.md that references the fictional
# `use opengraphdb::` Rust API the C4-H3 finding caught.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-design-vs-impl.sh"

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

# --- RED: planted fictional-API doc ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/DESIGN.md" <<'MD'
# Fictional Quickstart

```rust
use opengraphdb::Database;
let db = Database::open("path", Config::default());
```
MD

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag planted 'use opengraphdb::' fictional API" >&2
  exit 1
fi
echo "test: RED on fictional-API fixture (expected, exit=$RC)"

echo "test: PASS"
