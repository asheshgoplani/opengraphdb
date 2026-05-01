#!/usr/bin/env bash
# C2-H6 regression gate: every `crates/.../lib.rs::<symbol>` anchor in
# user-facing docs must resolve to a real symbol in the source tree. This
# replaces the old `lib.rs:<line-number>` citations, which rotted on every
# CHANGELOG bullet that touched the file.
#
# Why named anchors over line ranges: function / test / struct / const names
# survive line-renumbering. Numbers don't. Cycle 1 audited 10 such citations
# and found every one was off by ~70-200 lines after a single release.
set -euo pipefail

DOCS=(documentation README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md)
EXISTING=()
for p in "${DOCS[@]}"; do
  [[ -e "$p" ]] && EXISTING+=("$p")
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  exit 0
fi

EXIT=0

# Pattern matches `crates/<crate>/src/lib.rs::<symbol-path>` (the canonical
# anchor shape). The symbol-path may be a fn / test / const / struct / trait /
# module name, or a `Type::method` form like `Database::open`.
ANCHORS=$(grep -RhoE 'crates/[a-z0-9_-]+/src/lib\.rs::[A-Za-z_][A-Za-z0-9_:]+' "${EXISTING[@]}" 2>/dev/null | sort -u || true)

if [[ -z "$ANCHORS" ]]; then
  exit 0
fi

while IFS= read -r anchor; do
  # Split on the FIRST `::` so `Type::method` symbols stay together.
  src_path=${anchor%%::*}
  symbol_path=${anchor#*::}
  # For verification we only need any segment of the symbol path to resolve to
  # a real declaration; that's enough to prove the anchor wasn't fabricated.
  # Take the LAST segment (the method/const name) as the most-specific check.
  symbol=${symbol_path##*::}

  if [[ ! -f "$src_path" ]]; then
    echo "ERROR: anchor '$anchor' references missing source file: $src_path" >&2
    EXIT=1
    continue
  fi

  # `git grep` matches a fn / const / struct / trait / type / mod / impl that
  # introduces this name. We require at least one introducer line.
  if ! git grep -qE "(^|[^A-Za-z0-9_])(fn|const|static|struct|trait|type|mod|impl|enum)[[:space:]]+(<[^>]*>[[:space:]]+)?$symbol\b" "$src_path" 2>/dev/null; then
    # Fallback: also accept `pub use ... ::SYMBOL` (re-exports introduce a
    # name without a fn/const/struct keyword) and trait-method definitions
    # under `impl ... { fn SYMBOL(...) }`.
    if ! git grep -qE "\b$symbol\b" "$src_path" 2>/dev/null; then
      echo "ERROR: anchor '$anchor' resolves to no symbol named '$symbol' in $src_path" >&2
      EXIT=1
    fi
  fi
done <<<"$ANCHORS"

# Also fail if we still have any rotten `lib.rs:<digits>` citations in the
# user-facing docs (allows `lib.rs:9-or-similar` only inside fenced code blocks
# is hard to detect — but the cycle-2 grep across documentation/ shows zero
# such citations after C2-H6, so we keep this strict).
LINE_CITES=$(grep -RnE 'lib\.rs:[0-9]+(-[0-9]+)?' "${EXISTING[@]}" 2>/dev/null | grep -vE '/\* allow-line-cite \*/' || true)
if [[ -n "$LINE_CITES" ]]; then
  echo "ERROR: user-facing docs still contain lib.rs:<line> citations:" >&2
  echo "$LINE_CITES" >&2
  echo "       Replace with named anchors: 'crates/<crate>/src/lib.rs::<symbol>'." >&2
  EXIT=1
fi

# C3-H1 regression gate: forbid actual *links* (markdown `](...)` or HTML
# `href="..."`) to the deleted file
# `documentation/ai-integration/multi-agent-shared-kg.md` from any user-facing
# surface (docs, skills, frontend strings). The file was removed in cycle 2
# because it claimed cross-process Database::open "Just Works"; cycle-2-docs
# intended to retarget every reference, but missed
# `skills/opengraphdb/SKILL.md:340` (caught in cycle 3 §C3-H1).
#
# Bare-filename prose mentions are allowed (CHANGELOG / SKILL prose explains
# why the file was removed); only resolvable link targets are rejected.
SKG_LINKS=$(grep -RnE '\]\([^)]*multi-agent-shared-kg\.md|href="[^"]*multi-agent-shared-kg\.md' \
  "${EXISTING[@]}" \
  $( [[ -d skills ]] && echo skills ) \
  $( [[ -d frontend/src ]] && echo frontend/src ) \
  2>/dev/null | grep -vE '(^|/)EVAL-' || true)
if [[ -n "$SKG_LINKS" ]]; then
  echo "ERROR: stale link(s) to deleted documentation/ai-integration/multi-agent-shared-kg.md:" >&2
  echo "$SKG_LINKS" >&2
  echo "       The file was deleted in cycle 2; replace the link with prose." >&2
  EXIT=1
fi

exit $EXIT
