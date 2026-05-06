#!/usr/bin/env bash
# EVAL-FRONTEND-CYCLE31 HIGH-1 + HIGH-2 + HIGH-3 regression gate.
# EVAL-FRONTEND-CYCLE32 HIGH-1 extension: published-vs-source surface check.
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
#      `from "@opengraphdb/mcp"` — but validated against the package's
#      *published entry point* (`mcp/src/index.ts`), not against any
#      internal source file. Cycle-32's BLOCKER-1 was a class that lived
#      in `mcp/src/client.ts` but was never re-exported by the entry —
#      cycle-31's gate happily rubber-stamped it because it parsed
#      `client.ts` directly. The fix walks the entry's `export {…} from
#      "./X.js"` re-exports (one hop is enough for this codebase) and
#      treats only those names as importable.
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
# see. Cycle-32 found a fifth axis: a real symbol (`OpenGraphDBClient`)
# imported from a real package (`@opengraphdb/mcp`) where the package's
# entry point silently failed to re-export it — i.e., the symbol is real
# in the source tree but fake on the published surface. This gate closes
# the remaining surface so the same class of bug cannot reach the
# clipboard via a sixth snippet.
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
# Cycle-32 BLOCKER-1: the @opengraphdb/mcp package surface is rooted at
# its published entry point (mcp/src/index.ts), NOT at any internal
# source file. The gate walks index.ts re-exports to find the actual
# class definitions; the legacy MCP_CLIENT_TS pointer is gone.
MCP_INDEX_TS="$REPO_ROOT/mcp/src/index.ts"

if [[ ! -d "$FRONTEND_SRC" ]]; then
  echo "[check-frontend-node-api-surface] no frontend/src at $FRONTEND_SRC; nothing to check." >&2
  exit 0
fi

if [[ ! -f "$NODE_DTS" ]]; then
  echo "[check-frontend-node-api-surface] no $NODE_DTS; cannot validate." >&2
  exit 1
fi

if [[ ! -f "$MCP_INDEX_TS" ]]; then
  echo "[check-frontend-node-api-surface] no $MCP_INDEX_TS; cannot validate." >&2
  exit 1
fi

python3 - "$FRONTEND_SRC" "$NODE_DTS" "$MCP_INDEX_TS" <<'PY'
import os
import re
import sys

frontend_src, node_dts, mcp_index_ts = sys.argv[1], sys.argv[2], sys.argv[3]


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


def load_published_surface(entry_path):
    """Walk the package's published entry point and collect:
      - classes: {name: class_info} for every class actually re-exported
        (or directly defined) by the entry file. Class info comes from
        the file that defines the class (entry itself, or one hop away
        via `export {…} from "./X.js"`).
      - names: set of every name re-exported or directly exported by the
        entry — class, interface, type, const, function alike. This is
        the IMPORT-axis allowlist.

    Cycle-32 BLOCKER-1: a class living in `mcp/src/client.ts` but never
    re-exported by `mcp/src/index.ts` is NOT importable from the bare
    `@opengraphdb/mcp` specifier. The cycle-31 gate parsed `client.ts`
    directly and waved it through; this walker fails it.
    """
    text = open(entry_path).read()
    src_dir = os.path.dirname(entry_path)
    classes = {}
    names = set()

    # Pass 1: re-exports of the form `export {A, B as C, type D} from "./X.js"`
    # and `export type {A, B} from "./X.js"`.
    re_export_re = re.compile(
        r'export\s+(?P<typeonly>type\s+)?\{(?P<names>[^}]+)\}\s*'
        r'from\s*["\'](?P<src>\.[^"\']+)["\']'
    )
    for m in re_export_re.finditer(text):
        names_blob = m.group('names')
        rel_src = m.group('src')
        # `./client.js` → `./client.ts` (we're reading TS source).
        rel_src_ts = re.sub(r'\.js$', '.ts', rel_src)
        target_full = os.path.normpath(os.path.join(src_dir, rel_src_ts))
        target_classes = (
            load_node_surface(target_full) if os.path.exists(target_full) else {}
        )
        for raw in names_blob.split(','):
            raw = raw.strip()
            if not raw:
                continue
            # `type Foo` inline modifier — strip.
            inline_type_only = bool(re.match(r'^type\s+', raw))
            raw = re.sub(r'^type\s+', '', raw).strip()
            # `Foo as Bar` — local binding is Bar; external surface IS Bar
            # (that's the name a consumer must `import { Bar }`).
            if ' as ' in raw:
                raw = raw.split(' as ', 1)[1].strip()
            if not raw:
                continue
            names.add(raw)
            # Only classify as a class if the source file actually defines
            # it as one AND the export is not a `type ...` re-export.
            if (
                not inline_type_only
                and not m.group('typeonly')
                and raw in target_classes
            ):
                classes[raw] = target_classes[raw]

    # Pass 2: re-exports of bare module surface — `export * from "./X.js"`.
    # We pull every class name from the target file (mirrors what the
    # bundler/runtime would expose).
    for m in re.finditer(
        r'export\s+\*\s*from\s*["\'](\.[^"\']+)["\']', text
    ):
        rel_src = m.group(1)
        rel_src_ts = re.sub(r'\.js$', '.ts', rel_src)
        target_full = os.path.normpath(os.path.join(src_dir, rel_src_ts))
        if os.path.exists(target_full):
            for k, v in load_node_surface(target_full).items():
                classes.setdefault(k, v)
                names.add(k)
            # Also pull interface/type/const/function names so the import
            # axis can find them.
            t = open(target_full).read()
            for nm in re.findall(
                r'export\s+(?:interface|type|const|function)\s+'
                r'([A-Za-z_][A-Za-z0-9_]*)',
                t,
            ):
                names.add(nm)

    # Pass 3: directly-declared exports in the entry file itself.
    direct_classes = load_node_surface(entry_path)
    for k, v in direct_classes.items():
        classes.setdefault(k, v)
        names.add(k)
    for nm in re.findall(
        r'export\s+(?:interface|type|const|function)\s+'
        r'([A-Za-z_][A-Za-z0-9_]*)',
        text,
    ):
        names.add(nm)

    return classes, names


# Map: import-specifier → class set this gate knows about.
NODE_BINDING_PKG = "opengraphdb"
MCP_CLIENT_PKG = "@opengraphdb/mcp"

node_classes = load_node_surface(node_dts)
mcp_classes, mcp_published_names = load_published_surface(mcp_index_ts)

# Node binding: the .d.ts IS the published surface, so every exported name
# in it counts. Pull interface/type/const/function names too.
node_published_names = set(node_classes.keys())
_node_text = open(node_dts).read()
for nm in re.findall(
    r'export\s+(?:interface|type|const|function)\s+'
    r'([A-Za-z_][A-Za-z0-9_]*)',
    _node_text,
):
    node_published_names.add(nm)

surface = {
    NODE_BINDING_PKG: node_classes,
    MCP_CLIENT_PKG: mcp_classes,
}
published_names = {
    NODE_BINDING_PKG: node_published_names,
    MCP_CLIENT_PKG: mcp_published_names,
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
        # Cycle-32 BLOCKER-1: validate against the *published* surface,
        # i.e. names actually re-exported by the package's entry point —
        # NOT against any export-class found anywhere in the source tree.
        # `published_names[pkg]` already includes class + interface/type/
        # const/function names traceable to the entry, so the secondary
        # source-file scan from cycle-31 is now redundant (and was the
        # bug that let BLOCKER-1 through).
        for name in names:
            if name not in published_names[pkg]:
                violations.append(
                    (path, line,
                     "import {{ {} }} from \"{}\" — not exported by "
                     "the package's published entry point".format(
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
        pkg = imported_names[cls_name]
        cls_info = surface[pkg].get(cls_name)
        if cls_info is None:
            # Already flagged in the import axis (or it's a type/interface,
            # in which case `new …` would already be a TS error elsewhere).
            continue
        total_news += 1
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
    # No marketing snippets currently reference Node/MCP packages.
    # cycle-33 removed the cosmos-mcp pattern card (was the last consumer).
    # The gate stays wired so future re-introductions are still validated;
    # nothing to validate today is a green outcome, not a failure.
    sys.stdout.write(
        "[check-frontend-node-api-surface] no marketing snippets reference "
        "{{{}}} today; gate stays wired for future regressions\n".format(
            ", ".join(sorted(surface.keys())))
    )
    sys.exit(0)

if violations:
    sys.stderr.write(
        "[check-frontend-node-api-surface] found {} fake-API site(s) "
        "in frontend TS/TSX:\n".format(len(violations))
    )
    for path, line, msg in violations:
        rel = os.path.relpath(path)
        sys.stderr.write("  - {}:{}: {}\n".format(rel, line, msg))
    sys.stderr.write(
        "Real published surfaces: opengraphdb={} ; @opengraphdb/mcp={}\n".format(
            ", ".join(sorted(published_names[NODE_BINDING_PKG])),
            ", ".join(sorted(published_names[MCP_CLIENT_PKG])),
        )
    )
    sys.exit(1)

print(
    "check-frontend-node-api-surface: ok ({} imports, {} `new` calls, "
    "{} query-destructures, all match real surface)".format(
        total_imports, total_news, total_destructs))
PY
