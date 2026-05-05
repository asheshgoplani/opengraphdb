#!/usr/bin/env bash
# EVAL-DOCS-COMPLETENESS-CYCLE18.md F01 (HIGH): scripts/install.sh creates
# the post-install demo database at "$OGDB_HOME/demo.ogdb". `ogdb demo`
# without a path argument falls through to
# `crates/ogdb-cli/src/lib.rs::default_demo_db_path()`. If those two paths
# disagree, the install.sh banner ("run `ogdb demo` to load MovieLens")
# silently sends the user to a different database file from the one
# install.sh just created — the user-visible bug cycle-17's 91ee552
# correction left in place.
#
# This is a structural gate: parse the literal default path out of each
# source and assert they normalize to the same `$HOME-relative` directory.
# The gate is intentionally conservative — it only checks the directory,
# not the filename, since `default_demo_db_path()` hard-codes
# `demo.ogdb` and install.sh's `bootstrap_demo` writes the same filename
# beneath `$OGDB_HOME`.
#
# Usage: bash scripts/check-install-demo-path-matches-binary-default.sh [<repo-root>]
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
INSTALL_SH="$ROOT/scripts/install.sh"
LIB_RS="$ROOT/crates/ogdb-cli/src/lib.rs"

if [[ ! -f "$INSTALL_SH" ]]; then
  echo "check-install-demo-path-matches-binary-default: missing $INSTALL_SH" >&2
  exit 2
fi
if [[ ! -f "$LIB_RS" ]]; then
  echo "check-install-demo-path-matches-binary-default: missing $LIB_RS" >&2
  exit 2
fi

# Parse the install.sh OGDB_HOME default. Accepts forms like
#   OGDB_HOME="${OGDB_HOME:-$HOME/.ogdb}"
#   OGDB_HOME=${OGDB_HOME:-$HOME/.ogdb}
# The captured group is the dir-name beneath $HOME (e.g. ".ogdb").
# `|| true` swallows grep's exit-1 when the pattern doesn't match; we
# detect the no-match case below by checking for an empty result, so a
# malformed input surfaces as exit 2 (config error) rather than exit 1
# (gate violation).
INSTALL_DIR=$( { grep -oE 'OGDB_HOME="?\$\{OGDB_HOME:-\$HOME/[^}"]+' "$INSTALL_SH" || true; } \
              | head -n1 \
              | sed -E 's|.*\$HOME/||')

if [[ -z "$INSTALL_DIR" ]]; then
  echo "check-install-demo-path-matches-binary-default: could not parse OGDB_HOME default from $INSTALL_SH" >&2
  exit 2
fi

# Parse the binary default — `default_demo_db_path` returns
# `format!("{home}/.ogdb/demo.ogdb")`. Capture the dir between `{home}/`
# and `/demo.ogdb`. Same `|| true` shape as install.sh parse above.
BINARY_DIR=$( { grep -oE 'format!\("\{home\}/[^"]+/demo\.ogdb' "$LIB_RS" || true; } \
             | head -n1 \
             | sed -E 's|.*\{home\}/||; s|/demo\.ogdb$||')

if [[ -z "$BINARY_DIR" ]]; then
  echo "check-install-demo-path-matches-binary-default: could not parse default_demo_db_path from $LIB_RS" >&2
  exit 2
fi

if [[ "$INSTALL_DIR" != "$BINARY_DIR" ]]; then
  echo "ERROR: install.sh OGDB_HOME default (\$HOME/$INSTALL_DIR) does not match the binary's default_demo_db_path (\$HOME/$BINARY_DIR/demo.ogdb)." >&2
  echo "  scripts/install.sh:        \$HOME/$INSTALL_DIR" >&2
  echo "  crates/ogdb-cli/src/lib.rs: \$HOME/$BINARY_DIR" >&2
  echo "  When these diverge, the install.sh banner promise ('run \`ogdb demo\` to load MovieLens') silently targets a different file from the one install.sh creates." >&2
  exit 1
fi

echo "check-install-demo-path-matches-binary-default: ok (install.sh OGDB_HOME=\$HOME/$INSTALL_DIR == binary default \$HOME/$BINARY_DIR/demo.ogdb)"
exit 0
