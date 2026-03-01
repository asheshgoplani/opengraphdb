# Phase 1 Verification Report (Bugfix Verification)

Verification scope: Phase 1 success criteria from `.planning/ROADMAP.md`.

Global gate checks used for all criteria:
- `CHANGELOG.md` released section check: `rg -n "^## \[0\\.2\\.0\]" CHANGELOG.md` -> `13:## [0.2.0] - 2026-02-27`
- Workspace version check: `rg -n "^version\\s*=\\s*\"0\\.2\\.0\"" Cargo.toml` -> `16:version = "0.2.0"`
- Full pipeline check: `./scripts/test.sh` -> `EXIT_CODE=0`
- Coverage gate check: `./scripts/coverage.sh` -> `EXIT_CODE=0`, `TOTAL ... Lines Cover 98.05%`

## 1) `MATCH (p:Person {name: 'Alice'})` returns only matching nodes

Status: **PASS**

Evidence:
- Command: `cargo test -p ogdb-core -- cypher_match_applies_inline_node_property_filters`
- Output:
  - `test tests::cypher_match_applies_inline_node_property_filters ... ok`
  - `test result: ok. 1 passed; 0 failed; ...`
- CHANGELOG `[0.2.0]` present: **PASS**
- `Cargo.toml` workspace version `0.2.0`: **PASS**
- `./scripts/test.sh`: **PASS** (`EXIT_CODE=0`)
- `./scripts/coverage.sh`: **PASS** (`EXIT_CODE=0`; total line coverage `98.05%`)

## 2) `RETURN a.name, c.name` disambiguates to `name`, `name_2`

Status: **PASS**

Evidence:
- Command: `cargo test -p ogdb-core -- cypher_query_disambiguates_duplicate_projection_output_names`
- Output:
  - `test tests::cypher_query_disambiguates_duplicate_projection_output_names ... ok`
  - `test result: ok. 1 passed; 0 failed; ...`
- CHANGELOG `[0.2.0]` present: **PASS**
- `Cargo.toml` workspace version `0.2.0`: **PASS**
- `./scripts/test.sh`: **PASS** (`EXIT_CODE=0`)
- `./scripts/coverage.sh`: **PASS** (`EXIT_CODE=0`; total line coverage `98.05%`)

## 3) `CREATE INDEX ON` and `CREATE INDEX FOR` both work and index appears in `db.indexes()`

Status: **PASS**

Evidence:
- Command: `cargo test -p ogdb-core -- cypher_query_executes_create_index_on_statement cypher_query_executes_create_index_for_on_statement builtin_shortest_path_and_indexes_calls_return_expected_rows`
- Output:
  - `test tests::cypher_query_executes_create_index_for_on_statement ... ok`
  - `test tests::cypher_query_executes_create_index_on_statement ... ok`
  - `test tests::builtin_shortest_path_and_indexes_calls_return_expected_rows ... ok`
  - `test result: ok. 3 passed; 0 failed; ...`
- CHANGELOG `[0.2.0]` present: **PASS**
- `Cargo.toml` workspace version `0.2.0`: **PASS**
- `./scripts/test.sh`: **PASS** (`EXIT_CODE=0`)
- `./scripts/coverage.sh`: **PASS** (`EXIT_CODE=0`; total line coverage `98.05%`)

## 4) `CALL db.algo.shortestPath` and `CALL db.index.fulltext.queryNodes` dispatch correctly

Status: **PASS**

Evidence:
- Command: `cargo test -p ogdb-core -- builtin_shortest_path_and_indexes_calls_return_expected_rows fulltext_builtin_call_without_indexes_falls_back_to_property_scan`
- Output:
  - `test tests::fulltext_builtin_call_without_indexes_falls_back_to_property_scan ... ok`
  - `test tests::builtin_shortest_path_and_indexes_calls_return_expected_rows ... ok`
  - `test result: ok. 2 passed; 0 failed; ...`
- CHANGELOG `[0.2.0]` present: **PASS**
- `Cargo.toml` workspace version `0.2.0`: **PASS**
- `./scripts/test.sh`: **PASS** (`EXIT_CODE=0`)
- `./scripts/coverage.sh`: **PASS** (`EXIT_CODE=0`; total line coverage `98.05%`)

## 5) Numeric `ORDER BY`, `REMOVE n.prop`, and `serve` endpoint print behavior

Status: **PASS**

Evidence:
- Command: `cargo test -p ogdb-core -- cypher_query_orders_integers_by_numeric_value_not_lexical_or_insertion_order cypher_query_executes_remove_property_and_returns_null_property`
- Output:
  - `test tests::cypher_query_executes_remove_property_and_returns_null_property ... ok`
  - `test tests::cypher_query_orders_integers_by_numeric_value_not_lexical_or_insertion_order ... ok`
  - `test result: ok. 2 passed; 0 failed; ...`
- Command: `cargo test -p ogdb-cli -- serve_http_port_flag_binds_loopback_with_requested_port`
- Output:
  - `test tests::serve_http_port_flag_binds_loopback_with_requested_port ... ok`
  - `test result: ok. 1 passed; 0 failed; ...`
- CHANGELOG `[0.2.0]` present: **PASS**
- `Cargo.toml` workspace version `0.2.0`: **PASS**
- `./scripts/test.sh`: **PASS** (`EXIT_CODE=0`)
- `./scripts/coverage.sh`: **PASS** (`EXIT_CODE=0`; total line coverage `98.05%`)

## Overall Verdict

**PASS** — all 5 Phase 1 success criteria are met based on targeted regression tests plus release/version/full-pipeline/coverage checks.
