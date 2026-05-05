#!/usr/bin/env bash
# EVAL-FRONTEND-CYCLE28/-29 HIGH-1 + HIGH-2 regression gate.
#
# Sibling of scripts/check-readme-bash-blocks.sh: walks every `ogdb …`
# command-shaped fragment in frontend/src/**/*.{ts,tsx} and validates it
# against the live clap surface. Sources scanned:
#   - string literals (single-, double-, or backtick-quoted);
#   - JSX text inside `<code>…</code>` and `<pre>…</pre>` children;
#   - generic JSX text content (text between `>` and `<` in TSX).
# For each fragment whose trimmed content starts with `ogdb …`, validates
# that:
#   1. the second token is a real subcommand from CLI_SUBCOMMANDS
#      (crates/ogdb-cli/tests/readme_cli_listing.rs);
#   2. the invocation supplies enough positional args for the corresponding
#      *Command struct in crates/ogdb-cli/src/lib.rs to be accepted by clap.
#      For commands whose `path: Option<…>` field carries
#      `required_unless_present = "db_path"` (Init, Info, Serve, Mcp …), the
#      slot is satisfied by either an extra positional OR the global
#      `--db <path>` flag — same shape the binary enforces at runtime.
#
# Cycle-27 F01 (`ogdb import data.ttl` in README.md) was caught by the README
# gate. Cycle-28 closed two TSX string-literal leaks (DisconnectedState
# SERVE_COMMAND const + LiveEmptyDbCTA inline mention). Cycle-29 found the
# same bug class had leaked into JSX text content under imperative wording
# (`<code>ogdb serve --http</code>` rendered after "start" / "to ingest for
# real") in RDFDropzone.tsx and PlaygroundPage.tsx — the cycle-28 carve-out
# that skipped JSX text turned out to be wrong: that text IS directive
# copy-paste content, not narrative shorthand. JSX text is now in scope.
#
# Comments (`//` line, `/* */` block) are stripped before scan so that
# code-comment prose like `// fresh \`ogdb serve --http\`` doesn't fire.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-frontend-bash-blocks] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_SRC="$REPO_ROOT/frontend/src"
LIB_RS="$REPO_ROOT/crates/ogdb-cli/src/lib.rs"
CLI_TEST="$REPO_ROOT/crates/ogdb-cli/tests/readme_cli_listing.rs"

if [[ ! -d "$FRONTEND_SRC" ]]; then
  echo "[check-frontend-bash-blocks] no frontend/src at $FRONTEND_SRC; nothing to check." >&2
  exit 0
fi

python3 - "$FRONTEND_SRC" "$LIB_RS" "$CLI_TEST" <<'PY'
import os
import re
import sys

frontend_src, lib_rs_path, cli_test_path = sys.argv[1], sys.argv[2], sys.argv[3]


def load_valid_names(path):
    """Read the CLI_SUBCOMMANDS const from the readme_cli_listing.rs test."""
    try:
        text = open(path).read()
    except OSError:
        return None
    m = re.search(r'const CLI_SUBCOMMANDS:[^=]*=\s*&\[(.*?)\];', text, re.DOTALL)
    if not m:
        return None
    return set(re.findall(r'"([a-z][a-z0-9-]*)"', m.group(1)))


def _camel_to_kebab(name):
    out = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            out.append('-')
        out.append(ch.lower())
    return ''.join(out)


def load_command_constraints(path):
    """Return cli-name -> {min_pos, db_path_alts} where:
      - min_pos: required positionals (value_name, no long/short, type not
        Option<…>/Vec<…>);
      - db_path_alts: count of Option<…> fields with `value_name` that carry
        `required_unless_present = "db_path"` — each one is satisfied by
        either an extra positional OR the global `--db <path>` flag.
    """
    try:
        text = open(path).read()
    except OSError:
        return None

    enum_match = re.search(r'enum Commands\s*\{(.*?)^\}', text, re.DOTALL | re.MULTILINE)
    if not enum_match:
        return None
    enum_body = enum_match.group(1)

    name_to_struct = {}
    pending_override = None
    for line in enum_body.splitlines():
        nm = re.search(r'name\s*=\s*"([a-z][a-z0-9-]*)"', line)
        if nm and 'name =' in line and '#[command' in line:
            pending_override = nm.group(1)
            continue
        var = re.match(r'\s*([A-Z][A-Za-z0-9]*)\(\s*([A-Z][A-Za-z0-9]*Command)\s*\)', line)
        if var:
            variant, struct = var.group(1), var.group(2)
            cli = pending_override if pending_override else _camel_to_kebab(variant)
            name_to_struct[cli] = struct
            pending_override = None

    constraints = {}
    for cli, struct in name_to_struct.items():
        body_match = re.search(
            r'struct\s+' + re.escape(struct) + r'\b[^{]*\{(.*?)^\}',
            text,
            re.DOTALL | re.MULTILINE,
        )
        if not body_match:
            constraints[cli] = {'min_pos': 0, 'db_path_alts': 0}
            continue
        body = body_match.group(1)
        min_pos = 0
        db_path_alts = 0
        chunks = re.split(r'(?m)^\s*#\[arg\(', body)
        for chunk in chunks[1:]:
            depth = 1
            i = 0
            while i < len(chunk) and depth > 0:
                if chunk[i] == '(':
                    depth += 1
                elif chunk[i] == ')':
                    depth -= 1
                i += 1
            attr = chunk[: i - 1]
            after = chunk[i:].lstrip(']').lstrip('\n')
            field_decl = None
            for line in after.splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith('//'):
                    continue
                if stripped.startswith('#['):
                    continue
                if re.match(r'[a-z_][a-z0-9_]*\s*:', stripped):
                    field_decl = stripped
                    break
                break
            if not field_decl:
                continue

            attr_flat = re.sub(r'\s+', ' ', attr)
            if 'value_name' not in attr_flat:
                continue
            if re.search(r'\blong\b', attr_flat) or re.search(r'\bshort\b', attr_flat):
                continue
            type_part = field_decl.split(':', 1)[1].strip().rstrip(',')
            if type_part.startswith('Option<') or type_part.startswith('Vec<'):
                if 'required_unless_present = "db_path"' in attr_flat:
                    db_path_alts += 1
                continue
            min_pos += 1
        constraints[cli] = {'min_pos': min_pos, 'db_path_alts': db_path_alts}
    return constraints


def iter_source_files(root):
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            if fn.endswith('.tsx') or fn.endswith('.ts'):
                yield os.path.join(dirpath, fn)


def extract_string_literals(text):
    """Walk a TS/TSX source as a small state machine and yield
    (lineno, content) for every single-, double-, or backtick-quoted string
    literal. Skips everything inside `// ...` line comments and
    `/* ... */` block comments. Backslash escapes inside the string are
    honored; template-literal `${expr}` interpolations are passed through
    verbatim into `content` (we don't recurse into the expression)."""
    i = 0
    n = len(text)
    line = 1
    while i < n:
        c = text[i]
        # Newline tracking.
        if c == '\n':
            line += 1
            i += 1
            continue
        # Line comment: consume until newline.
        if c == '/' and i + 1 < n and text[i + 1] == '/':
            while i < n and text[i] != '\n':
                i += 1
            continue
        # Block comment: consume until `*/`.
        if c == '/' and i + 1 < n and text[i + 1] == '*':
            i += 2
            while i + 1 < n and not (text[i] == '*' and text[i + 1] == '/'):
                if text[i] == '\n':
                    line += 1
                i += 1
            i += 2  # consume the closing `*/`
            continue
        # String literal start.
        if c in ("'", '"', '`'):
            quote = c
            start_line = line
            i += 1
            buf = []
            while i < n:
                ch = text[i]
                if ch == '\\' and i + 1 < n:
                    buf.append(text[i + 1])
                    if text[i + 1] == '\n':
                        line += 1
                    i += 2
                    continue
                if ch == quote:
                    i += 1
                    break
                if ch == '\n':
                    line += 1
                    # Single/double quote string can't span lines (in valid
                    # TS); break defensively to avoid runaway scans on a
                    # malformed file.
                    if quote != '`':
                        break
                buf.append(ch)
                i += 1
            yield start_line, ''.join(buf)
            continue
        i += 1


def extract_jsx_text(text):
    """Yield (lineno, content) for JSX text between `>` and `<` (excluding
    `{` / `}` so JSX expression interpolations don't leak in). Captures the
    children of `<code>…</code>` and `<pre>…</pre>` (cycle-29 HIGH-1/-2
    shape) as well as plain JSX text under imperative wording. Heuristic
    rather than a full TSX parse — sufficient because `is_command_shaped`
    requires the trimmed content to literally start with `ogdb `, so noise
    from non-JSX `>` tokens (TS comparisons, generics) is filtered downstream.
    """
    pattern = re.compile(r'>([^<>{}]+)<')
    for m in pattern.finditer(text):
        content = m.group(1)
        if not content.strip():
            continue
        lineno = text.count('\n', 0, m.start(1)) + 1
        yield lineno, content


def is_command_shaped(content):
    """A fragment is treated as a command shape iff its trimmed content
    STARTS with the bare token `ogdb` (followed by whitespace). Skips
    narrative prose like 'Open a .ogdb file …' (starts with 'Open') or
    'HTTP for apps; run `ogdb mcp` …' (starts with 'HTTP'). Cycle-29 broadens
    the scan beyond string literals to also include JSX text inside
    `<code>…</code>` / `<pre>…</pre>` and plain JSX text — but the same
    `^ogdb\\s` filter still drops narrative-shaped surrounding text.
    """
    stripped = content.strip()
    return bool(re.match(r'^ogdb(\s|$)', stripped))


def count_positional_args(invocation_tokens):
    """Conservative: every `--flag` / `-f` token consumes ZERO subsequent
    args. Non-flag tokens are counted as positional. This may over-count
    (a flag-value like the `100` in `--batch 100` becomes a positional),
    but over-counting is safe — the gate only fails on `got < need`,
    so a higher `got` cannot produce a false positive. Mirrors the same
    safety choice the README gate makes implicitly."""
    pos = 0
    for t in invocation_tokens:
        if not t:
            continue
        if t.startswith('-'):
            continue
        pos += 1
    return pos


def has_db_flag(invocation_tokens):
    """True iff `--db <value>` or `--db=<value>` is present in the tokens."""
    for i, t in enumerate(invocation_tokens):
        if t == '--db' and i + 1 < len(invocation_tokens):
            return True
        if t.startswith('--db='):
            return True
    return False


valid_names = load_valid_names(cli_test_path)
constraints = load_command_constraints(lib_rs_path)

errors = []

def iter_candidates(text, path):
    """String literals (all .ts/.tsx) plus JSX text (.tsx only)."""
    yield from extract_string_literals(text)
    if path.endswith('.tsx'):
        yield from extract_jsx_text(text)


for path in sorted(iter_source_files(frontend_src)):
    try:
        text = open(path).read()
    except OSError:
        continue
    rel = os.path.relpath(path)
    for lineno, content in iter_candidates(text, path):
        if not is_command_shaped(content):
            continue
        # Tokenize the literal's trimmed content. Pipes/&&-chained
        # sub-commands inside one literal each get checked.
        for chunk in re.split(r'\|\||\||&&', content.strip()):
            tokens = chunk.strip().split()
            if not tokens or tokens[0] != 'ogdb':
                continue
            if len(tokens) < 2:
                continue  # bare `ogdb`
            sub = tokens[1]
            if sub.startswith('-'):
                continue  # `ogdb --version` etc.
            rest = tokens[2:]

            if valid_names is not None and sub not in valid_names:
                errors.append(
                    f'{rel}:{lineno}: unknown subcommand "{sub}" — not in '
                    f'CLI_SUBCOMMANDS ({sorted(valid_names)})'
                )
                continue

            if constraints is not None and sub in constraints:
                spec = constraints[sub]
                need = spec['min_pos']
                db_alts = spec['db_path_alts']
                got = count_positional_args(rest)
                db_present = has_db_flag(rest)
                free_slots = 1 if db_present else 0
                effective_need = need + max(0, db_alts - free_slots)
                if got < effective_need:
                    hint = ''
                    if db_alts > 0 and not db_present:
                        hint = (
                            ' (clap also accepts the global `--db <path>` '
                            'flag in place of the positional)'
                        )
                    errors.append(
                        f'{rel}:{lineno}: `ogdb {sub}` needs {effective_need} '
                        f'positional arg(s), got {got}: `{chunk.strip()}`'
                        + hint
                    )

if errors:
    print('check-frontend-bash-blocks: FAIL', file=sys.stderr)
    for e in errors:
        print('  ' + e, file=sys.stderr)
    print('', file=sys.stderr)
    print(
        'Source of truth: CLI_SUBCOMMANDS in '
        'crates/ogdb-cli/tests/readme_cli_listing.rs',
        file=sys.stderr,
    )
    print(
        'and Commands enum / *Command structs in crates/ogdb-cli/src/lib.rs.',
        file=sys.stderr,
    )
    sys.exit(1)

print('check-frontend-bash-blocks: ok', file=sys.stderr)
PY
