# EVAL-RUST-QUALITY-CYCLE16

Area: RUST-QUALITY (all 18 Rust crates)
Base: origin/main @ 8496878 (post v0.5.1; cycle-15 → cycle-16 = 16 cascade-fix landings)
Worktree: /tmp/wt-c16-rust-quality (detached HEAD, fresh)
Toolchain: rustc 1.88.0 / cargo 1.88.0
Date: 2026-05-05
Predecessor: `documentation/EVAL-RUST-QUALITY-CYCLE15.md` (origin/eval/c15-rust-quality-aff476f)

## TL;DR

Cycle-15 verdict (**0 BLOCKER, 0 HIGH, 4 MEDIUM, 3 LOW**) is **CONFIRMED** on the new HEAD.

Of the 16 fix commits between aff476f → 8496878, **only one** touches Rust:

```
c904418 fix(compat): bump CLI stability examples to 0.5.* + add v0.5.0 upgrade-fixture test
```

That commit adds exactly one new file — `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` (151 lines). No production-side `.rs` was edited. Therefore none of cycle-15's findings F01–F07 were closed; all seven still apply verbatim. They are re-listed below for traceability with cycle-16 IDs F01–F08.

The new finding this cycle is **F05** — a third-and-fourth bare `.unwrap()` in non-test code that cycle-15's F07 narrative ("two bare `.unwrap()` in core hot paths") under-counted. The two extra sites are:

- `crates/ogdb-core/src/lib.rs:21985` — inside `pub fn ingest_document` (production public API)
- `crates/ogdb-cli/src/init_agent.rs:264` — inside top-level `fn port_in_use` (production helper, runs at every `ogdb init` invocation)

Both are structurally safe (the unwraps are guarded by `is_some()` / a hardcoded literal SocketAddr), but they break the same `.expect("…")` discipline that cycle-15 flagged for the two ogdb-core sites — and they raise the production-side bare-unwrap inventory from 2 to 4. Severity matches cycle-15's F07: MEDIUM.

The new test file (`upgrade_fixture_v0_5_0_opens_on_current.rs`) is itself clippy-clean on the `cast_sign_loss` axis (its only cast is `node_id as u64`, a pure widening) and adheres to the workspace pattern (top-of-file `//!` block, `.expect("rationale")` everywhere, no `.unwrap()`).

## Scope coverage

Axes scanned this cycle:

- ✅ `cargo fmt --all --check` from worktree → zero diff
- ✅ `cargo clippy -p ogdb-core --lib -- -D warnings` → clean (CI-gate equivalent)
- ✅ `cargo clippy -p ogdb-core --tests -- -D warnings` → fails with the same `cast_sign_loss` error cycle-15 reported (F01)
- ✅ `bash scripts/check-shipped-doc-coverage.sh` → passes
- ✅ `bash scripts/check-doc-rust-blocks.sh` → passes (`README.md:55`, `DESIGN.md:1584` compile)
- ✅ `bash scripts/check-doc-tests-wired.sh` → passes
- ✅ `bash scripts/check-doc-ratchet.sh` → reports same `ogdb-core 289/290 (please lower baseline to 289)` drift as cycle-15 (F06)
- ✅ Re-grep of every cycle-15 finding's file:line → all seven sites unchanged
- ✅ Public-API surface diff vs `v0.5.1` tag (`git diff v0.5.1..HEAD --stat -- 'crates/**/*.rs'`) → only the new test file; zero production-side change → zero risk
- ✅ Unsafe-block audit (delta only) → no new unsafe blocks added (only the test file was added; it has none)
- ✅ TODO/FIXME/HACK/XXX scan → exactly one match (`crates/ogdb-eval/tests/skill_quality_adapter.rs:4` references "Phase-3 TODO" inside a doc comment); identical to cycle-15
- ✅ `panic!(` in non-test code → zero (all 35 `panic!()` sites in shipped-crate `src/*.rs` are inside `#[cfg(test)]` mods; verified by line-number-vs-test-mod-boundary cross-check)
- ✅ `.unwrap()` in non-test code → 4 sites (cycle-15 only listed 2; see F04 + F05)
- ✅ Error-type design (`pub enum *Error` per crate, no `Box<dyn Error>` returns) → unchanged from cycle-15
- ✅ New test file's quality (clippy-shape, doc-shape, panic-shape) → clean

## Findings

### F01 — clippy `cast_sign_loss` in ogdb-core test target [confirms cycle-15 F01]

- Severity: **MEDIUM**
- File: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74`
- Status at HEAD: unchanged. `cargo clippy -p ogdb-core --tests -- -D warnings` from the c16 worktree fails with:
  ```
  error: casting `f64` to `usize` may lose the sign of the value
    --> crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:74:15
  ```
- CI gate impact: still none — `scripts/test.sh` runs `cargo clippy --workspace -- -D warnings` (default targets), which excludes `tests/`. But every developer running the standard `cargo clippy --all-targets` locally hits this.
- Patch sketch: `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]` on `fn percentile` with the rationale "pct ∈ [0,100] and samples.len() ≥ 1 keeps the index ≥ 0". Or restructure to `let idx = ((samples.len().saturating_sub(1) as f64) * pct / 100.0).round().max(0.0) as usize;`.

### F02 — clippy `cast_sign_loss` in ogdb-bench main [confirms cycle-15 F02]

- Severity: **MEDIUM**
- File: `crates/ogdb-bench/src/main.rs:743`
- Status at HEAD: unchanged. Same cast pattern as F01:
  ```rust
  let index = (((samples.len() - 1) as f64) * percentile).round() as usize;
  ```
- Patch sketch: identical to F01 (either a per-fn `#[allow]` with rationale or `.max(0.0) as usize`).

### F03 — multiple clippy errors in ogdb-eval `--all-targets` [confirms cycle-15 F03]

- Severity: **MEDIUM**
- Files (status unchanged at HEAD):
  - `crates/ogdb-eval/tests/graphalytics_driver.rs:50,73` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/scaling_driver.rs:30,82` — `cast_sign_loss`
  - `crates/ogdb-eval/tests/throughput_driver.rs:38` — `cast_sign_loss` (`f64 → u64`)
  - `crates/ogdb-eval/tests/ai_agent_driver.rs:30,41,52` — `cast_sign_loss` (`f64 → u32`)
  - `crates/ogdb-eval/src/drivers/common.rs:201` — `redundant_closure` (`(1..=100).map(|i| f64::from(i))` should be `.map(f64::from)`)
- Patch sketch: 8× percentile-helper extraction or per-test `#[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]`; 1× drop the closure (`drivers/common.rs:201`).

### F04 — bare `.unwrap()` in ogdb-core production hot paths [confirms+extends cycle-15 F07]

- Severity: **MEDIUM**
- Files (cycle-15 F07 listed two; cycle-16 audit found a third in the same file):
  - `crates/ogdb-core/src/lib.rs:18705` — `*remap.get(raw_comm).unwrap()` in Louvain hierarchical builder (cycle-15 F07a)
  - `crates/ogdb-core/src/lib.rs:19482` — `let cmap = community_by_node.as_ref().unwrap();` in GraphRAG retrieval prefilter (cycle-15 F07b)
  - **NEW** `crates/ogdb-core/src/lib.rs:21985` — `let dims = config.embedding_dimensions.unwrap();` inside `pub fn ingest_document` (line ~21901). Guarded by `let has_embeddings = config.embed_fn.is_some() && config.embedding_dimensions.is_some();` two lines above and only entered when `has_embeddings`. Structurally safe but violates the same `.expect("rationale")` rule cycle-15 flagged for the other two.
- Why it matters: ogdb-core has ~50 `.expect("…")` sites that all carry rationale strings; these three break the pattern and panic with the opaque `called Option::unwrap() on a None value` if invariants ever drift.
- Patch sketch:
  ```rust
  // 18705
  *remap.get(raw_comm).expect("remap built from unique_raw_ids covers every raw_communities key")
  // 19482
  let cmap = community_by_node.as_ref().expect("community_by_node is Some when config.community_id is set");
  // 21985 (NEW)
  let dims = config.embedding_dimensions.expect("has_embeddings guard above already verified is_some()");
  ```

### F05 — bare `.unwrap()` in ogdb-cli production (NEW — not in cycle-15)

- Severity: **MEDIUM**
- File: `crates/ogdb-cli/src/init_agent.rs:264`
- Site:
  ```rust
  fn port_in_use(port: u16) -> bool {
      TcpStream::connect_timeout(
          &format!("127.0.0.1:{port}").parse().unwrap(),
          Duration::from_millis(250),
      )
      .is_ok()
  }
  ```
- Status: cycle-15's grep filtered ogdb-cli at `/tests/`-path level which excluded inline `#[cfg(test)] mod tests {}` correctly, but did not surface `init_agent.rs:264` because the F07 narrative was scoped to ogdb-core. Cycle-16 widened the audit to all shipped crates and found this one site outside ogdb-core.
- Why it matters: `port_in_use` is called from the bin entry point (`fn main` → `init_agent` flow), so the unwrap is on a hot path of `ogdb init`. The literal `127.0.0.1:{port}` always parses for any `u16`, so this is impossible-by-construction — but it still breaks the discipline rule, and `.parse::<SocketAddr>()` returning `Err` on a malformed format string would surface as a cryptic panic with no rationale.
- Patch sketch (1 line):
  ```rust
  &format!("127.0.0.1:{port}").parse().expect("static 127.0.0.1:<u16> is always a valid SocketAddr")
  ```
  (Or restructure to `SocketAddr::from(([127,0,0,1], port))` which is infallible and avoids the `unwrap` entirely — preferred form, no string parsing.)
- Note: a `ripgrep` of the rest of the workspace's shipped-crate `src/` confirms no other production-side bare `.unwrap()` exists in ogdb-vector, ogdb-types, ogdb-algorithms, ogdb-text, ogdb-temporal, ogdb-import, ogdb-bolt, ogdb-export, ogdb-ffi, ogdb-python, ogdb-node. The total production-side bare-unwrap inventory is therefore exactly 4 (3× ogdb-core + 1× ogdb-cli).

### F06 — doc-ratchet baseline outdated for ogdb-core [confirms cycle-15 F04]

- Severity: **LOW**
- File: `scripts/check-doc-ratchet.sh:27`
- Status: unchanged. `bash scripts/check-doc-ratchet.sh` from c16 worktree still emits `ok: ogdb-core 289/290 undocumented (please lower baseline to 289)`.
- Patch sketch (1 line): `[ogdb-core]=289` (down from 290).

### F07 — `crates/ogdb-tck/src/lib.rs` missing top-of-crate `//!` doc [confirms cycle-15 F05]

- Severity: **LOW**
- File: `crates/ogdb-tck/src/lib.rs:1` — first line is still `use cucumber::gherkin;` with no `//!` block above it.
- Status: unchanged. Every other workspace crate (publishable + harness) starts with a `//!`. `scripts/check-crate-root-docs.sh` deliberately skips `publish = false` crates so the gap is invisible to CI.
- Patch sketch (3 lines):
  ```rust
  //! `ogdb-tck` — Cucumber-based technology-compatibility-kit harness for
  //! `ogdb-core`. Internal `publish = false` crate; entry point is the
  //! `cucumber::World` defined here, driven by `crates/ogdb-tck/tests/`.
  ```

### F08 — 119 `clippy::doc_markdown` warnings (missing/unbalanced backticks) [confirms cycle-15 F06]

- Severity: **LOW**
- Status: unchanged at HEAD; no doc-markdown sweep landed cycle-15 → cycle-16 (the sole Rust diff is the new test file, whose doc block is balanced).
- Patch sketch: enable `#![warn(clippy::doc_markdown)]` per-shipped-crate (vector / algorithms / text / temporal / import / export / types — single-digit counts) once the existing 119 sites are wrapped in backticks. Workspace-level enablement in `[workspace.lints.clippy]` would gate cleanup behind a one-shot 119-site sweep.

## Findings summary

| ID  | Severity | Area                       | Brief                                                  | vs cycle-15            |
|-----|----------|----------------------------|--------------------------------------------------------|------------------------|
| F01 | MEDIUM   | clippy --all-targets       | `cast_sign_loss` in core test                          | confirms F01           |
| F02 | MEDIUM   | clippy --all-targets       | `cast_sign_loss` in bench main                         | confirms F02           |
| F03 | MEDIUM   | clippy --all-targets       | 9 errors in eval test files                            | confirms F03           |
| F04 | MEDIUM   | panic-discipline (core)    | 3 bare `.unwrap()` in ogdb-core production             | confirms+extends F07   |
| F05 | MEDIUM   | panic-discipline (cli)     | 1 bare `.unwrap()` in ogdb-cli `port_in_use`           | NEW (cycle-15 missed)  |
| F06 | LOW      | doc-ratchet                | core baseline 290 vs actual 289                        | confirms F04           |
| F07 | LOW      | crate-root docs            | ogdb-tck missing `//!` block                           | confirms F05           |
| F08 | LOW      | clippy::doc_markdown       | 119 missing-backticks warnings                         | confirms F06           |

**Counts:** BLOCKER = 0, HIGH = 0, MEDIUM = 5 (F01, F02, F03, F04, F05), LOW = 3 (F06, F07, F08).

## Confirm/refute the cycle-15 verdict

- **Confirmed**: BLOCKER = 0 and HIGH = 0 still hold on `8496878`. No commit between `aff476f` and `8496878` changed production-side Rust source; the only Rust delta is a new ignored-by-default test fixture regenerator + an upgrade-fixture-open test, both well-formed.
- **Refined**: cycle-15's MEDIUM count of 4 should have been 5 — the F07 audit under-counted bare `.unwrap()` sites. Cycle-16 widens the audit to the rest of the workspace's shipped `src/` paths and surfaces one additional site (ogdb-cli init_agent.rs:264) plus one missed site in the same ogdb-core file (21985). Severity remains MEDIUM, not promoted.

## What was clean (delta from cycle-15)

- `cargo fmt --all --check` from worktree: zero diff (still)
- `cargo clippy -p ogdb-core --lib -- -D warnings`: clean (CI gate equivalent)
- `bash scripts/check-shipped-doc-coverage.sh`, `check-doc-rust-blocks.sh`, `check-doc-tests-wired.sh`: all pass
- Public-API surface vs `v0.5.1` tag: zero Rust diff
- Unsafe blocks: no new unsafe in the cycle-15 → cycle-16 delta
- Error-type design: 16 dedicated `pub enum *Error` types, zero `Box<dyn Error>` returns
- New test file (`upgrade_fixture_v0_5_0_opens_on_current.rs`): top-of-file `//!`, every fallible call uses `.expect("…")` or `?`, only cast is widening, no `.unwrap()`, no `panic!()` outside the structured `_ => panic!(...)` test-assertion arm
