---
phase: 06-demo-datasets-and-live-backend
plan: 01
subsystem: database
tags: [datasets, import, seed-script, demo, cli]
requires:
  - phase: 05-frontend-polish-and-showcase
    provides: polished UI surfaces that now need realistic backend data
provides:
  - production demo JSON import datasets for movies/social/fraud domains
  - idempotent seed script for local live-backend demo setup
  - regression tests validating dataset integrity and seeding behavior
affects: [playground, backend-import, demo-workflow, developer-experience]
tech-stack:
  added: [JSON import datasets, bash seed script]
  patterns: [idempotent seed reset-and-reload, dataset ID range partitioning]
key-files:
  created:
    - datasets/movies.json
    - datasets/social.json
    - datasets/fraud.json
    - scripts/seed-demo.sh
    - crates/ogdb-cli/tests/demo_datasets_seed.rs
    - .planning/phases/06-demo-datasets-and-live-backend/06-01-SUMMARY.md
  modified:
    - .gitignore
    - CHANGELOG.md
    - docs/IMPLEMENTATION-LOG.md
key-decisions:
  - "Used non-overlapping numeric ID ranges per dataset domain to keep imports deterministic."
  - "Implemented seed as delete+init+import sequence for guaranteed idempotent fresh starts."
  - "Used scalar ACTED_IN role values due current importer array semantics (arrays map to numeric vectors only)."
patterns-established:
  - "Demo datasets are stored as import-ready JSON payloads in datasets/ and loaded solely via CLI import."
  - "Seed scripts should support OGDB_BIN and OGDB_DEMO_DB overrides for local/CI portability."
requirements-completed: [DEMO-03, DEMO-04]
duration: 2h 10m
completed: 2026-03-01
---

# Phase 6 Plan 01 Summary

**Shipped three realistic, import-ready demo graph datasets plus an idempotent seed workflow that populates a live OpenGraphDB instance in one command.**

## Performance

- **Duration:** 2h 10m
- **Started:** 2026-03-01T13:54:00Z
- **Completed:** 2026-03-01T16:04:12Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Created a flagship movies graph dataset with real titles/actors/directors and rich relationship structure.
- Expanded social and fraud datasets to production demo scale with traversal-friendly and anomaly-friendly patterns.
- Added and validated an executable idempotent seed script for repeatable live backend demos.
- Added automated CLI integration tests to prevent regressions in dataset format/range/seed behavior.

## Task Commits

No task commits were created in this execution.

## Files Created/Modified

- `datasets/movies.json` - 262-node movie/person/genre import graph with `ACTED_IN`, `DIRECTED`, `WROTE`, `IN_GENRE` edges.
- `datasets/social.json` - 280-node social network import graph with dense follow/content/group relationships.
- `datasets/fraud.json` - 140-node fraud domain graph with account/device/IP sharing and flagged transaction links.
- `scripts/seed-demo.sh` - idempotent seed script (`OGDB_DEMO_DB`, `OGDB_BIN`) that recreates and imports all demo datasets.
- `crates/ogdb-cli/tests/demo_datasets_seed.rs` - dataset and seed integration tests (including temp DB idempotency run).
- `.gitignore` - added `data/`.
- `CHANGELOG.md` - added Unreleased entry for this phase deliverable.
- `docs/IMPLEMENTATION-LOG.md` - logged step implementation and validation.

## Decisions Made

- Chose full-range numeric partitions per dataset (`movies: 0-261`, `social: 500-779`, `fraud: 1000+`) to keep cross-dataset IDs non-overlapping and query-friendly.
- Kept seed logic purely CLI-driven (`ogdb init` + `ogdb import`) to avoid introducing new runtime dependencies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ACTED_IN role arrays were incompatible with current JSON import parser**
- **Found during:** Task 2 (seed script execution)
- **Issue:** Import failed with `unsupported non-numeric vector property entry in import payload` for string arrays.
- **Fix:** Stored role metadata as scalar `role` string properties on `ACTED_IN` edges to maintain import compatibility.
- **Files modified:** `datasets/movies.json`
- **Verification:** Seed script completed successfully in tests and manual temp DB run.

---

**Total deviations:** 1 auto-fixed (Rule 3: blocking compatibility issue)
**Impact on plan:** Seed workflow is fully functional; role metadata remains present but encoded as scalar values instead of arrays due current importer constraints.

## Issues Encountered

- `./scripts/test.sh` fails at `cargo fmt --all --check` due pre-existing rustfmt drift in untouched workspace files.
- `./scripts/coverage.sh` executed successfully but failed strict uncovered-lines gate with current workspace baseline above configured threshold.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Demo datasets and seed script are ready for live backend integration and playground live-mode wiring.
- `./scripts/seed-demo.sh` now provides a reproducible local graph bootstrap for evaluators.

---
*Phase: 06-demo-datasets-and-live-backend*
*Completed: 2026-03-01*
