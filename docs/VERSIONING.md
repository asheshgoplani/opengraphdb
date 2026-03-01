# Versioning Policy

This document defines OpenGraphDB versioning and release discipline.

## Source of Truth

- Project version is centralized in `/Users/ashesh/opengraphdb/Cargo.toml` under `[workspace.package].version`.
- Crates must inherit version from workspace metadata (`version.workspace = true`).

## Scheme

- Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`.
- Pre-release tags may be used when needed: `MAJOR.MINOR.PATCH-alpha.N`, `beta.N`, `rc.N`.

## Bump Rules

- MAJOR: breaking user-visible behavior, incompatible storage format, incompatible API.
- MINOR: backward-compatible feature additions.
- PATCH: backward-compatible bug fixes or internal improvements.

## Release Checklist

1. All tests pass: `./scripts/test.sh`.
2. Coverage gate passes for active implementation crates: `./scripts/coverage.sh`.
3. `CHANGELOG.md`:
   - move entries from `Unreleased` into a new `## [X.Y.Z] - YYYY-MM-DD` section
   - reset `Unreleased` with fresh headings
4. Update `[workspace.package].version` in `Cargo.toml`.
5. Add a matching git tag: `vX.Y.Z`.

## Day-to-Day Rule

Every completed change must add or update an item under `## [Unreleased]` in `CHANGELOG.md`.
