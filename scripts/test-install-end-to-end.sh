#!/usr/bin/env bash
# End-to-end test for scripts/install.sh — runs the actual installer in a
# sandboxed tempdir against a locally-built ogdb binary, asserting the
# `curl install.sh | sh` first-touch path that the v0.5.0 incident proved
# CI was not exercising.
#
# Closes coverage-audit-2026-05-05 §3 / §7 HIGH: existing
# scripts/test-install-detect-target.sh only validates the rust-target
# triple table from detect_target(); nothing actually invokes install.sh
# end-to-end. This script does, by:
#   1. Mocking curl (and gh-fallback API) so the installer "downloads" a
#      tarball that wraps the local target/release/ogdb binary.
#   2. Pointing $HOME / OGDB_HOME / OGDB_BIN_DIR at a fresh tempdir so the
#      run cannot pollute the real user environment.
#   3. Setting OGDB_SKIP_AGENT=1 to scope the assertion to install + demo
#      bootstrap; agent-registration coverage is owned by separate tests
#      (init_agent.rs unit tests + comprehensive_e2e.rs MCP path).
#
# Asserts:
#   - install.sh exits zero
#   - $OGDB_BIN_DIR/ogdb exists and is executable
#   - $OGDB_HOME/demo.ogdb exists (cycle-18 ~/.ogdb path)
#   - `ogdb --version` prints the workspace.package.version

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_SH="$ROOT/scripts/install.sh"
[ -f "$INSTALL_SH" ] || { echo "FAIL: install.sh not found at $INSTALL_SH" >&2; exit 1; }

# Locate a pre-built ogdb binary. Prefer release (matches the artefact users
# get from GitHub releases); fall back to debug. A full `cargo build` can
# take 10+ minutes on a cold cache, so the test refuses to build for itself
# and instead instructs the operator (or upstream test.sh wrapper) to do so.
BIN_REAL=""
for cand in target/release/ogdb target/debug/ogdb; do
  if [ -x "$ROOT/$cand" ]; then
    BIN_REAL="$ROOT/$cand"
    break
  fi
done
if [ -z "$BIN_REAL" ]; then
  echo "FAIL: no pre-built ogdb binary found at target/{release,debug}/ogdb" >&2
  echo "      run 'cargo build --release -p ogdb-cli' (or build debug) first" >&2
  exit 1
fi

# Workspace version is the source of truth; ogdb --version must echo it.
EXPECTED_VERSION=$(awk '
  /^\[workspace\.package\]/ { in_block=1; next }
  /^\[/ && in_block { exit }
  in_block && /^version[[:space:]]*=/ {
    match($0, /"[^"]+"/);
    print substr($0, RSTART+1, RLENGTH-2);
    exit
  }
' "$ROOT/Cargo.toml")
[ -n "$EXPECTED_VERSION" ] || { echo "FAIL: could not extract [workspace.package].version from Cargo.toml" >&2; exit 1; }

SANDBOX=$(mktemp -d -t ogdb-install-e2e-XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT

FAKE_HOME="$SANDBOX/home"
SHIM_DIR="$SANDBOX/shim"
mkdir -p "$FAKE_HOME" "$SHIM_DIR"

# curl shim. install.sh hits two URL shapes:
#   - https://api.github.com/repos/<owner>/<repo>/releases/latest  (gh-fallback in resolve_version)
#   - https://github.com/<owner>/<repo>/releases/download/v<ver>/ogdb-<ver>-<triple>.<ext>  (download)
# The shim returns a fake JSON for the first and produces a tarball wrapping
# $BIN_REAL for the second. Anything else is an unexpected URL and fails loudly.
cat >"$SHIM_DIR/curl" <<SHIM
#!/usr/bin/env bash
set -euo pipefail
url=""
dest=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    -o|--output) dest="\$2"; shift 2 ;;
    -*) shift ;;
    *) url="\$1"; shift ;;
  esac
done
case "\$url" in
  https://api.github.com/repos/*/releases/latest)
    payload='{"tag_name":"v${EXPECTED_VERSION}"}'
    if [ -n "\$dest" ]; then printf '%s' "\$payload" > "\$dest"; else printf '%s' "\$payload"; fi
    ;;
  https://github.com/*/releases/download/v*/ogdb-*.tar.xz|\
  https://github.com/*/releases/download/v*/ogdb-*.tar.gz|\
  https://github.com/*/releases/download/v*/ogdb-*.zip)
    [ -n "\$dest" ] || { echo "shim: download URL given with no -o destination" >&2; exit 1; }
    asset=\$(basename "\$url")
    work=\$(mktemp -d)
    cp "${BIN_REAL}" "\$work/ogdb"
    chmod +x "\$work/ogdb"
    case "\$asset" in
      *.tar.xz) tar -cJf "\$dest" -C "\$work" ogdb ;;
      *.tar.gz) tar -czf "\$dest" -C "\$work" ogdb ;;
      *.zip)    (cd "\$work" && zip -q "\$dest" ogdb) ;;
    esac
    rm -rf "\$work"
    ;;
  *)
    echo "shim: unexpected url for end-to-end test: \$url" >&2
    exit 1
    ;;
esac
SHIM
chmod +x "$SHIM_DIR/curl"

# Run install.sh in a tightly-scoped env. The shim PATH comes first so
# install.sh's `command -v curl` resolves to our mock; standard coreutils
# (uname / mktemp / install / tar / find / chmod / mkdir / printf / sed / grep)
# come from /usr/bin + /bin. We deliberately drop gh from PATH so resolve_version
# falls through to the curl-fallback branch, which is the public-API path the
# vast majority of installs hit.
INSTALL_LOG="$SANDBOX/install.log"
if ! env -i \
  PATH="$SHIM_DIR:/usr/bin:/bin" \
  HOME="$FAKE_HOME" \
  OGDB_HOME="$FAKE_HOME/.ogdb" \
  OGDB_BIN_DIR="$FAKE_HOME/.local/bin" \
  OGDB_VERSION="latest" \
  OGDB_REPO="asheshgoplani/opengraphdb" \
  OGDB_SKIP_AGENT=1 \
  bash "$INSTALL_SH" >"$INSTALL_LOG" 2>&1; then
  echo "FAIL: install.sh exited non-zero" >&2
  echo "--- install.log ---" >&2
  cat "$INSTALL_LOG" >&2
  exit 1
fi

# Assertions
fail=0
check() {
  local cond_desc="$1"
  shift
  if "$@"; then
    printf 'PASS: %s\n' "$cond_desc"
  else
    printf 'FAIL: %s\n' "$cond_desc"
    fail=$((fail+1))
  fi
}

INSTALLED_BIN="$FAKE_HOME/.local/bin/ogdb"
check "ogdb installed at \$HOME/.local/bin/ogdb and executable" test -x "$INSTALLED_BIN"

DEMO_DB="$FAKE_HOME/.ogdb/demo.ogdb"
check "demo.ogdb exists at \$HOME/.ogdb/demo.ogdb (cycle-18 path)" test -f "$DEMO_DB"

if [ -x "$INSTALLED_BIN" ]; then
  GOT_VERSION_LINE=$("$INSTALLED_BIN" --version 2>&1 || true)
  GOT_VERSION=$(printf '%s' "$GOT_VERSION_LINE" | awk '{print $NF}')
  if [ "$GOT_VERSION" = "$EXPECTED_VERSION" ]; then
    printf 'PASS: ogdb --version (%s) matches workspace.package.version (%s)\n' "$GOT_VERSION" "$EXPECTED_VERSION"
  else
    printf 'FAIL: ogdb --version=%q want %q  (raw: %q)\n' "$GOT_VERSION" "$EXPECTED_VERSION" "$GOT_VERSION_LINE"
    fail=$((fail+1))
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "$fail assertion(s) failed" >&2
  echo "--- install.log ---" >&2
  cat "$INSTALL_LOG" >&2
  exit 1
fi

echo ""
echo "all install end-to-end assertions pass (sandbox=$SANDBOX)"
