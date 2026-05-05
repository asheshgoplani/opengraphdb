#!/usr/bin/env bash
# Workflow gate for AGENTS.md step 3: every merged change updates CHANGELOG.md
# under `## [Unreleased]`.
#
# Two layers (cycle-3 §C3-H2 strengthening):
#
# 1) `[Unreleased]` must have at least one bullet.
#
# 2) Every `feat(` commit since the latest released `## [X.Y.Z]` heading must
#    map to at least one bullet under `[Unreleased]`. "Map" is intentionally
#    loose: any distinctive keyword from the commit subject (any non-stopword
#    token longer than 3 chars) appearing anywhere in the unreleased block
#    counts. Bundled changes (one bullet for many commits) are fine; a feature
#    merged with NO matching keyword under `[Unreleased]` is the exact regression
#    cycle-3 caught (`feat(s8): ogdb demo subcommand` shipped 2 days after 0.4.0
#    with no `[Unreleased]` entry).
set -euo pipefail

CHANGELOG_FILE="CHANGELOG.md"

if [[ ! -f "$CHANGELOG_FILE" ]]; then
  echo "Missing $CHANGELOG_FILE"
  exit 1
fi

# Layer 1: at least one bullet under [Unreleased].
unreleased_block="$(
  awk '
    /^## \[Unreleased\]/ { in_unreleased=1; next }
    /^## \[/ && in_unreleased { in_unreleased=0 }
    in_unreleased { print }
  ' "$CHANGELOG_FILE"
)"

unreleased_added_count="$(
  printf '%s\n' "$unreleased_block" | grep -E '^[[:space:]]*-[[:space:]]+' | wc -l | tr -d ' '
)"

if [[ "$unreleased_added_count" -lt 1 ]]; then
  echo "CHANGELOG.md Unreleased section must contain at least one bullet."
  exit 1
fi

# C15-F16 strengthening: reject the literal "(No entries yet" placeholder so
# the AGENTS rule ("Every completed change must have an entry in `Unreleased`")
# is enforced for non-`feat(` commits too. Layer-2 below only fires for
# `feat(` commits; without this layer-1 tightening, a `docs(` or `fix(`
# landing can satisfy the gate by leaving the placeholder bullet untouched.
if printf '%s\n' "$unreleased_block" | grep -qF '(No entries yet'; then
  echo "ERROR: CHANGELOG.md [Unreleased] still contains the '(No entries yet' placeholder bullet." >&2
  echo "       Replace it with a real entry describing the change you just landed." >&2
  exit 1
fi

# Layer 2: feat( coverage since the most recent released version.
#
# Find the most recent released tag heading (e.g., `## [0.4.0]`); resolve the
# matching git tag (`v0.4.0`); list `feat(` commits since that tag; for each,
# extract the subject after `):` and assert at least one distinctive keyword
# appears in the [Unreleased] block. Skipped silently when:
#   - we are not in a git checkout (CI tarballs)
#   - the tag is not present (shallow clone)
# so the gate stays green in those edge cases without false-positives.
if ! command -v git >/dev/null 2>&1; then
  exit 0
fi
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

latest_release_heading="$(grep -m1 -E '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$CHANGELOG_FILE" || true)"
if [[ -z "$latest_release_heading" ]]; then
  exit 0
fi
# Extract the X.Y.Z between brackets.
released_version="$(printf '%s\n' "$latest_release_heading" | sed -E 's/^## \[([0-9]+\.[0-9]+\.[0-9]+)\].*/\1/')"
released_tag="v${released_version}"
if ! git rev-parse "$released_tag" >/dev/null 2>&1; then
  exit 0
fi

# Lower-case a copy of the unreleased block once for keyword matching.
unreleased_lc="$(printf '%s\n' "$unreleased_block" | tr '[:upper:]' '[:lower:]')"

# Stopwords to ignore when extracting topic keywords; mostly verbs / connectors
# that appear in nearly every commit subject and would falsely "match".
declare -A STOP=(
  [add]=1 [adds]=1 [added]=1 [adding]=1
  [fix]=1 [fixes]=1 [fixed]=1 [fixing]=1
  [feat]=1 [feature]=1 [chore]=1 [docs]=1 [refactor]=1 [test]=1 [perf]=1
  [the]=1 [and]=1 [for]=1 [with]=1 [from]=1 [into]=1 [over]=1
  [use]=1 [uses]=1 [using]=1 [via]=1 [per]=1
  [new]=1 [old]=1 [now]=1 [also]=1 [more]=1 [less]=1
  [allow]=1 [allows]=1 [enable]=1 [enables]=1 [disable]=1 [disables]=1
  [update]=1 [updates]=1 [updated]=1 [updating]=1
  [make]=1 [makes]=1 [made]=1 [making]=1
  [bump]=1 [bumps]=1 [bumped]=1 [bumping]=1
  [merge]=1 [merges]=1 [merged]=1 [merging]=1
  [emit]=1 [emits]=1 [emitted]=1 [return]=1 [returns]=1
  [support]=1 [supports]=1 [supported]=1
  [implement]=1 [implements]=1 [implemented]=1
  [drop]=1 [drops]=1 [dropped]=1
  [move]=1 [moves]=1 [moved]=1 [moving]=1
  [rename]=1 [renames]=1 [renamed]=1
  [introduce]=1 [introduces]=1 [introduced]=1
  [a]=1 [an]=1 [of]=1 [to]=1 [in]=1 [on]=1 [is]=1 [be]=1 [as]=1 [at]=1 [by]=1
  [or]=1 [if]=1 [it]=1 [its]=1 [this]=1 [that]=1 [these]=1 [those]=1
  # Project-name nouns: appear in nearly every changelog line and do not
  # discriminate between commits, so are useless as topic keywords.
  [ogdb]=1 [opengraphdb]=1 [core]=1 [cli]=1 [http]=1 [code]=1 [test]=1 [tests]=1
  [src]=1 [main]=1 [docs]=1 [doc]=1 [crate]=1 [crates]=1
)

failed_commits=()

# Use NUL-separated reads so multi-word subjects survive whitespace.
while IFS= read -r -d '' line; do
  sha="${line%%|*}"
  subject="${line#*|}"
  # Strip the `feat(...):` prefix to get the topic body.
  topic="$(printf '%s' "$subject" | sed -E 's/^feat(\([^)]*\))?!?:[[:space:]]*//I')"
  topic_lc="$(printf '%s\n' "$topic" | tr '[:upper:]' '[:lower:]')"
  # Tokenise on anything that's not [a-z0-9_].
  matched=0
  for token in $(printf '%s\n' "$topic_lc" | tr -c 'a-z0-9_' ' '); do
    [[ ${#token} -lt 4 ]] && continue
    [[ -n "${STOP[$token]:-}" ]] && continue
    if printf '%s\n' "$unreleased_lc" | grep -qF -- "$token"; then
      matched=1
      break
    fi
  done
  if [[ "$matched" -eq 0 ]]; then
    failed_commits+=("$sha $subject")
  fi
done < <(git log "${released_tag}..HEAD" --no-merges --format='%H|%s' -E --grep='^feat(\(|!:|:)' -z)

if [[ ${#failed_commits[@]} -gt 0 ]]; then
  echo "ERROR: ${#failed_commits[@]} feat( commit(s) since ${released_tag} have no matching keyword under [Unreleased]:" >&2
  for line in "${failed_commits[@]}"; do
    echo "  - $line" >&2
  done
  echo "" >&2
  echo "Add a bullet under '## [Unreleased]' that mentions a distinctive keyword from the commit subject." >&2
  echo "Bundled bullets are fine; one bullet covering many commits is enough as long as a token from each subject appears in the block." >&2
  exit 1
fi
