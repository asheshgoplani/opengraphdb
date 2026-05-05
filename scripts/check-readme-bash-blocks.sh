#!/usr/bin/env bash
# EVAL-DOCS-CYCLE27 F01 regression gate: every `ogdb <subcommand> ...`
# invocation inside a fenced ```bash block in README.md must (a) use a
# subcommand name that exists in the shipped CLI surface and (b) supply at
# least as many positional args as the corresponding clap struct requires.
#
# F01 was a 12-character snippet — `ogdb import data.ttl` — that silently
# survived the cycle-15→26 polish train. Two independent bugs:
#   1. `import` requires two positional args (db + src); one positional
#      makes clap reject with "the following required arguments were not
#      provided: <src-path>".
#   2. `import` only handles CSV/JSON/JSONL; the RDF subcommand is
#      `import-rdf` (correctly used in documentation/QUICKSTART.md:75-76).
#
# Sources of truth, walked at runtime so the gate stays in sync with the CLI:
#   - Subcommand names: `CLI_SUBCOMMANDS` const in
#     `crates/ogdb-cli/tests/readme_cli_listing.rs` (the same list the C3-H3
#     coverage test uses).
#   - Positional arg counts: `Commands` enum + `*Command` structs in
#     `crates/ogdb-cli/src/lib.rs`. A field counts as a required positional
#     iff its `#[arg(...)]` attribute carries `value_name = "..."`, lacks
#     `long = ...` / `short = ...`, and its declared type is not `Option<…>`.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-readme-bash-blocks] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
LIB_RS="$REPO_ROOT/crates/ogdb-cli/src/lib.rs"
CLI_TEST="$REPO_ROOT/crates/ogdb-cli/tests/readme_cli_listing.rs"

# README is required; lib.rs / cli-test absence means the gate runs in a
# stripped-down checkout (e.g. a fixture dir under mktemp) — fall back to a
# README-only sanity check so the meta-test can still drive this script.
if [[ ! -f "$README" ]]; then
  echo "[check-readme-bash-blocks] no README.md at $README; nothing to check." >&2
  exit 0
fi

python3 - "$README" "$LIB_RS" "$CLI_TEST" <<'PY'
import re
import sys

readme_path, lib_rs_path, cli_test_path = sys.argv[1], sys.argv[2], sys.argv[3]


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


def load_min_positional(path):
    """Map cli-name -> minimum required positional arg count by parsing
    the Commands enum + *Command structs in lib.rs."""
    try:
        text = open(path).read()
    except OSError:
        return None

    # Step 1: walk the Commands enum, build cli-name -> struct-name map.
    enum_match = re.search(r'enum Commands\s*\{(.*?)^\}', text, re.DOTALL | re.MULTILINE)
    if not enum_match:
        return None
    enum_body = enum_match.group(1)

    name_to_struct = {}
    pending_override = None
    for line in enum_body.splitlines():
        # `#[command(name = "import-rdf", about = "...")]` overrides the
        # default snake-cased variant name. May span multiple lines, but in
        # this codebase it sits on a single line per variant.
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

    # Step 2: for each *Command struct, count required positional args.
    min_positional = {}
    for cli, struct in name_to_struct.items():
        body_match = re.search(
            r'struct\s+' + re.escape(struct) + r'\b[^{]*\{(.*?)^\}',
            text,
            re.DOTALL | re.MULTILINE,
        )
        if not body_match:
            min_positional[cli] = 0
            continue
        body = body_match.group(1)
        # Split on field boundaries: every `name: Type,` line that is NOT
        # inside an attribute. Easiest heuristic: walk attribute blocks then
        # grab the immediately-following field declaration.
        count = 0
        # Collapse multi-line `#[arg(...)]` attributes into a single logical
        # block per field so we can inspect their flags atomically.
        chunks = re.split(r'(?m)^\s*#\[arg\(', body)
        # chunks[0] is the prelude before the first attribute.
        for chunk in chunks[1:]:
            # chunk now starts inside the (...) of #[arg(. Find the matching
            # `)]` (single-paren depth — clap attrs don't nest parens).
            depth = 1
            i = 0
            while i < len(chunk) and depth > 0:
                if chunk[i] == '(':
                    depth += 1
                elif chunk[i] == ')':
                    depth -= 1
                i += 1
            attr = chunk[: i - 1]
            after = chunk[i:]  # `]` + newline + maybe more attributes + field decl

            # Strip everything up to and including the closing `]` of #[arg(...)].
            after = after.lstrip(']').lstrip('\n')
            # Skip any further attributes (#[arg(...)], #[command(...)], etc.)
            # until we hit a `field: Type,` declaration.
            field_decl = None
            for line in after.splitlines():
                stripped = line.strip()
                if not stripped or stripped.startswith('//'):
                    continue
                if stripped.startswith('#['):
                    # Subsequent attribute on the same field — keep looking.
                    continue
                if re.match(r'[a-z_][a-z0-9_]*\s*:', stripped):
                    field_decl = stripped
                    break
                # Anything else (close-brace, etc.) — stop.
                break
            if not field_decl:
                continue

            # A required positional has value_name AND no `long` / `short`
            # AND its type is not `Option<…>`. The attribute body is the
            # single-line projection of the multi-line attr, so a bare
            # `long` (no `=`) shows up as the token `long`.
            attr_flat = re.sub(r'\s+', ' ', attr)
            if 'value_name' not in attr_flat:
                continue
            if re.search(r'\blong\b', attr_flat) or re.search(r'\bshort\b', attr_flat):
                continue
            type_part = field_decl.split(':', 1)[1].strip().rstrip(',')
            if type_part.startswith('Option<') or type_part.startswith('Vec<'):
                continue
            count += 1
        min_positional[cli] = count
    return min_positional


def _camel_to_kebab(name):
    out = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            out.append('-')
        out.append(ch.lower())
    return ''.join(out)


def extract_ogdb_invocations(readme_path):
    """Yield (line_no, full_invocation) for every `ogdb <subcommand>` line
    inside a fenced ```bash code block in README.md."""
    try:
        text = open(readme_path).read()
    except OSError:
        return
    in_bash = False
    fence_re = re.compile(r'^\s*```([a-zA-Z0-9_-]*)\s*$')
    for lineno, raw in enumerate(text.splitlines(), 1):
        m = fence_re.match(raw)
        if m:
            lang = m.group(1).lower()
            if not in_bash:
                in_bash = lang in ('bash', 'sh', 'shell', 'console')
            else:
                in_bash = False
            continue
        if not in_bash:
            continue
        # Strip a leading shell prompt (`$ `, `# `) if present.
        stripped = raw.lstrip()
        stripped = re.sub(r'^[#$]\s+', '', stripped)
        # We only care about lines that invoke `ogdb`. Allow `ogdb` at the
        # start, after a pipe, or after `&&` — but not inside `# comments`.
        if stripped.startswith('#'):
            continue
        # Split on `|` and `&&` so each piped sub-command is checked.
        for chunk in re.split(r'\|\||\||&&', stripped):
            chunk = chunk.strip()
            tokens = chunk.split()
            if not tokens:
                continue
            # Allow optional `sudo` / leading env-vars (e.g. `FOO=1 ogdb ...`).
            i = 0
            while i < len(tokens) and ('=' in tokens[i] and not tokens[i].startswith('-')):
                i += 1
            if i >= len(tokens):
                continue
            if tokens[i] != 'ogdb':
                continue
            yield lineno, ' '.join(tokens[i:])


def count_positional_args(invocation_tokens):
    """Given tokens after `ogdb <subcommand>`, count positional args. Skip
    `--flag value` and `--flag=value`; `--bool` flags also consume zero args
    here because we don't know which are SetTrue. Be conservative: assume a
    `--flag` is followed by a value unless the next token is also `--…`."""
    pos = 0
    i = 0
    while i < len(invocation_tokens):
        t = invocation_tokens[i]
        if t.startswith('--') or t.startswith('-'):
            # `--flag=value` consumes nothing extra.
            if '=' in t:
                i += 1
                continue
            # If the next token is another flag or absent, this was a bool.
            if i + 1 < len(invocation_tokens) and not invocation_tokens[i + 1].startswith('-'):
                i += 2  # consumed value
            else:
                i += 1
            continue
        # Positional. If it looks like a quoted Cypher string, it's still
        # one positional from clap's perspective.
        pos += 1
        i += 1
    return pos


valid_names = load_valid_names(cli_test_path)
min_positional = load_min_positional(lib_rs_path)

errors = []

for lineno, invocation in extract_ogdb_invocations(readme_path):
    tokens = invocation.split()
    # tokens[0] == 'ogdb'
    if len(tokens) < 2:
        # Bare `ogdb` (e.g. `ogdb --version`) — nothing to validate.
        continue
    sub = tokens[1]
    rest = tokens[2:]

    # `ogdb --version`, `ogdb --help` etc. are global flags, not subcommands.
    if sub.startswith('-'):
        continue

    if valid_names is not None and sub not in valid_names:
        errors.append(
            f'README.md:{lineno}: unknown subcommand "{sub}" — not in CLI_SUBCOMMANDS '
            f'({sorted(valid_names)})'
        )
        continue

    if min_positional is not None and sub in min_positional:
        need = min_positional[sub]
        got = count_positional_args(rest)
        if got < need:
            errors.append(
                f'README.md:{lineno}: `ogdb {sub}` needs {need} positional '
                f'arg(s), got {got}: `{invocation}`'
            )

if errors:
    print('check-readme-bash-blocks: FAIL', file=sys.stderr)
    for e in errors:
        print('  ' + e, file=sys.stderr)
    print('', file=sys.stderr)
    print(
        'Source of truth: CLI_SUBCOMMANDS in crates/ogdb-cli/tests/readme_cli_listing.rs',
        file=sys.stderr,
    )
    print(
        'and Commands enum / *Command structs in crates/ogdb-cli/src/lib.rs.',
        file=sys.stderr,
    )
    sys.exit(1)

print('check-readme-bash-blocks: ok', file=sys.stderr)
PY
