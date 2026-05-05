# EVAL-RUST-QUALITY-CYCLE21

Area: RUST-QUALITY (all 18 Rust crates)
Base: origin/main @ `cfb3d40` (post readme-cli-listing fix + cycle-20 skills mirror sweep)
Worktree: a fresh detached worktree off `origin/main` @ `cfb3d40`
Toolchain: rustc 1.88.0 (6b00bc388 2025-06-23) / cargo 1.88.0 (873a06493 2025-05-10)
Date: 2026-05-05
Predecessor: `documentation/EVAL-RUST-QUALITY-CYCLE20.md` (origin/eval/c20-rust-quality-fb0ec7a)

## TL;DR

Cycle-15, cycle-16, cycle-17, cycle-18, **and** cycle-20 verdicts (**0 BLOCKER, 0 HIGH** in all five prior rounds) are **CONFIRMED for the sixth consecutive scan** on `cfb3d40`. RUST-QUALITY remains converged on the BLOCKER/HIGH axis. The cycle-20 → cycle-21 delta is a tiny test-only Rust touch (one `tests/readme_cli_listing.rs` refactor) that introduces **zero** clippy regressions.

Of the 2 commits between `fb0ec7a` (cycle-20 base) and `cfb3d40` (cycle-21 base), **only 1 touches Rust source** — and the touch is in a `tests/` file:

| Commit | Rust files | Net Rust delta |
|--------|------------|----------------|
| `6108439 fix(skills): sweep all 11 remaining rows + measurement date + tighten vocab gate to case-insensitive` | (none) | 0 lines |
| `cfb3d40 fix(test): readme_cli_listing scans README+QUICKSTART+CLI.md (post-simplification fix); ship CLI.md as canonical CLI reference` | `crates/ogdb-cli/tests/readme_cli_listing.rs` | +39 / −14 |

Stat: `+39 / −14` across 1 file. **Zero structural Rust changes** — no production-side `.rs` touched, no new `pub` API, no new unsafe, no new `.unwrap()`/`.expect()`/`panic!` in shipped code, no new public/private fn signatures, no new dependencies, no `Cargo.toml` / `Cargo.lock` deltas.

`git diff --name-only fb0ec7a..cfb3d40 -- '*.rs' '*.toml' Cargo.lock` lists exactly 1 file (`crates/ogdb-cli/tests/readme_cli_listing.rs`) and zero manifests. The only non-Rust commit in this window (`6108439` skills/sweep) cannot affect Rust call-paths by construction. The sole Rust commit (`cfb3d40`) widens an existing test's doc-coverage scan from a single `README.md` read to a multi-file union (`README.md`, `documentation/CLI.md`, `documentation/QUICKSTART.md`, `documentation/COOKBOOK.md`, `documentation/MIGRATION-FROM-NEO4J.md`) — pure test-target re-scoping, no production behaviour change.

## Scope coverage

Axes scanned this cycle (all from the c21 worktree on `cfb3d40`):

- ✅ `cargo fmt --all -- --check` → exit 0, zero diff
- ✅ `cargo clippy -p ogdb-cli --tests -- -D warnings` → exit 0, clean (covers the rewritten `tests/readme_cli_listing.rs`)
- ✅ `cargo clippy -p ogdb-cli --lib -- -D warnings` → exit 0, clean
- ✅ `cargo clippy -p ogdb-core --lib -- -D warnings` → exit 0, clean (CI-gate equivalent)
- ✅ `cargo clippy -p ogdb-tck --lib -- -D warnings` → exit 0, clean
- ✅ `cargo clippy -p ogdb-bench --bin ogdb-bench -- -D warnings` → exit 0, clean
- ✅ `bash scripts/check-doc-ratchet.sh` → emits same `ogdb-core 289/290 (please lower baseline to 289)` drift as cycles-15/16/17/18/20 (F06 below)
- ✅ Re-grep of every cycle-20 finding's file:line → all 8 sites unchanged at the listed line numbers
  - F01: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74` — verified verbatim
  - F02: `crates/ogdb-bench/src/main.rs:743` — verified verbatim
  - F04: `crates/ogdb-core/src/lib.rs:18705`, `:19482`, `:21985` — verified verbatim
  - F05: `crates/ogdb-cli/src/init_agent.rs:264` — verified verbatim (`&format!("127.0.0.1:{port}").parse().unwrap(),`)
  - F06: `scripts/check-doc-ratchet.sh:27` — `[ogdb-core]=290` unchanged
  - F07: `crates/ogdb-tck/src/lib.rs:1` — first line still `use cucumber::gherkin;`
- ✅ Public-API surface diff vs `v0.5.1` tag → unchanged from cycle-20 (still only the new ignored-by-default upgrade-fixture test; zero production-side `pub` delta)
- ✅ Unsafe-block delta scan vs cycle-20 → zero new unsafe (no production `.rs` touched; the test-target `.rs` touch contains no `unsafe`); workspace count stable
- ✅ Production-side bare `.unwrap()` re-grep → unchanged at exactly 4 sites (3× ogdb-core lib.rs + 1× ogdb-cli init_agent.rs:264). The rewritten test uses `panic!(...)` only in the documented "required doc missing" branch (already-existing pattern, just narrowed to required files).
- ✅ `panic!(` in non-test shipped code → unchanged from cycle-20 (still 2 sites: `ogdb-bench/src/main.rs:122,124` argv-parsing). The test-only `panic!` introduced inside `match … Err(e) if … => { panic!(...) }` lives in `crates/ogdb-cli/tests/readme_cli_listing.rs` and is correctly scoped (test target + same panic-on-IO-error semantics as the prior code).
- ✅ TODO/FIXME/HACK/XXX scan → unchanged at 1 (Phase-3 doc comment in `crates/ogdb-eval/tests/skill_quality_adapter.rs:4`)

## Findings

All findings carry forward unchanged from cycle-20 with identical line numbers. IDs renumbered F01–F08 (matching the cycle-20 numbering). Cycle-19 was dropped due to flake; cycle-21 is the **6th-round confirmation** on the BLOCKER/HIGH axis.

### F01 — clippy `cast_sign_loss` in ogdb-core test target [carry-fwd from cycle-20 F01]

- Severity: **MEDIUM**
- File: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`
- Status at HEAD: unchanged. Site reads `let idx = ((samples.len() as f64 - 1.0) * pct / 100.0).round() as usize;`. CI-gate impact: still none (`scripts/test.sh` invokes `cargo clippy --workspace -- -D warnings` against default targets, excluding `tests/`); developer impact: any local `cargo clippy --all-targets` hits this.
- Patch sketch: `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on `fn percentile` with rationale "pct ∈ [0,100] and samples.len() ≥ 1 keeps the index ≥ 0", or restructure to `((samples.len().saturating_sub(1) as f64) * pct / 100.0).round().max(0.0) as usize`.

### F02 — clippy `cast_sign_loss` in ogdb-bench main [carry-fwd from cycle-20 F02]

- Severity: **MEDIUM**
- File: `crates/ogdb-bench/src/main.rs:743`
- Status at HEAD: unchanged. Same `(((samples.len() - 1) as f64) * percentile).round() as usize` shape as F01.
- Patch sketch: identical to F01.

### F03 — multiple clippy errors in ogdb-eval `--all-targets` [carry-fwd from cycle-20 F03]

- Severity: **MEDIUM**
- Files (all unchanged at HEAD):
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:50,73` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/scaling_driver.rs:30,82` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/throughput_driver.rs:38` — `cast_sign_loss` (`f64 → u64`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:30,41,52` — `cast_sign_loss` (`f64 → u32`)
  - `crates/ogdb-eval/src/drivers/common.rs:201` — `redundant_closure` (`(1..=100).map(|i| f64::from(i))` should be `.map(f64::from)`)
- Patch sketch: 8× percentile-helper extraction or per-test `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]`; 1× drop the closure on `drivers/common.rs:201`.

### F04 — bare `.unwrap()` in ogdb-core production hot paths [carry-fwd from cycle-20 F04]

- Severity: **MEDIUM**
- Files: `crates/ogdb-core/src/lib.rs:18705`, `:19482`, `:21985` — all three sites confirmed at the original line numbers (no `ogdb-core/src/lib.rs` change in the cycle-20 → cycle-21 delta).
- Patch sketch:
  ```rust
  // 18705
  *remap.get(raw_comm).expect("remap built from unique_raw_ids covers every raw_communities key")
  // 19482
  let cmap = community_by_node.as_ref().expect("community_by_node is Some when config.community_id is set");
  // 21985
  let dims = config.embedding_dimensions.expect("has_embeddings guard above already verified is_some()");
  ```

### F05 — bare `.unwrap()` in ogdb-cli `port_in_use` [carry-fwd from cycle-20 F05]

- Severity: **MEDIUM**
- File: `crates/ogdb-cli/src/init_agent.rs:264`
- Status at HEAD: unchanged. The cycle-20 → cycle-21 window touched `init_agent.rs` at zero lines; the file's only delta in the prior cycle (path-sweep at L35/L234/L274/L454) did not intersect L264 either. Site remains `&format!("127.0.0.1:{port}").parse().unwrap()` inside `fn port_in_use`. Impossible-by-construction (every `u16` parses as a valid IPv4 socket), but still breaks the workspace's `.expect("rationale")` discipline.
- Patch sketch (preferred — eliminates parsing entirely):
  ```rust
  use std::net::SocketAddr;
  TcpStream::connect_timeout(
      &SocketAddr::from(([127, 0, 0, 1], port)),
      Duration::from_millis(250),
  ).is_ok()
  ```

### F06 — doc-ratchet baseline outdated for ogdb-core [carry-fwd from cycle-20 F06]

- Severity: **LOW**
- File: `scripts/check-doc-ratchet.sh:27`
- Status: unchanged. Re-running the script from c21 worktree still emits `ok: ogdb-core 289/290 undocumented (please lower baseline to 289)`.
- Patch sketch (1 line): `[ogdb-core]=289` (down from 290).

### F07 — `crates/ogdb-tck/src/lib.rs` missing top-of-crate `//!` doc [carry-fwd from cycle-20 F07]

- Severity: **LOW**
- File: `crates/ogdb-tck/src/lib.rs:1` — first line still `use cucumber::gherkin;`. `scripts/check-crate-root-docs.sh` skips `publish = false` crates so the gap remains invisible to CI.
- Patch sketch (3 lines):
  ```rust
  //! `ogdb-tck` — Cucumber-based technology-compatibility-kit harness for
  //! `ogdb-core`. Internal `publish = false` crate; entry point is the
  //! `cucumber::World` defined here, driven by `crates/ogdb-tck/tests/`.
  ```

### F08 — clippy::doc_markdown warnings (missing/unbalanced backticks) [carry-fwd from cycle-20 F08]

- Severity: **LOW**
- Status: unchanged. The single `.rs` touched in this delta is in `ogdb-cli` (`tests/readme_cli_listing.rs`); none of the 39 added lines are `///` doc comments on shipped APIs (added lines are inner-doc `//!` clarifying the test's contract, plus one `///` comment on the new `DOC_FILES` const, which is a private test-target item). Workspace-wide doc_markdown surface is functionally identical to cycle-20 (≈119 warnings, 20 of them in `ogdb-core --lib`).
- Patch sketch: enable `#![warn(clippy::doc_markdown)]` per shipped crate after a one-shot backtick-wrapping sweep, or set `clippy::doc_markdown = "warn"` in `[workspace.lints.clippy]` once the existing sites are fixed.

## Findings summary

| ID  | Severity | Area                       | Brief                                                  | vs cycle-20 |
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

## Confirm/refute the cycle-15 → cycle-20 verdict

- **Confirmed (6th round on the BLOCKER/HIGH axis)**: BLOCKER = 0 and HIGH = 0 hold on `cfb3d40`. The only Rust commit in the cycle-20 → cycle-21 window is a test-target rewrite at `crates/ogdb-cli/tests/readme_cli_listing.rs` that broadens the doc-coverage scan from a single `README.md` read to a multi-file union. The companion non-Rust commit (`6108439`, skills sweep + vocab-gate tightening) cannot reach Rust call-paths by construction — touched files are `skills/opengraphdb/SKILL.md`, `skills/opengraphdb/references/benchmarks-snapshot.md`, and `scripts/check-benchmarks-vocabulary-mirror.sh`. Verified via lib + tests + bin clippy gates on `ogdb-cli` plus lib clippy gates on `ogdb-core`, `ogdb-tck`, `ogdb-bench`, all exit 0 with `-D warnings`.
- **No new findings**: every cycle-20 finding F01–F08 carries forward at identical file:line coordinates. The single test-file touch lives at lines 1–17 / 39–50 / 76–86 of `tests/readme_cli_listing.rs` and does not intersect any cycle-20 finding site.
- **No closures**: zero of cycle-20's M/L findings were addressed. The 2-commit window targets a doc-listing test fix and a skills/vocabulary mirror sweep; neither touches the M/L surfaces.
- **Bonus axis (delta safety check)**: the rewritten `tests/readme_cli_listing.rs` is clippy-clean. The new `DOC_FILES: &[&str]` const + `match std::fs::read_to_string(&path) { Ok(c) => combined.push_str(&c), Err(e) if *rel == "..." => panic!(...), Err(_) => {} }` pattern is idiomatic — mandatory files (`README.md`, `documentation/CLI.md`) panic on read error (correct behaviour for a regression gate); optional files silently skip. No new unwrap, no new unsafe, no new dependency, no new `pub` API.

## What was clean (delta from cycle-20)

- `cargo fmt --all -- --check` from c21 worktree: zero diff (still)
- `cargo clippy -p ogdb-core --lib -- -D warnings`: clean
- `cargo clippy -p ogdb-cli --lib -- -D warnings`: clean
- `cargo clippy -p ogdb-cli --tests -- -D warnings`: clean (covers rewritten `tests/readme_cli_listing.rs`)
- `cargo clippy -p ogdb-tck --lib -- -D warnings`: clean
- `cargo clippy -p ogdb-bench --bin ogdb-bench -- -D warnings`: clean
- `bash scripts/check-doc-ratchet.sh`: passes (still emits the F06 hint)
- Public-API surface vs `v0.5.1` tag: still only the new ignored-by-default upgrade-fixture test
- Production-side bare-`.unwrap()` inventory: stable at 4 sites (no growth)
- Unsafe inventory: stable; no new unsafe in the cycle-20 → cycle-21 delta
- TODO/FIXME inventory: stable at 1 (Phase-3 doc comment)
- `panic!(` in non-test shipped code: stable at 2 (CLI argv-parsing)
- New code review (manual): the test-target rewrite is idiomatic — `let workspace_root = …;` extracted once and reused across 5 reads, an iterator over a `const &[&str]` + a `match` on `read_to_string` that distinguishes "required" vs "optional" docs, and a single-pass `combined.contains(cmd)` predicate. The widening of the contract from "README mentions X" to "any of {README, CLI.md, QUICKSTART, COOKBOOK, MIGRATION} mentions X" matches the README-simplification motion and keeps the test green without weakening the underlying invariant (every subcommand is documented somewhere user-facing).

## Recommendation

RUST-QUALITY is in steady-state converged shape **for the sixth consecutive scan** on the BLOCKER/HIGH axis. The 5 MEDIUM and 3 LOW findings are all known carry-forwards with patch sketches; none ship-blocking. A future cycle should bundle them as a single 1-PR cleanup pass (sketches identical to cycle-20):

1. F01 + F02 + F03 — extract one shared `percentile_index(samples_len, pct)` helper or duplicate a small `#[allow]` macro; resolves all 9 cast sites + 1 redundant_closure.
2. F04 + F05 — 4 mechanical `.unwrap()` → `.expect("…")` (or SocketAddr restructure) edits; resolves panic-discipline drift.
3. F06 — 1-line baseline ratchet decrement.
4. F07 — 3-line `//!` block addition.
5. F08 — gate after a sweep; lowest priority.

Given **6 consecutive confirmations** (cycles 15/16/17/18/20/21 — cycle-19 was dropped) on the BLOCKER/HIGH axis, with the cycle-20 → cycle-21 window adding only a test-target doc-coverage refactor (zero clippy regression, zero unsafe delta, zero unwrap delta in shipped code, zero public-API delta, zero manifest delta), RUST-QUALITY scans should remain on a lower cadence — trigger only when `git diff <prev-base>..HEAD -- '*.rs' Cargo.toml Cargo.lock` exceeds a threshold (e.g., > 50 production-side lines or any manifest touch) until the M/L cleanup PR lands. The cycle-20 → cycle-21 delta of 39+/14- across a single `tests/` file does **not** clear that threshold; this audit is the bookkeeping confirmation the prompt expected.
