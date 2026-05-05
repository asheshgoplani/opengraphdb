#!/usr/bin/env bash
# Red-green test for scripts/check-benchmarks-vocabulary-mirror.sh.
# (1) Runs the gate against the live tree (expect green).
# (2) Plants a forbidden-token line into a temp copy of one mirror file
#     and confirms the gate flags it (expect red).
# (3) Plants a forbidden-token line WITH the <!-- HISTORICAL --> marker
#     and confirms the gate accepts it (expect green).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-benchmarks-vocabulary-mirror.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported HITS on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

# --- RED: planted unmarked forbidden token should fail ---
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/documentation" \
         "$TMP/skills/opengraphdb/references"
cp "$REPO_ROOT/documentation/BENCHMARKS.md"                        "$TMP/documentation/BENCHMARKS.md"
cp "$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"              "$TMP/documentation/MIGRATION-FROM-NEO4J.md"
cp "$REPO_ROOT/skills/opengraphdb/SKILL.md"                        "$TMP/skills/opengraphdb/SKILL.md"
cp "$REPO_ROOT/skills/opengraphdb/references/benchmarks-snapshot.md" \
   "$TMP/skills/opengraphdb/references/benchmarks-snapshot.md"

printf '\nDIRECTIONAL WIN — planted line for gate test.\n' \
  >> "$TMP/skills/opengraphdb/SKILL.md"

set +e
( cd "$TMP" && "$GATE" >/dev/null 2>&1 )
RC=$?
set -e

if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a planted unmarked forbidden token" >&2
  exit 1
fi
echo "test: RED on planted unmarked reference (expected, exit=$RC)"

# --- GREEN: planted forbidden token WITH HISTORICAL marker should pass ---
TMP2=$(mktemp -d)
trap 'rm -rf "$TMP" "$TMP2"' EXIT

mkdir -p "$TMP2/documentation" \
         "$TMP2/skills/opengraphdb/references"
cp "$REPO_ROOT/documentation/BENCHMARKS.md"                        "$TMP2/documentation/BENCHMARKS.md"
cp "$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"              "$TMP2/documentation/MIGRATION-FROM-NEO4J.md"
cp "$REPO_ROOT/skills/opengraphdb/SKILL.md"                        "$TMP2/skills/opengraphdb/SKILL.md"
cp "$REPO_ROOT/skills/opengraphdb/references/benchmarks-snapshot.md" \
   "$TMP2/skills/opengraphdb/references/benchmarks-snapshot.md"

printf '\nPreviously this row read "DIRECTIONAL WIN" pre cycle-17. <!-- HISTORICAL -->\n' \
  >> "$TMP2/skills/opengraphdb/SKILL.md"

( cd "$TMP2" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate flagged a planted reference even with <!-- HISTORICAL --> marker" >&2
  exit 1
}
echo "test: GREEN on planted reference with HISTORICAL marker (expected)"

echo "test: PASS"
