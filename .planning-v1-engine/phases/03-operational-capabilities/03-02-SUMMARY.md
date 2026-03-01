# Phase 03-02 Summary: All-or-Nothing Bulk Import (IMEX-01)

Date: 2026-02-27
Status: Completed

## Objective
Add all-or-nothing bulk import mode so `import`/`import-rdf` can roll back the entire import when any record fails.

## Task 1: CLI Flags and Wiring
Completed in `crates/ogdb-cli/src/lib.rs`.

- Added `--atomic` to:
  - `ImportCommand`
  - `ImportRdfCommand`
- Enforced mutual exclusion with `--continue-on-error` via clap `conflicts_with`.
- Wired atomic flag through command dispatch to import handlers.
- Refactored RDF handler signature to avoid clippy `too_many_arguments`:
  - introduced `ImportRdfOptions`
  - `handle_import_rdf(db_path, src_path, options)`

## Task 2: Atomic Transaction Semantics in ImportBatcher
Completed in `crates/ogdb-cli/src/lib.rs`.

- Added `atomic_mode` to `ImportBatcher`.
- Added constructor variant `ImportBatcher::new_with_mode(...)`.
- Changed `push()` behavior:
  - non-atomic: unchanged batch-size flushing
  - atomic: defer all flushes until `finish()`
- Kept rollback mechanism on existing transaction semantics:
  - if `flush()` returns `Err` before `commit()`, `WriteTransaction` drops and rolls back
- Added explicit atomic failure message in `flush()`:
  - `atomic import rolled back: record N failed: ...`

## Task 3: Tests
Completed in `crates/ogdb-cli/src/lib.rs`.

Added tests:
- `import_atomic_valid_data_commits_single_batch`
- `import_atomic_corrupt_record_rolls_back_all`
- `import_atomic_conflicts_with_continue_on_error`
- `import_non_atomic_default_behavior_is_unchanged`
- `import_rdf_atomic_imports_in_single_batch`
- Updated `rdf_commands_validate_usage_and_format_resolution` with atomic conflict assertion.

Coverage of required truths:
- atomic import succeeds and commits once with valid input
- atomic import failure leaves database unchanged
- atomic and continue-on-error are rejected together
- default non-atomic behavior remains unchanged
- RDF import supports atomic mode

## Validation

- `cargo test -p ogdb-cli` (pass)
- `cargo test -p ogdb-core` (pass)
- `./scripts/test.sh` (pass)
- `./scripts/coverage.sh` (fails repo gate)
  - thresholds: `--fail-under-lines 98`, `--fail-uncovered-lines 600`
  - observed totals: `96.51%` lines, `1462` uncovered lines

## Documentation Updates

- `CHANGELOG.md` updated under `## [Unreleased]`.
- `docs/IMPLEMENTATION-LOG.md` updated with Step 061 entry.
