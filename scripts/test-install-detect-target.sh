#!/usr/bin/env bash
# Regression guard for the v0.5.0 install-pipeline BLOCKER (commit 1a56bb2).
#
# scripts/install.sh::detect_target() must emit asset URL components
# (rust-target-triple + extension) that match the build matrix in
# .github/workflows/release.yml::build.matrix and the archive extensions
# scripts/release.sh produces (.tar.xz on linux/macos, .zip on windows).
#
# We exercise detect_target() against all 5 OS/arch pairs by mocking
# `uname -s` / `uname -m` per case, then assert the produced asset URL
# pattern is one the release pipeline actually publishes. A drift here is
# the failure mode that 404'd the v0.5.0 install for a real user.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/install.sh"
[ -f "$INSTALL_SH" ] || { echo "FAIL: install.sh not found at $INSTALL_SH" >&2; exit 1; }

# Extract just the detect_target() function body so we can run it without
# triggering install.sh::main() (which would attempt a real install).
detect_target_fn=$(awk '
  /^detect_target\(\) \{/ { capture=1 }
  capture { print }
  capture && /^\}$/ { exit }
' "$INSTALL_SH")

if [ -z "$detect_target_fn" ]; then
  echo "FAIL: could not extract detect_target() from $INSTALL_SH" >&2
  exit 1
fi

# (uname -s, uname -m, expected target triple, expected archive ext)
# Pairs match .github/workflows/release.yml::build.matrix exactly.
cases=(
  "Linux:x86_64:x86_64-unknown-linux-gnu:tar.xz"
  "Linux:aarch64:aarch64-unknown-linux-gnu:tar.xz"
  "Darwin:x86_64:x86_64-apple-darwin:tar.xz"
  "Darwin:arm64:aarch64-apple-darwin:tar.xz"
  "MINGW64_NT-10.0:x86_64:x86_64-pc-windows-msvc:zip"
)

failed=0
for c in "${cases[@]}"; do
  IFS=':' read -r os_name arch expected_target expected_ext <<<"$c"

  out=$(
    OS_NAME="$os_name" ARCH="$arch" DETECT_FN="$detect_target_fn" bash -c '
      c_red() { printf "ERR: %s\n" "$1" >&2; }
      uname() {
        case "$1" in
          -s) printf "%s" "$OS_NAME" ;;
          -m) printf "%s" "$ARCH" ;;
          *) command uname "$@" ;;
        esac
      }
      eval "$DETECT_FN"
      detect_target
    '
  )

  got_target="${out%|*}"
  got_ext="${out#*|}"

  if [ "$got_target" != "$expected_target" ] || [ "$got_ext" != "$expected_ext" ]; then
    printf 'FAIL: uname-s=%-18s uname-m=%-8s -> got %s.%s want %s.%s\n' \
      "$os_name" "$arch" "$got_target" "$got_ext" "$expected_target" "$expected_ext"
    failed=$((failed + 1))
    continue
  fi

  # Reconstruct the asset URL the install script will request and assert it
  # matches the ogdb-<version>-<target>.{tar.xz,zip} pattern release.sh emits.
  asset="ogdb-X.Y.Z-${got_target}.${got_ext}"
  url="https://github.com/asheshgoplani/opengraphdb/releases/download/vX.Y.Z/${asset}"
  case "$asset" in
    ogdb-X.Y.Z-*.tar.xz|ogdb-X.Y.Z-*.zip) ;;
    *) printf 'FAIL: asset name does not match release.sh pattern: %s\n' "$asset"
       failed=$((failed + 1))
       continue ;;
  esac

  printf 'PASS: %-18s %-8s -> %s\n' "$os_name" "$arch" "$url"
done

if [ "$failed" -ne 0 ]; then
  printf '\n%d/%d cases failed\n' "$failed" "${#cases[@]}" >&2
  exit 1
fi

printf '\nall %d detect_target cases pass\n' "${#cases[@]}"
