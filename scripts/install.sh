#!/usr/bin/env sh
# OpenGraphDB one-line installer.
#   curl -fsSL https://github.com/asheshgoplani/opengraphdb/releases/latest/download/install.sh | sh
#
# Detects OS + arch (Linux/macOS/Windows-msys/cygwin, x86_64/aarch64/arm64),
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
  # Release artefact names are produced by `scripts/release.sh` and follow
  # `ogdb-<version>-<rust-target-triple>.{tar.xz,zip}` (matching the rustc
  # target triples in `.github/workflows/release.yml::build.matrix`). Keep
  # this table in sync with that matrix; otherwise the curl below 404s.
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  case "$os" in
    linux*)
      case "$arch" in
        x86_64|amd64)         target="x86_64-unknown-linux-gnu"  ;;
        aarch64|arm64)        target="aarch64-unknown-linux-gnu" ;;
        *) c_red "unsupported linux arch: $arch"; exit 1 ;;
      esac
      ext="tar.xz"
      ;;
    darwin*)
      case "$arch" in
        x86_64|amd64)         target="x86_64-apple-darwin"  ;;
        aarch64|arm64)        target="aarch64-apple-darwin" ;;
        *) c_red "unsupported darwin arch: $arch"; exit 1 ;;
      esac
      ext="tar.xz"
      ;;
    msys*|mingw*|cygwin*)
      case "$arch" in
        x86_64|amd64)         target="x86_64-pc-windows-msvc" ;;
        *) c_red "unsupported windows arch: $arch"; exit 1 ;;
      esac
      ext="zip"
      ;;
    *) c_red "unsupported os: $os"; exit 1 ;;
  esac
  printf '%s|%s' "$target" "$ext"
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

# Resolve the literal version string from "latest" → "0.5.1" so downstream
# asset URLs interpolate to `ogdb-0.5.1-<target>.<ext>`. Without this the
# `releases/latest/download/...` redirect form ships the asset under its
# real name at the redirect target — but the local `mktemp` path uses the
# templated name, and the extract step needs the resolved version too. We
# resolve once, up front, and use the same string everywhere.
resolve_version() {
  if [ "$OGDB_VERSION" != "latest" ]; then
    # strip optional leading 'v' so callers can pass either v0.5.1 or 0.5.1
    case "$OGDB_VERSION" in
      v*) printf '%s' "${OGDB_VERSION#v}" ;;
      *)  printf '%s' "$OGDB_VERSION"      ;;
    esac
    return
  fi
  if command -v gh >/dev/null 2>&1; then
    tag=$(gh api "repos/${OGDB_REPO}/releases/latest" -q .tag_name 2>/dev/null || true)
  else
    tag=""
  fi
  if [ -z "$tag" ]; then
    # Fallback to the public GitHub API when `gh` is unavailable. The
    # API returns JSON; grep + sed extracts `"tag_name": "v0.5.1"` →
    # `v0.5.1` without needing jq.
    api_url="https://api.github.com/repos/${OGDB_REPO}/releases/latest"
    if command -v curl >/dev/null 2>&1; then
      tag=$(curl --fail -sSL "$api_url" 2>/dev/null \
        | grep -E '"tag_name"' | head -n1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)
    elif command -v wget >/dev/null 2>&1; then
      tag=$(wget -qO- "$api_url" 2>/dev/null \
        | grep -E '"tag_name"' | head -n1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)
    fi
  fi
  if [ -z "$tag" ]; then
    c_red "could not resolve latest release tag for ${OGDB_REPO}; set OGDB_VERSION=v0.5.1 (or similar) to bypass"
    exit 1
  fi
  printf '%s' "${tag#v}"
}

download() {
  url="$1"; dest="$2"
  # --fail makes curl exit non-zero on HTTP >= 400 (otherwise a 404 body
  # gets written to disk and the script proceeds as if the download
  # succeeded — exactly the silent-success bug the v0.5.0 install hit).
  if command -v curl >/dev/null 2>&1; then
    curl --fail -sSL "$url" -o "$dest"
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
  resolved_version=$(resolve_version)
  triple_ext=$(detect_target)
  target=${triple_ext%|*}
  ext=${triple_ext#*|}
  asset_name="ogdb-${resolved_version}-${target}.${ext}"
  url="https://github.com/${OGDB_REPO}/releases/download/v${resolved_version}/${asset_name}"

  bin_dir=$(pick_bin_dir)
  mkdir -p "$bin_dir"
  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t ogdb)
  trap 'rm -rf "$tmp"' EXIT

  c_grn "downloading $url"
  if ! download "$url" "$tmp/$asset_name"; then
    c_red "download failed: $url"
    exit 1
  fi

  case "$asset_name" in
    *.tar.xz) need tar; tar -xJf "$tmp/$asset_name" -C "$tmp" ;;
    *.tar.gz) need tar; tar -xzf "$tmp/$asset_name" -C "$tmp" ;;
    *.zip)    need unzip; unzip -q "$tmp/$asset_name" -d "$tmp" ;;
    *) c_red "unrecognised archive extension: $asset_name"; exit 1 ;;
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
  c_grn "installed $bin_dir/$bin_name (v${resolved_version})"
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
