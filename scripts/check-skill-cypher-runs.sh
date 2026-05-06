#!/usr/bin/env bash
# Verify that every ```cypher``` snippet in skills/opengraphdb*/SKILL.md
# and documentation/recipes/*.md actually executes against the running
# binary. Catches the class of "skill drift" where an example reads
# fluently to a human but the engine returns "unsupported query" or
# "semantic analysis error: unbound variable".
#
# Why this exists: cycle-N audit (H-9 / H-10 / C-4) found three lying
# docs at once — the gate is the structural fix so the next rebaseline
# cannot re-introduce them silently.
#
# Scope is intentionally narrow:
#   - skills/opengraphdb/SKILL.md
#   - skills/opengraphdb-v2/SKILL.md
#   - documentation/recipes/*.md
# Reference docs (skills/opengraphdb*/references/*.md, COOKBOOK.md) are
# not in scope today — they are reviewed as part of the cross-doc
# consistency gate. This gate is the load-bearing one for the
# entry-point surface an agent reads first.
#
# Statements that intentionally use parameters ($foo) or that are listed
# in the file under a "**not** supported" section are skipped — the
# extractor only runs blocks that should execute today.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OGDB_BIN="${OGDB_BIN:-$REPO_ROOT/target/release/ogdb}"
if [[ ! -x "$OGDB_BIN" ]]; then
  echo "check-skill-cypher-runs: skip — ogdb binary not built at $OGDB_BIN" >&2
  echo "  (run `cargo build --release -p ogdb-cli` to enable this gate)" >&2
  exit 0
fi

FIXTURE="${CHECK_SKILL_CYPHER_FIXTURE:-$(mktemp -u -t check-skill-cypher.XXXXXX.ogdb)}"
trap 'rm -f "$FIXTURE"' EXIT
rm -f "$FIXTURE"
"$OGDB_BIN" init "$FIXTURE" >/dev/null

# Seed enough of the schema that every label / edge type referenced by
# the snippets resolves. Each query may still return zero rows — the
# gate only checks that the engine accepts the query (no
# "unsupported query" / "semantic analysis error").
seed_node() {
  "$OGDB_BIN" create-node "$FIXTURE" --labels "$1" --props "$2" >/dev/null
}
seed_edge() {
  "$OGDB_BIN" add-edge "$FIXTURE" "$1" "$2" --type "$3" >/dev/null
}

# Property-graph side (SKILL.md):
seed_node Person 'name=string:Alice;age=i64:30'                       # 0
seed_node Person 'name=string:Bob;age=i64:25'                         # 1
seed_node Book   'title=string:Cookbook'                              # 2
seed_node Article 'title=string:Hello;body=string:graph database'     # 3
seed_node Review 'text=string:Nice;embedding=string:[0.1,0.2,0.3]'    # 4
seed_edge 0 1 KNOWS
seed_edge 0 2 WROTE
seed_edge 0 1 WORKS_WITH

# Lexical-graph side (recipes/wordnet-traversal.md):
seed_node Synset 'label=string:dog;definition=string:domestic dog'    # 5
seed_node Synset 'label=string:canine'                                # 6
seed_node Synset 'label=string:mammal'                                # 7
seed_node Synset 'label=string:animal'                                # 8
seed_node Synset 'label=string:cat'                                   # 9
seed_node Synset 'label=string:feline'                                # 10
seed_node Synset 'label=string:hot'                                   # 11
seed_node Synset 'label=string:cold'                                  # 12
seed_node Synset 'label=string:bank;definition=string:financial institution'  # 13
seed_node Synset 'label=string:bank;definition=string:river edge'             # 14
seed_node Word   'lexicalForm=string:bank'                            # 15
seed_edge 5 6 hypernymOf
seed_edge 6 7 hypernymOf
seed_edge 7 8 hypernymOf
seed_edge 9 10 hypernymOf
seed_edge 10 7 hypernymOf
seed_edge 11 12 antonymOf
seed_edge 15 13 senseOf
seed_edge 15 14 senseOf

# Extract individual cypher statements from the in-scope markdown files.
# A "statement" is one logical query — we split fenced blocks on blank
# lines so each `// comment` + body counts as one runnable unit.
SNIPPETS=$(python3 - <<'PY'
import os
import re
import sys

ROOT = os.environ.get("CHECK_SKILL_CYPHER_ROOT", ".")
files = []
for cand in [
    os.path.join(ROOT, "skills/opengraphdb/SKILL.md"),
    os.path.join(ROOT, "skills/opengraphdb-v2/SKILL.md"),
]:
    if os.path.isfile(cand):
        files.append(cand)
import glob
files.extend(sorted(glob.glob(os.path.join(ROOT, "documentation/recipes/*.md"))))

CYPHER_FENCE = re.compile(r"```cypher\s*\n(.*?)\n```", re.DOTALL)
NOT_SUPPORTED_SECTION = re.compile(
    r"^#{1,6}\s+.*not.*support|"          # "## What is not supported"
    r"^#{1,6}\s+.*roadmap|"               # "## Roadmap"
    r"^#{1,6}\s+.*not yet",
    re.IGNORECASE | re.MULTILINE,
)

def block_in_skipped_section(text: str, block_start: int) -> bool:
    # Walk back to the nearest preceding heading. Skip if it matches
    # one of the "not supported / roadmap" patterns.
    preceding = text[:block_start]
    headings = list(re.finditer(r"^#{1,6}\s+.*$", preceding, re.MULTILINE))
    if not headings:
        return False
    last = headings[-1].group(0)
    return bool(NOT_SUPPORTED_SECTION.match(last))

records = []
for f in files:
    try:
        with open(f, "r", encoding="utf-8") as fp:
            text = fp.read()
    except OSError as e:
        print(f"FILE_ERR\t{f}\t{e}", file=sys.stderr)
        continue
    for m in CYPHER_FENCE.finditer(text):
        if block_in_skipped_section(text, m.start()):
            continue
        body = m.group(1)
        # Split on blank lines into individual statements.
        for raw in re.split(r"\n\s*\n", body):
            # Strip line comments and trailing whitespace.
            cleaned_lines = []
            for line in raw.splitlines():
                stripped = line.lstrip()
                if stripped.startswith("//"):
                    continue
                cleaned_lines.append(line)
            stmt = "\n".join(cleaned_lines).strip()
            if not stmt:
                continue
            # Drop trailing semicolons — the engine rejects them today.
            stmt = stmt.rstrip(";").rstrip()
            if not stmt:
                continue
            # Skip statements that need parameter injection.
            if re.search(r"(?<![A-Za-z0-9_])\$[A-Za-z_]", stmt):
                continue
            # Encode for safe transit through bash by base64ing.
            import base64
            blob = base64.b64encode(stmt.encode("utf-8")).decode("ascii")
            records.append(f"{f}\t{blob}")

for line in records:
    print(line)
PY
)

if [[ -z "$SNIPPETS" ]]; then
  echo "check-skill-cypher-runs: extracted zero in-scope cypher snippets — extraction broke?" >&2
  exit 2
fi

declare -i ran=0
declare -i failed=0
FAILS_FILE=$(mktemp)

while IFS=$'\t' read -r file blob; do
  [[ -z "$file" ]] && continue
  stmt=$(echo "$blob" | base64 -d)
  ran=$((ran + 1))
  if ! out=$("$OGDB_BIN" query "$FIXTURE" "$stmt" 2>&1); then
    failed=$((failed + 1))
    {
      printf "FAIL %s\n" "$file"
      printf "  cypher: %s\n" "${stmt//$'\n'/ }"
      printf "  error: %s\n" "$(echo "$out" | head -3 | tr '\n' ' ')"
    } >> "$FAILS_FILE"
  fi
done <<< "$SNIPPETS"

if (( failed > 0 )); then
  echo "check-skill-cypher-runs: $failed of $ran cypher snippets failed" >&2
  echo "" >&2
  cat "$FAILS_FILE" >&2
  rm -f "$FAILS_FILE"
  exit 1
fi
rm -f "$FAILS_FILE"

echo "check-skill-cypher-runs: $ran in-scope cypher snippets all parsed + executed cleanly"
