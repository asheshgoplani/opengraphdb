# Phase 1: Bugfix Verification - Research

**Researched:** 2026-02-27
**Domain:** Rust test writing for an existing codebase (ogdb-core + ogdb-cli); regression coverage for 15 already-implemented bugfixes
**Confidence:** HIGH

## Summary

All 15 bugfixes (BUG-01 through BUG-15) are already implemented in the codebase. Every fix lives in one of two Rust source files: `crates/ogdb-core/src/lib.rs` (query engine, parser, planner, executor) and `crates/ogdb-cli/src/lib.rs` (CLI commands). Both files use the same pattern: a single large `#[cfg(test)] mod tests` block at the bottom of the file containing inline unit tests alongside the production code they exercise. There are no separate integration test directories for these crates; the ogdb-e2e crate holds cross-crate integration tests.

The research confirms that many of the 15 bugs already have corresponding regression tests. The task for Phase 1 is to audit which bugs have tests and which do not, write the missing ones, verify the full suite passes, and then move the CHANGELOG entries from `## [Unreleased]` to a new `## [0.2.0]` section.

**Primary recommendation:** Work bug-by-bug in the two source files. For each bug, find the implementation, confirm whether a regression test exists with the correct name and coverage, add one if absent, then run the full test suite before releasing.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Rust built-in `#[test]` | N/A | Unit test framework | No additional dependency; already used across all 308+ tests in ogdb-core and 100+ tests in ogdb-cli |
| `ogdb_core::Database` | workspace | Public API under test | All BUG-01 through BUG-09 verify behavior of `db.query(...)` |
| `ogdb_cli::run(...)` | workspace | CLI invocation for BUG-10 through BUG-15 | All CLI bugs exercise the `run(&[String])` function |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `std::env::temp_dir()` | Generate unique temporary db paths | Used by `temp_db_path(tag)` helper in both test modules |
| `std::fs` | Cleanup artifacts after tests | `cleanup_db_artifacts(path)` in ogdb-core; individual `fs::remove_file` in ogdb-cli tests |
| `serde_json` | Parse JSON output in CLI tests | Used when testing `--format json` output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `#[test]` in lib.rs | Separate `tests/` directory | The codebase established the inline pattern from the start; do not deviate |
| ogdb-e2e crate | New inline tests | E2e tests are for cross-crate integration; bug regression tests belong in the crate that owns the fix |

## Architecture Patterns

### Test Module Locations

```
crates/ogdb-core/src/lib.rs
  (all production code)
  ...
  #[cfg(test)]
  mod tests {
      use super::*;
      ...
      fn temp_db_path(tag: &str) -> PathBuf { ... }
      fn cleanup_db_artifacts(path: &Path) { ... }
      ...
      #[test]
      fn <test_name>() { ... }
  }

crates/ogdb-cli/src/lib.rs
  (all production code)
  ...
  #[cfg(test)]
  mod tests {
      use super::*;
      use ogdb_core::{...};
      ...
      fn temp_db_path(tag: &str) -> PathBuf { ... }
      fn wal_path(path: &PathBuf) -> PathBuf { ... }
      fn meta_path(path: &PathBuf) -> PathBuf { ... }
      ...
      #[test]
      fn <test_name>() { ... }
  }
```

### Pattern 1: ogdb-core query regression test
**What:** Create a fresh db, insert seed data, call `db.query(...)`, assert on result columns and row values.
**When to use:** BUG-01 through BUG-09 (all query engine / parser bugs)
**Example:**
```rust
#[test]
fn cypher_match_applies_inline_node_property_filters() {
    let path = temp_db_path("cypher-match-inline-node-properties");
    let mut db = Database::init(&path, Header::default_v1()).expect("init");
    // ... seed data ...
    let rows = db
        .query("MATCH (p:Person {name: 'Alice'}) RETURN p.name AS name, p.age AS age")
        .expect("inline property filter query")
        .to_rows();
    assert_eq!(rows.len(), 1);
    // ...
    cleanup_db_artifacts(&path);
}
```

### Pattern 2: ogdb-cli command regression test
**What:** Call `run(&[String])` with CLI args, assert on `exit_code`, `stdout`, and `stderr`.
**When to use:** BUG-10 through BUG-15 (all CLI bugs)
**Example:**
```rust
#[test]
fn import_reports_missing_database_with_actionable_message() {
    let missing_db = temp_db_path("import-missing-db-message");
    let input = temp_file_path("import-missing-db-message-input", "json");
    fs::write(&input, "{\"nodes\":[],\"edges\":[]}").expect("write import json");
    let out = run(&vec![
        "import".to_string(),
        missing_db.display().to_string(),
        input.display().to_string(),
    ]);
    assert_eq!(out.exit_code, 1);
    assert_eq!(
        out.stderr.trim(),
        format!(
            "error: database not found at '{}'. Run 'ogdb init <path>' first.",
            missing_db.display()
        )
    );
    fs::remove_file(input).expect("cleanup input");
}
```

### Pattern 3: Feature-gated tests
**What:** Some tests require `#[cfg(feature = "fulltext-search")]` when they exercise Tantivy-backed full-text indexing.
**When to use:** The `fulltext_builtin_call_without_indexes_falls_back_to_property_scan` and `builtin_call_procedure_validation_paths` tests (BUG-05) do NOT need this gate because they test fallback behavior when no index exists.

### Anti-Patterns to Avoid
- **Leaving temp files on disk:** Always call `cleanup_db_artifacts(path)` in ogdb-core or `fs::remove_file` equivalents in ogdb-cli.
- **Using raw file paths without temp_db_path:** Static paths cause test interference on parallel runs.
- **Testing implementation internals:** All 15 bugs should be verified through the public query API (`db.query(...)`) or the CLI `run(...)` function, not internal structs.
- **Adding tests to the e2e crate:** The e2e crate covers cross-crate integration scenarios; individual bug regressions belong with their owning crate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temp path generation | Custom path logic | `temp_db_path(tag)` in each test module | Already handles PID + timestamp + counter for uniqueness |
| DB cleanup | Custom file removal | `cleanup_db_artifacts(path)` in ogdb-core | Already knows all sidecar file patterns |
| CLI invocation | Subprocess spawn | `run(&[String])` in ogdb-cli | In-process, testable, returns `CliResult { exit_code, stdout, stderr }` |
| JSON parsing in CLI tests | Manual string matching | `serde_json::from_str` | Already used in 20+ CLI tests |

## Common Pitfalls

### Pitfall 1: Test already exists with subtly different scope
**What goes wrong:** You write a new test for a bug only to discover an existing test already covers the same behavior but with a slightly different name or assertion. The suite then has redundant tests.
**Why it happens:** The codebase has 308 tests in ogdb-core and 100+ in ogdb-cli; it is easy to miss an existing test.
**How to avoid:** Search for the bug's key words (e.g., "inline", "disambiguate", "remove_property") before writing a new test. Several bugs already have tests (see Bug-by-Bug Findings below).
**Warning signs:** `grep` finds a test function whose name or body matches the bug behavior.

### Pitfall 2: BUG-05 fulltext procedure tests need no feature gate for fallback path
**What goes wrong:** Adding `#[cfg(feature = "fulltext-search")]` to the 1-3 argument fallback test would make it conditional when it should always run.
**Why it happens:** Other fulltext tests require the Tantivy feature; the pattern looks copy-paste-able.
**How to avoid:** The fallback test (`fulltext_builtin_call_without_indexes_falls_back_to_property_scan`) already runs without the feature gate and is correct. Any new variant tests for BUG-05 should follow the same gate-free pattern for the property-scan fallback path.

### Pitfall 3: `cleanup_db_artifacts` not called on test failure paths
**What goes wrong:** A test panics mid-run and leaves temp files in `/tmp`, making subsequent runs flaky.
**Why it happens:** Rust tests do not auto-clean temp files.
**How to avoid:** Call `cleanup_db_artifacts` unconditionally at the end; if the test must be structurally complex, consider `std::panic::catch_unwind` wrapping. Existing tests accept the minor leakage risk for simplicity.

### Pitfall 4: Serve tests race on port binding
**What goes wrong:** Serve tests that bind real TCP ports can collide when tests run in parallel.
**Why it happens:** `cargo test` runs tests in parallel by default.
**How to avoid:** Follow the existing pattern: bind to port 0 (OS assigns a free port), then read the assigned port via `local_addr()`. The existing `serve_accepts_http_port_flag` test uses a missing-db path specifically to avoid needing a real listen loop.

### Pitfall 5: CHANGELOG section change requires exact format
**What goes wrong:** The `scripts/changelog-check.sh` script validates changelog structure. A malformed section move causes CI to fail.
**Why it happens:** The changelog check is part of `scripts/test.sh`.
**How to avoid:** When moving entries in Plan 01-03, follow `Keep a Changelog` format exactly. The released version block must be `## [0.2.0] - YYYY-MM-DD` and a URL reference link must be added at the bottom.

## Code Examples

### Existing regression tests (already passing, no action needed)

**BUG-01** (inline node property filter):
```rust
// crates/ogdb-core/src/lib.rs line 25827
fn cypher_match_applies_inline_node_property_filters()
// Also: cypher_match_with_two_patterns_filters_before_create (line 25866)
```

**BUG-02** (duplicate column disambiguation):
```rust
// crates/ogdb-core/src/lib.rs line 25781
fn cypher_query_disambiguates_duplicate_projection_output_names()
```

**BUG-03** (CREATE INDEX ON):
```rust
// crates/ogdb-core/src/lib.rs line 25706
fn cypher_query_executes_create_index_on_statement()
```

**BUG-04** (CALL db.indexes() and db.algo.shortestPath):
```rust
// crates/ogdb-core/src/lib.rs line 30739
fn builtin_shortest_path_and_indexes_calls_return_expected_rows()
// CLI-level (line 7631): fn query_command_routes_call_procedures_and_create_index_on()
```

**BUG-05** (fulltext 1-3 arg forms):
```rust
// crates/ogdb-core/src/lib.rs line 29758
fn fulltext_builtin_call_without_indexes_falls_back_to_property_scan()
// crates/ogdb-core/src/lib.rs line 30039
fn builtin_call_procedure_validation_paths()
```

**BUG-06** (relationship property null):
```rust
// crates/ogdb-core/src/lib.rs line 30530
fn relationship_property_projection_allows_missing_values_as_null()
```

**BUG-07** (numeric ORDER BY):
```rust
// crates/ogdb-core/src/lib.rs line 25742
fn cypher_query_orders_integers_by_numeric_value_not_lexical_or_insertion_order()
```

**BUG-08** (REMOVE n.prop):
```rust
// crates/ogdb-core/src/lib.rs line 25677
fn cypher_query_executes_remove_property_and_returns_null_property()
```

**BUG-09** (CREATE INDEX FOR alternate syntax):
```rust
// crates/ogdb-core/src/lib.rs line 25724
fn cypher_query_executes_create_index_for_on_statement()
```

**BUG-10** (--db path fallback):
```rust
// crates/ogdb-cli/src/lib.rs line 6760
fn global_db_flag_can_supply_database_path()
// line 6779: fn all_path_subcommands_accept_db_without_positional_path()
// line 7690: fn query_allows_db_flag_without_positional_path()
```

**BUG-11** (query argument parsing, --format flags):
```rust
// crates/ogdb-cli/src/lib.rs line 7709
fn query_parses_format_flag_after_query_argument()
```

**BUG-12** (CALL routing through core engine):
```rust
// crates/ogdb-cli/src/lib.rs line 7631
fn query_command_routes_call_procedures_and_create_index_on()
```

**BUG-13** (import missing db error):
```rust
// crates/ogdb-cli/src/lib.rs line 8601
fn import_reports_missing_database_with_actionable_message()
```

**BUG-14** (serve startup output includes protocol + endpoint):
```rust
// crates/ogdb-cli/src/lib.rs line 12936 (MCP)
fn serve_processes_single_tcp_request_when_max_requests_is_set()
  // asserts: serve_result.stdout.contains("listening on mcp://")
// crates/ogdb-cli/src/lib.rs line 13903
fn http_serve_reports_bind_errors_and_timeout_helper_panics()
  // exercises handle_serve_http which emits "listening on http://"
// Bolt: handle_serve_bolt emits "listening on bolt://..." at line 2881
```

**BUG-15** (serve --port with protocol-aware defaults):
```rust
// crates/ogdb-cli/src/lib.rs line 12847
fn resolve_serve_bind_addr_defaults_and_port_override()
// line 12895: fn serve_accepts_http_port_flag()
```

### Key implementation locations

**BUG-01 fix location:** `crates/ogdb-core/src/lib.rs`
- `node_pattern_property_predicate(...)` at line 2646: converts inline node properties to filter predicates
- `plan_match_clause(...)` at line 2669: applies `node_pattern_property_predicate` and wraps in `CartesianProduct` for multi-pattern

**BUG-02 fix location:** `crates/ogdb-core/src/lib.rs`
- `projection_output_columns(...)` at line 3566: uses `BTreeMap<String, usize>` occurrence counter to produce `name`, `name_2` etc.

**BUG-03 fix location:** `crates/ogdb-core/src/lib.rs`
- `parse_create_index_clause(...)` at line 5359 (parser)
- Index execution at line 10239 (`create_index(...)`)
- Logical plan `CreateIndex` variant handled in physical plan builder

**BUG-04 fix location:** `crates/ogdb-core/src/lib.rs`
- `try_execute_builtin_call_query(...)` at line 11176
- `CALL db.algo.shortestPath(...)` dispatch at line 11561
- `CALL db.indexes()` at line 11176 (handled in the same dispatch function)

**BUG-05 fix location:** `crates/ogdb-core/src/lib.rs`
- `fulltext_query_nodes_all_indexes(...)` at line 10989: handles 1-arg (text-only) call
- `try_execute_builtin_call_query(...)` at line 11214: handles 1-, 2-, and 3-arg forms

**BUG-06 fix location:** `crates/ogdb-core/src/lib.rs`
- `Ord` / `PartialOrd` for `PropertyValue` at line 462
- Null-handling in result type validation: treats missing property access as `PropertyValue::String("null")` for column consistency

**BUG-07 fix location:** `crates/ogdb-core/src/lib.rs`
- `impl Ord for PropertyValue` at line 468: numeric comparison via `numeric_cmp` branch before string fallback

**BUG-08 fix location:** `crates/ogdb-core/src/lib.rs`
- `parse_remove_clause(...)` at line 5430
- `LogicalPlan::RemoveProperties` at line 1572
- `PhysicalPlan::PhysicalRemove` at line 1709
- Executor at line 12379

**BUG-09 fix location:** `crates/ogdb-core/src/lib.rs`
- `parse_create_index_clause(...)` handles both `CREATE INDEX ON :Label(prop)` and `CREATE INDEX FOR (n:Label) ON (n.prop)` forms

**BUG-10 fix location:** `crates/ogdb-cli/src/lib.rs`
- `resolve_db_path(local_path, global_db)` at line 427
- `try_parse_with_injected_db_path(...)` at line 521
- `subcommand_supports_db_path_injection(...)` at line 505

**BUG-11 fix location:** `crates/ogdb-cli/src/lib.rs`
- `QueryCommand` at line 132: `query: Option<String>` + `query_tail: Vec<String>`
- `resolve_query_path_and_text(...)` at line 710: joins `query` + `query_tail` parts

**BUG-12 fix location:** `crates/ogdb-cli/src/lib.rs`
- `should_route_to_cypher(...)` at line 1378: `db.parse_cypher(query).is_ok() || query starts with "CALL "`

**BUG-13 fix location:** `crates/ogdb-cli/src/lib.rs`
- `handle_import(...)` at line 4842: checks `Path::new(db_path).exists()` and returns actionable error

**BUG-14 fix location:** `crates/ogdb-cli/src/lib.rs`
- `handle_serve_bolt(...)` at line 2870: `eprintln!("listening on bolt://{bind_addr}")`
- `handle_serve_http(...)`: emits "listening on http://..."
- `handle_serve_mcp(...)` at line 2913: emits "listening on mcp://..."

**BUG-15 fix location:** `crates/ogdb-cli/src/lib.rs`
- `ServeCommand` at line 248: `port: Option<u16>` field with `conflicts_with = "bind"`
- `resolve_serve_bind_addr(...)` at line 2850: applies protocol-specific defaults

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Separate `tests/` directory | Inline `mod tests` at bottom of lib.rs | Both approaches are idiomatic Rust; this project chose inline — do not mix |
| Manual test cleanup | `cleanup_db_artifacts(path)` helper | All ogdb-core tests use this; ogdb-cli tests use individual `fs::remove_file` calls |
| Legacy command handler for CALL | `should_route_to_cypher` + `db.query(...)` | BUG-12 fix: CALL now always routes through core engine |

## Bug-by-Bug Findings

### BUG-01: MATCH inline property filters
**Status:** EXISTING TEST at line 25827 (`cypher_match_applies_inline_node_property_filters`) and line 25866 (`cypher_match_with_two_patterns_filters_before_create`)
**Action needed:** Audit tests confirm they verify both single-pattern and multi-pattern cases. No new test required.

### BUG-02: Duplicate column names
**Status:** EXISTING TEST at line 25781 (`cypher_query_disambiguates_duplicate_projection_output_names`)
**Action needed:** Test exists. Verify it asserts both column name `name_2` and the correct values.

### BUG-03: CREATE INDEX ON :Label(property)
**Status:** EXISTING TEST at line 25706 (`cypher_query_executes_create_index_on_statement`)
**Action needed:** Test exists. Verifies the index appears in `db.list_indexes()` after the Cypher statement runs.

### BUG-04: CALL db.indexes() and CALL db.algo.shortestPath
**Status:** EXISTING TESTS at line 30739 (core) and line 7631 (CLI)
**Action needed:** Both tests exist. CLI test (`query_command_routes_call_procedures_and_create_index_on`) exercises CALL through the full CLI + core path.

### BUG-05: CALL db.index.fulltext.queryNodes 1-3 arg forms
**Status:** EXISTING TESTS at lines 29758 and 30039
**Action needed:** Tests exist. They cover 1-arg (query text only), 2-arg (index name + text), and 3-arg (index name + text + k) without the fulltext feature gate (property-scan fallback path).

### BUG-06: Relationship property null for missing properties
**Status:** EXISTING TEST at line 30530 (`relationship_property_projection_allows_missing_values_as_null`)
**Action needed:** Test exists. Creates edges with and without `since` property, asserts the missing one returns `PropertyValue::String("null")`.

### BUG-07: Numeric ORDER BY
**Status:** EXISTING TEST at line 25742 (`cypher_query_orders_integers_by_numeric_value_not_lexical_or_insertion_order`)
**Action needed:** Test exists. Inserts nodes with ages `[10, 2, 1]` in insertion order and asserts `ORDER BY n.age ASC` returns `[1, 2, 10]`.

### BUG-08: REMOVE n.prop
**Status:** EXISTING TEST at line 25677 (`cypher_query_executes_remove_property_and_returns_null_property`)
**Action needed:** Test exists. Verifies the property is absent after REMOVE (returns "null" string), and a subsequent query also returns "null".

### BUG-09: CREATE INDEX FOR (n:Label) ON (n.prop)
**Status:** EXISTING TEST at line 25724 (`cypher_query_executes_create_index_for_on_statement`)
**Action needed:** Test exists. Mirrors BUG-03's test but uses the alternate syntax.

### BUG-10: CLI --db path fallback
**Status:** EXISTING TESTS at lines 6760 and 6779
**Action needed:** Tests exist. `all_path_subcommands_accept_db_without_positional_path` at line 6779 covers a broad set of commands accepting `--db` without a positional path.

### BUG-11: query command argument parsing (--format flags)
**Status:** EXISTING TEST at line 7709 (`query_parses_format_flag_after_query_argument`)
**Action needed:** Test exists. Verifies `query <path> info --format json` works correctly (the format flag appears after the query text, not consumed as query text).

### BUG-12: CALL routing through core engine
**Status:** EXISTING TEST at line 7631 (`query_command_routes_call_procedures_and_create_index_on`)
**Action needed:** Test exists at CLI level. Routes `CALL db.indexes()` and `CALL db.algo.shortestPath(0, 1)` through `run(...)` and asserts a successful exit code and valid JSON output.

### BUG-13: import error on missing db
**Status:** EXISTING TEST at line 8601 (`import_reports_missing_database_with_actionable_message`)
**Action needed:** Test exists. Asserts exact error message format including the `Run 'ogdb init <path>' first.` suggestion.

### BUG-14: serve startup output includes protocol + endpoint
**Status:** PARTIALLY TESTED
- MCP protocol: covered by line 12936 (asserts `"listening on mcp://"`).
- HTTP protocol: line 13903 exercises `handle_serve_http` but primarily tests error paths; the "listening on http://" output is emitted on success, not easily asserted in unit tests that inject errors.
- Bolt protocol: `handle_serve_bolt` emits "listening on bolt://..." but no isolated unit-level test asserts this specific string from a clean serve run.
**Action needed:** May need a targeted test asserting the bolt and/or HTTP startup output strings for completeness.

### BUG-15: serve --port with protocol-aware defaults
**Status:** EXISTING TESTS at lines 12847 and 12895
**Action needed:** Tests exist. `resolve_serve_bind_addr_defaults_and_port_override` covers all four protocols. `serve_accepts_http_port_flag` exercises the CLI argument path.

## Open Questions

1. **BUG-14 serve startup output completeness**
   - What we know: MCP startup output is asserted. Bolt and HTTP emit the strings but tests do not cleanly assert them from a successful startup run.
   - What's unclear: Whether the existing test coverage is sufficient for the REQUIREMENTS.md definition (which requires protocol + bind endpoint in output).
   - Recommendation: Write a targeted test for bolt startup output using `thread::spawn` + `connect_with_retry` + short `max_requests` count, similar to `serve_processes_single_tcp_request_when_max_requests_is_set`.

2. **Test coverage gate**
   - What we know: `scripts/coverage.sh` enforces `--fail-under-lines 98` and `--fail-uncovered-lines 600`.
   - What's unclear: Whether adding new tests for any uncovered bug path will push coverage above the gate or not.
   - Recommendation: Run `cargo llvm-cov --show-missing-lines` after writing any new tests. Existing tests for all 15 bugs are almost certainly already driving the coverage gate.

3. **CHANGELOG version number**
   - What we know: Current released version is `0.1.0`. The unreleased section has the 15 bugfix entries plus a large block of Phase 15 additions.
   - What's unclear: Whether the release should be `0.2.0` (significant features added beyond just bugfixes) or `0.1.1` (bugfix-only release).
   - Recommendation: The unreleased section includes Phase 15 production hardening (WASM, RBAC, replication, GQL extensions) in addition to the 15 bugfixes, suggesting `0.2.0` is more appropriate. Confirm with the VERSIONING.md policy at `docs/VERSIONING.md`.

## Validation Architecture

(Skipped: `workflow.nyquist_validation` is not present in `.planning/config.json`)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUG-01 | MATCH inline node-property filters apply correctly | Test exists at ogdb-core lib.rs line 25827; covers single and multi-pattern MATCH |
| BUG-02 | Projection output names disambiguated deterministically | Test exists at ogdb-core lib.rs line 25781; asserts `name`, `name_2` columns |
| BUG-03 | CREATE INDEX ON :Label(property) end-to-end | Test exists at ogdb-core lib.rs line 25706; asserts index appears in list_indexes() |
| BUG-04 | CALL db.indexes() and CALL db.algo.shortestPath dispatch | Tests exist at ogdb-core line 30739 and ogdb-cli line 7631 |
| BUG-05 | CALL db.index.fulltext.queryNodes 1-3 arg forms | Tests exist at ogdb-core lines 29758 and 30039 |
| BUG-06 | Relationship property projection null for missing props | Test exists at ogdb-core lib.rs line 30530 |
| BUG-07 | Numeric ORDER BY sorts by value not lexical order | Test exists at ogdb-core lib.rs line 25742 |
| BUG-08 | REMOVE n.prop works through parser/planner/executor | Test exists at ogdb-core lib.rs line 25677 |
| BUG-09 | CREATE INDEX FOR (n:Label) ON (n.prop) alternate syntax | Test exists at ogdb-core lib.rs line 25724 |
| BUG-10 | CLI path commands accept --db path fallback | Tests exist at ogdb-cli lib.rs lines 6760 and 6779 |
| BUG-11 | query treats text as single arg so --format flags work | Test exists at ogdb-cli lib.rs line 7709 |
| BUG-12 | CALL routes through core engine not legacy handler | Test exists at ogdb-cli lib.rs line 7631 |
| BUG-13 | import returns actionable error for missing database | Test exists at ogdb-cli lib.rs line 8601 |
| BUG-14 | serve startup output includes protocol + bind endpoint | MCP covered (line 12936); bolt/HTTP coverage may need a targeted addition |
| BUG-15 | serve --port with protocol-aware defaults | Tests exist at ogdb-cli lib.rs lines 12847 and 12895 |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `/Users/ashesh/opengraphdb/crates/ogdb-core/src/lib.rs` (33,624 lines) - implementation and test locations for BUG-01 through BUG-09
- Direct source code inspection of `/Users/ashesh/opengraphdb/crates/ogdb-cli/src/lib.rs` (14,059 lines) - implementation and test locations for BUG-10 through BUG-15
- `/Users/ashesh/opengraphdb/CHANGELOG.md` - confirmed 15 unreleased bugfix entries
- `/Users/ashesh/opengraphdb/.planning/REQUIREMENTS.md` - requirements definitions
- `/Users/ashesh/opengraphdb/Cargo.toml` - workspace structure

### Secondary (MEDIUM confidence)
- `/Users/ashesh/opengraphdb/.planning/STATE.md` - confirms bugfixes are implemented, Phase 1 is verification only
- `/Users/ashesh/opengraphdb/.planning/ROADMAP.md` - phase plan structure and success criteria

## Metadata

**Confidence breakdown:**
- Bug fix locations: HIGH - read source code directly
- Existing test coverage per bug: HIGH - read test function bodies directly
- BUG-14 completeness: MEDIUM - startup output asserted for MCP but bolt/HTTP may need additional coverage
- CHANGELOG version number: MEDIUM - depends on VERSIONING.md policy

**Research date:** 2026-02-27
**Valid until:** 2026-03-28 (stable codebase, 30-day window)
