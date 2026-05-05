#!/usr/bin/env bash
# Red-green test for scripts/check-deny-expirations.sh.
# GREEN: live tree (every advisory deferral has a future re-evaluate date).
# RED:   a planted RUSTSEC ignore with an expired or missing date trips the
# gate (CYCLE3 H12 contract — every deferral carries a freshness guard).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-deny-expirations.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree should pass ---
"$GATE" "$REPO_ROOT" >/dev/null || {
  echo "test FAILED: gate reported expired deferral on a clean tree" >&2
  exit 1
}
echo "test: GREEN on clean tree (expected)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- GREEN on a fixture with a future re-evaluate date ---
cat > "$TMP/deny.toml" <<'EOF'
[advisories]
ignore = [
    { id = "RUSTSEC-2099-0001", reason = "deferred — re-evaluate by 2099-12-31." },
]
EOF
"$GATE" "$TMP" >/dev/null 2>&1 || {
  echo "test FAILED: gate flagged a 2099 future-dated deferral" >&2
  exit 1
}
echo "test: GREEN on future-dated fixture (expected)"

# --- RED on an expired date ---
cat > "$TMP/deny.toml" <<'EOF'
[advisories]
ignore = [
    { id = "RUSTSEC-2020-0001", reason = "deferred — re-evaluate by 2020-01-01." },
]
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a 2020-01-01 expired deferral" >&2
  exit 1
fi
echo "test: RED on expired deferral (expected, exit=$RC)"

# --- RED on a missing 're-evaluate by' clause ---
cat > "$TMP/deny.toml" <<'EOF'
[advisories]
ignore = [
    { id = "RUSTSEC-2025-0099", reason = "no expiration set" },
]
EOF
set +e
"$GATE" "$TMP" >/dev/null 2>&1
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag a missing 're-evaluate by' clause" >&2
  exit 1
fi
echo "test: RED on missing expiration (expected, exit=$RC)"

echo "test: PASS"
