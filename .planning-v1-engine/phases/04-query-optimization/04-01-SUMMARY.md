# Phase 04-01 Summary: WCOJ Strategy (QOPT-01)

Date: 2026-02-27
Status: Completed

## Objective
Add a worst-case optimal join (WCOJ) planning and execution strategy for multi-way Cypher pattern joins, with cost-based selection against existing binary expand chains.

## Task 1: WCOJ Data Model
Completed in `crates/ogdb-core/src/lib.rs`.

- Added `PhysicalJoinStrategy::WcojJoin`.
- Added `WcojRelation` relation descriptor.
- Added `PhysicalPlan::PhysicalWcojJoin` with:
  - `input`
  - `relations`
  - `variable_order`
  - `output_variables`
  - `estimated_rows`
  - `estimated_cost`
- Updated `estimated_rows()`, `estimated_cost()`, and `plan_output_columns()` for the new plan variant.
- Updated test helper plan extractors to recognize WCOJ plans.

## Task 2: Candidate Detection + Cost-Based Planning
Completed in `crates/ogdb-core/src/lib.rs`.

- Added `WcojCandidate` and planner helpers:
  - `detect_wcoj_candidate(...)`
  - `estimate_wcoj_cost(...)`
  - `estimate_binary_chain_cost(...)`
- Integrated WCOJ selection into `build_physical_plan(...)` for `LogicalPlan::Expand`:
  - detects expand-chain candidates (3+ variables / 2+ expands)
  - compares WCOJ and binary estimates
  - emits `PhysicalWcojJoin` when WCOJ is estimated cheaper
  - preserves existing binary `PhysicalExpand` fallback behavior

## Task 3: WCOJ Executor + Tests
Completed in `crates/ogdb-core/src/lib.rs`.

- Added `sorted_intersect(...)` helper.
- Added `execute_wcoj_join(...)` with recursive variable-at-a-time intersection (`wcoj_recurse(...)`).
- Added `PhysicalWcojJoin` execution arm in `execute_physical_plan_batches(...)`.
- Added/updated tests:
  - `sorted_intersect_basic`
  - `detect_wcoj_candidate_requires_at_least_three_variables`
  - `physical_plan_uses_wcoj_for_triangle_patterns`
  - `simple_two_variable_pattern_stays_on_physical_expand`
  - `wcoj_triangle_query_returns_all_triangles`
  - `wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower`

## Validation

- `cargo test -p ogdb-core -- wcoj sorted_intersect`: pass
- `cargo test -p ogdb-core`: pass
- `./scripts/test.sh`: pass
- `./scripts/coverage.sh`: fail (repo coverage gate)
  - Thresholds: lines >= 98%, uncovered lines <= 600
  - Current: 96.61% lines, 1388 uncovered lines

## Documentation Updates

- `CHANGELOG.md` updated (`[Unreleased] -> Changed`) with WCOJ planner/executor entry.
- `docs/IMPLEMENTATION-LOG.md` updated with Step 058 entry for this phase.
