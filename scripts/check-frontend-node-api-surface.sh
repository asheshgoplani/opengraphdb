#!/usr/bin/env bash
# EVAL-FRONTEND-CYCLE31 HIGH-1 + HIGH-2 + HIGH-3 regression gate.
#
# Sibling of scripts/check-frontend-python-api-surface.sh. Where that gate
# closes one axis of the marketing-leak class (`db.<method>(` against
# `#[pymethods] impl PythonDatabase`), this one closes the three remaining
# axes for the Node / TypeScript surface. Walks every TS/TSX file under
# frontend/src/ (after `//` + `/* */` comment stripping so prose like
# `// import { Fake } from "opengraphdb"` does not fire) and asserts:
#
#   1. IMPORT axis: every `import { <Sym>, ... } from "opengraphdb"` names
#      a class/value exported by `crates/ogdb-node/index.d.ts`. Same for
#      `from "@opengraphdb/mcp"` against `mcp/src/client.ts`.
#   2. CONSTRUCTOR axis: every `new <Class>(<arg0>)` call where `<Class>`
#      is one of those imported names is checked against the typed
#      constructor. The two real classes both take a positional **string**
#      (`Database#constructor(path: string)`,
#      `OpenGraphDBClient#constructor(baseUrl: string)`); an object
#      argument like `{ url: "..." }` is rejected — it would coerce to
#      the literal `"[object Object]"` at runtime.
#   3. RETURN-SHAPE axis: every destructure of a `db.query(<cypher>)`
#      result must use names that the real return shape provides
#      (`columns` / `rows` for `OpenGraphDBClient#query`; embedded
#      `Database#query` returns an `Array<Record<…>>` and is not safely
#      destructurable as an object — flag any `{nodes, edges}` /
#      `{nodes}` / `{edges}` shape that lands on a `query(…)` call).
#
# Why: marketing snippets in AIIntegrationSection.tsx ride the
# CodeSnippetCard Copy button straight to the user's clipboard. Cycle-30's
# gate caught the `db.<method>(` axis only; cycle-31 found a snippet
# fabricating an `OgdbClient` import + `{ url }` constructor +
# `{ nodes, edges }` query return — three axes the cycle-30 regex cannot
# see. This gate closes the remaining surface so the same class of bug
# cannot reach the clipboard via a fourth snippet.
#
# Dead-gate sentinel: if the scan visits zero imports / zero `new` calls /
# zero destructures, fail loudly — same defensive shape as cycle-30.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-frontend-node-api-surface] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_SRC="$REPO_ROOT/frontend/src"
NODE_DTS="$REPO_ROOT/crates/ogdb-node/index.d.ts"
MCP_CLIENT_TS="$REPO_ROOT/mcp/src/client.ts"

if [[ ! -d "$FRONTEND_SRC" ]]; then
  echo "[check-frontend-node-api-surface] no frontend/src at $FRONTEND_SRC; nothing to check." >&2
  exit 0
fi

if [[ ! -f "$NODE_DTS" ]]; then
  echo "[check-frontend-node-api-surface] no $NODE_DTS; cannot validate." >&2
  exit 1
fi

if [[ ! -f "$MCP_CLIENT_TS" ]]; then
  echo "[check-frontend-node-api-surface] no $MCP_CLIENT_TS; cannot validate." >&2
  exit 1
fi

python3 - "$FRONTEND_SRC" "$NODE_DTS" "$MCP_CLIENT_TS" <<'PY'
import os
import re
import sys

frontend_src, node_dts, mcp_client_ts = sys.argv[1], sys.argv[2], sys.argv[3]


# ---- Comment-stripping carve-out (mirror of the python-api-surface gate)
def strip_ts_comments(src):
    """Strip `//` line comments and `/* … */` block comments. Pass-through
    inside string + template literals so that template-literal contents
    (the actual marketing snippets we want to scan) survive intact."""
    out = []
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        if ch == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            if j == -1:
                break
            i = j + 2
            continue
        if ch == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            if j == -1:
                break
            i = j
            continue
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


def line_of(text, idx):
    return text.count('\n', 0, idx) + 1


# ---- Surface extraction --------------------------------------------------

def load_node_surface(path):
    """Return {class_name: {'ctor_arg_kind': 'string'|'object'|'unknown',
                           'methods': set([...])}} from a .d.ts file.

    The Node binding ships a single class (`Database`) with a positional
    string constructor; this function is general enough to cover any
    additional `export class` blocks that may land later.
    """
    text = open(path).read()
    classes = {}
    # Match `export class Foo {` and walk braces to the matching close.
    for m in re.finditer(r'export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{', text):
        name = m.group(1)
        start = m.end() - 1
        depth = 0
        end = None
        for i in range(start, len(text)):
            c = text[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end is None:
            continue
        body = text[start:end + 1]
        # First constructor signature decides the arg kind.
        ctor_kind = 'unknown'
        cm = re.search(r'\bconstructor\s*\(([^)]*)\)', body)
        if cm:
            arg = cm.group(1).strip()
            if arg == '':
                ctor_kind = 'none'
            else:
                # `path: string` / `private baseUrl: string` → 'string'.
                # `opts: { url: ... }` / `opts: SomeIface` → 'object'.
                # We look at the FIRST positional only — multi-arg ctors
                # are handled as 'mixed' (still string-leading is fine
                # for our callers).
                first = arg.split(',', 1)[0].strip()
                # Drop modifiers like `private `, `readonly `.
                first = re.sub(r'^(public|private|readonly|protected)\s+', '', first)
                # `name: type` — extract `type`.
                if ':' in first:
                    type_str = first.split(':', 1)[1].strip()
                    # Trailing `= default` → strip default.
                    type_str = type_str.split('=', 1)[0].strip()
                    if type_str.startswith('{') or 'Record<' in type_str:
                        ctor_kind = 'object'
                    elif type_str.startswith(('string', 'String')):
                        ctor_kind = 'string'
                    elif type_str.startswith(('number', 'boolean')):
                        ctor_kind = 'primitive'
                    else:
                        # Identifier type — could be either; treat as
                        # string-friendly since the live ctors are.
                        ctor_kind = 'unknown'
        # Method names — every `<name>(` at body scope.
        methods = set(
            re.findall(
                r'(?<![A-Za-z0-9_])(?:async\s+)?'
                r'([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*[:{]',
                body,
            )
        )
        # Drop the constructor entry from the method set so the gate
        # doesn't accept `db.constructor(…)` as a legit method call.
        methods.discard('constructor')
        classes[name] = {'ctor_arg_kind': ctor_kind, 'methods': methods}
    return classes


# Map: import-specifier → class set this gate knows about.
NODE_BINDING_PKG = "opengraphdb"
MCP_CLIENT_PKG = "@opengraphdb/mcp"

node_classes = load_node_surface(node_dts)
mcp_classes = load_node_surface(mcp_client_ts)

surface = {
    NODE_BINDING_PKG: node_classes,
    MCP_CLIENT_PKG: mcp_classes,
}

# Sanity: each surface must have at least one class. If the parser
# regressed (regex changed, file restructured), the gate would silently
# accept any imported symbol — fail loudly instead.
for pkg, cls in surface.items():
    if not cls:
        sys.stderr.write(
            "[check-frontend-node-api-surface] parsed 0 classes from the "
            "surface file for {} — gate cannot validate.\n".format(pkg)
        )
        sys.exit(1)


# ---- Frontend scan -------------------------------------------------------

def iter_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in ('node_modules', 'dist', 'build', '.next', '.turbo')
        ]
        for name in filenames:
            if name.endswith(('.ts', '.tsx')):
                yield os.path.join(dirpath, name)


# `import { A, B as C } from "opengraphdb"` — capture the imported names
# (left side of `as`, or the bare name).
IMPORT_RE = re.compile(
    r'import\s*\{([^}]+)\}\s*from\s*["\']'
    r'(opengraphdb|@opengraphdb/mcp)["\']'
)
# `new <ClassName>(<arg0>` — capture the class + the first arg literal up
# to the closing paren or comma. We accept either string-literal or
# object-literal openings; the rest is heuristic-validated downstream.
NEW_RE = re.compile(
    r'new\s+([A-Za-z_][A-Za-z0-9_]*)\s*\('
)
# `const { a, b } = await? <id>.query(` — capture the destructured names.
DESTRUCT_QUERY_RE = re.compile(
    r'(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*='
    r'\s*(?:await\s+)?([A-Za-z_][A-Za-z0-9_]*)\.query\s*\('
)


def parse_imports(src):
    """Yield (line, package, [names]) for each matching import."""
    for m in IMPORT_RE.finditer(src):
        names_blob = m.group(1)
        pkg = m.group(2)
        names = []
        for raw in names_blob.split(','):
            raw = raw.strip()
            if not raw:
                continue
            # `Foo as Bar` — the binding-side name is `Bar` but the
            # surface-side name is `Foo`. We validate `Foo` (surface).
            if ' as ' in raw:
                raw = raw.split(' as ', 1)[0].strip()
            # Strip type-only modifier `type Foo`.
            raw = re.sub(r'^type\s+', '', raw).strip()
            if raw:
                names.append(raw)
        yield (line_of(src, m.start()), pkg, names)


def first_arg_kind(src, open_paren_idx):
    """Look at the first non-whitespace char after `(` and classify the
    first argument as 'string' (single, double, or template-literal
    quoted), 'object' (`{`), 'identifier' (variable reference —
    pass-through), or 'unknown'."""
    j = open_paren_idx
    n = len(src)
    while j < n and src[j] in ' \t\n\r':
        j += 1
    if j >= n:
        return 'unknown'
    c = src[j]
    if c == ')':
        return 'none'
    if c in ("'", '"', '`'):
        return 'string'
    if c == '{':
        return 'object'
    if c == '[':
        return 'array'
    if c.isalpha() or c == '_':
        return 'identifier'
    return 'unknown'


violations = []
total_imports = 0
total_news = 0
total_destructs = 0
# Per-file: track imported-class → originating-package so the `new`
# scanner knows which surface to validate against.
for path in iter_files(frontend_src):
    raw = open(path).read()
    src = strip_ts_comments(raw)

    imports = []  # list of (line, pkg, [names])
    for line, pkg, names in parse_imports(src):
        total_imports += 1
        imports.append((line, pkg, names))
        cls_map = surface[pkg]
        for name in names:
            if name not in cls_map:
                # Allow type-only re-exports of interfaces from
                # mcp/src/client.ts (QueryResponse, SchemaResponse, etc.)
                # — they're real exports, just `export interface` not
                # `export class`. Re-parse the surface file as a quick
                # secondary pass.
                surface_text = open(
                    node_dts if pkg == NODE_BINDING_PKG else mcp_client_ts
                ).read()
                if re.search(
                    r'export\s+(interface|type|const|function)\s+'
                    + re.escape(name) + r'\b',
                    surface_text,
                ):
                    continue
                violations.append(
                    (path, line,
                     "import {{ {} }} from \"{}\" — not exported".format(
                         name, pkg))
                )

    # Build a name → package map for `new` validation.
    imported_names = {}
    for _line, pkg, names in imports:
        for name in names:
            imported_names[name] = pkg

    for m in NEW_RE.finditer(src):
        cls_name = m.group(1)
        if cls_name not in imported_names:
            continue
        total_news += 1
        pkg = imported_names[cls_name]
        cls_info = surface[pkg].get(cls_name)
        if cls_info is None:
            # Already flagged in the import axis.
            continue
        kind = first_arg_kind(src, m.end())
        expected = cls_info['ctor_arg_kind']
        if expected == 'string' and kind == 'object':
            violations.append(
                (path, line_of(src, m.start()),
                 "new {}({{ ... }}) — ctor expects positional string, "
                 "object literal coerces to '[object Object]'".format(cls_name))
            )
        elif expected == 'object' and kind == 'string':
            violations.append(
                (path, line_of(src, m.start()),
                 "new {}('...') — ctor expects object literal, "
                 "got string".format(cls_name))
            )
        # `identifier` / `unknown` is passed through — we cannot
        # statically resolve a bound variable's type from a regex pass.

    for m in DESTRUCT_QUERY_RE.finditer(src):
        total_destructs += 1
        names_blob = m.group(1)
        names = [n.strip() for n in names_blob.split(',') if n.strip()]
        # Strip ` as Foo` / default values for the inner key.
        keys = set()
        for n in names:
            n = re.sub(r'\s*=\s*.*$', '', n)
            n = re.sub(r'\s*:\s*.*$', '', n)
            keys.add(n.strip())
        # The HTTP query() shape is { columns, rows }. Anything else
        # destructured from a `.query(…)` call is a fabrication.
        valid = {'columns', 'rows'}
        if not keys.issubset(valid):
            unexpected = sorted(keys - valid)
            violations.append(
                (path, line_of(src, m.start()),
                 "destructure {{ {} }} from .query(...) — query() returns "
                 "{{ columns, rows }} only; {} are fabricated".format(
                     ", ".join(sorted(keys)), ", ".join(unexpected)))
            )

# ---- Dead-gate sentinel + report ----------------------------------------

if total_imports == 0 and total_news == 0 and total_destructs == 0:
    sys.stderr.write(
        "[check-frontend-node-api-surface] scanned 0 imports, 0 `new` "
        "calls, AND 0 query-destructures from any of {{{}}}. The gate is "
        "not exercising the surface it claims to gate. Either the repo "
        "no longer ships Node/MCP marketing snippets (delete this gate) "
        "or the regex needs updating.\n".format(
            ", ".join(sorted(surface.keys())))
    )
    sys.exit(1)

if violations:
    sys.stderr.write(
        "[check-frontend-node-api-surface] found {} fake-API site(s) "
        "in frontend TS/TSX:\n".format(len(violations))
    )
    for path, line, msg in violations:
        rel = os.path.relpath(path)
        sys.stderr.write("  - {}:{}: {}\n".format(rel, line, msg))
    sys.stderr.write(
        "Real surfaces: opengraphdb={} ; @opengraphdb/mcp={}\n".format(
            ", ".join(sorted(surface[NODE_BINDING_PKG].keys())),
            ", ".join(sorted(surface[MCP_CLIENT_PKG].keys())),
        )
    )
    sys.exit(1)

print(
    "check-frontend-node-api-surface: ok ({} imports, {} `new` calls, "
    "{} query-destructures, all match real surface)".format(
        total_imports, total_news, total_destructs))
PY
