# EVAL-RUST-QUALITY-CYCLE15

Area: RUST-QUALITY (all 18 Rust crates)
Base: origin/main @ aff476f (post v0.5.1 cut + cascade-fix landings)
Worktree: /tmp/wt-c15-rust-quality (detached HEAD, fresh)
Toolchain: rustc 1.88.0 / cargo 1.88.0
Date: 2026-05-05

## Scope coverage

Axes scanned (per the cycle prompt):
- ✅ clippy per-crate (default targets `cargo clippy -p <crate> -- -D warnings`) — clean across all 18 crates
- ✅ clippy per-crate `--all-targets` — three crates fail (F01, F02, F03)
- ✅ `cargo fmt --all --check` — clean (zero diff)
- ✅ unsafe blocks audit — every `unsafe { ... }` in `crates/ogdb-ffi/src/lib.rs`, `crates/ogdb-bench/src/main.rs` is preceded by a `// SAFETY:` comment; no other crates contain hand-written unsafe
- ✅ `.unwrap()` / `.expect(` / `panic!` in non-test code (F07)
- ✅ TODO/FIXME/HACK markers — exactly one match (`crates/ogdb-eval/tests/skill_quality_adapter.rs:4` references "Phase-3 TODO" inside a doc comment, no in-code markers); effectively clean
- ✅ doc coverage on shipped library crates (`scripts/check-shipped-doc-coverage.sh`) — passes
- ✅ doctest correctness (`scripts/check-doc-rust-blocks.sh`) — passes (`README.md:55`, `DESIGN.md:1584` both compile)
- ✅ doctest wiring (`scripts/check-doc-tests-wired.sh`) — passes (`scripts/test.sh` + `.github/workflows/ci.yml` both run `cargo test --doc`)
- ✅ doc-ratchet (`scripts/check-doc-ratchet.sh`) — drift in F04
- ✅ public-API breakage v0.5.1 → HEAD — only `documentation/BENCHMARKS.md` changed; zero Rust diff (no risk)
- ✅ error-type design (per-crate Error enum, no `Box<dyn Error>`, thiserror discipline) — clean: 16 `pub enum *Error` enums; the only `Box<dyn ... Error>` references are doctest helpers (`Box<dyn std::error::Error>` in `crates/ogdb-core/src/lib.rs:16` doc comment + similar narrative in `ogdb-cli`) plus `Box<dyn LlmAdapter>` in `ogdb-eval/src/drivers/real_llm_adapter/mod.rs:107` — that one returns the trait-object adapter, not an error
- ✅ rustc 1.95+-style lints (`type_complexity`, `single_char_add_str`, `doc_markdown`) — F06
- ✅ top-of-crate `//!` doc blocks — F05

## Findings

### F01 — clippy `cast_sign_loss` in ogdb-core test target

- Severity: **MEDIUM**
- File: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`
- Trigger: `cargo clippy -p ogdb-core --all-targets -- -D warnings` fails compilation; CI gate `cargo clippy --workspace -- -D warnings` (no `--all-targets`) still passes.
- Exact problem:
  ```
  error: casting `f64` to `usize` may lose the sign of the value
    --> crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74:15
     |
  74 |     let idx = ((samples.len() as f64 - 1.0) * pct / 100.0).round() as usize;
  ```
- Why it matters: every developer running `cargo clippy --all-targets` locally (the standard "all green" workflow) sees a hard error in this regression test. Not currently a CI blocker because `scripts/test.sh:82` only runs lib targets, but it makes the per-crate ratchet surface inconsistent across crates.
- Patch sketch (1 line):
  ```rust
  let idx = ((samples.len().saturating_sub(1) as f64) * pct / 100.0).round().max(0.0) as usize;
  ```
  or simply add `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on the function with a short rationale comment ( `pct` is bounded `[0,100]`, count ≥ 1 — sign is non-negative).

### F02 — clippy `cast_sign_loss` in ogdb-bench main

- Severity: **MEDIUM**
- File: `crates/ogdb-bench/src/main.rs:743`
- Trigger: `cargo clippy -p ogdb-bench --all-targets -- -D warnings` fails (clippy fires on the test build of the bench harness even though the offending line lives in the bin module).
- Exact problem:
  ```
  error: casting `f64` to `usize` may lose the sign of the value
     --> crates/ogdb-bench/src/main.rs:743:21
      |
  743 |         let index = (((samples.len() - 1) as f64) * percentile).round() as usize;
  ```
- Patch sketch (1 line):
  ```rust
  let index = (((samples.len() - 1) as f64) * percentile).round().max(0.0) as usize;
  ```
  or `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on the percentile helper.

### F03 — multiple clippy errors in ogdb-eval `--all-targets`

- Severity: **MEDIUM**
- Files (all `cast_sign_loss` unless noted):
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:50:9`
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:73:16`
  - `crates/ogdb-eval/tests/scaling_driver.rs:30:16`
  - `crates/ogdb-eval/tests/scaling_driver.rs:82:16`
  - `crates/ogdb-eval/tests/throughput_driver.rs:38:9` (`f64 → u64`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:30:9` (`f64 → u32`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:41:16` (`f64 → u32`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:52:16` (`f64 → u32`)
  - `crates/ogdb-eval/src/drivers/common.rs:201:42` — **`redundant_closure`** — `(1..=100).map(|i| f64::from(i))` should be `.map(f64::from)` (inside `#[cfg(test)]` mod, but still triggers under `--all-targets`)
- Trigger: `cargo clippy -p ogdb-eval --all-targets -- -D warnings` fails on every test target.
- Patch sketch:
  - For the `redundant_closure`: drop the closure, use `f64::from` directly.
  - For the cast batch: introduce a tiny `fn pctile(xs: &[f64], p: f64) -> f64 { ... }` helper (already exists in `ogdb-eval/src/drivers/common.rs`) and call it from each test — eliminates the per-test cast — or sprinkle `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` with a `// percentile is in [0,1]` rationale.

### F04 — doc-ratchet baseline outdated for ogdb-core

- Severity: **LOW**
- File: `scripts/check-doc-ratchet.sh:27`
- Trigger: `bash scripts/check-doc-ratchet.sh` reports `ok: ogdb-core 289/290 undocumented (please lower baseline to 289)`. The ratchet bakes in the rule that you must tighten when you reduce undocumented count, but the baseline is one ahead of reality.
- Patch sketch (1 line):
  ```sh
  -  [ogdb-core]=290
  +  [ogdb-core]=289
  ```

### F05 — ogdb-tck/src/lib.rs missing top-of-crate `//!` doc

- Severity: **LOW**
- File: `crates/ogdb-tck/src/lib.rs:1`
- Trigger: every other workspace crate (including the other `publish = false` harness crates `ogdb-bench`, `ogdb-eval`, `ogdb-e2e`) starts with a `//!` doc block. `ogdb-tck/src/lib.rs` jumps straight to `use cucumber::gherkin;` with no inner doc.
- Why it matters: `scripts/check-crate-root-docs.sh` does NOT walk publish=false crates, so the gap is invisible to CI but breaks the consistency rule. (Also: `ogdb-fuzz` lib.rs has no top-of-crate doc — it's `[lib] = false` by name, so less critical.)
- Patch sketch (3 lines):
  ```rust
  //! `ogdb-tck` — Cucumber-based technology-compatibility-kit harness for
  //! `ogdb-core`. Internal `publish = false` crate; entry point is the
  //! `cucumber::World` defined here, driven by `crates/ogdb-tck/tests/`.
  ```

### F06 — 119 `clippy::doc_markdown` warnings (missing/unbalanced backticks)

- Severity: **LOW**
- Trigger: `cargo clippy --workspace --all-targets -- -W clippy::doc_markdown 2>&1 | grep -c "missing backticks\|backticks are unbalanced"` → **119**
- Top offenders (first 10 unique locations):
  ```
  crates/ogdb-algorithms/src/lib.rs:123:15
  crates/ogdb-algorithms/src/lib.rs:125:15
  crates/ogdb-bolt/src/lib.rs:104,115,118,121,126,142,146,156
  crates/ogdb-cli/src/init_agent.rs:4
  crates/ogdb-cli/src/lib.rs:4024-4025
  ```
- Why it matters: docs.rs renders identifiers like `Database` without backticks as plain words; readers don't get the cross-link. With the workspace's already-strong doc-coverage ratchet, leaving `doc_markdown` ungated permits drift.
- Patch sketch: enable `#![warn(clippy::doc_markdown)]` at workspace level (in `[workspace.lints.clippy]` block of root `Cargo.toml`) once the 119 existing warnings are wrapped in backticks. As a smaller first step, gate it per-shipped-crate (vector / algorithms / text / temporal / import / export / types) where the count is single-digit.

### F07 — bare `.unwrap()` calls in ogdb-core production hot paths

- Severity: **MEDIUM**
- Files (only `.unwrap()` in non-test code in `crates/ogdb-core/src/lib.rs`):
  - `crates/ogdb-core/src/lib.rs:18705` — `(*node_id, *remap.get(raw_comm).unwrap())` inside the Louvain hierarchical-community builder. Invariant: `remap` is built two lines above from `unique_raw_ids` and is a total map over `raw_communities` keys, so unwrap is structurally safe. But it is a bare `.unwrap()` with no `.expect("rationale")`.
  - `crates/ogdb-core/src/lib.rs:19482` — `let cmap = community_by_node.as_ref().unwrap();` inside the GraphRAG retrieval prefilter. Invariant: `community_by_node` is `Some` whenever `config.community_id.is_some()` — but this is enforced ~25 lines above via a separate branch and the coupling is implicit, not type-encoded.
- Why it matters: every other unwrap in production-side core uses `.expect("…")` with a rationale string (the file has 50 such expects, all justified). These two break the pattern and would produce opaque "called unwrap on None" panics under invariant violation.
- Patch sketch (1 line each):
  ```rust
  // line 18705
  *remap.get(raw_comm).expect("remap built from unique_raw_ids covers every raw_communities key")
  // line 19482
  let cmap = community_by_node.as_ref().expect("community_by_node is Some when config.community_id is set");
  ```

## Findings summary

| ID | Severity | Area | Brief |
|----|----------|------|------|
| F01 | MEDIUM | clippy --all-targets | `cast_sign_loss` in core test |
| F02 | MEDIUM | clippy --all-targets | `cast_sign_loss` in bench main |
| F03 | MEDIUM | clippy --all-targets | 9 errors in eval test files |
| F04 | LOW | doc-ratchet | core baseline 290 vs actual 289 |
| F05 | LOW | crate-root docs | ogdb-tck missing `//!` block |
| F06 | LOW | clippy::doc_markdown | 119 missing-backticks warnings |
| F07 | MEDIUM | panic-discipline | 2 bare `.unwrap()` in core hot paths |

**Counts:** BLOCKER = 0, HIGH = 0, MEDIUM = 4 (F01, F02, F03, F07), LOW = 3 (F04, F05, F06).

## Notes on what was clean

- `cargo fmt --all --check` from the worktree: zero diff
- `cargo clippy --workspace -- -D warnings` (CI gate, default targets): zero warnings
- Per-crate `cargo clippy -p <crate> -- -D warnings` (default targets) for all 18 crates: clean
- Public-API surface vs `v0.5.1` tag: zero Rust diff (only `documentation/BENCHMARKS.md` changed)
- Every `unsafe { ... }` block in `ogdb-ffi/src/lib.rs` (20 sites, incl. test mod) and `ogdb-bench/src/main.rs` (2 sites) has a `// SAFETY:` comment immediately preceding it
- `scripts/check-shipped-doc-coverage.sh`, `scripts/check-doc-rust-blocks.sh`, `scripts/check-doc-tests-wired.sh`, `scripts/check-public-doc-tmp-leak.sh`, `scripts/check-crate-root-docs.sh` all pass
- Error-type design: 16 dedicated `pub enum *Error` types using `thiserror` (or hand-written `Display` for `ogdb-core::DbError`); no `Box<dyn Error>` returns
