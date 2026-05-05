#!/usr/bin/env bash
# F02 regression gate: every */package.json in the workspace must declare
# repository.url, homepage, and bugs URLs that match the canonical
# https://github.com/<owner>/<repo> form derived from `git remote get-url origin`.
#
# Cycle-15 verified frontend GitHub URLs against the remote, but missed the two
# npm packages (skills/ + mcp/) which had drifted to a fictitious
# `github.com/openGraphDB/openGraphDB` slug — case-sensitive 404 on npmjs.com
# "View Repository" / "Issues" / "Homepage" links. This gate locks every npm
# package's GitHub-URL surface to the live remote.
set -euo pipefail

REMOTE_RAW=$(git remote get-url origin 2>/dev/null || true)
if [[ -z "$REMOTE_RAW" ]]; then
  echo "check-npm-package-github-url: cannot read git remote origin" >&2
  exit 2
fi

# Normalize any of:
#   git@github.com:owner/repo.git
#   https://github.com/owner/repo.git
#   https://github.com/owner/repo
# → https://github.com/owner/repo
CANON=$(echo "$REMOTE_RAW" | sed -E 's|^git@github\.com:|https://github.com/|; s|\.git$||')
if [[ ! "$CANON" =~ ^https://github\.com/[^/]+/[^/]+$ ]]; then
  echo "check-npm-package-github-url: could not normalize remote: $REMOTE_RAW → $CANON" >&2
  exit 2
fi

mapfile -t PKGS < <(git ls-files '*/package.json' | grep -vE '(^|/)(node_modules|frontend)/')

if [[ ${#PKGS[@]} -eq 0 ]]; then
  echo "check-npm-package-github-url: no */package.json files tracked" >&2
  exit 2
fi

FAIL=0
for pkg in "${PKGS[@]}"; do
  [[ -f "$pkg" ]] || continue
  # repository.url
  REPO_URL=$(node -e "const p=require('./$pkg'); process.stdout.write(((p.repository && p.repository.url) || ''))" 2>/dev/null || true)
  HOMEPAGE=$(node -e "const p=require('./$pkg'); process.stdout.write((p.homepage || ''))" 2>/dev/null || true)
  BUGS=$(node -e "const p=require('./$pkg'); const b=p.bugs; process.stdout.write(typeof b==='string'?b:(b && b.url)||'')" 2>/dev/null || true)

  for field in "repository.url:$REPO_URL" "homepage:$HOMEPAGE" "bugs:$BUGS"; do
    name="${field%%:*}"
    val="${field#*:}"
    [[ -z "$val" ]] && continue
    # Strip any /tree/... or /issues or trailing /<dir> off, then compare prefix
    base=$(echo "$val" | sed -E 's|(/tree/[^[:space:]]*\|/issues[^[:space:]]*\|\.git)$||')
    if [[ "$base" != "$CANON" ]]; then
      echo "check-npm-package-github-url: $pkg $name='$val' does not match remote '$CANON'" >&2
      FAIL=1
    fi
  done
done

if [[ $FAIL -ne 0 ]]; then
  exit 1
fi

echo "ok (${#PKGS[@]} package.json files; remote=$CANON)"
exit 0
