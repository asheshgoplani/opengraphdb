#!/usr/bin/env bash
# EVAL-PERF-RELEASE.md Finding 9 (HIGH): there is no Dockerfile in the
# repo, so the `ogdb serve --http` SaaS-sidecar use case has no
# deployment surface. This test is a structural lint — asserts the
# Dockerfile exists, is multi-stage with rust+distroless, builds the
# SPA before cargo (so include_dir! macro doesn't panic), and exposes
# the right entrypoint/port.
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
DOCKERFILE="$ROOT/Dockerfile"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok: $*"; }

[[ -f "$DOCKERFILE" ]] || fail "missing $DOCKERFILE (Finding 9)"
ok "Dockerfile present"

# Multi-stage: must have at least one `FROM ... AS build` and a runtime FROM.
build_stages=$(grep -cE '^[[:space:]]*FROM[[:space:]].*[[:space:]]AS[[:space:]]' "$DOCKERFILE" || true)
[[ "$build_stages" -ge 1 ]] || fail "Dockerfile must be multi-stage (FROM ... AS build)"
ok "Dockerfile is multi-stage ($build_stages build stage(s))"

grep -qE '^[[:space:]]*FROM[[:space:]]+rust:' "$DOCKERFILE" \
  || fail "Dockerfile must use a rust: base image for the build stage"
ok "build stage uses rust: image"

# C2-A2 (BLOCKER): the Dockerfile rust base image must satisfy the workspace
# `rust-version` MSRV. cargo ≥ 1.74 enforces rust-version as a hard error
# during `cargo build`; a stale Dockerfile breaks the release-time docker job.
ws_msrv=$(awk '
  /^\[workspace\.package\]/ { in_b = 1; next }
  /^\[/ && !/^\[workspace\.package\]/ { in_b = 0 }
  in_b && /^[[:space:]]*rust-version[[:space:]]*=/ {
    gsub(/[^0-9.]/, "")
    print
    exit
  }
' "$ROOT/Cargo.toml")
df_rust=$(grep -oE 'FROM rust:[0-9]+\.[0-9]+(\.[0-9]+)?' "$DOCKERFILE" | head -1 | sed 's/FROM rust://')
[[ -n "$ws_msrv" ]] || fail "could not parse workspace rust-version from Cargo.toml"
[[ -n "$df_rust" ]] || fail "could not parse FROM rust: tag from Dockerfile"
# Lex compare on dotted X.Y[.Z] is correct for X<10 — fine for the foreseeable future.
# Build a sortable pair: "version_to_compare\nversion_lower_bound", sort -V, take first.
lowest=$(printf '%s\n%s\n' "$df_rust" "$ws_msrv" | sort -V | head -1)
if [[ "$lowest" != "$ws_msrv" ]]; then
  fail "Dockerfile rust=$df_rust < workspace MSRV $ws_msrv (cargo will reject build)"
fi
ok "Dockerfile rust=$df_rust >= workspace MSRV $ws_msrv"

grep -qE '^[[:space:]]*FROM[[:space:]]+(gcr\.io/distroless|debian:.*-slim)' "$DOCKERFILE" \
  || fail "Dockerfile must use distroless or slim Debian for runtime"
ok "runtime stage uses distroless / debian-slim"

# SPA must be built before cargo build (include_dir! reads frontend/dist-app).
# Filter out comment lines so prose mentioning "cargo build time" doesn't fool us.
spa_line=$(grep -nE '^[[:space:]]*RUN.*npm.*(build:app|run.*build)' "$DOCKERFILE" | head -1 | cut -d: -f1 || true)
cargo_line=$(grep -nE '^[[:space:]]*RUN.*cargo[[:space:]]+build' "$DOCKERFILE" | head -1 | cut -d: -f1 || true)
[[ -n "$spa_line" && -n "$cargo_line" ]] || fail "Dockerfile must build SPA then cargo"
[[ "$spa_line" -lt "$cargo_line" ]] || fail "Dockerfile must build SPA BEFORE cargo build (include_dir! constraint)"
ok "Dockerfile builds SPA before cargo (line $spa_line < $cargo_line)"

grep -qE '^[[:space:]]*ENTRYPOINT.*ogdb' "$DOCKERFILE" \
  || fail "Dockerfile must ENTRYPOINT to /usr/local/bin/ogdb"
ok "Dockerfile ENTRYPOINT exposes ogdb"

grep -qE '^[[:space:]]*EXPOSE[[:space:]]+[0-9]+' "$DOCKERFILE" \
  || fail "Dockerfile must EXPOSE the serve port"
ok "Dockerfile exposes serve port"

echo "all Dockerfile contract checks pass"
