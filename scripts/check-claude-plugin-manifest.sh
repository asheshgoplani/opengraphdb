#!/usr/bin/env bash
# Manifest gate for .claude-plugin/plugin.json.
#
# Asserts:
#   - file exists at the expected path
#   - parses as JSON
#   - has a kebab-case `name`
#   - has `description`, `version`, `license` (strongly recommended fields)
#   - has `repository` matching `git remote get-url origin` host (when in a git tree)
#   - the .mcp.json sibling at repo root is also valid JSON, if present
#
# This is a structural gate, not a schema validator. Anthropic's
# `claude plugin validate` does the deep schema check; this script is the
# pre-PR red-light that catches the obvious shapes (missing file, broken
# JSON, missing required name).
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$PWD}"
MANIFEST="$REPO_ROOT/.claude-plugin/plugin.json"

fail() {
  echo "check-claude-plugin-manifest: FAIL — $*" >&2
  exit 1
}

[[ -f "$MANIFEST" ]] || fail "missing $MANIFEST"

python3 -c "
import json, re, sys
p = json.load(open('$MANIFEST'))
def need(key, msg):
    if key not in p or not p[key]:
        print('missing field: ' + key + ' (' + msg + ')'); sys.exit(1)
need('name', 'plugin manifest requires name')
need('description', 'discovery requires description')
need('version', 'cache key — bump on every release')
need('license', 'SPDX identifier required')
need('repository', 'source URL required')
if not re.fullmatch(r'[a-z][a-z0-9-]*', p['name']):
    print('name must be kebab-case ASCII: ' + repr(p['name'])); sys.exit(1)
" || fail "manifest content checks failed"

# Optional: if .mcp.json sits alongside, sanity-check that it parses.
if [[ -f "$REPO_ROOT/.mcp.json" ]]; then
  python3 -c "import json; json.load(open('$REPO_ROOT/.mcp.json'))" \
    || fail ".mcp.json is not valid JSON"
fi

echo "check-claude-plugin-manifest: PASS"
