#!/usr/bin/env bash
# scripts/verify-claims.sh
#
# Build-time claim verifier for OpenGraphDB's landing page.
#
# Reads .claude/release-tests.yaml, runs each frontend e2e spec listed there,
# and writes the verdict to frontend/public/claims-status.json in the shape
# consumed by <ClaimsBadge /> and /claims:
#
#   {
#     "sha":  "<short git sha>",
#     "date": "<ISO-8601 UTC>",
#     "entries": [
#       { "id": "<kebab-id>", "claim": "<one-line purpose>",
#         "status": "green" | "red",
#         "last_run": "<ISO-8601 UTC>",
#         "evidence": "<spec path or command>" },
#       ...
#     ]
#   }
#
# Exits 1 if ANY entry is red so CI can gate on it.
#
# Usage:
#   scripts/verify-claims.sh                # run all frontend e2e entries
#   scripts/verify-claims.sh --dry-run      # regenerate JSON without running tests (marks all green)
#   scripts/verify-claims.sh --ids a,b,c    # only run the listed ids

set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${ROOT}/.claude/release-tests.yaml"
OUTPUT="${ROOT}/frontend/public/claims-status.json"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "verify-claims: manifest not found at ${MANIFEST}" >&2
  exit 2
fi

DRY_RUN=0
ONLY_IDS=""
for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=1 ;;
    --ids=*)   ONLY_IDS="${arg#--ids=}" ;;
    --ids)     shift; ONLY_IDS="${1-}" ;;
    *)         echo "verify-claims: unknown arg: ${arg}" >&2; exit 2 ;;
  esac
done

SHA="$(git -C "${ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Extract executable manifest entries. Each entry becomes one claim on the
# landing page. Rust crate entries (ogdb-*) are skipped — they run under the
# workspace cargo test suite, not the landing-claim surface.
#
# EVAL-PERF-RELEASE-CYCLE16 F03: include `crate: scripts` entries in addition
# to `crate: frontend`. The cycle-15 install-sh-asset-url-template manifest
# entry pointed at scripts/test-install-detect-target.sh but the prior
# `t.get("crate") != "frontend"` filter skipped it — the manifest entry was
# documentation, not gate. Including `scripts` here mechanically runs every
# shell-script regression test the manifest references.
ENTRIES_JSON="$(
  ONLY_IDS="${ONLY_IDS}" python3 - "${MANIFEST}" <<'PY'
import json, os, sys
import yaml

with open(sys.argv[1]) as fh:
    doc = yaml.safe_load(fh) or {}
tests = doc.get("tests") or []

only = {s.strip() for s in os.environ.get("ONLY_IDS", "").split(",") if s.strip()}

# F03: frontend e2e claims + scripts/* shell regression gates.
RUNNABLE_CRATES = {"frontend", "scripts"}

out = []
for t in tests:
    if t.get("crate") not in RUNNABLE_CRATES:
        continue
    tid = t.get("id")
    if only and tid not in only:
        continue
    out.append({
        "id":       tid,
        "claim":    (t.get("purpose") or "").strip(),
        "command":  t.get("command") or "",
        "evidence": t.get("test") or t.get("command") or "",
    })
print(json.dumps(out))
PY
)"

if [[ -z "${ENTRIES_JSON}" || "${ENTRIES_JSON}" == "[]" ]]; then
  echo "verify-claims: no runnable (frontend|scripts) entries found in manifest" >&2
  exit 2
fi

# Run each entry's command, capturing status.
RESULTS_JSON='[]'
ANY_RED=0

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "verify-claims: --dry-run (skipping test execution, marking all green)"
  RESULTS_JSON="$(
    python3 - "${ENTRIES_JSON}" "${DATE}" <<'PY'
import json, sys
entries = json.loads(sys.argv[1])
date    = sys.argv[2]
out = []
for e in entries:
    out.append({
        "id":        e["id"],
        "claim":     e["claim"],
        "status":    "green",
        "last_run":  date,
        "evidence":  e["evidence"],
    })
print(json.dumps(out))
PY
  )"
else
  mapfile -t IDS  < <(python3 -c 'import json,sys; [print(e["id"])  for e in json.loads(sys.argv[1])]' "${ENTRIES_JSON}")
  mapfile -t CMDS < <(python3 -c 'import json,sys; [print(e["command"]) for e in json.loads(sys.argv[1])]' "${ENTRIES_JSON}")
  mapfile -t CLAIMS   < <(python3 -c 'import json,sys; [print(e["claim"])    for e in json.loads(sys.argv[1])]' "${ENTRIES_JSON}")
  mapfile -t EVIDENCE < <(python3 -c 'import json,sys; [print(e["evidence"]) for e in json.loads(sys.argv[1])]' "${ENTRIES_JSON}")

  RESULTS=()
  for i in "${!IDS[@]}"; do
    id="${IDS[$i]}"
    cmd="${CMDS[$i]}"
    claim="${CLAIMS[$i]}"
    ev="${EVIDENCE[$i]}"
    echo "verify-claims: [$((i+1))/${#IDS[@]}] ${id} ..."
    run_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if ( cd "${ROOT}" && bash -lc "${cmd}" ) >/dev/null 2>&1; then
      status=green
    else
      status=red
      ANY_RED=1
    fi
    echo "  -> ${status}"
    RESULTS+=("$(python3 - "${id}" "${claim}" "${status}" "${run_at}" "${ev}" <<'PY'
import json, sys
print(json.dumps({
    "id":       sys.argv[1],
    "claim":    sys.argv[2],
    "status":   sys.argv[3],
    "last_run": sys.argv[4],
    "evidence": sys.argv[5],
}))
PY
)")
  done
  RESULTS_JSON="[$(IFS=,; echo "${RESULTS[*]}")]"
fi

mkdir -p "$(dirname "${OUTPUT}")"
python3 - "${SHA}" "${DATE}" "${RESULTS_JSON}" "${OUTPUT}" <<'PY'
import json, sys
payload = {
    "sha":     sys.argv[1],
    "date":    sys.argv[2],
    "entries": json.loads(sys.argv[3]),
}
with open(sys.argv[4], "w") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")
PY

REDS="$(python3 -c 'import json,sys; print(sum(1 for e in json.loads(sys.stdin.read())["entries"] if e["status"]=="red"))' < "${OUTPUT}")"
GREENS="$(python3 -c 'import json,sys; print(sum(1 for e in json.loads(sys.stdin.read())["entries"] if e["status"]=="green"))' < "${OUTPUT}")"

echo ""
echo "verify-claims: wrote ${OUTPUT}"
echo "verify-claims: green=${GREENS} red=${REDS} sha=${SHA}"

if [[ "${ANY_RED}" -ne 0 ]]; then
  echo "verify-claims: FAIL — at least one claim is red" >&2
  exit 1
fi
exit 0
