#!/usr/bin/env sh
# OpenGraphDB one-line installer.
#   curl -fsSL https://opengraphdb.com/install.sh | sh
#
# Detects OS + arch (Linux/macOS/Windows-WSL/cygwin/msys, x86_64/aarch64/arm64),
# downloads the matching prebuilt binary from GitHub Releases, installs it to
# ~/.local/bin/ogdb (or /usr/local/bin/ogdb if writeable), and runs
# `ogdb init --agent` so the user's coding agent is wired up in one shot.
#
# Idempotent: re-running upgrades cleanly. Safe with `set -eu`.
# Env overrides: OGDB_VERSION, OGDB_BIN_DIR, OGDB_HOME, OGDB_REPO, OGDB_PORT,
# OGDB_SKIP_AGENT.

set -eu

OGDB_VERSION="${OGDB_VERSION:-latest}"
OGDB_HOME="${OGDB_HOME:-$HOME/.opengraphdb}"
OGDB_REPO="${OGDB_REPO:-asheshgoplani/opengraphdb}"
OGDB_PORT="${OGDB_PORT:-8765}"
OGDB_SKIP_AGENT="${OGDB_SKIP_AGENT:-}"

c_grn() { printf '\033[1;32m%s\033[0m\n' "$1"; }
c_yel() { printf '\033[1;33m%s\033[0m\n' "$1"; }
c_red() { printf '\033[1;31m%s\033[0m\n' "$1" >&2; }
need()  { command -v "$1" >/dev/null 2>&1 || { c_red "missing required tool: $1"; exit 1; }; }

need uname

detect_target() {
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  ext="tar.gz"
  case "$os" in
    linux*)                     os_id="linux";   ext="tar.gz" ;;
    darwin*)                    os_id="macos";   ext="tar.gz" ;;
    msys*|mingw*|cygwin*)       os_id="windows"; ext="zip" ;;
    *) c_red "unsupported os: $os"; exit 1 ;;
  esac
  case "$arch" in
    x86_64|amd64)               arch_id="x86_64" ;;
    aarch64|arm64)              arch_id="arm64" ;;
    *) c_red "unsupported arch: $arch"; exit 1 ;;
  esac
  printf '%s-%s.%s' "$os_id" "$arch_id" "$ext"
}

pick_bin_dir() {
  if [ -n "${OGDB_BIN_DIR:-}" ]; then
    printf '%s' "$OGDB_BIN_DIR"; return
  fi
  if [ -w /usr/local/bin ] 2>/dev/null; then
    printf '%s' "/usr/local/bin"; return
  fi
  printf '%s' "$HOME/.local/bin"
}

download() {
  url="$1"; dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    c_red "missing required tool: curl or wget"; exit 1
  fi
}

install_binary() {
  if command -v ogdb >/dev/null 2>&1 && [ "$OGDB_VERSION" = "latest" ] && [ -z "${OGDB_FORCE_REINSTALL:-}" ]; then
    c_yel "ogdb already on PATH ($(command -v ogdb)) — skipping download. (set OGDB_VERSION=x.y.z or OGDB_FORCE_REINSTALL=1 to override.)"
    return
  fi
  asset_suffix=$(detect_target)
  asset_name="ogdb-${asset_suffix}"
  if [ "$OGDB_VERSION" = "latest" ]; then
    url="https://github.com/${OGDB_REPO}/releases/latest/download/${asset_name}"
  else
    url="https://github.com/${OGDB_REPO}/releases/download/${OGDB_VERSION}/${asset_name}"
  fi

  bin_dir=$(pick_bin_dir)
  mkdir -p "$bin_dir"
  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t ogdb)
  trap 'rm -rf "$tmp"' EXIT

  c_grn "downloading $url"
  download "$url" "$tmp/$asset_name"

  case "$asset_name" in
    *.tar.gz) need tar; tar -xzf "$tmp/$asset_name" -C "$tmp" ;;
    *.zip)    need unzip; unzip -q "$tmp/$asset_name" -d "$tmp" ;;
  esac

  bin_src=$(find "$tmp" -maxdepth 3 -type f \( -name 'ogdb' -o -name 'ogdb.exe' \) | head -n1)
  if [ -z "$bin_src" ]; then
    c_red "could not find ogdb binary inside the downloaded archive"
    exit 1
  fi
  bin_name=$(basename "$bin_src")
  install -m 0755 "$bin_src" "$bin_dir/$bin_name" 2>/dev/null || cp "$bin_src" "$bin_dir/$bin_name"
  chmod +x "$bin_dir/$bin_name" 2>/dev/null || true

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) c_yel "  add \"$bin_dir\" to your PATH (or restart your shell)"; export PATH="$bin_dir:$PATH" ;;
  esac
  c_grn "installed $bin_dir/$bin_name"
}

bootstrap_demo() {
  mkdir -p "$OGDB_HOME"
  if [ ! -f "$OGDB_HOME/demo.ogdb" ]; then
    c_grn "seeding demo database at $OGDB_HOME/demo.ogdb"
    ogdb init "$OGDB_HOME/demo.ogdb" >/dev/null 2>&1 || c_yel "  (ogdb init failed; you can run it later)"
  fi
}

print_banner() {
  cat <<EOF

  OpenGraphDB is installed.

    binary      $(command -v ogdb 2>/dev/null || echo "(not on PATH yet — restart your shell)")
    database    $OGDB_HOME/demo.ogdb
    playground  http://127.0.0.1:${OGDB_PORT}/

  Try this in your coding agent next:
    > List the labels in the OpenGraphDB demo database.

  Docs: https://github.com/${OGDB_REPO}
EOF
}

main() {
  install_binary
  bootstrap_demo
  if [ -z "$OGDB_SKIP_AGENT" ]; then
    # Hand off to the Rust binary for agent detection + MCP registration +
    # skill bundle drop + background server start.
    ogdb init --agent --port "$OGDB_PORT" --db "$OGDB_HOME/demo.ogdb" "$@" || c_yel "  (ogdb init --agent exited non-zero; see above)"
  fi
  print_banner
}

main "$@"
