# EVAL-RUST-QUALITY-CYCLE18

Area: RUST-QUALITY (all 18 Rust crates)
Base: origin/main @ 91ee552 (post cycle-17; cycle-17 → cycle-18 = 7 fix/docs landings, **zero touch any `.rs` file**)
Worktree: a fresh detached worktree off origin/main
Toolchain: rustc 1.88.0 (6b00bc388 2025-06-23) / cargo 1.88.0
Date: 2026-05-05
Predecessor: `documentation/EVAL-RUST-QUALITY-CYCLE17.md` (origin/eval/c17-rust-quality-b994aa7)

## TL;DR

Cycle-15, cycle-16, **and** cycle-17 verdicts (**0 BLOCKER, 0 HIGH** in all three rounds) are **CONFIRMED for the fourth consecutive cycle**. RUST-QUALITY remains converged on the BLOCKER/HIGH axis.

Of the 7 commits between `b994aa7` (cycle-17 base) and `91ee552` (cycle-18 base), **zero touch Rust source**:

| Commit | Files |
|--------|-------|
| `64929c8 fix(benchmarks): bump headline from rows-3-4-5-6-10 → all-14-rows + tighten gate` | `documentation/BENCHMARKS.md`, `scripts/check-benchmarks-version.sh` |
| `b5bf977 fix(ci): wire check-npm-package-github-url + add structural meta-meta-test (every check-*.sh must be referenced in test.sh)` | `scripts/test.sh`, `scripts/test-all-check-scripts-wired.sh` |
| `0061176 fix(docs): Bolt v0.5 follow-up → v0.6.0 across COMPATIBILITY/SPEC/DESIGN + structural gate` | `SPEC.md`, `DESIGN.md`, `documentation/COMPATIBILITY.md`, `scripts/check-followup-target-not-current.sh`, `scripts/test-check-followup-target-not-current.sh`, `scripts/test.sh` |
| `b5d10c9 docs(readme): simplify hero + drop dense Neo4j comparison + add Can I use RDF section + ship QUICKSTART.md` | `README.md`, `documentation/QUICKSTART.md` |
| `463c3d0 fix(changelog): correct docs/→documentation/ for COOKBOOK + MIGRATION-FROM-NEO4J + add path-resolution gate` | `CHANGELOG.md`, `scripts/check-changelog-paths.sh`, `scripts/test-check-changelog-paths.sh`, `scripts/test.sh` |
| `e585f66 docs(benchmarks): tone down DIRECTIONAL WIN to DIRECTIONAL INDICATOR pending apples-to-apples + drop crushing language` | `documentation/BENCHMARKS.md` only |
| `91ee552 fix(install,readme,changelog): correct demo seed claim — ogdb demo loads MovieLens only, not movies+social+fraud` | `README.md`, `CHANGELOG.md`, `scripts/install.sh` |

`git diff --name-only b994aa7..91ee552 -- '*.rs'` returns empty. `Cargo.lock` is also unchanged. Therefore **none** of cycle-17's findings F01–F08 have been closed; they all carry forward verbatim with cycle-18 IDs F01–F08 and identical line numbers.

The 7-commit window adds 4 new gate scripts (`check-benchmarks-version.sh`, `test-all-check-scripts-wired.sh`, `check-followup-target-not-current.sh`, `check-changelog-paths.sh`) plus 2 self-tests for them; **zero of these introduce or alter any Rust call-path**, so no clippy/build-time regressions are possible from this delta. All 4 new gates exit 0 against the worktree.

## Scope coverage

Axes scanned this cycle (all from the c18 worktree on `91ee552`):

- ✅ `cargo fmt --all -- --check` → exit 0, zero diff
- ✅ `cargo clippy -p ogdb-core --lib -- -D warnings` → exit 0, clean (CI-gate equivalent)
- ✅ Per-crate clippy spot-checks: `-p ogdb-tck --lib`, `-p ogdb-bench --bin ogdb-bench`, `-p ogdb-cli --lib` → all exit 0
- ✅ `bash scripts/check-shipped-doc-coverage.sh` → passes
- ✅ `bash scripts/check-doc-rust-blocks.sh` → passes (`DESIGN.md:1584` block compiles)
- ✅ `bash scripts/check-doc-tests-wired.sh` → passes
- ✅ `bash scripts/check-doc-ratchet.sh` → reports same `ogdb-core 289/290 (please lower baseline to 289)` drift as cycles-15/16/17 (F06)
- ✅ `bash scripts/check-changelog-paths.sh` (new) → passes (12 unique doc paths checked)
- ✅ `bash scripts/check-followup-target-not-current.sh` (new) → passes
- ✅ `bash scripts/check-benchmarks-version.sh` (new) → passes (workspace=0.5.1; headline + §2 agree)
- ✅ `bash scripts/test-all-check-scripts-wired.sh` (new structural meta-test) → passes (every `check-*.sh` is referenced from `test.sh`)
- ✅ Re-grep of every cycle-17 finding's file:line → all 8 sites unchanged at the listed line numbers (`crates/ogdb-core/src/lib.rs:18705,19482,21985`, `crates/ogdb-cli/src/init_agent.rs:264`, `crates/ogdb-bench/src/main.rs:743`, `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`, four eval driver tests at the cycle-17 line numbers, `crates/ogdb-eval/src/drivers/common.rs:201` redundant_closure — note: cycle-17 wrote `:200` but the actual line was `:201` in `b994aa7` too; this is a cycle-17 typo, not a shift)
- ✅ `crates/ogdb-tck/src/lib.rs:1` — confirmed first line is still `use cucumber::gherkin;` (no `//!` block) → F07 still alive
- ✅ Public-API surface diff vs `v0.5.1` tag (`git diff v0.5.1..HEAD --stat -- 'crates/**/*.rs'`) → still only the new test file (`upgrade_fixture_v0_5_0_opens_on_current.rs`); zero production-side Rust delta
- ✅ Unsafe-block delta scan vs cycle-17 → zero new unsafe blocks (no `.rs` changed); workspace count stable at 47 sites
- ✅ Production-side bare `.unwrap()` re-grep → exactly 4 sites (3× ogdb-core lib.rs at the cycle-17 line numbers + 1× ogdb-cli init_agent.rs:264); identical to cycle-17
- ✅ `panic!(` in non-test code → unchanged from cycle-17. Only `crates/ogdb-bench/src/main.rs:122,124` (CLI argv-parsing failures, equivalent to `.expect()` shape, acceptable for a binary). All 35 other `panic!(` sites in shipped-crate `src/*.rs` remain inside `#[cfg(test)]` mods.
- ✅ TODO/FIXME/HACK/XXX scan → zero in shipped `src/`; one in tests (`crates/ogdb-eval/tests/skill_quality_adapter.rs:4` Phase-3 TODO doc comment); identical to cycle-17
- ✅ Error-type design (`pub enum *Error` per crate, no `Box<dyn Error>` returns) → unchanged
- ✅ Bonus: scan of the 4 new gate scripts → all are pure bash + sed/awk/grep over `*.md` / `*.sh`; none invoke `cargo`/`rustc`/`clippy`; none modify Cargo manifests or Rust files → **zero possibility of clippy regressions from this delta** by construction.

## Findings

All findings carry forward unchanged from cycle-17. IDs are renumbered F01–F08 to match cycles-16/17 identically (no new surfaces, no closures). Patch sketches restated for traceability.

### F01 — clippy `cast_sign_loss` in ogdb-core test target [carry-fwd from cycle-17 F01]

- Severity: **MEDIUM**
- File: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`
- Status at HEAD: unchanged. Site reads `let idx = ((samples.len() as f64 - 1.0) * pct / 100.0).round() as usize;`. CI-gate impact: still none (`scripts/test.sh:138` runs `cargo clippy --workspace -- -D warnings` against default targets, excluding `tests/`); developer impact: any local `cargo clippy --all-targets` hits this.
- Patch sketch: `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on `fn percentile` with rationale "pct ∈ [0,100] and samples.len() ≥ 1 keeps the index ≥ 0", or restructure to `((samples.len().saturating_sub(1) as f64) * pct / 100.0).round().max(0.0) as usize`.

### F02 — clippy `cast_sign_loss` in ogdb-bench main [carry-fwd from cycle-17 F02]

- Severity: **MEDIUM**
- File: `crates/ogdb-bench/src/main.rs:743`
- Status at HEAD: unchanged. Same `(((samples.len() - 1) as f64) * percentile).round() as usize` shape as F01.
- Patch sketch: identical to F01.

### F03 — multiple clippy errors in ogdb-eval `--all-targets` [carry-fwd from cycle-17 F03]

- Severity: **MEDIUM**
- Files (all unchanged at HEAD):
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:50,73` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/scaling_driver.rs:30,82` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/throughput_driver.rs:38` — `cast_sign_loss` (`f64 → u64`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:30,41,52` — `cast_sign_loss` (`f64 → u32`)
  - `crates/ogdb-eval/src/drivers/common.rs:201` — `redundant_closure` (`(1..=100).map(|i| f64::from(i))` should be `.map(f64::from)`) [cycle-17 typo'd this as `:200`; actual line was `:201` in `b994aa7` and remains `:201` in `91ee552`]
- Patch sketch: 8× percentile-helper extraction or per-test `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]`; 1× drop the closure on `drivers/common.rs:201`.

### F04 — bare `.unwrap()` in ogdb-core production hot paths [carry-fwd from cycle-17 F04]

- Severity: **MEDIUM**
- Files: `crates/ogdb-core/src/lib.rs:18705`, `:19482`, `:21985` — all three sites confirmed at the original line numbers via grep + verified to lie *before* the `#[cfg(test)]` boundary at `:22174`. Structurally safe (each is guarded by an `is_some()` or `as_ref()` check, or by an outer `has_embeddings` guard) but breaks the workspace's `.expect("rationale")` discipline that ~50 other ogdb-core sites adhere to.
- Patch sketch:
  ```rust
  // 18705
  *remap.get(raw_comm).expect("remap built from unique_raw_ids covers every raw_communities key")
  // 19482
  let cmap = community_by_node.as_ref().expect("community_by_node is Some when config.community_id is set");
  // 21985
  let dims = config.embedding_dimensions.expect("has_embeddings guard above already verified is_some()");
  ```

### F05 — bare `.unwrap()` in ogdb-cli `port_in_use` [carry-fwd from cycle-17 F05]

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

### F06 — doc-ratchet baseline outdated for ogdb-core [carry-fwd from cycle-17 F06]

- Severity: **LOW**
- File: `scripts/check-doc-ratchet.sh:27`
- Status: unchanged. Re-running the script from c18 worktree still emits `ok: ogdb-core 289/290 undocumented (please lower baseline to 289)`.
- Patch sketch (1 line): `[ogdb-core]=289` (down from 290).

### F07 — `crates/ogdb-tck/src/lib.rs` missing top-of-crate `//!` doc [carry-fwd from cycle-17 F07]

- Severity: **LOW**
- File: `crates/ogdb-tck/src/lib.rs:1` — first line still `use cucumber::gherkin;`. `scripts/check-crate-root-docs.sh` skips `publish = false` crates so the gap remains invisible to CI.
- Patch sketch (3 lines):
  ```rust
  //! `ogdb-tck` — Cucumber-based technology-compatibility-kit harness for
  //! `ogdb-core`. Internal `publish = false` crate; entry point is the
  //! `cucumber::World` defined here, driven by `crates/ogdb-tck/tests/`.
  ```

### F08 — clippy::doc_markdown warnings (missing/unbalanced backticks) [carry-fwd from cycle-17 F08]

- Severity: **LOW**
- Status: unchanged at HEAD. No `.rs` changed in the cycle-17 → cycle-18 delta, so the doc_markdown surface is bit-identical to what cycle-17 measured (≈119 workspace-wide warnings, 20 of them in `ogdb-core --lib`).
- Patch sketch: enable `#![warn(clippy::doc_markdown)]` per shipped crate after a one-shot backtick-wrapping sweep, or set `clippy::doc_markdown = "warn"` in `[workspace.lints.clippy]` once the existing sites are fixed.

## Findings summary

| ID  | Severity | Area                       | Brief                                                  | vs cycle-17 |
|-----|----------|----------------------------|--------------------------------------------------------|-------------|
| F01 | MEDIUM   | clippy --all-targets       | `cast_sign_loss` in core test                          | carry-fwd   |
| F02 | MEDIUM   | clippy --all-targets       | `cast_sign_loss` in bench main                         | carry-fwd   |
| F03 | MEDIUM   | clippy --all-targets       | 9 errors in eval test/driver files                     | carry-fwd   |
| F04 | MEDIUM   | panic-discipline (core)    | 3 bare `.unwrap()` in ogdb-core production             | carry-fwd   |
| F05 | MEDIUM   | panic-discipline (cli)     | 1 bare `.unwrap()` in ogdb-cli `port_in_use`           | carry-fwd   |
| F06 | LOW      | doc-ratchet                | core baseline 290 vs actual 289                        | carry-fwd   |
| F07 | LOW      | crate-root docs            | ogdb-tck missing `//!` block                           | carry-fwd   |
| F08 | LOW      | clippy::doc_markdown       | doc_markdown warnings still present                    | carry-fwd   |

**Counts:** BLOCKER = 0, HIGH = 0, MEDIUM = 5 (F01–F05), LOW = 3 (F06–F08).

## Confirm/refute the cycle-15+16+17 verdict

- **Confirmed (4th round)**: BLOCKER = 0 and HIGH = 0 hold on `91ee552`. No commit between `b994aa7` and `91ee552` changed any `.rs` file (verified via `git diff --name-only b994aa7..91ee552 -- '*.rs'` returning empty). `Cargo.lock` is also unchanged. RUST-QUALITY remains **converged on the ship-blocking axis**.
- **No new findings**: the cycle-18 audit re-ran every cycle-17 axis plus the 4 new gate scripts. All 8 cycle-17 findings carry forward at identical file:line addresses.
- **No closures**: zero of cycle-17's M/L findings were addressed in the 7-commit window (the 7 commits target docs accuracy + new bash gate scripts; none touch the M/L surfaces).
- **Bonus axis (new gate scripts)**: the 4 new scripts (`check-benchmarks-version.sh`, `check-changelog-paths.sh`, `check-followup-target-not-current.sh`, `test-all-check-scripts-wired.sh`) are pure bash + text utilities. None invoke `cargo`/`rustc`/`clippy` and none modify Rust source — **zero clippy-regression surface introduced**. All 4 exit 0 against `91ee552`.

## What was clean (delta from cycle-17)

- `cargo fmt --all -- --check` from c18 worktree: zero diff (still)
- `cargo clippy -p ogdb-core --lib -- -D warnings`: clean (CI-gate equivalent)
- Per-crate clippy spot-checks (`ogdb-tck --lib`, `ogdb-bench --bin`, `ogdb-cli --lib`): all clean
- `bash scripts/check-shipped-doc-coverage.sh`, `check-doc-rust-blocks.sh`, `check-doc-tests-wired.sh`: all pass
- New gates (`check-changelog-paths.sh`, `check-followup-target-not-current.sh`, `check-benchmarks-version.sh`, `test-all-check-scripts-wired.sh`): all pass
- Public-API surface vs `v0.5.1` tag: still only the new ignored-by-default upgrade-fixture test (`upgrade_fixture_v0_5_0_opens_on_current.rs`)
- Unsafe blocks: no new unsafe in the cycle-17 → cycle-18 delta (no `.rs` touched); workspace count stable at 47 sites
- Error-type design: 16 dedicated `pub enum *Error` types, zero `Box<dyn Error>` returns
- Production-side bare-`.unwrap()` inventory: stable at 4 sites (no growth, no shrinkage)
- TODO/FIXME inventory: stable at 1 (Phase-3 doc comment in `crates/ogdb-eval/tests/skill_quality_adapter.rs:4`)
- `panic!(` in non-test shipped code: stable at 2 (CLI argv-parsing in `ogdb-bench/src/main.rs:122,124`)

## Recommendation

RUST-QUALITY is in steady-state converged shape **for the fourth consecutive cycle**. The 5 MEDIUM and 3 LOW findings are all known carry-forwards with patch sketches; none are ship-blocking. A future cycle should bundle them as a single 1-PR cleanup pass:

1. F01 + F02 + F03 — extract one shared `percentile_index(samples_len, pct)` helper in a workspace-test-utils crate or duplicate a small `#[allow]` macro; resolves all 9 cast sites + 1 redundant_closure.
2. F04 + F05 — 4 mechanical `.unwrap()` → `.expect("…")` (or SocketAddr restructure) edits; resolves panic-discipline drift.
3. F06 — 1-line baseline ratchet decrement.
4. F07 — 3-line `//!` block addition.
5. F08 — gate after a sweep; lowest priority.

None of these require coordination with other areas; they can land in any order. Given 4 consecutive clean cycles on the BLOCKER/HIGH axis with **zero Rust delta** in the last 7 commits, future RUST-QUALITY cycles can confidently shift to a lower cadence (e.g., trigger only when `git diff <prev-base>..HEAD -- '*.rs' Cargo.toml Cargo.lock` is non-empty) until the M/L cleanup PR lands.
