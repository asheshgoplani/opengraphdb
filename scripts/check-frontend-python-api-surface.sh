#!/usr/bin/env bash
# EVAL-FRONTEND-CYCLE30 HIGH-1 + HIGH-2 regression gate.
#
# Sibling of scripts/check-frontend-bash-blocks.sh (CLI surface) for the
# Python binding surface. Walks every `db.<method>(` call inside string
# / template literals in frontend/src/**/*.{ts,tsx} and asserts the
# method name appears as a `fn` inside the `#[pymethods] impl
# PythonDatabase { … }` block of crates/ogdb-python/src/lib.rs.
#
# Why: marketing snippets in AIIntegrationSection.tsx ride the
# CodeSnippetCard Copy button straight to the user's clipboard. A snippet
# that calls `db.schema_catalog()` (Rust-only) or `db.insert_node(…)` /
# `db.rag_hybrid_search(…)` (never bridged to Python) fails with
# AttributeError on first paste — cycle-30 HIGH-1 + HIGH-2.
#
# Comments (`//` line, `/* */` block) are stripped before scan so that
# code-comment prose like `// db.fake_method() does not exist` does not
# fire. Method names that look like Python `dict.method` style accessors
# on the user's own code (e.g. `corpus.append`) are out of scope — only
# the `db.<name>(` shape is gated, since `db` is the conventional binding
# name across every Python recipe in this repo.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-frontend-python-api-surface] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_SRC="$REPO_ROOT/frontend/src"
PY_LIB_RS="$REPO_ROOT/crates/ogdb-python/src/lib.rs"

if [[ ! -d "$FRONTEND_SRC" ]]; then
  echo "[check-frontend-python-api-surface] no frontend/src at $FRONTEND_SRC; nothing to check." >&2
  exit 0
fi

if [[ ! -f "$PY_LIB_RS" ]]; then
  echo "[check-frontend-python-api-surface] no $PY_LIB_RS; cannot validate." >&2
  exit 1
fi

python3 - "$FRONTEND_SRC" "$PY_LIB_RS" <<'PY'
import os
import re
import sys

frontend_src, py_lib_rs = sys.argv[1], sys.argv[2]


def load_pymethods(path):
    """Return the set of `fn <name>(` identifiers inside the
    `#[pymethods] impl PythonDatabase { … }` block.
    """
    text = open(path).read()
    # Find the start of `#[pymethods]` immediately followed by
    # `impl PythonDatabase` (with optional cfg-feature gate in between).
    m = re.search(
        r'#\[pymethods\]\s*impl\s+PythonDatabase\s*\{',
        text,
    )
    if not m:
        sys.stderr.write(
            "[check-frontend-python-api-surface] could not locate "
            "`#[pymethods] impl PythonDatabase` in {}\n".format(path)
        )
        sys.exit(2)
    # Walk the brace pairs from the opening `{` to find the matching close.
    start = m.end() - 1  # the `{`
    depth = 0
    end = None
    for i in range(start, len(text)):
        ch = text[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        sys.stderr.write(
            "[check-frontend-python-api-surface] unbalanced braces in pymethods block\n"
        )
        sys.exit(2)
    block = text[start : end + 1]
    # Each `fn <name>(` exposes a method on the Python side. `#[new]` is the
    # constructor (callable as `Database(path)`); `#[staticmethod]` are
    # callable as `Database.<name>(…)`. Both forms still expose `<name>` as
    # a valid attr lookup on the class, so we collect all `fn` names.
    return set(re.findall(r'\bfn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', block))


def strip_ts_comments(src):
    """Strip `//` line comments and `/* … */` block comments so that
    `// db.fake_method()` style prose does not register as a real call.
    String / template literal contents are preserved unchanged.
    """
    out = []
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        # Block comment.
        if ch == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            if j == -1:
                break
            i = j + 2
            continue
        # Line comment.
        if ch == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            if j == -1:
                break
            i = j  # keep the newline so line numbers stay sane
            continue
        # String / template literal — pass through verbatim. We do NOT
        # parse the inside for nested comments because Python `#` is a
        # comment marker, not a TS one; a `db.fake(` inside a Python `#`
        # line *should* still trip the gate because the user copies the
        # whole literal to their clipboard, including the comment line
        # claiming `db.fake()` is unsupported — but the broken call would
        # still show up in the Python source they paste. So preserving
        # the literal contents (and matching the broken call inside) is
        # the conservative choice.
        if ch in ('"', "'", '`'):
            quote = ch
            out.append(ch)
            i += 1
            while i < n:
                if src[i] == '\\':
                    if i + 1 < n:
                        out.append(src[i])
                        out.append(src[i + 1])
                        i += 2
                        continue
                if src[i] == quote:
                    out.append(quote)
                    i += 1
                    break
                out.append(src[i])
                i += 1
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def iter_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip generated / vendored output.
        dirnames[:] = [
            d for d in dirnames
            if d not in ('node_modules', 'dist', 'build', '.next', '.turbo')
        ]
        for name in filenames:
            if name.endswith(('.ts', '.tsx')):
                yield os.path.join(dirpath, name)


# Match every `db.<name>(` call. `\b` anchors so `mydb.foo(` does not
# match. Method names follow Python identifier rules.
DB_CALL_RE = re.compile(r'(?<![A-Za-z0-9_])db\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(')


def line_of(text, idx):
    return text.count('\n', 0, idx) + 1


py_methods = load_pymethods(py_lib_rs)

violations = []
total_calls = 0

for path in iter_files(frontend_src):
    raw = open(path).read()
    src = strip_ts_comments(raw)
    for m in DB_CALL_RE.finditer(src):
        total_calls += 1
        name = m.group(1)
        if name not in py_methods:
            violations.append(
                (path, line_of(src, m.start()), name)
            )

if total_calls == 0:
    # Defensive: if scanning silently produced zero hits, the gate is
    # dead-code (regex broken / repo restructured). Fail loudly so we
    # do not ship a green-by-default gate.
    sys.stderr.write(
        "[check-frontend-python-api-surface] scanned 0 `db.<method>(` "
        "calls — gate is not exercising the surface it claims to gate. "
        "Either the repo no longer has Python marketing snippets (delete "
        "this gate) or the regex needs updating.\n"
    )
    sys.exit(1)

if violations:
    sys.stderr.write(
        "[check-frontend-python-api-surface] found {} call(s) to methods "
        "not exposed by the Python binding ({}):\n".format(
            len(violations), py_lib_rs
        )
    )
    for path, line, name in violations:
        rel = os.path.relpath(path)
        sys.stderr.write(
            "  - {}:{}: db.{}( — not in #[pymethods] impl PythonDatabase\n".format(
                rel, line, name
            )
        )
    sys.stderr.write(
        "Real Python binding surface: {}\n".format(
            ", ".join(sorted(py_methods))
        )
    )
    sys.exit(1)

print("check-frontend-python-api-surface: ok ({} calls, all in binding)".format(total_calls))
PY
