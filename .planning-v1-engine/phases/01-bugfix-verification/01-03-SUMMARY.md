# 01-03 Summary (Release Gate: BUG-01..BUG-15)

## Task 1: Full workspace suite + static checks

### Commands run
- `cargo fmt --all --check`
- `cargo check --workspace`
- `cargo clippy --workspace -- -D warnings`
- `cargo test --workspace --all-targets`
- `cargo test --workspace`

### Results
- Formatting: pass
- Workspace compile: pass
- Clippy (`-D warnings`): pass
- Full workspace tests: pass (`0 failed`)
- Aggregated workspace totals from the full run: `512 passed`, `0 failed`, `2 ignored`

### BUG-specific confirmation commands
All 15 required selector runs passed:
- `ogdb-core`: inline MATCH properties, projection disambiguation, CREATE INDEX ON, built-in shortest path/indexes CALL, fulltext CALL forms, relationship null projection, numeric ORDER BY, REMOVE, CREATE INDEX FOR
- `ogdb-cli`: `--db` fallback, query format parsing, CALL routing, import missing-db message, serve single request/startup path, serve bind-default resolution

## Task 2: CHANGELOG release split + workspace version bump

### Files changed
- `CHANGELOG.md`
- `Cargo.toml`

### What changed
- Moved all previously unreleased entries into:
  - `## [0.2.0] - 2026-02-27`
- Kept `## [Unreleased]` with current bullet content.
- Updated reference links:
  - `[Unreleased]` now compares from `v0.2.0...HEAD`
  - Added `[0.2.0]` compare link (`v0.1.0...v0.2.0`)
  - Kept `[0.1.0]` release tag link
- Bumped root workspace version in `[workspace.package]`:
  - `version = "0.2.0"`

### Validation
- `./scripts/changelog-check.sh`: pass
- `cargo check --workspace`: pass

## Task 3: End-to-end pipeline + coverage gate

### Commands run
- `./scripts/test.sh`
- `./scripts/coverage.sh`

### Results
- `./scripts/test.sh`: pass (includes changelog check, workflow check, fmt, check, clippy, full workspace tests)
- `./scripts/coverage.sh`: pass
  - Total line coverage: `98.03%`

## Gap encountered and closure

### Workflow-check false positive after release split
- Symptom:
  - `./scripts/test.sh` initially failed at `scripts/workflow-check.sh` with:
    - `implementation steps (51) exceed changelog Unreleased bullets (1)`
- Cause:
  - The check only compared implementation-log step count against `Unreleased` bullets, which is not release-aware once entries are moved into a versioned release section.
- Fix:
  - Updated `scripts/workflow-check.sh` to compare implementation steps against total changelog bullet history (released + unreleased), while still requiring at least one `Unreleased` bullet.
- Added changelog entry in `Unreleased` documenting this behavior change.

## Final release-gate state
- All BUG-01..BUG-15 regressions confirmed green.
- Full workspace static checks and tests are green.
- `CHANGELOG.md` contains `## [0.2.0] - 2026-02-27` and retained `## [Unreleased]`.
- Workspace version is `0.2.0` in root `Cargo.toml`.
- End-to-end validation and coverage gates pass.
- No git tag was created in this step.
