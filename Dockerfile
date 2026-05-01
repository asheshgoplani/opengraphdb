# EVAL-PERF-RELEASE.md Finding 9 (HIGH): multi-stage distroless build for
# the `ogdb serve --http` SaaS-sidecar use case. Produces a ~30 MB image
# that ships only the static binary + runtime deps (libgcc), no shell, no
# package manager, no toolchain.
#
# Build:    docker build -t opengraphdb:0.4.0 .
# Run:      docker run -p 8080:8080 -v $(pwd)/data:/data opengraphdb:0.4.0
# CI/CD:    .github/workflows/release.yml builds + pushes to ghcr.io on v* tag.

# ---- Stage 1: build the SPA (frontend/dist-app/ is read by include_dir!
#               at cargo build time, so it MUST exist before cargo runs).
FROM node:20-bookworm-slim AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build:app

# ---- Stage 2: build the cargo release binary.
# C2-A2 (BLOCKER): the workspace declares `rust-version = "1.88"` in
# Cargo.toml; rustc < 1.88 hard-fails. Keep this in sync with the workspace
# MSRV — `scripts/test-dockerfile.sh` enforces the cross-check.
FROM rust:1.88-bookworm AS build
WORKDIR /src
COPY . .
COPY --from=frontend /src/frontend/dist-app ./frontend/dist-app
RUN cargo build --release --locked -p ogdb-cli

# ---- Stage 3: distroless runtime. distroless/cc-debian12 ships glibc +
#               libgcc but no shell — small, audit-friendly attack surface.
FROM gcr.io/distroless/cc-debian12 AS runtime
COPY --from=build /src/target/release/ogdb /usr/local/bin/ogdb
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/ogdb"]
CMD ["serve", "--http", "0.0.0.0:8080", "/data/db.ogdb"]
