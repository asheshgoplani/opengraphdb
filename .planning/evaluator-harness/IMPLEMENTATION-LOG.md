# Evaluator Harness — Implementation Log

## Phase 3 — GREEN (completed 2026-04-20)

**Tasks completed:** 3.1, 3.2, 3.3, 3.4. **Deferred:** 3.5.

### Task 3.1 — `EvaluationRun` schema
- `from_json`/`to_json` wired through `serde_json`. The `schema_version` field has no `#[serde(default)]`, so serde natively rejects input that omits it; an extra empty-string guard converts blanks to `InvalidSchema`. Malformed JSON surfaces as `EvalError::Serde`.
- Test file: `tests/schema_roundtrip.rs` — 3/3 GREEN.

### Task 3.2 — `DiffEngine`
- Pure function over `&EvaluationRun × &EvaluationRun`. No I/O.
- Category routing via `category_threshold(name, higher_is_better, &Threshold)`:
  - name contains `ndcg|recall|mrr|precision` → `quality_pct` (3%)
  - name contains `tti|lcp|fcp` → `tti_pct` (20%)
  - otherwise `higher_is_better=true` → `throughput_pct` (5%)
  - otherwise → `latency_pct` (10%)
- Direction: `higher_is_better` metrics regress when current < baseline; `!higher_is_better` (latency-class) metrics regress when current > baseline. Moves in the improving direction emit `RegressionEvent::Improvement` once magnitude crosses threshold.
- Severity ladder: `>= 3× threshold` → Critical, `>= 2×` → Major, else Minor.
- Test file: `tests/diff_engine.rs` — 4/4 GREEN.

### Task 3.3 — `JsonlHistory`
- `append`: `OpenOptions::new().create(true).append(true)` + one JSON line + `\n`.
- `read_all`: `BufReader::lines()`, skips blanks, deserialises each line independently.
- Test file: `tests/history_append.rs` — 3/3 GREEN.

### Task 3.4 — `LdbcSubmission`
- Emits the LDBC SNB audit-report skeleton keys required by the tests: `sut_name`, `sut_version`, `sut_vendor`, `scale_factor`, `run_date`, `throughput_qps`, `hardware`, `certification_status`, plus auxiliary `percentiles`, `suite`, `subsuite`, `git_sha`.
- Vendor/SUT name default to `"OpenGraphDB"`.
- `scale_factor` is parsed from the `dataset` field via the `sf0_1` → `0.1` convention (`sf` prefix stripped, `_` → `.`).
- Enforces `p50_us < p95_us < p99_us` when all three are present; otherwise returns `InvalidSchema`. This is the percentile-ordering invariant called out in PLAN.md Task 3.4 Step 2.
- Test file: `tests/ldbc_submission.rs` — 3/3 GREEN.

### Task 3.5 — `OgdbMirror` (DEFERRED)

**Status:** Deferred to a follow-up phase (tracked here, not on PLAN.md's checkbox list yet).

**Why deferred:**
1. `OgdbMirror` requires a `ogdb_core::Database` dependency. Pulling that in now would make `ogdb-eval` transitively depend on a storage layer that phase 3 does not exercise in any test, widening the change surface.
2. The mirror is the *secondary* history channel per PLAN.md decision D2 — JSONL is the primary and is already GREEN. The mirror being late does not block downstream phases.
3. The test called out in PLAN.md Task 3.5 Step 3 ("append 100 runs, reopen, count") would be the first integration test that boots a real `Database`, which wants a separate RED-phase failing test committed first to keep the TDD discipline intact.

**Next step to un-defer:** open a small RED-phase commit adding `crates/ogdb-eval/tests/ogdb_mirror.rs` + an `OgdbMirror` stub, then a GREEN commit wiring `ogdb_core::Database`. Blocks on nothing in Phase 4 (baselines) or Phase 5 (drivers).

### Verification snapshot

```
cargo test --release -p ogdb-eval --no-fail-fast
  diff_engine        4/4 passed
  history_append     3/3 passed
  ldbc_submission    3/3 passed
  schema_roundtrip   3/3 passed
  ─────────────────
  TOTAL             13/13 passed
```

Per-crate cargo only; no `--workspace` invocation was used. `ogdb-core` and the other crates remain untouched.
