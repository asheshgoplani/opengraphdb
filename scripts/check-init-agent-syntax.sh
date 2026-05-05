#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE18 F03 regression gate: shipped *.md files must
# not teach `ogdb init --agent <bareword>` syntax. The CLI parses `--agent` as
# `ArgAction::SetTrue` (crates/ogdb-cli/src/lib.rs:227-232); the agent ID is
# selected by `--agent-id <ID>` (lib.rs:240-246). Any bareword token after
# `--agent` (e.g. `claude`, `cursor`) is silently consumed as the positional
# `path: Option<String>` slot — the user's database file. Anything that
# follows `--agent` directly must be either nothing or another `-`-prefixed
# flag.
#
# Same template as scripts/check-skills-copilot-removed.sh.
set -euo pipefail

# Search shipped *.md files only — exclude the EVAL-* reports (they
# legitimately quote the broken pattern when describing the finding) and
# vendored/build dirs.
HITS=$(
  find . -type f -name '*.md' \
    -not -path './target/*' \
    -not -path './node_modules/*' \
    -not -path '*/.git/*' \
    -not -name 'EVAL-*' \
    -print0 \
  | xargs -0 grep -nE 'ogdb init --agent[[:space:]]+[a-z][a-z0-9_-]*\b' 2>/dev/null \
  || true
)

if [[ -n "$HITS" ]]; then
  echo "check-init-agent-syntax: found 'ogdb init --agent <bareword>' usage" >&2
  echo "  '--agent' is a SetTrue boolean; agent id is selected by '--agent-id <ID>'." >&2
  echo "  A trailing bareword is silently parsed as the positional db path." >&2
  echo "$HITS" >&2
  exit 1
fi

exit 0
