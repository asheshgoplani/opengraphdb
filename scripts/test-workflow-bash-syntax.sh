#!/usr/bin/env bash
# Regression test for EVAL-PERF-RELEASE-CYCLE15 F04 (HIGH):
# stray `done` in `.github/workflows/ci.yml` semver-checks job slipped past
# review because no gate parses the bash inside `run: |` blocks. This script
# extracts every `run: |` body from .github/workflows/*.yml via Python yaml
# and pipes each through `bash -n` (parse-only). Catches stray dones,
# mismatched fi/then, missing do, and similar structural drift at PR time.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
WORKFLOWS_DIR="$ROOT/.github/workflows"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok: $*"; }

[[ -d "$WORKFLOWS_DIR" ]] || fail "missing $WORKFLOWS_DIR"

shopt -s nullglob
WORKFLOWS=("$WORKFLOWS_DIR"/*.yml "$WORKFLOWS_DIR"/*.yaml)
shopt -u nullglob
[[ ${#WORKFLOWS[@]} -gt 0 ]] || fail "no workflow YAMLs under $WORKFLOWS_DIR"

TMPDIR_BLOCKS="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_BLOCKS"' EXIT

EXTRACTOR="$(mktemp)"
cat >"$EXTRACTOR" <<'PY'
import sys, os, yaml

workflow_path = sys.argv[1]
out_dir = sys.argv[2]
basename = os.path.basename(workflow_path)

with open(workflow_path) as f:
    doc = yaml.safe_load(f)

def emit(label, body):
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in label)
    path = os.path.join(out_dir, f"{basename}__{safe}.bash")
    with open(path, "w") as f:
        f.write(body if body.endswith("\n") else body + "\n")
    print(f"{path}\t{label}")

def walk(node, trail):
    if isinstance(node, dict):
        # A step with `run:` is a leaf for our purposes.
        if "run" in node and isinstance(node["run"], str):
            name = node.get("name") or "(unnamed)"
            label = "/".join(trail + [name])
            emit(label, node["run"])
        for k, v in node.items():
            walk(v, trail + [str(k)])
    elif isinstance(node, list):
        for i, item in enumerate(node):
            walk(item, trail + [f"[{i}]"])

walk(doc, [])
PY

FAILED=0
TOTAL=0

for wf in "${WORKFLOWS[@]}"; do
    MANIFEST="$(python3 "$EXTRACTOR" "$wf" "$TMPDIR_BLOCKS")"
    if [[ -z "$MANIFEST" ]]; then
        ok "$(basename "$wf"): no run: blocks"
        continue
    fi
    while IFS=$'\t' read -r block_path label; do
        TOTAL=$((TOTAL + 1))
        if ! err=$(bash -n "$block_path" 2>&1); then
            echo "FAIL: $(basename "$wf") :: $label" >&2
            echo "$err" | sed 's/^/      /' >&2
            FAILED=$((FAILED + 1))
        fi
    done <<<"$MANIFEST"
done

if [[ "$FAILED" -gt 0 ]]; then
    fail "$FAILED of $TOTAL run: blocks have bash syntax errors"
fi

ok "all $TOTAL run: blocks parse with bash -n"
