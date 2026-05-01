#!/usr/bin/env bash
# C3-H5 regression gate: reject the fictional `opengraphdb` binary name in
# any user-facing or contributor doc. The actual binary is `ogdb` (declared
# in `crates/ogdb-cli/Cargo.toml::[[bin]] name = "ogdb"`); printing
# `opengraphdb query ...` in a doc means a new contributor copy-pasting the
# command hits `command not found: opengraphdb`. This is the same class of
# error that got `documentation/AI-NATIVE-FEATURES.md` deleted in cycle 2;
# cycle 3 found 39 occurrences in SPEC.md and 11 in DESIGN.md (§C3-H5).
#
# Allowed contexts (no false-positives):
#   - GitHub URLs:    github.com/asheshgoplani/opengraphdb
#   - Hosted domain:  opengraphdb.dev
#   - Email aliases:  [opengraphdb-security], opengraphdb-conduct@
set -euo pipefail

PATHS=(README.md SPEC.md DESIGN.md ARCHITECTURE.md CONTRIBUTING.md
       CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md AGENTS.md
       documentation docs skills)

EXISTING=()
for p in "${PATHS[@]}"; do
  [[ -e "$p" ]] && EXISTING+=("$p")
done
[[ ${#EXISTING[@]} -eq 0 ]] && exit 0

# Match `opengraphdb <subcommand>` invocations (the binary form). The trailing
# token must look like a CLI subcommand: lowercase letters / hyphens. This
# deliberately excludes `cargo add opengraphdb`, `pip install opengraphdb`,
# `import opengraphdb`, `opengraphdb.Database(...)`, etc., since none of those
# match `opengraphdb <space> <subcommand>`.
HITS=$(grep -RnE '\bopengraphdb [a-z][a-z-]+' "${EXISTING[@]}" 2>/dev/null \
  | grep -vE '(github\.com/asheshgoplani/opengraphdb|opengraphdb\.dev|opengraphdb-(security|conduct)|/EVAL-)' \
  || true)

if [[ -n "$HITS" ]]; then
  echo "ERROR: doc(s) use the fictional 'opengraphdb' binary name. The real binary is 'ogdb'." >&2
  echo "$HITS" >&2
  echo "" >&2
  echo "Replace 'opengraphdb <subcommand>' with 'ogdb <subcommand>'." >&2
  echo "(allowed exceptions: github.com/asheshgoplani/opengraphdb URLs, opengraphdb.dev, [opengraphdb-security] / opengraphdb-conduct@ aliases.)" >&2
  exit 1
fi
