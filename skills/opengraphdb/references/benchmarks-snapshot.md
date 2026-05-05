# OpenGraphDB 0.5.1 — benchmarks snapshot (frozen)

This is a frozen copy of the most relevant numbers from `documentation/BENCHMARKS.md`
so the master skill stays self-contained even if the live benchmark file is
updated. The table below mirrors `documentation/BENCHMARKS.md` § 2 — 0.4.0 N=5
medianed values from `documentation/evaluation-runs/baseline-2026-05-02.json`.
The 0.4.0 → 0.5.1 patch-release window touched no perf-relevant code, so these
are authoritative for 0.5.1 too. Re-baseline tracked as a v0.6.0 follow-up.
**For the live, authoritative baseline, always go to
[`documentation/BENCHMARKS.md`](../../../documentation/BENCHMARKS.md).**

## Methodology in one paragraph

Numbers are the **median of N=5 release-build iterations** with one warm-up
iteration discarded, on an Intel Core i9-10920X (12-core HEDT, Linux, kernel
6.17). CPU governor pinned to `performance` when writeable. p99.9 is dropped
from the medianed core because at N=5 the tail is too noisy to publish (the
manifest gate requires N≥5 median for tail comparisons). Source:
`crates/ogdb-eval/tests/publish_baseline.rs`. Measurement date: 2026-05-02 (0.4.0 N=5 medianed re-baseline; carried forward to 0.5.1).

## 14-row competitive scorecard

| # | Metric | OpenGraphDB 0.5.1 | Spec target | Verdict |
|---|---|---|---|---|
| 1 | Bulk ingest @ 10k+10k single write-tx (nodes/s) | **251 nodes/s** | ≥ 139k rels/s | ❌ LOSS — 670× behind Kuzu, 1 150× behind Memgraph at the same scale. Driver does one `begin_write`/`commit` per node — a real batched bulk loader is tracked in BENCHMARKS §4.1. |
| 2 | Streaming ingest, 30s window, batch=64 (nodes/s) | **300 nodes/s** | ≥ 100k tx/s | ❌ LOSS — same root cause as row 1. |
| 3 | Point read `neighbors()` p50/p95/p99 @ 10k nodes, cold | **5.8 / 6.8 / 11.8 μs** (166k qps) | p95 < 5 ms (SF10 warm) | 🟡 DIRECTIONAL INDICATOR (pending apples-to-apples) — at our 10k-node tier we measure a p99 of 12 μs; competitors publish at 1.6M-node Pokec/SF10. Until that re-run lands, this is a lower-bound feasibility signal, not a verified WIN. |
| 4 | 2-hop traversal p50/p95/p99 @ 10k nodes, cold | **22.9 / 25.8 / 36.0 μs** (48k qps) | p95 < 100 ms | 🟡 DIRECTIONAL INDICATOR (pending apples-to-apples) — clears the SF10 IC-1..7 spec threshold at 10k nodes; SF1/SF10 numbers wait on a profile pass after the cycle-15 17→26 μs regression. |
| 5 | LDBC SNB IS-1 p50/p95/p99 (1k queries, mini fixture) | **18.3 / 163 / 222 μs** (25.9k qps) | p95 < 5 ms @ SF10 | 🟡 NOVEL — scale mismatch, mini fixture not directly comparable. |
| 6 | Single-tx mutation p95/p99 (1k samples) | **12 981 / 15 939 μs** (72 ops/s) | ≥ 100k ops/s, p99.9 < 1 s | ❌ LOSS on throughput. p99.9 = 720 ms scrapes inside the 1s bound; the 56× p99→p99.9 ratio points at a flush/GC pause. |
| 7 | Enrichment round-trip `t_persist` p50/p95/p99 (100 docs × 10ent + 15edge) | **38.8 / 46.7 / 112.6 ms** | p50 < 15 ms, p95 < 40 ms best-in-class | ✅ WIN on competitive (3.2× under 150 ms threshold), MISS on best-in-class by 7 ms. |
| 8 | Hybrid retrieval (vector kNN + 1-hop) p50/p95/p99 (100q × 1k × dim=16) | **204 / 233 / 246 μs** | p95 < 80 ms + NDCG@10 ≥ dense-SOTA + 3pp | 🟡 NOVEL — 0.23ms p95 is 343× under the best-in-class bar; quality (NDCG@10) deferred until a BEIR corpus is wired. |
| 9 | Concurrent multi-agent writes (commits/s, N=4 × 500 ops) | **295 commits/s** (conflict_rate = 0.0) | ≥ 10k commits/s @ N=64, conflict < 3% | ❌ LOSS — under-scaled (N=4 vs N=64) and **kernel-limited**: ogdb-core is single-writer today, so each thread owns its own DB and conflict_rate=0 is mechanical. Multi-writer kernel tracked in BENCHMARKS §4.6. |
| 10 | Graph-feature rerank batch p50/p95/p99 (100 candidates × 1-hop) | **1.28 / 1.34 / 1.62 μs** (153 μs/batch) | p95 < 50 ms | ✅ WIN — 91 000× faster than Cohere Rerank 3.5, 27 000× under best-in-class bar. Caveat: synthetic `Σ neighbour_id` boost; real boost adds ~1–5 μs/candidate. |
| 11 | Graphalytics BFS (μs, seed=0, max_hops=3, LDBC mini = 100 nodes) | **48.5 μs** (70 nodes visited, 3 levels) | T_p ≤ 12s on Datagen-9.0 | 🟡 NOVEL — scale mismatch (tier 0 vs tier XL). |
| 12 | Graphalytics PageRank (20 iters, damping 0.85, mini fixture) | **652 μs/iter × 20 = 13.0 ms** | T_p ≤ 30s on Datagen-9.0 | 🟡 NOVEL — same caveat as row 11. |
| 13 | Scaling Tier 7.1 @ 10k nodes (read p95 / load / RSS / file) | **0.38 μs / 0.32 s / 28.0 MB / 39.4 MB** | p95 < 1 ms, load < 1 s, RSS < 100 MB | ✅ WIN on all three gates — 2 600× / 3.1× / 3.6× under thresholds. |
| 14 | Resources @ 10k bulk ingest (CPU user / RSS peak / disk / wall) | **1.51 s / 28.0 MB / 49 MB / 40 s** | RSS ≤ 4× raw data | 🟡 NOVEL — RSS is 0.57× raw; factorization ratio not yet wired. |

## Scorecard summary

| Verdict | Count | Rows |
|---|---|---|
| ✅ Win (clears spec, apples-to-apples) | **3** | 7, 10, 13 |
| ❌ Loss (apples-to-apples) | **3** | 1, 2 (collapsed to one ingest root cause), 6, 9 |
| 🟡 Novel / ⚠️ scale-mismatched | **8** | 3, 4, 5, 8, 11, 12, 14 + the kernel-limited side of 9 |

Strict bucketing (post cycle-17 `e585f66` verdict tone-down): **1 verified WIN / 2 caveated WIN / 2 losses / 6 novel-or-directional.**

## What this means for an AI-agent workload

Use this table to set realistic expectations for the workload the agent is
about to run.

- **Reads, traversals, and 1-hop retrieval are sub-millisecond.** Rows 3, 4, 8.
  An agent doing hybrid retrieval over a small / medium graph will not be
  bottlenecked by storage.
- **Enrichment (doc → entities → graph) clears the competitive bar.** Row 7.
  GraphRAG ingest is healthy.
- **Bulk import is the active sore spot.** Rows 1, 2. If your agent's first
  step is "load 100k rows", budget for the gap or use the `POST /import`
  endpoint / batched UNWIND inside one write-tx.
- **Concurrent writes do not work yet.** Row 9. Shard per-agent or queue
  through a single coordinator; do *not* assume MVCC.
- **Mutation tail latency is rough.** Row 6. p99.9 = 720 ms is in-bound but
  large enough that you should not place per-token writes on a user-facing
  latency-SLA flow.

## Reproduce

```bash
cd crates/ogdb-eval
cargo build --release

# Single-shot (legacy):
OGDB_EVAL_BASELINE_JSON=/tmp/baseline.json \
OGDB_EVAL_BASELINE_MD=/tmp/auto-summary.md \
  cargo test --release --test publish_baseline -- --nocapture

# N=5 median (default for published baselines):
OGDB_EVAL_BASELINE_JSON=/tmp/baseline-N5.json \
OGDB_EVAL_BASELINE_MD=/tmp/auto-summary-N5.md \
OGDB_EVAL_BASELINE_ITERS=5 \
  cargo test --release --test publish_baseline -- --nocapture
```

Expected wall-clock: ~150 s single-shot, ~12 min N=5 median on the i9-10920X
bench box.

## See also

- [`documentation/BENCHMARKS.md`](../../../documentation/BENCHMARKS.md) — live baseline (this file is a frozen snapshot).
- [`documentation/evaluation-runs/`](../../../documentation/evaluation-runs/) — raw `EvaluationRun` JSON for every published run.
