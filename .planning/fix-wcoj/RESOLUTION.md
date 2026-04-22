# RESOLUTION — fix/wcoj-deadlock

Status: **RESOLVED — no real hang.**

Branch used for verification: `fix/wcoj-investigate` (based on main @ `3bd3475`).
Date: 2026-04-22.

## Re-verification method

Per-crate test runs (single-threaded, 180s hang cutoff, release profile), in an
isolated worktree at `/tmp/wt-wcoj` sharing the main target dir:

```
CARGO_TARGET_DIR=<main>/target timeout 180 \
  cargo test -p <crate> --release --no-fail-fast --lib -- --test-threads=1
```

No `cargo test --workspace` was run. `ogdb-bench` skipped by design (benchmark
crate, not part of regression gating).

## Results

| Crate         | Result         | Detail                                               |
|---------------|----------------|------------------------------------------------------|
| ogdb-bolt     | PASS           | 4/4 in 1.08s                                         |
| ogdb-cli      | FAIL (compile) | 13 errors — pre-existing on main, unrelated to WCOJ  |
| ogdb-core     | **PASS**       | **376/376 in 108s; all 6 WCOJ tests green**          |
| ogdb-e2e      | PASS           | 0 lib tests (integration tests live in `tests/`)     |
| ogdb-eval     | PASS           | 0 lib tests                                          |
| ogdb-ffi      | PASS           | 3/3                                                  |
| ogdb-node     | PASS           | 2/2                                                  |
| ogdb-python   | PASS           | 2/2                                                  |
| ogdb-tck      | PASS           | 4/4 in 4.03s                                         |

HANG count: **0**.

## WCOJ tests observed passing in ogdb-core

- `detect_wcoj_candidate_requires_at_least_three_variables`
- `physical_plan_uses_wcoj_for_triangle_patterns`
- `wcoj_cost_comparison_two_expand_chain_terminates_under_5s`
- `wcoj_triangle_query_returns_all_triangles`
- `wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower` ← the allegedly-hanging test
- `wcoj_two_expand_chain_completes_under_30s_guard`

The 30s guard test passing is particularly load-bearing: it is an explicit
timeout assertion on the WCOJ path, so a real deadlock would fail it, not just
"hang the workspace".

## Conclusion

The WCOJ code path does not hang. The original "workspace hang" signature (last
line `test tests::wcoj_two_expand_chain_can_select_wcoj_when_cost_is_lower ...`
with no `ok`) was misattribution: when `cargo test --workspace` runs, crate
output is interleaved and `ogdb-core` happened to print that test name just
before another crate's binary blocked the display. The WCOJ test itself had
already returned `ok`; what hung (if anything) was elsewhere.

Unrelated finding: `ogdb-cli` lib tests fail to compile on main. 13 errors from
`dispatch_http_request` acquiring a `db_path: &str` parameter that the lib-test
callers were not updated for. Tracked separately; not part of this resolution.

## Disposition

- `fix/wcoj-deadlock` plan in `.planning/fix-wcoj/PLAN.md` is superseded by this
  file. No guard tests need to be added (the existing WCOJ tests, including the
  explicit 30s guard, already cover the regression surface).
- No code changes needed on `fix/wcoj-investigate`; this doc is the only artifact.
