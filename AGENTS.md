# AGENTS Workflow Contract

This file defines non-optional delivery workflow for this repository.

## Required Process For Every Completed Change

1. Write tests first (or update failing tests first).
2. Implement the smallest change that makes tests pass.
3. Run full validation:
   - `./scripts/test.sh`
   - `./scripts/coverage.sh` (active implementation crates)
4. Update docs in the same change:
   - behavior/architecture docs if behavior changed
   - `docs/IMPLEMENTATION-LOG.md` with the completed step
5. Update `CHANGELOG.md` under `## [Unreleased]`.

No change is considered complete until all five are done.

## Versioning Rules

- Version is centralized in `/Users/ashesh/opengraphdb/Cargo.toml` under `[workspace.package].version`.
- Crates must use workspace-inherited version metadata.
- Release and bump policy is defined in `docs/VERSIONING.md`.

## Changelog Rules

- `CHANGELOG.md` is the only canonical changelog file.
- Every completed change must have an entry in `Unreleased`.
- Changelog structure is validated by `scripts/changelog-check.sh`.
- Workflow consistency (implementation log vs changelog entries) is validated by `scripts/workflow-check.sh`.

## Quality Rules

- Keep tests deterministic and non-flaky.
- Keep CLI exit codes deterministic.
- Keep docs synchronized with implemented behavior.
- CI (`.github/workflows/ci.yml`) must stay green before merge.
