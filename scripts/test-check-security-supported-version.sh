#!/usr/bin/env bash
# Regression test for scripts/check-security-supported-version.sh — the
# EVAL-DOCS-COMPLETENESS-CYCLE15.md F01 CI gate. Verifies (a) matching
# minors pass, (b) drifted minors fail, (c) missing supported row fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/check-security-supported-version.sh"

if [[ ! -f "$GATE" ]]; then
  echo "test: $GATE missing" >&2
  exit 2
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

write_cargo() {
  cat > "$TMPDIR/Cargo.toml" <<EOF
[workspace]
members = ["x"]
[workspace.package]
version = "$1"
edition = "2021"
EOF
}

write_security() {
  local supported_minor="$1"
  cat > "$TMPDIR/SECURITY.md" <<EOF
# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| ${supported_minor}.x   | ✅        |
| < ${supported_minor}.0 | ❌        |
EOF
}

# Case 1: matching minors → exit 0
write_cargo "0.5.1"
write_security "0.5"

if ! bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 1: matching minors should pass" >&2
  exit 1
fi
echo "ok case 1: matching minors (workspace=0.5.1, supported=0.5.x) → pass"

# Case 2: drifted minors → exit non-zero (the bug F01 documents)
write_cargo "0.5.1"
write_security "0.4"

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 2: drifted minors should fail" >&2
  exit 1
fi
echo "ok case 2: drifted minors (workspace=0.5.1, supported=0.4.x) → fail"

# Case 3: missing supported row → exit non-zero
cat > "$TMPDIR/SECURITY.md" <<'EOF'
# Security Policy

## Supported Versions

(no table here)
EOF

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 3: missing supported row should fail" >&2
  exit 1
fi
echo "ok case 3: missing supported row → fail"

# Case 4: workspace at 0.6.x, SECURITY.md still at 0.5.x → fail
write_cargo "0.6.0"
write_security "0.5"

if bash "$GATE" "$TMPDIR" >/dev/null 2>&1; then
  echo "FAIL case 4: workspace ahead of SECURITY.md should fail" >&2
  exit 1
fi
echo "ok case 4: workspace=0.6.0 vs supported=0.5.x → fail"

echo "all cases pass"
