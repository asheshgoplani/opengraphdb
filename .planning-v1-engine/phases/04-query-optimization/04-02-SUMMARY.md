# Phase 04-02 Summary: Factorized Intermediate Results (QOPT-02)

Date: 2026-02-27
Status: Completed

## Objective
Add factorized intermediate-result support for high fan-out Cypher expand execution so planner/executor can avoid flat intermediate blowups while preserving result correctness.

## Task 1: Factorized Data Model + Physical Plan Surface
Completed in `crates/ogdb-core/src/lib.rs`.

- Added `FACTORIZE_FAN_OUT_THRESHOLD`.
- Added factorized intermediate structs:
  - `FactorNode`
  - `FactorGroup`
  - `FactorTree`
- Added `PhysicalPlan::PhysicalFactorizedExpand` with:
  - `input`, `from`, `edge_type`, `direction`, `to`, `edge_variable`, `temporal_filter`
  - `factorized`
  - `estimated_rows`, `estimated_cost`
- Updated plan helpers for the new variant:
  - `PhysicalPlan::estimated_rows()`
  - `PhysicalPlan::estimated_cost()`
  - `plan_output_columns(...)`
  - internal plan helper extractors (`physical_scan_parts`, `physical_expand_parts`)

## Task 2: Fan-Out Planning + Factorized Materialization/Execution
Completed in `crates/ogdb-core/src/lib.rs`.

- Added fan-out based selection in `build_physical_plan(...)` for `LogicalPlan::Expand`:
  - computes `fan_out = estimated_rows / input_rows`
  - emits `PhysicalFactorizedExpand` when `fan_out > FACTORIZE_FAN_OUT_THRESHOLD && input_rows > 64`
- Added factor-tree materialization helpers:
  - `merge_runtime_rows(...)`
  - `materialize_factor_tree(...)`
  - `materialize_factor_node(...)`
- Added execution arm in `execute_physical_plan_batches(...)` for `PhysicalFactorizedExpand`:
  - builds hash lookup
  - constructs/materializes factorized tree
  - emits flat batches with output parity to standard expand

## Task 3: Tests for Materialization, Planner Selection, and Parity
Completed in `crates/ogdb-core/src/lib.rs`.

Added tests:
- `factor_tree_materialize_single_group`
- `factor_tree_materialize_independent_children`
- `factor_tree_materialize_multiple_roots`
- `factor_tree_materialize_empty`
- `physical_plan_selects_factorized_expand_for_high_fan_out`
- `factorized_expand_correctness_parity`
- `factorized_expand_bounded_intermediate_rows`

## Validation

- `cargo test -p ogdb-core -- factor_tree materialize factorized_expand`: pass
- `cargo test -p ogdb-core`: pass
- `./scripts/test.sh`: pass
- `./scripts/coverage.sh`: fail (repo coverage gate)
  - current totals from script output:
    - line coverage: `96.50%`
    - uncovered lines: `1451`

## Documentation Updates

- `CHANGELOG.md` updated (`[Unreleased] -> Changed`) with factorized planner/executor entry.
- `docs/IMPLEMENTATION-LOG.md` updated with Step 059 entry.
