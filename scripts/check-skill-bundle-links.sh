#!/usr/bin/env bash
# EVAL-DOCS-CYCLE34 H1: every relative `.md` link target appearing in
# `skills/opengraphdb/**/*.md` must resolve to a real file on disk. The
# skill bundle ships to user agents — a broken `](../../foo.md)` link
# becomes a 404 in the rendered surface (GitHub web view, MCP client,
# `Read` tool over the relative path).
#
# Generalizes the cycle-3 hard-coded denylist arm of
# `scripts/check-doc-anchors.sh` (which only flagged
# `multi-agent-shared-kg.md`): cycle-3 caught the second instance of
# this bug class; this gate locks the class itself, so the third
# instance (cosmos-mcp-tool.md, cycle-34 H1) cannot recur silently.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SKILL_DIR="$ROOT/skills/opengraphdb"

if [[ ! -d "$SKILL_DIR" ]]; then
  exit 0
fi

python3 - "$SKILL_DIR" <<'PY'
import os
import re
import sys
from pathlib import Path

skill_dir = Path(sys.argv[1]).resolve()

# Match markdown link target groups: `](TARGET)`. We deliberately do NOT
# match reference-style links — none ship in the skill bundle today, and
# adding one without a corresponding test fixture is a separate concern.
LINK_RE = re.compile(r'\]\(([^)\s#]+?)(?:#[^)]*)?\)')

errors = []
checked = 0

for md_path in sorted(skill_dir.rglob('*.md')):
    text = md_path.read_text(encoding='utf-8')
    for m in LINK_RE.finditer(text):
        target = m.group(1).strip()
        # Skip absolute URLs, mailto, and root-anchored repo paths
        # (root-anchored `/foo.md` is a GitHub-specific convention; if
        # any ship in the skill bundle later, this gate can be widened
        # to resolve them against the repo root).
        if target.startswith(('http://', 'https://', 'mailto:', '#', '/')):
            continue
        # Only check markdown link targets (the published failure mode).
        # Other relative refs (e.g. `scripts/quickstart.sh`) are valid
        # repo-root paths but not markdown link bodies — out of scope
        # here, covered by other gates (check-doc-anchors etc.).
        if not target.endswith('.md'):
            continue
        resolved = (md_path.parent / target).resolve()
        checked += 1
        if not resolved.exists():
            try:
                src_rel = md_path.relative_to(skill_dir.parent.parent)
            except ValueError:
                src_rel = md_path
            errors.append(f"{src_rel}: broken markdown link `{target}` -> {resolved} (file does not exist)")

if errors:
    for e in errors:
        print(e, file=sys.stderr)
    print(f"check-skill-bundle-links: FAIL ({len(errors)} broken / {checked} checked)", file=sys.stderr)
    sys.exit(1)

print(f"check-skill-bundle-links: ok ({checked} markdown link targets resolved)")
PY
