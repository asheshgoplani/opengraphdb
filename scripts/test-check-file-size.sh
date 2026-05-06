#!/usr/bin/env bash
# Red-green meta-test for scripts/check-file-size.sh.
# GREEN: live tree passes (the two known >8k files are EXEMPTed in the gate).
# RED:   a synthetic 8001-line *.rs fixture in a sandbox repo trips the gate.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="$REPO_ROOT/scripts/check-file-size.sh"

if [[ ! -x "$GATE" ]]; then
  echo "test: $GATE is not executable" >&2
  exit 2
fi

# --- GREEN: live tree (with EXEMPT entries) should pass ---
( cd "$REPO_ROOT" && "$GATE" >/dev/null ) || {
  echo "test FAILED: gate reported on a live tree (EXEMPT not honoured?)" >&2
  exit 1
}
echo "test: GREEN on live tree (expected — exempts honoured)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts" "$TMP/src"
cp "$GATE" "$TMP/scripts/check-file-size.sh"
chmod +x "$TMP/scripts/check-file-size.sh"

cd "$TMP"
git init -q
git config user.email "test@example.com"
git config user.name "test"

# A small *.rs that should NOT trip the cap.
cat > "$TMP/src/small.rs" <<'EOF'
// well under cap
fn main() {}
EOF
git add scripts/check-file-size.sh src/small.rs
git commit -qm "initial sandbox"

# GREEN: small file → no trip
( cd "$TMP" && "$TMP/scripts/check-file-size.sh" >/dev/null ) || {
  echo "test FAILED: sandbox green path failed before planting" >&2
  exit 1
}
echo "test: GREEN on small fixture (expected)"

# RED: 8001-line synthetic *.rs (NOT in EXEMPT list).
{
  echo '// synthetic oversize fixture'
  for i in $(seq 1 8000); do echo "// line $i"; done
} > "$TMP/src/oversize.rs"
git add src/oversize.rs
git commit -qm "plant oversize *.rs"

# Sanity: confirm it's actually 8001 lines.
got=$(wc -l < "$TMP/src/oversize.rs")
if (( got != 8001 )); then
  echo "test FAILED: synthetic fixture is $got lines, expected 8001" >&2
  exit 1
fi

set +e
( cd "$TMP" && "$TMP/scripts/check-file-size.sh" >/dev/null 2>&1 )
RC=$?
set -e
if [[ $RC -eq 0 ]]; then
  echo "test FAILED: gate did not flag an 8001-line *.rs file" >&2
  exit 1
fi
echo "test: RED on planted 8001-line *.rs (expected, exit=$RC)"

echo "test: PASS"
