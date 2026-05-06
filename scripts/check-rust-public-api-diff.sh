#!/usr/bin/env bash
# Phase B M-12: Rust public-API breaking-change detector.
#
# Uses `cargo public-api --diff <BASE>..HEAD` against the PR's merge-base on
# `origin/main`. Fails if removed or signature-changed public items are
# present without a corresponding major-version bump.
#
# CRITICAL self-protection: the FIRST thing this script does is re-exec
# itself from the BASE-SHA version of the file. Otherwise a malicious /
# inattentive PR could simultaneously delete a public symbol AND weaken
# this detector — head-of-PR `bash check-rust-public-api-diff.sh` would
# silently allow the removal. Re-execing from the base version guarantees
# that the detector PR-author cannot edit is the one that runs.
#
# Bypass when intentional: bump the major version in Cargo.toml workspace
# (release-please does this on a `feat!:` / `BREAKING CHANGE:` commit).
#
# Required tool: `cargo install --locked cargo-public-api` (CI installs).
#
# Env:
#   BASE_SHA  - the merge-base or the commit to diff against. Falls back to
#               `git merge-base HEAD origin/main` if not set.

set -euo pipefail

SELF_PATH="scripts/check-rust-public-api-diff.sh"

if [ -z "${BASE_SHA:-}" ]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base HEAD origin/main)"
  else
    BASE_SHA="$(git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD)"
  fi
  export BASE_SHA
fi

# --- Re-exec self from BASE_SHA so a same-PR detector edit cannot bypass. ---
if [ "${PUBLIC_API_DETECTOR_REEXEC:-}" != "1" ]; then
  if git cat-file -e "$BASE_SHA:$SELF_PATH" 2>/dev/null; then
    BASE_SCRIPT="$(mktemp -t check-rust-public-api-diff.XXXXXX.sh)"
    git show "$BASE_SHA:$SELF_PATH" > "$BASE_SCRIPT"
    chmod +x "$BASE_SCRIPT"
    PUBLIC_API_DETECTOR_REEXEC=1 BASE_SHA="$BASE_SHA" exec "$BASE_SCRIPT" "$@"
  fi
  # First time the detector lands — base SHA does not contain the file yet.
  # Run inline; on the next PR the self-protection takes over.
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! command -v cargo-public-api >/dev/null 2>&1; then
  echo "[check-rust-public-api-diff] installing cargo-public-api ..." >&2
  cargo install --locked cargo-public-api
fi

# Diff every publishable rust crate. `--deny=removed --deny=changed` makes
# the run non-zero on any breaking diff.
PUBLISHABLE_CRATES=(
  ogdb-core
  ogdb-vector
  ogdb-types
  ogdb-algorithms
  ogdb-text
  ogdb-temporal
  ogdb-import
  ogdb-bolt
  ogdb-cli
  ogdb-export
  ogdb-ffi
  ogdb-python
  ogdb-node
)

failed=0
for crate in "${PUBLISHABLE_CRATES[@]}"; do
  echo "::group::cargo public-api --diff $BASE_SHA..HEAD -p $crate"
  if ! cargo public-api \
      --diff "${BASE_SHA}..HEAD" \
      --deny=removed \
      --deny=changed \
      -p "$crate" 2>&1; then
    echo "[check-rust-public-api-diff] BREAKING change detected in $crate" >&2
    failed=1
  fi
  echo "::endgroup::"
done

if [ "$failed" -ne 0 ]; then
  cat >&2 <<'EOF'

[check-rust-public-api-diff] FAILED.

Public-API surface of one or more publishable crates changed in a way that
removes or alters a previously-exported item. To merge this PR you must
either:
  1. Restore the affected items, OR
  2. Land the change as a `feat!:` / `BREAKING CHANGE:` commit so
     release-please bumps the major version, AND mention the removal in
     CHANGELOG.md.
EOF
  exit 1
fi

echo "[check-rust-public-api-diff] OK — no breaking public-API diff."
