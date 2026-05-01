#!/usr/bin/env bash
# EVAL-RUST-QUALITY-CYCLE4 H6 + B2 regression gate.
#
# Two invariants on the workspace lint table in `Cargo.toml`:
#
# 1. H6 — `unsafe_op_in_unsafe_fn` MUST be `deny`. Cycle 3 left it at
#    `warn`, which softens the contract: under `warn`, a per-site
#    `#[allow(unsafe_op_in_unsafe_fn)]` silently disables the lint at
#    that site; under `deny`, the same allow becomes a visible diff
#    in code review.
#
# 2. B2 — every `= "allow"` line in `[workspace.lints.clippy]` must
#    appear in the inventory below. Adding a new allow forces a touch
#    of this script — exactly the code-review touchpoint cycle 3's
#    H6 patch missed (the table shipped with five allows and zero
#    enforcement). The cycle-3 `check-shipped-doc-coverage.sh`
#    discipline is the model: new exclusions go through the gate.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cfg="$ROOT/Cargo.toml"
[[ -f "$cfg" ]] || { echo "FAIL: $cfg missing" >&2; exit 1; }

# --- H6 ---
if ! grep -qE '^[[:space:]]*unsafe_op_in_unsafe_fn[[:space:]]*=[[:space:]]*"deny"' "$cfg"; then
  echo "FAIL: workspace lint 'unsafe_op_in_unsafe_fn' is not pinned to \"deny\" (CYCLE4 H6)" >&2
  exit 1
fi
echo "ok: unsafe_op_in_unsafe_fn = \"deny\" (H6)"

# --- B2 ---
# Inventory of allowed `= "allow"` lines inside [workspace.lints.*].
# Sorted by lint name. A new allow MUST be added here AND its block
# above must carry a `# EVAL-RUST-QUALITY-CYCLE<N> ratchet:` comment
# (or equivalent) explaining the deferral and its expiry.
expected=$(cat <<'EOF'
cast_possible_truncation
duplicated_attributes
only_used_in_recursion
pedantic
uninlined_format_args
EOF
)

# Extract lint names that are currently set to allow inside any
# [workspace.lints.*] section. Handles both `lint = "allow"` and
# `lint = { level = "allow", ... }` shapes.
actual=$(awk '
  /^\[workspace\.lints\./ { in_table = 1; next }
  /^\[/ && !/^\[workspace\.lints\./ { in_table = 0; next }
  in_table && /^[[:space:]]*[a-z_:]+[[:space:]]*=[[:space:]]*"allow"[[:space:]]*$/ {
    sub(/[[:space:]]*=.*/, "")
    print
  }
  in_table && /^[[:space:]]*[a-z_:]+[[:space:]]*=[[:space:]]*\{[[:space:]]*level[[:space:]]*=[[:space:]]*"allow"/ {
    sub(/[[:space:]]*=.*/, "")
    print
  }
' "$cfg" | sort -u)

# Diff actual vs expected.
unexpected=$(comm -23 <(echo "$actual") <(echo "$expected" | sort -u) || true)
missing=$(comm -13 <(echo "$actual") <(echo "$expected" | sort -u) || true)

fail=0
if [[ -n "$unexpected" ]]; then
  echo "FAIL: new \"allow\" entries in [workspace.lints.*] not in the cycle-4 inventory (B2):" >&2
  for lint in $unexpected; do
    echo "  - $lint  (add to scripts/check-workspace-lint-pins.sh inventory + paired # EVAL-RUST-QUALITY-CYCLE<N> ratchet: comment in Cargo.toml)" >&2
  done
  fail=1
fi
if [[ -n "$missing" ]]; then
  echo "FAIL: inventory expects these lints to be \"allow\" but they aren't (B2 — closed?):" >&2
  for lint in $missing; do
    echo "  - $lint  (remove from scripts/check-workspace-lint-pins.sh if intentionally tightened)" >&2
  done
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi
echo "ok: [workspace.lints.*] allows match cycle-4 inventory (B2)"
