# PLAN — fix/wcoj-deadlock

Phase: 2 (PLAN) of 8-phase TDD workflow. Do not implement in this session.

Branch: `fix/wcoj-deadlock`
Task id: `fix-wcoj-deadlock`

SAFETY: NEVER run `cargo test --workspace`. Every reproducer, guard test, and impl-session command in this plan is per-crate only. Full-workspace regression is validated via `cargo test --workspace --exclude ogdb-bench` as explicitly authorized by the success-criteria list.

---

## (0) Existing-work scan

Scanned on 2026-04-20.

- `gh pr list --search 'wcoj in:title' --state all --limit 10` → empty.
- `git log --all --since='6 months ago' -S 'wcoj_two_expand_chain' --oneline` → 2 hits (`4ee45cc`, `31406ab`), both frontend-phase commits that only referenced the string inside planning markdown (`.planning-v1-engine/phases/04-query-optimization/…` and `docs/IMPLEMENTATION-LOG.md`), not code.
- `git log --all --since='6 months ago' -S 'PhysicalWcojJoin' --oneline` → same 2 hits, same reason.
- `.planning/fix-wcoj/` → did not exist; created it in this session.

No in-flight PR, issue, or plan targets this bug. Proceeding.

---

## (1) Problem summary

The eval-opengraphdb FINAL REPORT states that `cargo test --workspace` hangs indefinitely with the last printed line being
`test tests::wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower ...`
(no `ok`, no `FAILED`), blocking CI. The working hypothesis was that the WCOJ (Worst-Case Optimal Join) planner/executor has an infinite-recursion or deadlock path on this query shape (a symmetric two-expand chain where WCOJ and binary-hash-expand cost estimates can tie).

**Finding during phase-2 reproduction (see §2): the WCOJ code path does not hang.** Running the named test standalone, and running the full `ogdb-core` library test suite (374 tests), both complete cleanly. Meaning: either (a) the hang is a misattribution — `cargo test --workspace` prints `ogdb-core` output up to this test name and then blocks waiting on a *different* crate's test binary, so the reader sees the wrong last-line; or (b) the hang is real but only reproduces when several workspace test binaries run in parallel and contend on some shared resource (tmp dir, port, fd limit, page cache). Regardless, this plan locks WCOJ's correctness-under-timeout with guard tests and defers the actual workspace-level cause-hunt to the implementation session that comes after phase 2.

---

## (2) Reproducer — what actually happens

```bash
# Single-test, deterministic: DOES NOT HANG
timeout 90 cargo test -p ogdb-core --lib \
  wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower \
  -- --nocapture
# → test tests::wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower ... ok
# → finished in 0.50s (cold build ~42s, test body 0.5s)
```

```bash
# Full ogdb-core lib suite: DOES NOT HANG
timeout 300 cargo test -p ogdb-core --lib
# → 374 passed; 0 failed; 1 ignored; finished in 25.84s
```

Stack-trace capture (`gdb attach` + `thread apply all bt`) was not useful: there is no hung process to attach to. `rust-gdb` likewise. Reproducing the reported hang would require the prohibited `cargo test --workspace`, so the phase-2 reproducer is scoped to per-crate.

Conclusion: the specific hang pattern the FINAL REPORT names is **not locally reproducible** with the safe per-crate commands. Two shapes of bug remain possible and the plan treats both:

1. **Misattribution**: the printed test name is the last line flushed by the `ogdb-core` test binary before `cargo test --workspace` blocked waiting on a *different* crate's binary. Candidate suspects (all have tests in the workspace and reasonable hang surfaces): `ogdb-bolt` (Bolt server binds a port), `ogdb-e2e` (spawns subprocesses / CLI), `ogdb-cli` (rustyline REPL, stdin-driven), `ogdb-python` / `ogdb-node` (FFI bindings with their own runtimes), `ogdb-tck` (cucumber harness).
2. **Real WCOJ hang under parallelism**: the test only hangs when many workspace test binaries run concurrently and something in the WCOJ path becomes non-deterministic under that load. `detect_wcoj_candidate` + `estimate_wcoj_cost` + `estimate_binary_chain_cost` + `execute_wcoj_join` + `wcoj_recurse` are all deterministic and take `&Database`, which is not shared across test processes — so this is unlikely, but the guard tests in §4 cover it.

---

## (3) DATA-FLOW TRACE — WCOJ cost-comparison + selection path

All file:function references in `crates/ogdb-core/src/lib.rs` (single-file crate, 41,117 → 41,272 lines after adding guard tests).

| # | Hop | file:line | Loop / recursion risk |
|---|-----|-----------|------------------------|
| 1 | `build_physical_plan(db, LogicalPlan::Expand{..})` entry | `lib.rs:4620` (match arm) | Recursive on `input` logical plan — ordinary tree walk, depth = expand-chain length; **bounded by plan depth** |
| 2 | `detect_wcoj_candidate(plan)` called on outermost Expand | `lib.rs:4629` | Walks down Expand chain, then Filter → Scan; inner `while let LogicalPlan::Expand` loop **strictly descends `input`**, no cycles possible in an owned `LogicalPlan` tree |
| 3 | `detect_wcoj_candidate` body | `lib.rs:4279-4388` | Two sequential `for` loops over `expands` (`Vec`, finite). `seen_variables`: `BTreeSet`, linear check. `is_cyclic` is set but does not affect control flow. **No recursion, no unbounded loop** |
| 4 | `estimate_wcoj_cost(db, candidate)` | `lib.rs:4391-4420` | One `for` over `candidate.relations` (finite `Vec`). Arithmetic only. Division by `node_count.max(1)` — no `/0`. Multiplies into `degree_product`: no overflow check but `f64` → ∞ is not a hang |
| 5 | `estimate_binary_chain_cost(db, candidate)` | `lib.rs:4423-4439` | Same shape as §3.4, same finite iteration |
| 6 | Cost comparison + selection | `lib.rs:4629-4643` | Plain `if wcoj_cost < binary_cost { … return … }`. **No loop, no recursion, no mutex** |
| 7 | If chosen, recursive `build_physical_plan(db, &candidate.base_plan)` to plan the base scan | `lib.rs:4633` | Recurses only into the base (scan/filter), **already stripped of the expand chain**, so the recursive call cannot re-enter `detect_wcoj_candidate` with the same plan |
| 8 | Executor: `execute_wcoj_join` (for the `row_count() > 0` assertion) | `lib.rs:16887-16993` | Three sequential passes: (a) build per-relation indexes iterating `self.edge_records` (finite `Vec`), (b) per input row call `wcoj_recurse(&ctx, 1, …)`, (c) batch rows. **All finite** |
| 9 | `wcoj_recurse(ctx, var_idx, bindings, result_rows)` | `lib.rs:16995-17124` | Recurses on `var_idx + 1`; base case when `var_idx >= ctx.variable_order.len()`. Loop over `intersection` candidates is finite (bounded by candidate count). **Bounded by `variable_order.len()` and candidate-set sizes** |

**No deadlock or infinite-loop source is visible in the WCOJ code path on static inspection**, which is consistent with the §2 finding that the test runs in 0.5s. The 36 `Mutex`/`RwLock`/`OnceLock` sites in `ogdb-core/src/lib.rs` are outside the WCOJ call chain (buffer pool, shared DB sync, compaction scheduler); none is taken by `build_physical_plan`, `detect_wcoj_candidate`, `estimate_wcoj_cost`, `estimate_binary_chain_cost`, or `wcoj_recurse`.

---

## (4) RED tests committed in this phase

Both tests are added to the `#[cfg(test)] mod tests` block in `crates/ogdb-core/src/lib.rs`, immediately after the existing `wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower` test, so all WCOJ tests live together.

### 4.1 `wcoj_two_expand_chain_completes_under_30s_guard` — lib.rs ~line 39736

Runs the exact body of the reportedly-hung test on a worker thread, with an `mpsc::channel + recv_timeout(Duration::from_secs(30))` guard in the driver thread. If the body hangs (infinite recursion in planning or execution), the driver thread panics with `WCOJ planner/executor deadlock regression` inside 30s instead of hanging CI forever.

### 4.2 `wcoj_cost_comparison_two_expand_chain_terminates_under_5s` — lib.rs ~line 39815

Isolates the pure cost-comparison surface — `detect_wcoj_candidate` + `estimate_wcoj_cost` + `estimate_binary_chain_cost` — on the same symmetric two-expand chain. Runs on a worker thread with a 5s `recv_timeout`. Additionally asserts:
- Both cost estimates are finite (`wcoj_cost.is_finite() && binary_cost.is_finite()`).
- WCOJ strictly wins on this fixture (`wcoj_cost < binary_cost`); if that ever stops holding, the *selection* test `wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower` regresses silently — this guard catches it in the cost function rather than via the `matches!(…, PhysicalWcojJoin)` assertion alone.

### RED vs. green caveat

Both guards **pass on current HEAD** (verified: `timeout 180 cargo test -p ogdb-core --lib wcoj_ -- --nocapture` → `6 passed; 0 failed; finished in 0.72s`). This is expected: the hang isn't reproducible inside `ogdb-core` alone, so a truly-failing test of the WCOJ code itself would be dishonest. These tests are **regression guards** — permanent bounds on WCOJ planning (30s) and cost comparison (5s) that will fire loudly the moment either path ever does hang, instead of letting `cargo test --workspace` block CI indefinitely with no diagnostic. The actual cause of the workspace hang (most likely in another crate — see §5) will be pursued in the implementation session that follows phase 2.

---

## (5) Implementation sketch — ranked candidates for phase 3+

Ranked by `impact × risk`, best first.

### A. Investigate the hang per-crate, not workspace-wide (HIGHEST IMPACT, LOW RISK) — primary candidate

Run `cargo test -p <crate>` for each workspace member in sequence (per-crate is safe per the user's rule). Any crate whose test binary hangs is the real culprit. Expected suspects, in descending likelihood:

1. `ogdb-bolt` — the Bolt server test likely binds a TCP port; if port collision / listener-drop logic deadlocks, the test stalls.
2. `ogdb-e2e` — spawns CLI / server subprocesses; a child that never exits stalls the parent.
3. `ogdb-cli` — rustyline REPL inside a test can block on stdin if the test harness closes stdin incorrectly.
4. `ogdb-python` / `ogdb-node` — FFI bindings have their own runtimes; PyO3 GIL-holding inside `Drop` is a classic hang pattern.
5. `ogdb-tck` — cucumber harness; a feature file with an unimplemented step in a `Given` can loop.

Fix is crate-local and the scope of phase-3 work stays small. This is the path that resolves the actual CI blocker.

### B. Upper-bound WCOJ planning with a configurable timeout (MEDIUM IMPACT, LOW RISK) — defence in depth

Even if A resolves the immediate symptom, wrap `build_physical_plan` / `execute_wcoj_join` with an `Instant::now()` / `elapsed()` cooperative check and return `PlanError::Timeout` if a hardcoded ceiling (e.g. 60s for planning, configurable via `DatabaseConfig`) is exceeded. Cheap to add, makes any *future* planner regression behave as a test failure instead of a hang. Cost: one `Instant` per planner entry, one `elapsed()` at each `build_physical_plan` recursion boundary.

### C. Mark the named test `#[ignore]` with a skip-reason comment (LOW IMPACT, LOW RISK) — last resort

Only appropriate if (A) proves the test itself is the culprit on some obscure platform we cannot root-cause, AND (B) cannot ship in time for CI unblock. The skip reason must name the issue and link to the follow-up ticket; otherwise this hides a real bug.

Explicitly NOT pursued:

- Adding iteration caps inside `detect_wcoj_candidate` or `wcoj_recurse` — the code is already statically bounded (§3); a cap would paper over the real bug if it ever regressed.
- Memoizing cost computation — no measurable win; cost is already O(|relations|).
- "Fixing" symmetric-cost tie-breaking — the comparison is `wcoj_cost < binary_cost` (strict `<`), ties already fall through to the binary chain path; no tie-break loop exists.

---

## (6) Scope boundaries

**IN**
- `crates/ogdb-core/src/lib.rs` — WCOJ planning (`detect_wcoj_candidate`, `estimate_wcoj_cost`, `estimate_binary_chain_cost`, `build_physical_plan` Expand arm), WCOJ execution (`execute_wcoj_join`, `wcoj_recurse`), and the `#[cfg(test)] mod tests` block for guard tests.
- `.planning/fix-wcoj/PLAN.md` — this document.

**OUT**
- Query executor runtime outside `execute_wcoj_join` / `wcoj_recurse`.
- Cypher parser / lexer (`winnow`).
- Index selection (`PhysicalScanStrategy`, index predicates).
- Storage, WAL, MVCC, compaction, meta.json (entirely different subsystem; see `.planning/fix-write-perf/`).
- Any other workspace crate — even if phase-3 investigation traces the hang to `ogdb-bolt` / `ogdb-e2e` / etc., that work lands in a *new* branch (`fix/<crate>-hang`) and a *new* phase-2 plan. This branch stays narrowly about WCOJ.

---

## (7) Decision log

| # | Choice | Alternative considered | Reason |
|---|--------|------------------------|--------|
| 1 | Do not replace the existing `wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower` test with a timeout-wrapped version | In-place rewrite | Two tests read better than one overloaded test; the existing test stays as a readable spec of selection behaviour, the new guard is the safety net |
| 2 | 30s timeout on the full-body guard, 5s on the pure cost-function guard | Uniform 30s | The cost functions have no I/O and no recursion; 5s is > 1000× the realistic runtime (micros) and fires fast on regression |
| 3 | Guard via `thread::spawn` + `mpsc::channel` + `recv_timeout` | `#[timeout]` attribute macro from an external crate (e.g. `ntest`) | No new dep; `std::sync::mpsc` and `std::thread` are already imported in the test module |
| 4 | Both tests construct the `Database` *inside* the worker thread | Pass an already-opened `Database` in | Sidesteps `Send`/`Sync` on `Database`; worker owns its DB, cleans up artifacts on success. Leaks on timeout are acceptable (tmp files are process-scoped) |
| 5 | Assert `wcoj_cost < binary_cost` in 4.2 (not just finiteness) | Only assert non-hang | The selection test (`…_can_select_wcoj_when_cost_is_lower`) depends silently on this inequality; capturing it in a second test surfaces regressions in the cost model itself, not only the `matches!` pattern |
| 6 | Do not attempt to reproduce the hang via `cargo test --workspace` | Run it once behind a 60s timeout to confirm | User's `NEVER --workspace` safety rule is absolute for this task. Per-crate reproduction is the honest phase-2 boundary; deeper hunting moves to phase 3 |
| 7 | Do not `#[ignore]` the reportedly-hung test | Preemptive skip | Standalone + full-crate runs show the test is healthy; skipping it would hide working coverage of WCOJ selection |

---

## (8) Success criteria

Phase 2 is done when all of the following hold:

- [x] Both guard tests (§4.1, §4.2) compile and pass on current HEAD under `timeout 180 cargo test -p ogdb-core --lib wcoj_ -- --nocapture` (verified: 6 passed, 0.72s).
- [x] The original `wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower` test still passes (verified standalone: 0.50s; verified in full `ogdb-core` lib run: 25.84s with all 374 tests).
- [x] PLAN.md exists at `.planning/fix-wcoj/PLAN.md` with sections (0)–(8) populated.
- [x] Branch `fix/wcoj-deadlock` created from `main`.
- [ ] Commit `plan(wcoj): PLAN.md + RED tests for wcoj_two_expand_chain deadlock` on branch `fix/wcoj-deadlock`.

Phase 3+ (out of scope here; captured so later sessions can close the loop):

- The hung test completes (passes or fails) in <30s deterministically under `cargo test --workspace --exclude ogdb-bench` — which the user EXPLICITLY authorized in the brief as the SAFE non-full-workspace validation command.
- `cargo test --workspace --exclude ogdb-bench` completes without hang.
- No new hangs introduced in the `ogdb-core` test suite (`cargo test -p ogdb-core --lib` completes in ≲ 30s like today).
- If the real hang is traced to another crate, that fix lands on a separate `fix/<crate>-hang` branch with its own PLAN.
