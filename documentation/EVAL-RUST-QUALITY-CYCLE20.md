# EVAL-RUST-QUALITY-CYCLE20

Area: RUST-QUALITY (all 18 Rust crates)
Base: origin/main @ `fb0ec7a` (post cycle-19 path-sweep + migration-spec; cycle-19 was dropped due to flake)
Worktree: a fresh detached worktree off `origin/main` @ `fb0ec7a`
Toolchain: rustc 1.88.0 (6b00bc388 2025-06-23) / cargo 1.88.0 (873a06493 2025-05-10)
Date: 2026-05-05
Predecessor: `documentation/EVAL-RUST-QUALITY-CYCLE18.md` (origin/eval/c18-rust-quality-91ee552) — cycle-19 audit was not produced

## TL;DR

Cycle-15, cycle-16, cycle-17, **and** cycle-18 verdicts (**0 BLOCKER, 0 HIGH** in all four prior rounds) are **CONFIRMED for the fifth consecutive scan** on `fb0ec7a`. RUST-QUALITY remains converged on the BLOCKER/HIGH axis. The cycle-19 → cycle-20 delta is a tiny, surgical Rust touch (path-sweep + a 12-line `else` branch) that introduces **zero** clippy regressions.

Of the 11 commits between `91ee552` (cycle-18 base) and `fb0ec7a` (cycle-20 base), **only 2 touch Rust source**:

| Commit | Rust files | Net Rust delta |
|--------|------------|----------------|
| `6c17c3d fix(install,demo): align install.sh path with binary default + ogdb demo re-seeds empty init files` | `crates/ogdb-cli/src/lib.rs`, `crates/ogdb-cli/tests/demo_subcommand.rs` (new) | +1 `path_exists` extraction, +12-line `else { … if is_empty { seed } }` block, + new test file |
| `fb0ec7a fix(paths): complete ~/.opengraphdb → ~/.ogdb sweep across init_agent.rs + skill bundle + widen gate` | `crates/ogdb-cli/src/init_agent.rs` | 4 string-literal swaps (`".opengraphdb"` → `".ogdb"`) at L35 (doc comment), L234, L274, L454 |

Stat: `+97 / −5` across 3 files. **Zero structural Rust changes** — no new `pub` API, no new unsafe, no new `.unwrap()`/`.expect()`/`panic!`, no new public/private fn signatures, no new dependencies, no `Cargo.toml` / `Cargo.lock` deltas. The diff is a literal-string sweep + a 12-line idempotency guard around an already-idiomatic seed call.

`git diff --name-only 91ee552..fb0ec7a -- '*.rs' '*.toml' Cargo.lock` lists exactly 3 files and zero manifests. The 9 non-Rust commits in this window (changelog/install/release/clippy fix, plus skill-bundle path edits) cannot affect Rust call-paths by construction.

## Scope coverage

Axes scanned this cycle (all from the c20 worktree on `fb0ec7a`):

- ✅ `cargo fmt --all -- --check` → exit 0, zero diff
- ✅ `cargo clippy -p ogdb-cli --lib -- -D warnings` → exit 0, clean (covers the new `else { … is_empty { seed } }` block in `cli/src/lib.rs:3788–3796`)
- ✅ `cargo clippy -p ogdb-cli --tests -- -D warnings` → exit 0, clean (covers the new `tests/demo_subcommand.rs`)
- ✅ `cargo clippy -p ogdb-cli --bin ogdb -- -D warnings` → exit 0, clean
- ✅ `cargo clippy -p ogdb-core --lib -- -D warnings` → exit 0, clean (CI-gate equivalent)
- ✅ `cargo clippy -p ogdb-tck --lib -- -D warnings` → exit 0, clean
- ✅ `cargo clippy -p ogdb-bench --bin ogdb-bench -- -D warnings` → exit 0, clean
- ✅ `bash scripts/check-doc-ratchet.sh` → emits same `ogdb-core 289/290 (please lower baseline to 289)` drift as cycles-15/16/17/18 (F03 below)
- ✅ Re-grep of every cycle-18 finding's file:line → all 8 sites unchanged at the listed line numbers
- ✅ Path-sweep verification on `init_agent.rs` → confirmed only L35 (doc comment), L234, L274, L454 changed; cycle-18 F02 site (`init_agent.rs:264` `.parse().unwrap()`) **did not shift** (still at L264 verbatim) and is **not** part of the path-sweep
- ✅ Public-API surface diff vs `v0.5.1` tag → still only the new ignored-by-default upgrade-fixture test; zero production-side `pub` delta
- ✅ Unsafe-block delta scan vs cycle-18 → zero new unsafe (no `core` `.rs` touched; cli `.rs` touch contains no `unsafe`); workspace count stable
- ✅ Production-side bare `.unwrap()` re-grep → unchanged at exactly 4 sites (3× ogdb-core lib.rs + 1× ogdb-cli init_agent.rs:264). The new `else` block in `cli/src/lib.rs` uses `Database::open(&db_path)?` and a clean `db.node_count() == 0 && db.edge_count() == 0` predicate — no new unwraps introduced.
- ✅ `panic!(` in non-test shipped code → unchanged from cycle-18 (still 2 sites: `ogdb-bench/src/main.rs:122,124` argv-parsing). The new `cli/src/lib.rs` block raises 0 panics.
- ✅ TODO/FIXME/HACK/XXX scan → unchanged at 1 (Phase-3 doc comment in `crates/ogdb-eval/tests/skill_quality_adapter.rs:4`)

## Findings

All findings carry forward unchanged from cycle-18 with identical line numbers. IDs renumbered to F01–F08; predecessor IDs noted. Cycle-19 left no audit; this cycle is the 5th-round confirmation.

### F01 — clippy `cast_sign_loss` in ogdb-core test target [carry-fwd from cycle-18 F01]

- Severity: **MEDIUM**
- File: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`
- Status at HEAD: unchanged. Site reads `let idx = ((samples.len() as f64 - 1.0) * pct / 100.0).round() as usize;`. CI-gate impact: still none (`scripts/test.sh` invokes `cargo clippy --workspace -- -D warnings` against default targets, excluding `tests/`); developer impact: any local `cargo clippy --all-targets` hits this.
- Patch sketch: `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on `fn percentile` with rationale "pct ∈ [0,100] and samples.len() ≥ 1 keeps the index ≥ 0", or restructure to `((samples.len().saturating_sub(1) as f64) * pct / 100.0).round().max(0.0) as usize`.

### F02 — clippy `cast_sign_loss` in ogdb-bench main [carry-fwd from cycle-18 F02]

- Severity: **MEDIUM**
- File: `crates/ogdb-bench/src/main.rs:743`
- Status at HEAD: unchanged. Same `(((samples.len() - 1) as f64) * percentile).round() as usize` shape as F01.
- Patch sketch: identical to F01.

### F03 — multiple clippy errors in ogdb-eval `--all-targets` [carry-fwd from cycle-18 F03]

- Severity: **MEDIUM**
- Files (all unchanged at HEAD):
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:50,73` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/scaling_driver.rs:30,82` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/throughput_driver.rs:38` — `cast_sign_loss` (`f64 → u64`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:30,41,52` — `cast_sign_loss` (`f64 → u32`)
  - `crates/ogdb-eval/src/drivers/common.rs:201` — `redundant_closure` (`(1..=100).map(|i| f64::from(i))` should be `.map(f64::from)`)
- Patch sketch: 8× percentile-helper extraction or per-test `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]`; 1× drop the closure on `drivers/common.rs:201`.

### F04 — bare `.unwrap()` in ogdb-core production hot paths [carry-fwd from cycle-18 F04]

- Severity: **MEDIUM**
- Files: `crates/ogdb-core/src/lib.rs:18705`, `:19482`, `:21985` — all three sites confirmed at the original line numbers (no `ogdb-core/src/lib.rs` change in the cycle-18 → cycle-20 delta).
- Patch sketch:
  ```rust
  // 18705
  *remap.get(raw_comm).expect("remap built from unique_raw_ids covers every raw_communities key")
  // 19482
  let cmap = community_by_node.as_ref().expect("community_by_node is Some when config.community_id is set");
  // 21985
  let dims = config.embedding_dimensions.expect("has_embeddings guard above already verified is_some()");
  ```

### F05 — bare `.unwrap()` in ogdb-cli `port_in_use` [carry-fwd from cycle-18 F05]

- Severity: **MEDIUM**
- File: `crates/ogdb-cli/src/init_agent.rs:264`
- Status at HEAD: unchanged. The cycle-19 → cycle-20 path-sweep touched L35/L234/L274/L454 only; **L264 was not part of the sweep** and remains `&format!("127.0.0.1:{port}").parse().unwrap()` inside `fn port_in_use`. The literal is impossible-by-construction (every `u16` parses as a valid IPv4 socket), but it still breaks the workspace's `.expect("rationale")` discipline.
- Patch sketch (preferred — eliminates parsing entirely):
  ```rust
  use std::net::SocketAddr;
  TcpStream::connect_timeout(
      &SocketAddr::from(([127, 0, 0, 1], port)),
      Duration::from_millis(250),
  ).is_ok()
  ```

### F06 — doc-ratchet baseline outdated for ogdb-core [carry-fwd from cycle-18 F06]

- Severity: **LOW**
- File: `scripts/check-doc-ratchet.sh:27`
- Status: unchanged. Re-running the script from c20 worktree still emits `ok: ogdb-core 289/290 undocumented (please lower baseline to 289)`.
- Patch sketch (1 line): `[ogdb-core]=289` (down from 290).

### F07 — `crates/ogdb-tck/src/lib.rs` missing top-of-crate `//!` doc [carry-fwd from cycle-18 F07]

- Severity: **LOW**
- File: `crates/ogdb-tck/src/lib.rs:1` — first line still `use cucumber::gherkin;`. `scripts/check-crate-root-docs.sh` skips `publish = false` crates so the gap remains invisible to CI.
- Patch sketch (3 lines):
  ```rust
  //! `ogdb-tck` — Cucumber-based technology-compatibility-kit harness for
  //! `ogdb-core`. Internal `publish = false` crate; entry point is the
  //! `cucumber::World` defined here, driven by `crates/ogdb-tck/tests/`.
  ```

### F08 — clippy::doc_markdown warnings (missing/unbalanced backticks) [carry-fwd from cycle-18 F08]

- Severity: **LOW**
- Status: unchanged. The 3 `.rs` touched in this delta are all in `ogdb-cli` (cli/src/lib.rs, cli/src/init_agent.rs, cli/tests/demo_subcommand.rs); none modify `ogdb-core` `///` blocks. Workspace-wide doc_markdown surface is functionally identical to cycle-18 (≈119 warnings, 20 of them in `ogdb-core --lib`).
- Patch sketch: enable `#![warn(clippy::doc_markdown)]` per shipped crate after a one-shot backtick-wrapping sweep, or set `clippy::doc_markdown = "warn"` in `[workspace.lints.clippy]` once the existing sites are fixed.

## Findings summary

| ID  | Severity | Area                       | Brief                                                  | vs cycle-18 |
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

## Confirm/refute the cycle-15 → cycle-18 verdict

- **Confirmed (5th round on the BLOCKER/HIGH axis)**: BLOCKER = 0 and HIGH = 0 hold on `fb0ec7a`. The only Rust commits in the cycle-18 → cycle-20 window are an idempotency guard in `cli/src/lib.rs::handle_demo` (with companion test) and a literal-string path-sweep in `init_agent.rs`. Neither introduces a clippy regression — verified via lib + tests + bin clippy gates on `ogdb-cli` plus lib clippy gates on `ogdb-core`, `ogdb-tck`, `ogdb-bench`, all exit 0 with `-D warnings`.
- **No new findings**: every cycle-18 finding F01–F08 carries forward at identical file:line coordinates. The path-sweep at `init_agent.rs:35/234/274/454` does **not** intersect F05's site at `init_agent.rs:264`.
- **No closures**: zero of cycle-18's M/L findings were addressed. The 11-commit window targets install/release plumbing + path normalization + new gate scripts; none touches the M/L surfaces.
- **Bonus axis (delta safety check)**: the 12-line `else { … if is_empty { seed } }` block at `cli/src/lib.rs:3788–3796` is clippy-clean as an extracted concern. The `db.node_count() == 0 && db.edge_count() == 0` predicate uses two existing `pub` accessors on `Database` and bubbles errors via `?` against the existing `CliError` chain — no new error variant required, no new unwrap.

## What was clean (delta from cycle-18)

- `cargo fmt --all -- --check` from c20 worktree: zero diff (still)
- `cargo clippy -p ogdb-core --lib -- -D warnings`: clean
- `cargo clippy -p ogdb-cli --lib -- -D warnings`: clean (covers new `handle_demo` else branch)
- `cargo clippy -p ogdb-cli --tests -- -D warnings`: clean (covers new `tests/demo_subcommand.rs`)
- `cargo clippy -p ogdb-cli --bin ogdb -- -D warnings`: clean
- `cargo clippy -p ogdb-tck --lib -- -D warnings`: clean
- `cargo clippy -p ogdb-bench --bin ogdb-bench -- -D warnings`: clean
- `bash scripts/check-doc-ratchet.sh`: passes (still emits the F06 hint)
- Public-API surface vs `v0.5.1` tag: still only the new ignored-by-default upgrade-fixture test
- Production-side bare-`.unwrap()` inventory: stable at 4 sites (no growth)
- Unsafe inventory: stable; no new unsafe in the cycle-18 → cycle-20 delta
- TODO/FIXME inventory: stable at 1 (Phase-3 doc comment)
- `panic!(` in non-test shipped code: stable at 2 (CLI argv-parsing)
- Path-sweep correctness: 4 sweep sites verified; F05's site at `init_agent.rs:264` is structurally distinct and not affected
- New code review (manual): `handle_demo` extraction is idiomatic — `let path_exists = …;` lifts the predicate, the new `else` branch reuses an existing `Database::open` + `node_count`/`edge_count` pattern that already appears multiple times in this crate, and the comment block (`// The install.sh post-install state…`) explains *why* the dual-seed path exists. The companion `tests/demo_subcommand.rs` adds 79 lines of integration coverage for the empty-file seed path.

## Recommendation

RUST-QUALITY is in steady-state converged shape **for the fifth consecutive scan** on the BLOCKER/HIGH axis. The 5 MEDIUM and 3 LOW findings are all known carry-forwards with patch sketches; none ship-blocking. A future cycle should bundle them as a single 1-PR cleanup pass:

1. F01 + F02 + F03 — extract one shared `percentile_index(samples_len, pct)` helper or duplicate a small `#[allow]` macro; resolves all 9 cast sites + 1 redundant_closure.
2. F04 + F05 — 4 mechanical `.unwrap()` → `.expect("…")` (or SocketAddr restructure) edits; resolves panic-discipline drift.
3. F06 — 1-line baseline ratchet decrement.
4. F07 — 3-line `//!` block addition.
5. F08 — gate after a sweep; lowest priority.

Given **5 consecutive confirmations** (cycles 15/16/17/18/20 — cycle-19 was dropped) on the BLOCKER/HIGH axis, with the cycle-18 → cycle-20 window adding only a path-sweep + idempotency guard (zero clippy regression, zero unsafe delta, zero unwrap delta, zero public-API delta), RUST-QUALITY scans can confidently shift to a lower cadence — trigger only when `git diff <prev-base>..HEAD -- '*.rs' Cargo.toml Cargo.lock` is non-empty *and* exceeds a threshold (e.g., > 50 lines or any manifest touch) — until the M/L cleanup PR lands.
