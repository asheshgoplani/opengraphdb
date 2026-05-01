#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE3 H12 regression gate.
#
# Every `[[advisories.ignore]]` entry in deny.toml must carry an explicit
# `re-evaluate by YYYY-MM-DD` in its reason. This gate parses those
# dates and fails the build once today is past any of them, forcing the
# maintainer to either land the upstream fix or re-write the reason
# with a fresh expiration. cargo-deny 0.19's config schema does not yet
# support a top-level `expiration` key on ignores; once it does, this
# gate can be replaced by cargo-deny's built-in evaluator.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cfg="$ROOT/deny.toml"
[[ -f "$cfg" ]] || { echo "FAIL: deny.toml missing" >&2; exit 1; }

today=$(date -u +%Y-%m-%d)
fail=0

# Match every line declaring an ignore entry inside [advisories].ignore.
while IFS= read -r line; do
  rid=$(echo "$line" | grep -oE 'RUSTSEC-[0-9]{4}-[0-9]{4}' | head -n1)
  date=$(echo "$line" | grep -oE 're-evaluate by [0-9]{4}-[0-9]{2}-[0-9]{2}' | awk '{print $NF}')
  if [[ -z "$rid" ]]; then
    continue
  fi
  if [[ -z "$date" ]]; then
    echo "FAIL: $rid missing 're-evaluate by YYYY-MM-DD' in reason" >&2
    fail=1
    continue
  fi
  if [[ "$date" < "$today" ]]; then
    echo "FAIL: $rid expired on $date — re-evaluate the deferral or update the date" >&2
    fail=1
  else
    echo "ok: $rid review window valid until $date"
  fi
done < <(grep -E '^\s*\{\s*id\s*=\s*"RUSTSEC-' "$cfg")

exit "$fail"
