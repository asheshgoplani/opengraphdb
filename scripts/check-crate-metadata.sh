#!/usr/bin/env bash
# Regression gate for eval/rust-quality §10 (BLOCKER B1):
# every publishable workspace crate must carry description, keywords,
# categories, and repository so `cargo publish` succeeds and the
# crates.io UX doesn't silently de-rank us. Internal harness crates
# (publish=false) are skipped.
set -euo pipefail

cargo metadata --no-deps --format-version 1 | python3 -c '
import json, sys
m = json.load(sys.stdin)
internal = {"ogdb-bench", "ogdb-e2e", "ogdb-eval", "ogdb-tck", "ogdb-fuzz"}
missing = []
for p in m["packages"]:
    if p["name"] in internal:
        continue
    fields = []
    if not p.get("description"):
        fields.append("description")
    if not p.get("keywords"):
        fields.append("keywords")
    if not p.get("categories"):
        fields.append("categories")
    if not p.get("repository"):
        fields.append("repository")
    if fields:
        missing.append((p["name"], fields))
if missing:
    print("CRATE METADATA REGRESSION:")
    for name, fields in missing:
        print(f"  {name}: missing {fields}")
    sys.exit(1)
count = sum(1 for p in m["packages"] if p["name"] not in internal)
print(f"OK: {count} publishable crates carry full crates.io metadata.")
'
