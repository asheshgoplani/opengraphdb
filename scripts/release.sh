#!/usr/bin/env bash
# EVAL-PERF-RELEASE.md Finding 4 (BLOCKER): drives the local part of the
# release — builds the SPA, builds the cargo release binary, and packages
# it into a target-named archive ready for `gh release upload`.
#
# Usage:
#   scripts/release.sh                           # auto-detect host triple
#   scripts/release.sh x86_64-unknown-linux-gnu  # explicit triple
#
# Env:
#   OGDB_SKIP_FRONTEND=1   skip `npm run build:app` (CI builds it once,
#                          then this script can run against the existing
#                          frontend/dist-app/ checkout).
#
# Output: dist/ogdb-<version>-<target>.{tar.xz,zip}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  TARGET=$(rustc -vV | awk '/host:/ { print $2 }')
fi
if [[ -z "$TARGET" ]]; then
  echo "release.sh: could not determine target triple" >&2
  exit 2
fi

VERSION=$(awk '
  /^\[workspace\.package\]/ { in_block = 1; next }
  /^\[/                     { in_block = 0 }
  in_block && /^[[:space:]]*version[[:space:]]*=/ {
    match($0, /"[^"]+"/); print substr($0, RSTART+1, RLENGTH-2); exit
  }
' Cargo.toml)
if [[ -z "$VERSION" ]]; then
  echo "release.sh: could not read workspace.package.version from Cargo.toml" >&2
  exit 2
fi

echo "release.sh: target=$TARGET version=$VERSION"

# 1) Build the SPA (gated; CI sets OGDB_SKIP_FRONTEND=1 once, sub-target
#    builds reuse the same dist-app/).
if [[ "${OGDB_SKIP_FRONTEND:-0}" != "1" ]]; then
  echo "release.sh: building SPA (set OGDB_SKIP_FRONTEND=1 to skip)"
  ( cd frontend && npm ci && npm run build:app )
fi

# 2) Build the cargo release binary for the target triple.
echo "release.sh: building ogdb release binary for $TARGET"
if rustup target list --installed | grep -q "^$TARGET\$"; then
  cargo build --release --locked -p ogdb-cli --target "$TARGET"
  BIN_DIR="target/$TARGET/release"
else
  # Native build path — no `--target` so we don't force a rebuild.
  echo "release.sh: target $TARGET not installed via rustup; falling back to host build"
  cargo build --release --locked -p ogdb-cli
  BIN_DIR="target/release"
fi

# 3) Package into dist/ogdb-<version>-<target>.{tar.xz,zip}
DIST="$ROOT/dist"
STAGE="$DIST/ogdb-$VERSION-$TARGET"
rm -rf "$DIST"
mkdir -p "$STAGE"

case "$TARGET" in
  *windows*)
    cp "$BIN_DIR/ogdb.exe" "$STAGE/"
    ;;
  *)
    cp "$BIN_DIR/ogdb" "$STAGE/"
    ;;
esac

cp README.md LICENSE CHANGELOG.md "$STAGE/" 2>/dev/null || true

case "$TARGET" in
  *windows*)
    ARCHIVE="$DIST/ogdb-$VERSION-$TARGET.zip"
    ( cd "$DIST" && zip -r "$(basename "$ARCHIVE")" "$(basename "$STAGE")" )
    ;;
  *)
    ARCHIVE="$DIST/ogdb-$VERSION-$TARGET.tar.xz"
    ( cd "$DIST" && tar -cJf "$(basename "$ARCHIVE")" "$(basename "$STAGE")" )
    ;;
esac

echo "release.sh: built $ARCHIVE"
ls -la "$ARCHIVE"
