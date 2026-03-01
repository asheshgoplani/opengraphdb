# OpenGraphDB Issue Scan Report

**Date:** 2026-02-22
**Commit:** main (pre-implementation scan)

## Summary

| Category | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 5 |
| MEDIUM | 8 |
| LOW | 5 |
| **Total** | **20** |

**Build:** `cargo build --workspace` passes
**Tests:** `cargo test --workspace` passes (502 passed, 1 ignored, 0 failed)
**Formatting:** `cargo fmt --all -- --check` passes
**Clippy:** `cargo clippy --workspace -- -D warnings` **FAILS** (11 errors)
**CLI smoke test:** init/create/query/help/version all work

---

## CRITICAL

### C1. Clippy not in CI pipeline

**File:** `scripts/test.sh`
**Impact:** 11 clippy errors exist in ogdb-core and will never be caught by CI.

The CI test script runs `cargo fmt`, `cargo check`, and `cargo test` but **not** `cargo clippy --workspace -- -D warnings`, which is listed as a required check in `CLAUDE.md`. This means lint regressions accumulate silently.

Current clippy failures in `crates/ogdb-core/src/lib.rs`:
- Line 887: derivable `Default` impl (manual impl identical to derive)
- Line 4859: needless borrow (`&remaining[1..]` should be `remaining[1..]`)
- Line 5509: overly complex return type (6-element tuple in Result)
- Line 9027, 13379: manual `% != 0` instead of `.is_multiple_of()`
- Line 9483: `OpenOptions::create(true)` without explicit `.truncate(true/false)`
- Line 10933: function with 8 arguments (limit is 7)
- Line 11775: unnecessary `let` binding before return
- Line 13203, 13257: `== false` instead of `!` negation
- Line 13776: manual saturating add instead of `.saturating_add(1)`

### C2. Monolithic ogdb-core: 33,242 lines in a single file

**File:** `crates/ogdb-core/src/lib.rs` (33,242 lines)
**Impact:** Severe maintainability risk. Compile time impact. Conflicts in multi-contributor workflows.

The architecture documents (`CLAUDE.md`, `ARCHITECTURE.md`) define 12 separate crates, but only 5 of the 12 exist in the workspace. The following 7 documented crates are missing, with all their functionality crammed into `ogdb-core`:

| Missing Crate | Documented Purpose | Currently Lives In |
|---------------|-------------------|-------------------|
| `ogdb-query` | Cypher lexer/parser, planner, optimizer, executor | ogdb-core |
| `ogdb-import` | CSV/JSON/RDF import pipelines | ogdb-cli |
| `ogdb-export` | JSON/CSV/RDF/Cypher export | ogdb-cli |
| `ogdb-vector` | Vector index integration | ogdb-core |
| `ogdb-text` | Full-text index integration | ogdb-core |
| `ogdb-temporal` | Temporal graph features | ogdb-core |
| `ogdb-algorithms` | Graph algorithms | ogdb-core |
| `ogdb-server` | Bolt/HTTP/MCP server adapters | ogdb-cli |

`ogdb-cli` is similarly oversized at 14,017 lines in a single file.

---

## HIGH

### H1. Mutex lock panics in production code (7 instances)

**File:** `crates/ogdb-core/src/lib.rs`
**Lines:** 6724, 6741, 7212, 7240, 7246, 7262, 7270
**Impact:** If any thread panics while holding a mutex, all subsequent lock acquisitions will panic too (poison propagation), potentially crashing the entire process.

All 7 instances use `.expect("... lock")` on mutex acquisitions in the `ActiveSnapshotRegistry` and `Compactor` subsystems. A poisoned mutex should be handled gracefully (e.g., by recovering or returning an error) rather than panicking.

Examples:
```rust
// Line 6724
.expect("active snapshot registry lock")

// Line 7212
.expect("background compactor state lock")
```

### H2. FFI handle dereference without full safety validation

**File:** `crates/ogdb-ffi/src/lib.rs`, line 244
**Impact:** The `with_handle` helper checks for null but then does a raw pointer cast (`&mut *(handle as *mut OgdbHandleInner)`) without verifying the pointer is actually a valid `OgdbHandleInner`. A corrupted or reused pointer from a C caller would cause undefined behavior.

### H3. Binary name mismatch

**File:** `crates/ogdb-cli/Cargo.toml`
**Impact:** The CLI binary is installed as `ogdb-cli` but the help text says `usage: opengraphdb`. Users cannot run `opengraphdb` after `cargo install`. The Cargo.toml should define `[[bin]] name = "opengraphdb"` or add an alias.

### H4. `suspicious_open_options` in WAL file creation

**File:** `crates/ogdb-core/src/lib.rs`, line 9483
**Impact:** `OpenOptions::new().create(true)` without `.truncate(true)` or `.truncate(false)`. While the code logic is correct (it checks file length after opening), clippy flags this as suspicious because the truncation behavior is platform-dependent when not explicit. This should be annotated with an allow or made explicit.

### H5. No `#![deny(warnings)]` or `#![warn(...)]` crate-level attributes

**Files:** All `lib.rs` / `main.rs` files
**Impact:** No crate enforces warning-free compilation at the source level. Combined with clippy missing from CI (C1), lint quality is entirely unguarded.

---

## MEDIUM

### M1. `.expect()` calls in JSON serialization paths (5 instances)

**Files and lines:**
- `ogdb-core/src/lib.rs:578` ("query result json serialization should succeed")
- `ogdb-cli/src/lib.rs:913` ("json rendering should not fail")
- `ogdb-cli/src/lib.rs:919` ("jsonl rendering should not fail")
- `ogdb-node/src/lib.rs:156` ("json encoding string should succeed")
- `ogdb-python/src/lib.rs:156` ("json encoding string should succeed")

**Impact:** While `serde_json::to_string()` rarely fails for in-memory data, these would panic on serialization edge cases (e.g., very large or unusual floating-point values). A `map_err` returning a proper error would be more robust.

### M2. `.expect()` calls in Cypher lexer (4 instances)

**File:** `crates/ogdb-core/src/lib.rs`
**Lines:** 4840, 4885, 4999, 5052
**Impact:** These have logical guards (e.g., "remaining is guaranteed non-empty") so they are unlikely to trigger, but panics in a parser are undesirable. They should return `ParseError` via `?` instead.

### M3. Python binding `.expect()` calls (2 instances)

**File:** `crates/ogdb-python/src/lib.rs`
**Lines:** 589 ("python list append should succeed"), 597 ("python dict set item should succeed")
**Impact:** PyO3 list/dict operations can fail under memory pressure or Python interpreter error states. A panic inside a Python extension crashes the Python process with no traceback.

### M4. Complex return type in parser

**File:** `crates/ogdb-core/src/lib.rs`, line 5509
**Impact:** A function returns `Result<(Option<String>, Option<String>, Vec<...>, ...), ParseError>` which clippy flags as too complex. This should be a named struct for clarity.

### M5. Function with 8 arguments (`hybrid_query_nodes`)

**File:** `crates/ogdb-core/src/lib.rs`, line 10933
**Impact:** Exceeds the 7-argument clippy limit. Should use an options struct pattern (similar to `ShortestPathOptions`).

### M6. Coverage script only covers ogdb-core and ogdb-cli

**File:** `scripts/coverage.sh`
**Impact:** Coverage gate (`--fail-under-lines 98`) only measures `ogdb-core` and `ogdb-cli`. The `ogdb-ffi`, `ogdb-python`, `ogdb-node`, `ogdb-bolt`, and `ogdb-tck` crates have no coverage tracking.

### M7. No doc-tests anywhere in the workspace

**Impact:** All `Doc-tests` sections report 0 tests across every crate. Public API items have no documentation examples. This makes it harder for consumers of the library crates to understand usage.

### M8. RuntimeColumnVec `.expect()` on column existence

**File:** `crates/ogdb-core/src/lib.rs`, line 4289
**Impact:** `.expect("runtime column must exist")` in the query executor. If a planning bug introduces a column mismatch, this panics at runtime instead of returning a query error.

---

## LOW

### L1. Benchmark binary uses `panic!()` for argument parsing

**File:** `crates/ogdb-bench/src/main.rs`, lines 122, 124
**Impact:** `panic!("Missing value for {flag}")` and `panic!("Invalid value for {flag}: {raw}")` in the benchmark CLI. Should use `clap` or return a proper error for consistency with ogdb-cli.

### L2. No `[[bin]] name` override for ogdb-bench

**File:** `crates/ogdb-bench/Cargo.toml`
**Impact:** The benchmark binary is named `ogdb-bench` rather than something user-friendly like `opengraphdb-bench`. Minor UX concern.

### L3. `ogdb-e2e` crate has an empty `lib.rs`

**File:** `crates/ogdb-e2e/src/lib.rs` (1 line, empty)
**Impact:** The crate exists only for its integration test file. The empty lib is unnecessary; the crate could use a `tests/` only layout or the lib could contain shared test utilities.

### L4. `source "$HOME/.cargo/env"` in CI scripts

**Files:** `scripts/test.sh`, `scripts/coverage.sh`
**Impact:** `source "$HOME/.cargo/env"` can fail or be a no-op in some CI environments where Rust is on the PATH but `~/.cargo/env` does not exist. The GitHub Actions `dtolnay/rust-toolchain` step already sets up the path. This is fragile but works currently.

### L5. Single ignored test with no tracking

**File:** `crates/ogdb-core/src/lib.rs`
**Test:** `crash_helper_abort_during_wal_write` (marked `#[ignore]`)
**Impact:** Ignored tests should have a tracking issue or comment explaining when they will be un-ignored. This one is documented as "helper test executed in a subprocess" which is reasonable, but there's no validation that the subprocess invocation is exercised in CI.
