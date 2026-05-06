#!/usr/bin/env bash
# Phase-B H-12: repo-wide credential / token leak gate.
#
# A separate, non-frontend-scoped scan that catches API keys, GitHub tokens,
# AWS keys, Slack tokens, GitLab personal-access tokens, and PEM-format
# private keys committed anywhere in the tracked tree. Pairs with the
# frontend-scoped token gate by widening the scope to crates/, scripts/,
# .claude/, .claude-plugin/, documentation/, top-level Dockerfile, top-level
# *.yaml + *.json, frontend/public/, and fixtures/ — i.e. every surface a
# credential could realistically be pasted into during agent-driven edits.
#
# Patterns are deliberately conservative (length-pinned, prefix-pinned) to
# avoid false positives on placeholder strings like `sk-...` in prose.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PATTERNS=(
  'sk-[A-Za-z0-9]{20,}'
  'ghp_[A-Za-z0-9]{36}'
  'AKIA[A-Z0-9]{16}'
  'xoxb-[A-Z0-9-]+'
  'glpat-[A-Za-z0-9_-]{20}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

# Build search-target list. Each entry must exist or it is silently dropped.
TARGETS=()
for cand in \
  crates \
  scripts \
  .claude \
  .claude-plugin \
  documentation \
  Dockerfile \
  frontend/public \
  fixtures \
; do
  [[ -e "$cand" ]] && TARGETS+=("$cand")
done
# Top-level config files only — recursive *.yaml/*.json scans pull in too
# much noise (lockfiles, dataset fixtures). Restrict to the repo root.
shopt -s nullglob
for f in *.yaml *.yml *.json; do
  [[ -f "$f" ]] && TARGETS+=("$f")
done
shopt -u nullglob

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  exit 0
fi

# Combine patterns with `|` for a single grep pass.
COMBINED=$(IFS='|'; echo "${PATTERNS[*]}")

HITS=$(grep -rEn --binary-files=without-match "$COMBINED" "${TARGETS[@]}" 2>/dev/null || true)

if [[ -n "$HITS" ]]; then
  echo "ERROR: credential / token leak detected — review the following lines:" >&2
  echo "$HITS" >&2
  echo >&2
  echo "If the match is a placeholder, restructure the example so the prefix" >&2
  echo "(sk-, ghp_, AKIA, xoxb-, glpat-) is broken (e.g. \`sk-EXAMPLE\` not" >&2
  echo "\`sk-AAAA…\`). Real credentials must never be committed; rotate any" >&2
  echo "key that has touched git history." >&2
  exit 1
fi

echo "check-token-leaks: ok (no credential prefixes detected across ${#TARGETS[@]} target paths)"
