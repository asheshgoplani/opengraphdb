#!/usr/bin/env bash
# Phase B M-12: Node public-API breaking-change detector for npm/cli.
#
# Generates `.d.ts` declarations from npm/cli's JS source via
# `tsc --emitDeclarationOnly --allowJs --declaration` against the BASE_SHA
# tree and the HEAD tree, then diffs the produced declarations. Any line
# present in BASE that is missing from HEAD is treated as a breaking
# removal.
#
# CRITICAL self-protection: re-execs from the BASE_SHA version of this
# script (see check-rust-public-api-diff.sh for the rationale).
#
# Required tool: `npm install -g typescript` (CI installs tsc).
#
# Env:
#   BASE_SHA  - falls back to `git merge-base HEAD origin/main`.

set -euo pipefail

SELF_PATH="scripts/check-node-public-api-diff.sh"

if [ -z "${BASE_SHA:-}" ]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base HEAD origin/main)"
  else
    BASE_SHA="$(git rev-parse HEAD~1 2>/dev/null || git rev-parse HEAD)"
  fi
  export BASE_SHA
fi

# --- Re-exec self from BASE_SHA. ---
if [ "${PUBLIC_API_DETECTOR_REEXEC:-}" != "1" ]; then
  if git cat-file -e "$BASE_SHA:$SELF_PATH" 2>/dev/null; then
    BASE_SCRIPT="$(mktemp -t check-node-public-api-diff.XXXXXX.sh)"
    git show "$BASE_SHA:$SELF_PATH" > "$BASE_SCRIPT"
    chmod +x "$BASE_SCRIPT"
    PUBLIC_API_DETECTOR_REEXEC=1 BASE_SHA="$BASE_SHA" exec "$BASE_SCRIPT" "$@"
  fi
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! command -v tsc >/dev/null 2>&1; then
  echo "[check-node-public-api-diff] installing typescript ..." >&2
  npm install -g typescript >/dev/null
fi

NODE_DIR="npm/cli"

if [ ! -d "$NODE_DIR" ]; then
  echo "[check-node-public-api-diff] $NODE_DIR missing — skipping." >&2
  exit 0
fi

emit_dts() {
  local rev="$1"
  local out_dir="$2"
  local worktree
  worktree="$(mktemp -d -t ogdb-node-api.XXXXXX)"
  git worktree add --detach "$worktree" "$rev" >/dev/null 2>&1 || {
    rm -rf "$worktree"
    return 1
  }
  mkdir -p "$out_dir"
  if [ -d "$worktree/$NODE_DIR" ]; then
    # `tsc --allowJs --declaration --emitDeclarationOnly` emits .d.ts
    # synthesised from JSDoc + structural inference. Errors during this
    # don't stop emit — we ignore non-zero so partial declarations still
    # produce useful diff signal.
    ( cd "$worktree/$NODE_DIR" \
      && tsc \
          --allowJs \
          --declaration \
          --emitDeclarationOnly \
          --noEmit false \
          --target ES2020 \
          --module commonjs \
          --moduleResolution node \
          --skipLibCheck \
          --outDir "$out_dir" \
          $(find bin scripts -maxdepth 3 -name '*.js' 2>/dev/null) \
          >/dev/null 2>&1 || true )
  fi
  git worktree remove --force "$worktree" >/dev/null 2>&1 || rm -rf "$worktree"
}

BASE_DTS_DIR="$(mktemp -d)"
HEAD_DTS_DIR="$(mktemp -d)"

emit_dts "$BASE_SHA" "$BASE_DTS_DIR"
emit_dts "HEAD"      "$HEAD_DTS_DIR"

# Compare: anything declared in BASE that is no longer declared in HEAD
# (function names, class names, exported member signatures) is a break.
collect_decls() {
  local dir="$1"
  if [ -d "$dir" ]; then
    find "$dir" -name '*.d.ts' -print0 \
      | xargs -0 -I{} grep -hE '^(export|declare)' {} 2>/dev/null \
      | sed -E 's/[[:space:]]+/ /g' \
      | sort -u
  fi
}

BASE_DECLS="$(mktemp)"
HEAD_DECLS="$(mktemp)"
collect_decls "$BASE_DTS_DIR" > "$BASE_DECLS"
collect_decls "$HEAD_DTS_DIR" > "$HEAD_DECLS"

REMOVED="$(comm -23 "$BASE_DECLS" "$HEAD_DECLS" || true)"

if [ -n "$REMOVED" ]; then
  cat >&2 <<EOF
[check-node-public-api-diff] BREAKING — these declarations disappeared or
changed signature in $NODE_DIR between $BASE_SHA and HEAD:

$REMOVED

To merge: restore the declarations, OR land as \`feat!:\` so release-please
bumps the major version, AND record the removal in CHANGELOG.md.
EOF
  exit 1
fi

echo "[check-node-public-api-diff] OK — no breaking public-API diff for $NODE_DIR."
