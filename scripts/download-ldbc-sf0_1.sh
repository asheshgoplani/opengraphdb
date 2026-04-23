#!/usr/bin/env bash
# Download the LDBC SNB SF0.1 dataset for full-fat evaluator runs.
# Plan reference: Phase 5 / Task 5.5 step 1.
#
# Tests in CI use the synthetic 100-person fixture in
# `crates/ogdb-eval/src/drivers/ldbc_mini.rs`; this script is for engineers
# who want to run the IS-1 driver against the real ~150 MB SF0.1 dataset.
#
# Usage: ./scripts/download-ldbc-sf0_1.sh [target-dir]
#
# Notes
#  * The LDBC council publishes datasets via a Surf CDN that occasionally
#    rotates URLs; if the DEFAULT_URL below 404s, fetch the current link
#    from https://ldbcouncil.org/benchmarks/snb/ and override via env:
#      LDBC_SF01_URL=<url> ./scripts/download-ldbc-sf0_1.sh
#  * Checksum is set after the first successful download
#    (set LDBC_SF01_SHA256 to skip / pin a different hash).

set -euo pipefail

TARGET_DIR="${1:-./datasets/ldbc-snb-sf0_1}"
DEFAULT_URL="https://repository.surfsara.nl/datasets/cwi/SNB/snb-sf0.1.tar.zst"
URL="${LDBC_SF01_URL:-$DEFAULT_URL}"
EXPECTED_SHA="${LDBC_SF01_SHA256:-}"

mkdir -p "$TARGET_DIR"
ARCHIVE="$TARGET_DIR/$(basename "$URL")"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "[ldbc] downloading $URL → $ARCHIVE"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --output "$ARCHIVE" "$URL"
  elif command -v wget >/dev/null 2>&1; then
    wget --output-document="$ARCHIVE" "$URL"
  else
    echo "[ldbc] need either curl or wget on PATH" >&2
    exit 1
  fi
else
  echo "[ldbc] archive already present at $ARCHIVE — skipping download"
fi

if [[ -n "$EXPECTED_SHA" ]]; then
  echo "[ldbc] verifying SHA-256"
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$ARCHIVE" | awk '{print $1}')
  else
    actual=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
  fi
  if [[ "$actual" != "$EXPECTED_SHA" ]]; then
    echo "[ldbc] checksum mismatch: expected=$EXPECTED_SHA actual=$actual" >&2
    exit 1
  fi
  echo "[ldbc] checksum OK ($actual)"
else
  echo "[ldbc] LDBC_SF01_SHA256 not set — skipping verification"
fi

echo "[ldbc] archive ready at $ARCHIVE"
echo "[ldbc] extract with: zstd -d $ARCHIVE -o ${ARCHIVE%.zst} && tar -xf ${ARCHIVE%.zst} -C $TARGET_DIR"
