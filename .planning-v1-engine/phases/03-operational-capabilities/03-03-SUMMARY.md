# Phase 03-03 Summary: Schema Migration Command (CLI-01)

Date: 2026-02-27
Status: Completed

## Objective
Add a `migrate` CLI command to apply schema evolution scripts with dry-run preview and transactional apply semantics.

## Task 1: Core Schema Unregister APIs
Completed in `crates/ogdb-core/src/lib.rs`.

- Added:
  - `Database::unregister_schema_label(&str) -> Result<bool, DbError>`
  - `Database::unregister_schema_edge_type(&str) -> Result<bool, DbError>`
  - `Database::unregister_schema_property_key(&str) -> Result<bool, DbError>`
- Behavior:
  - returns `Ok(true)` when an existing entry is removed
  - returns `Ok(false)` when an entry is not present
  - persists metadata only when a removal occurs.

## Task 2: `migrate` Command, Parser, and Execution
Completed in `crates/ogdb-cli/src/lib.rs`.

- Added `Commands::Migrate(MigrateCommand)`:
  - `migrate <path> <script-path> [--dry-run]`
  - supports `--db <path>` fallback through existing parse-injection path handling.
- Added migration model/parsing:
  - `MigrationAction` enum
  - `parse_migration_script(...)`
  - `parse_index_target(...)`
- Supported directives:
  - `ADD LABEL <name>`
  - `DROP LABEL <name>`
  - `ADD EDGE_TYPE <name>`
  - `DROP EDGE_TYPE <name>`
  - `ADD PROPERTY_KEY <name>`
  - `DROP PROPERTY_KEY <name>`
  - `ADD INDEX ON :Label(property)`
  - `DROP INDEX ON :Label(property)`
- Dry-run mode:
  - prints each planned action prefixed with `[DRY-RUN]`
  - prints summary count (`N action(s) would be applied`).
- Apply mode:
  - executes each parsed action and prints `[APPLIED] ...`
  - prints summary count (`N action(s) applied successfully`).

## Task 3: Transactional Rollback Behavior
Completed in `crates/ogdb-cli/src/lib.rs`.

- Added migration snapshot/restore helpers for:
  - `<db>`
  - `<db>-wal`
  - `<db>-meta.json`
- Before apply, command snapshots these files.
- If any action fails, snapshots are restored and migration exits with an error.
- This provides all-or-nothing migration behavior at the CLI command level.

## Task 4: Tests
Completed in `crates/ogdb-core/src/lib.rs` and `crates/ogdb-cli/src/lib.rs`.

- Added core tests:
  - `unregister_schema_label_removes_from_registry`
  - `unregister_schema_edge_type_removes_from_registry`
  - `unregister_schema_property_key_removes_from_registry`
- Added CLI tests:
  - `migrate_dry_run_prints_planned_actions`
  - `migrate_apply_executes_all_actions`
  - `migrate_drop_operations_remove_schema_entries`
  - `migrate_invalid_directive_returns_parse_error`
  - `migrate_skips_comments_and_empty_lines`
  - `parse_migration_script_parses_all_supported_directives`
  - `parse_index_target_validates_expected_shape`
  - updated `all_path_subcommands_accept_db_without_positional_path` for `migrate --db ...`.

## Validation

- `cargo test -p ogdb-core`: pass
- `./scripts/test.sh`: pass
- `./scripts/coverage.sh`: fail (repository gate threshold)
  - thresholds: `--fail-under-lines 98`, `--fail-uncovered-lines 600`
  - observed totals: `96.34%` lines, `1553` uncovered lines

## Documentation Updates

- `CHANGELOG.md` updated under `## [Unreleased]`
- `docs/IMPLEMENTATION-LOG.md` updated with Step 062
- `.planning/phases/03-operational-capabilities/03-03-SUMMARY.md` created
