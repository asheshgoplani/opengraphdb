#!/usr/bin/env bash
# Phase-B M-11: GitHub Actions pin-to-SHA gate.
#
# `uses: actions/checkout@v4` is convenient but supply-chain-risky: a tag
# can be re-pointed by a compromised maintainer. The strict policy is to
# pin every `uses:` to a 40-char commit SHA. To avoid breaking CI on the
# day this gate lands, well-known + audited actions are allowlisted —
# tag-pinning is acceptable for those, and the gate will FAIL for anything
# else that isn't a SHA. New actions therefore land with an explicit
# decision: either SHA-pin them or add them to the allowlist (with review).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WF_DIR=".github/workflows"
if [[ ! -d "$WF_DIR" ]]; then
  echo "check-action-pins: no $WF_DIR, nothing to do"
  exit 0
fi

# Allowlist: action repos (case-sensitive — GitHub repo paths are) that may
# pin to a tag instead of a SHA. Each entry is `<owner>/<repo>`. Adding a new
# entry is a deliberate trust decision.
ALLOWLIST=(
  'actions/checkout'
  'actions/download-artifact'
  'actions/setup-node'
  'actions/setup-python'
  'actions/upload-artifact'
  'docker/build-push-action'
  'docker/login-action'
  'docker/setup-buildx-action'
  'docker/setup-qemu-action'
  'dtolnay/rust-toolchain'
  'googleapis/release-please-action'
  'softprops/action-gh-release'
  'Swatinem/rust-cache'
  'taiki-e/install-action'
)

is_allowlisted() {
  local repo="$1"
  local entry
  for entry in "${ALLOWLIST[@]}"; do
    [[ "$repo" == "$entry" ]] && return 0
  done
  return 1
}

VIOLATIONS=""
for wf in "$WF_DIR"/*.yml "$WF_DIR"/*.yaml; do
  [[ -f "$wf" ]] || continue
  # Pull every `uses:` line with its line number. Accept indentation /
  # leading-dash variations (`- uses:`, `  uses:`, etc).
  while IFS= read -r line; do
    lineno="${line%%:*}"
    rest="${line#*:}"
    # rest now looks like `   uses: actions/checkout@v4` (possibly with `- `).
    val=$(echo "$rest" | sed -E 's/^[[:space:]-]*uses:[[:space:]]*//; s/[[:space:]]+#.*$//; s/[[:space:]]+$//')
    # Skip blank/quoted-empty.
    [[ -z "$val" ]] && continue
    # Strip surrounding quotes if any.
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    # Local path actions (`./.github/actions/foo`) have no @ and are local.
    if [[ "$val" == ./* || "$val" == /* ]]; then
      continue
    fi
    # docker:// URIs — not used here but skip gracefully.
    if [[ "$val" == docker://* ]]; then
      continue
    fi
    # Must look like owner/repo@ref or owner/repo/path@ref.
    if [[ "$val" != *@* ]]; then
      VIOLATIONS+="$wf:$lineno: missing @ref → '$val'"$'\n'
      continue
    fi
    repo_path="${val%@*}"
    ref="${val##*@}"
    # repo_path may include a sub-path (e.g. `foo/bar/sub`); the action repo
    # is the first two slash-separated components.
    owner_repo=$(echo "$repo_path" | cut -d/ -f1-2)
    # Is ref a 40-char hex SHA?
    if [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
      continue
    fi
    # Allowlisted repo → tag is OK.
    if is_allowlisted "$owner_repo"; then
      continue
    fi
    VIOLATIONS+="$wf:$lineno: '$val' is not SHA-pinned and '$owner_repo' is not in allowlist"$'\n'
  done < <(grep -nE '^[[:space:]-]*uses:[[:space:]]' "$wf" || true)
done

if [[ -n "$VIOLATIONS" ]]; then
  echo "ERROR: GitHub Actions uses: not pinned to 40-char SHA:" >&2
  printf '%s' "$VIOLATIONS" >&2
  echo >&2
  echo "Either replace the @tag with a 40-char commit SHA, or add the" >&2
  echo "<owner>/<repo> to ALLOWLIST in scripts/check-action-pins.sh after" >&2
  echo "auditing it. The allowlist is a deliberate trust statement." >&2
  exit 1
fi

echo "check-action-pins: ok (every uses: is either SHA-pinned or allowlisted)"
