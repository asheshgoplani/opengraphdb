#!/usr/bin/env bash
# Manifest gate for marketplace.json (self-hosted single-plugin marketplace).
#
# Asserts:
#   - file exists at the expected path
#   - parses as JSON
#   - has `name` (kebab-case, not on the reserved list)
#   - has `owner.name`
#   - has at least one `plugins` entry, each with `name` + `source`
#
# This sits alongside check-claude-plugin-manifest.sh — together they are the
# pre-PR structural gate for the plugin distribution surface.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$PWD}"
MANIFEST="$REPO_ROOT/marketplace.json"

fail() {
  echo "check-marketplace-manifest: FAIL — $*" >&2
  exit 1
}

[[ -f "$MANIFEST" ]] || fail "missing $MANIFEST"

python3 - <<PY || fail "marketplace.json content checks failed"
import json, re, sys
RESERVED = {
    "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
    "anthropic-marketplace", "anthropic-plugins", "agent-skills",
    "knowledge-work-plugins", "life-sciences",
    "official-claude-plugins", "anthropic-tools-v2",
}
m = json.load(open('$MANIFEST'))
for k in ('name', 'owner', 'plugins'):
    if k not in m or not m[k]:
        print('missing field: ' + k); sys.exit(1)
if not re.fullmatch(r'[a-z][a-z0-9-]*', m['name']):
    print('name must be kebab-case ASCII: ' + repr(m['name'])); sys.exit(1)
if m['name'] in RESERVED:
    print('name on reserved list: ' + m['name']); sys.exit(1)
if not isinstance(m['owner'], dict) or not m['owner'].get('name'):
    print('owner.name required'); sys.exit(1)
if not isinstance(m['plugins'], list) or len(m['plugins']) == 0:
    print('plugins must be a non-empty array'); sys.exit(1)
for i, p in enumerate(m['plugins']):
    if not p.get('name') or not p.get('source'):
        print('plugins[' + str(i) + '] requires name + source'); sys.exit(1)
PY

echo "check-marketplace-manifest: PASS"
