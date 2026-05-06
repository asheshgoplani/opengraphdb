#!/usr/bin/env bash
# Phase B M-12: Python public-API breaking-change detector for crates/ogdb-python.
#
# Uses `pyright --outputjson` against the BASE_SHA tree and the HEAD tree,
# extracts the set of exported symbols (top-level functions / classes /
# methods that are not name-mangled with a leading underscore), and fails if
# any symbol present in BASE is missing or has a changed signature in HEAD.
#
# CRITICAL self-protection: re-execs from the BASE_SHA version of this script
# (see check-rust-public-api-diff.sh for the rationale).
#
# Required tool: `npm install -g pyright` (CI installs).
#
# Env:
#   BASE_SHA  - falls back to `git merge-base HEAD origin/main`.

set -euo pipefail

SELF_PATH="scripts/check-python-public-api-diff.sh"

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
    BASE_SCRIPT="$(mktemp -t check-python-public-api-diff.XXXXXX.sh)"
    git show "$BASE_SHA:$SELF_PATH" > "$BASE_SCRIPT"
    chmod +x "$BASE_SCRIPT"
    PUBLIC_API_DETECTOR_REEXEC=1 BASE_SHA="$BASE_SHA" exec "$BASE_SCRIPT" "$@"
  fi
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! command -v pyright >/dev/null 2>&1; then
  echo "[check-python-public-api-diff] installing pyright ..." >&2
  npm install -g pyright >/dev/null
fi

PYTHON_DIR="crates/ogdb-python"

if [ ! -d "$PYTHON_DIR" ]; then
  echo "[check-python-public-api-diff] $PYTHON_DIR missing — skipping." >&2
  exit 0
fi

# Helper: extract a flat list of exported symbols from a checkout.
extract_symbols() {
  local rev="$1"
  local out="$2"
  local worktree
  worktree="$(mktemp -d -t ogdb-py-api.XXXXXX)"
  git worktree add --detach "$worktree" "$rev" >/dev/null 2>&1 || {
    rm -rf "$worktree"
    return 1
  }
  if [ -d "$worktree/$PYTHON_DIR" ]; then
    pyright --outputjson "$worktree/$PYTHON_DIR" > "$out.raw" 2>/dev/null || true
    # Extract only "publicSymbols" — top-level names not starting with `_`.
    python3 - "$out.raw" "$out" <<'PY'
import json, sys, re
raw_path, out_path = sys.argv[1], sys.argv[2]
syms = set()
try:
    data = json.load(open(raw_path))
except Exception:
    data = {}
# pyright --outputjson reports diagnostics, not symbols. Approximate the
# public surface by parsing exported `.pyi` / `.py` AST instead.
import ast, glob, os
base = os.path.dirname(raw_path)
PY
    # Parse all .py / .pyi files in the python crate directly (more
    # reliable for symbol extraction than scraping pyright diagnostics).
    python3 - "$worktree/$PYTHON_DIR" "$out" <<'PY'
import ast, os, sys, json
root, out_path = sys.argv[1], sys.argv[2]
syms = []
for dirpath, _, filenames in os.walk(root):
    for fn in filenames:
        if not (fn.endswith(".py") or fn.endswith(".pyi")):
            continue
        full = os.path.join(dirpath, fn)
        try:
            tree = ast.parse(open(full, "r", encoding="utf-8", errors="ignore").read())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if node.name.startswith("_"):
                    continue
                # Capture name + arg list signature for fns; just name for classes.
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    args = [a.arg for a in node.args.args]
                    syms.append(f"fn:{node.name}({','.join(args)})")
                else:
                    syms.append(f"class:{node.name}")
syms.sort()
open(out_path, "w").write("\n".join(syms) + "\n")
PY
  else
    : > "$out"
  fi
  git worktree remove --force "$worktree" >/dev/null 2>&1 || rm -rf "$worktree"
}

BASE_SYMS="$(mktemp)"
HEAD_SYMS="$(mktemp)"

extract_symbols "$BASE_SHA" "$BASE_SYMS"
extract_symbols "HEAD"      "$HEAD_SYMS"

# Anything in BASE not in HEAD is a breaking removal / signature change.
REMOVED="$(comm -23 "$BASE_SYMS" "$HEAD_SYMS" || true)"

if [ -n "$REMOVED" ]; then
  cat >&2 <<EOF
[check-python-public-api-diff] BREAKING — these public symbols disappeared
or changed signature between $BASE_SHA and HEAD:

$REMOVED

To merge: restore the symbols, OR land as \`feat!:\` so release-please bumps
the major version, AND record the removal in CHANGELOG.md.
EOF
  exit 1
fi

echo "[check-python-public-api-diff] OK — no breaking public-API diff for $PYTHON_DIR."
