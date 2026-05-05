# EVAL-RUST-QUALITY-CYCLE17

Area: RUST-QUALITY (all 18 Rust crates)
Base: origin/main @ b994aa7 (post v0.5.1; cycle-16 → cycle-17 = 3 cascade-fix landings)
Worktree: /tmp/wt-c17-rust-quality (detached HEAD, fresh)
Toolchain: rustc 1.88.0 / cargo 1.88.0
Date: 2026-05-05
Predecessor: `documentation/EVAL-RUST-QUALITY-CYCLE16.md` (origin/eval/c16-rust-quality-8496878)

## TL;DR

Cycle-15 + cycle-16 verdicts (**0 BLOCKER, 0 HIGH** in both rounds) are **CONFIRMED for the third consecutive cycle**. RUST-QUALITY remains converged on the BLOCKER/HIGH axis.

Of the 3 fix commits between `8496878` (cycle-16 base) and `b994aa7` (cycle-17 base), **zero touch Rust source**:

| Commit | Files |
|--------|-------|
| `09f9161 fix(npm-packages): strip copilot from skills npm metadata + correct skills+mcp github URLs` | `mcp/package.json`, `skills/package.json`, `skills/src/index.ts`, `scripts/check-skills-copilot-removed.sh` |
| `f72f7cd fix(benchmarks): rebaseline rows 1+2 to 0.4.0 N=5 + extend deltas table` | `documentation/BENCHMARKS.md` only |
| `b994aa7 fix(ci): wire cycle-15 gates into scripts/test.sh + extend verify-claims.sh` | `scripts/test.sh`, `scripts/verify-claims.sh`, two new bash scripts |

`git diff --name-only 8496878..b994aa7 -- '*.rs'` returns empty. Therefore **none** of cycle-16's findings F01–F08 have been closed; they all carry forward verbatim with cycle-17 IDs F01–F08 and identical line numbers. No new findings surfaced — the cycle-17 audit re-ran every cycle-16 axis plus a doc-markdown re-sample and recovered the same shape.

## Scope coverage

Axes scanned this cycle (all from the c17 worktree on `b994aa7`):

- ✅ `cargo fmt --all -- --check` → exit 0, zero diff
- ✅ `cargo clippy -p ogdb-core --lib -- -D warnings` → exit 0, clean (CI-gate equivalent)
- ✅ `bash scripts/check-shipped-doc-coverage.sh` → passes
- ✅ `bash scripts/check-doc-rust-blocks.sh` → passes (`README.md:55`, `DESIGN.md:1584` compile)
- ✅ `bash scripts/check-doc-tests-wired.sh` → passes (H4 step verified in `scripts/test.sh` and `.github/workflows/ci.yml`)
- ✅ `bash scripts/check-doc-ratchet.sh` → reports same `ogdb-core 289/290 (please lower baseline to 289)` drift as cycle-15 + cycle-16 (F06)
- ✅ Re-grep of every cycle-16 finding's file:line → all 8 sites unchanged at the listed line numbers (`crates/ogdb-core/src/lib.rs:18705,19482,21985`, `crates/ogdb-cli/src/init_agent.rs:264`, `crates/ogdb-bench/src/main.rs:743`, `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`, eval driver tests at the cycle-16 line numbers, `crates/ogdb-eval/src/drivers/common.rs:200` redundant_closure)
- ✅ `crates/ogdb-tck/src/lib.rs:1` — confirmed first line is still `use cucumber::gherkin;` (no `//!` block)
- ✅ Public-API surface diff vs `v0.5.1` tag (`git diff v0.5.1..HEAD --stat -- 'crates/**/*.rs'`) → still only the new test file (`upgrade_fixture_v0_5_0_opens_on_current.rs`); zero production-side change → zero risk
- ✅ Unsafe-block delta scan vs cycle-16 → zero new unsafe blocks (no `.rs` changed)
- ✅ Production-side bare `.unwrap()` re-grep → exactly 4 sites (3× ogdb-core lib.rs + 1× ogdb-cli init_agent.rs:264); identical to cycle-16
- ✅ `panic!(` in non-test code → still zero (all 35 `panic!()` sites in shipped-crate `src/*.rs` remain inside `#[cfg(test)]` mods)
- ✅ TODO/FIXME/HACK/XXX scan → exactly one match (`crates/ogdb-eval/tests/skill_quality_adapter.rs:4` Phase-3 TODO doc comment); identical to cycle-16
- ✅ Error-type design (`pub enum *Error` per crate, no `Box<dyn Error>` returns) → unchanged
- ✅ doc_markdown re-sample (per-crate `--lib --message-format=short -W clippy::doc_markdown`):
  - `ogdb-core`: 20 warnings
  - `ogdb-vector`: 0
  - `ogdb-algorithms`: 2
  - distribution roughly matches cycle-16's 119-workspace-total (most concentrated in ogdb-core), confirms F08 is still alive

## Findings

All findings carry forward unchanged from cycle-16. IDs are renumbered F01–F08 to match cycle-16 identically (no new surfaces, no closures). Patch sketches restated for traceability.

### F01 — clippy `cast_sign_loss` in ogdb-core test target [carry-fwd from cycle-16 F01]

- Severity: **MEDIUM**
- File: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`
- Status at HEAD: unchanged. Site reads `let idx = ((samples.len() as f64 - 1.0) * pct / 100.0).round() as usize;`. CI-gate impact: still none (`scripts/test.sh` runs `cargo clippy --workspace -- -D warnings` against default targets, excluding `tests/`); developer impact: any local `cargo clippy --all-targets` hits this.
- Patch sketch: `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on `fn percentile` with rationale "pct ∈ [0,100] and samples.len() ≥ 1 keeps the index ≥ 0", or restructure to `((samples.len().saturating_sub(1) as f64) * pct / 100.0).round().max(0.0) as usize`.

### F02 — clippy `cast_sign_loss` in ogdb-bench main [carry-fwd from cycle-16 F02]

- Severity: **MEDIUM**
- File: `crates/ogdb-bench/src/main.rs:743`
- Status at HEAD: unchanged. Same `(((samples.len() - 1) as f64) * percentile).round() as usize` shape as F01.
- Patch sketch: identical to F01 (per-fn `#[allow]` with rationale or `.max(0.0) as usize`).

### F03 — multiple clippy errors in ogdb-eval `--all-targets` [carry-fwd from cycle-16 F03]

- Severity: **MEDIUM**
- Files (all unchanged at HEAD):
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:50,73` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/scaling_driver.rs:30,82` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/throughput_driver.rs:38` — `cast_sign_loss` (`f64 → u64`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:30,41,52` — `cast_sign_loss` (`f64 → u32`)
  - `crates/ogdb-eval/src/drivers/common.rs:200` — `redundant_closure` (`(1..=100).map(|i| f64::from(i))` should be `.map(f64::from)`)
- Patch sketch: 8× percentile-helper extraction or per-test `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]`; 1× drop the closure on `drivers/common.rs:200`.

### F04 — bare `.unwrap()` in ogdb-core production hot paths [carry-fwd from cycle-16 F04]

- Severity: **MEDIUM**
- Files: `crates/ogdb-core/src/lib.rs:18705`, `:19482`, `:21985` — all three sites confirmed at the original line numbers via grep. Structurally safe (each is guarded by an `is_some()` or `as_ref()` check, or by an outer `has_embeddings` guard) but breaks the workspace's `.expect("rationale")` discipline that ~50 other ogdb-core sites adhere to.
- Patch sketch:
  ```rust
  // 18705
  *remap.get(raw_comm).expect("remap built from unique_raw_ids covers every raw_communities key")
  // 19482
  let cmap = community_by_node.as_ref().expect("community_by_node is Some when config.community_id is set");
  // 21985
  let dims = config.embedding_dimensions.expect("has_embeddings guard above already verified is_some()");
  ```

### F05 — bare `.unwrap()` in ogdb-cli `port_in_use` [carry-fwd from cycle-16 F05]

- Severity: **MEDIUM**
- File: `crates/ogdb-cli/src/init_agent.rs:264`
- Site: `&format!("127.0.0.1:{port}").parse().unwrap()` inside `fn port_in_use(port: u16) -> bool` (called from `ogdb init`). The literal `127.0.0.1:{port}` always parses for any `u16`, so impossible-by-construction — but it still breaks the `.expect("…")` discipline.
- Patch sketch (preferred — eliminates parsing entirely):
  ```rust
  use std::net::SocketAddr;
  TcpStream::connect_timeout(
      &SocketAddr::from(([127, 0, 0, 1], port)),
      Duration::from_millis(250),
  ).is_ok()
  ```

### F06 — doc-ratchet baseline outdated for ogdb-core [carry-fwd from cycle-16 F06]

- Severity: **LOW**
- File: `scripts/check-doc-ratchet.sh:27`
- Status: unchanged. Re-running the script from c17 worktree still emits `ok: ogdb-core 289/290 undocumented (please lower baseline to 289)`.
- Patch sketch (1 line): `[ogdb-core]=289` (down from 290).

### F07 — `crates/ogdb-tck/src/lib.rs` missing top-of-crate `//!` doc [carry-fwd from cycle-16 F07]

- Severity: **LOW**
- File: `crates/ogdb-tck/src/lib.rs:1` — first line still `use cucumber::gherkin;`. `scripts/check-crate-root-docs.sh` skips `publish = false` crates so the gap remains invisible to CI.
- Patch sketch (3 lines):
  ```rust
  //! `ogdb-tck` — Cucumber-based technology-compatibility-kit harness for
  //! `ogdb-core`. Internal `publish = false` crate; entry point is the
  //! `cucumber::World` defined here, driven by `crates/ogdb-tck/tests/`.
  ```

### F08 — clippy::doc_markdown warnings (missing/unbalanced backticks) [carry-fwd from cycle-16 F08]

- Severity: **LOW**
- Status: unchanged at HEAD. Per-crate `--lib --message-format=short -W clippy::doc_markdown` re-sample confirms the warnings still cluster in ogdb-core (20 lib-only) with low-single-digit counts in algorithms/etc., consistent with cycle-16's "119 workspace-wide" measurement (which used `--all-targets`).
- Patch sketch: enable `#![warn(clippy::doc_markdown)]` per shipped crate after a one-shot backtick-wrapping sweep, or set `clippy::doc_markdown = "warn"` in `[workspace.lints.clippy]` once the existing sites are fixed.

## Findings summary

| ID  | Severity | Area                       | Brief                                                  | vs cycle-16 |
|-----|----------|----------------------------|--------------------------------------------------------|-------------|
| F01 | MEDIUM   | clippy --all-targets       | `cast_sign_loss` in core test                          | carry-fwd   |
| F02 | MEDIUM   | clippy --all-targets       | `cast_sign_loss` in bench main                         | carry-fwd   |
| F03 | MEDIUM   | clippy --all-targets       | 9 errors in eval test files                            | carry-fwd   |
| F04 | MEDIUM   | panic-discipline (core)    | 3 bare `.unwrap()` in ogdb-core production             | carry-fwd   |
| F05 | MEDIUM   | panic-discipline (cli)     | 1 bare `.unwrap()` in ogdb-cli `port_in_use`           | carry-fwd   |
| F06 | LOW      | doc-ratchet                | core baseline 290 vs actual 289                        | carry-fwd   |
| F07 | LOW      | crate-root docs            | ogdb-tck missing `//!` block                           | carry-fwd   |
| F08 | LOW      | clippy::doc_markdown       | doc_markdown warnings still present                    | carry-fwd   |

**Counts:** BLOCKER = 0, HIGH = 0, MEDIUM = 5 (F01–F05), LOW = 3 (F06–F08).

## Confirm/refute the cycle-15 + cycle-16 verdict

- **Confirmed (3rd round)**: BLOCKER = 0 and HIGH = 0 hold on `b994aa7`. No commit between `8496878` and `b994aa7` changed any `.rs` file (verified via `git diff --name-only 8496878..b994aa7 -- '*.rs'` returning empty). RUST-QUALITY remains **converged on the ship-blocking axis**.
- **No new findings**: the cycle-17 audit re-ran every cycle-16 axis. All 8 cycle-16 findings carry forward at identical file:line addresses.
- **No closures**: zero of cycle-16's M/L findings were addressed in the 3-commit window (the 3 commits target npm-package metadata, BENCHMARKS doc, and CI script wiring; none of which touch the M/L surfaces).

## What was clean (delta from cycle-16)

- `cargo fmt --all -- --check` from worktree: zero diff (still)
- `cargo clippy -p ogdb-core --lib -- -D warnings`: clean (CI-gate equivalent)
- `bash scripts/check-shipped-doc-coverage.sh`, `check-doc-rust-blocks.sh`, `check-doc-tests-wired.sh`: all pass
- Public-API surface vs `v0.5.1` tag: still only the new ignored-by-default upgrade-fixture test
- Unsafe blocks: no new unsafe in the cycle-16 → cycle-17 delta (no `.rs` touched)
- Error-type design: 16 dedicated `pub enum *Error` types, zero `Box<dyn Error>` returns
- Production-side bare-`.unwrap()` inventory: stable at 4 sites (no growth, no shrinkage)

## Recommendation

RUST-QUALITY is in steady-state converged shape. The 5 MEDIUM and 3 LOW findings are all known carry-forwards with patch sketches; none are ship-blocking. A future cycle should bundle them as a single 1-PR cleanup pass:

1. F01 + F02 + F03 — extract one shared `percentile_index(samples_len, pct)` helper in a workspace-test-utils crate or duplicate a small `#[allow]` macro; resolves all 9 cast sites + 1 redundant_closure.
2. F04 + F05 — 4 mechanical `.unwrap()` → `.expect("…")` (or SocketAddr restructure) edits; resolves panic-discipline drift.
3. F06 — 1-line baseline ratchet decrement.
4. F07 — 3-line `//!` block addition.
5. F08 — gate after a sweep; lowest priority.

None of these require coordination with other areas; they can land in any order.
