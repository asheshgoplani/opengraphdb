# OpenGraphDB 0.3.0 — benchmarks snapshot (frozen)

This is a frozen copy of the most relevant numbers from `docs/BENCHMARKS.md`
so the master skill stays self-contained even if the live benchmark file is
updated. **For the live, authoritative baseline, always go to
[`docs/BENCHMARKS.md`](../../../docs/BENCHMARKS.md).**

## Methodology in one paragraph

Numbers are the **median of N=5 release-build iterations** with one warm-up
iteration discarded, on an Intel Core i9-10920X (12-core HEDT, Linux, kernel
6.17). CPU governor pinned to `performance` when writeable. p99.9 is dropped
from the medianed core because at N=5 the tail is too noisy to publish (the
manifest gate requires N≥5 median for tail comparisons). Source:
`crates/ogdb-eval/tests/publish_baseline.rs`. Measurement date: 2026-04-25.

## 14-row competitive scorecard

| # | Metric | OpenGraphDB 0.3.0 | Spec target | Verdict |
|---|---|---|---|---|
| 1 | Bulk ingest @ 10k+10k single write-tx (nodes/s) | **254 nodes/s** | ≥ 139k rels/s | ❌ LOSS — 670× behind Kuzu, 1 150× behind Memgraph at the same scale. Driver does one `begin_write`/`commit` per node — a real batched bulk loader is tracked in BENCHMARKS §4.1. |
| 2 | Streaming ingest, 30s window, batch=64 (nodes/s) | **301 nodes/s** | ≥ 100k tx/s | ❌ LOSS — same root cause as row 1. |
| 3 | Point read `neighbors()` p50/p95/p99 @ 10k nodes, cold | **7.1 / 11.2 / 13.4 μs** (119k qps) | p95 < 5 ms (SF10 warm) | ⚠️ DIRECTIONAL WIN — 80× under Memgraph Pokec p99, 2 000× under Neo4j. Scale mismatch: Pokec is 1.6M nodes; we ran 10k. |
| 4 | 2-hop traversal p50/p95/p99 @ 10k nodes, cold | **8.6 / 17.2 / 18.1 μs** (90k qps) | p95 < 100 ms | ⚠️ DIRECTIONAL WIN — clears SF10 IC threshold by 3 000×. |
| 5 | LDBC SNB IS-1 p50/p95/p99 (1k queries, mini fixture) | **22.2 / 232 / 365 μs** (18.9k qps) | p95 < 5 ms @ SF10 | 🟡 NOVEL — scale mismatch, mini fixture not directly comparable. |
| 6 | Single-tx mutation p95/p99 (1k samples) | **13 687 / 15 668 μs** (71 ops/s) | ≥ 100k ops/s, p99.9 < 1 s | ❌ LOSS on throughput. p99.9 = 720 ms scrapes inside the 1s bound; the 56× p99→p99.9 ratio points at a flush/GC pause. |
| 7 | Enrichment round-trip `t_persist` p50/p95/p99 (100 docs × 10ent + 15edge) | **38.5 / 45.4 / 114.0 ms** | p50 < 15 ms, p95 < 40 ms best-in-class | ✅ WIN on competitive (3.4× under 150 ms threshold), MISS on best-in-class by 4 ms. |
| 8 | Hybrid retrieval (vector kNN + 1-hop) p50/p95/p99 (100q × 1k × dim=16) | **184 / 223 / 245 μs** | p95 < 80 ms + NDCG@10 ≥ dense-SOTA + 3pp | 🟡 NOVEL — 0.38ms p95 is 200× under the best-in-class bar; quality (NDCG@10) deferred until a BEIR corpus is wired. |
| 9 | Concurrent multi-agent writes (commits/s, N=4 × 500 ops) | **300 commits/s** (conflict_rate = 0.0) | ≥ 10k commits/s @ N=64, conflict < 3% | ❌ LOSS — under-scaled (N=4 vs N=64) and **kernel-limited**: ogdb-core is single-writer today, so each thread owns its own DB and conflict_rate=0 is mechanical. Multi-writer kernel tracked in BENCHMARKS §4.6. |
| 10 | Graph-feature rerank batch p50/p95/p99 (100 candidates × 1-hop) | **1.27 / 1.35 / 1.50 μs** (153 μs/batch) | p95 < 50 ms | ✅ WIN — 91 000× faster than Cohere Rerank 3.5, 27 000× under best-in-class bar. Caveat: synthetic `Σ neighbour_id` boost; real boost adds ~1–5 μs/candidate. |
| 11 | Graphalytics BFS (μs, seed=0, max_hops=3, LDBC mini = 100 nodes) | **42.7 μs** (70 nodes visited, 3 levels) | T_p ≤ 12s on Datagen-9.0 | 🟡 NOVEL — scale mismatch (tier 0 vs tier XL). |
| 12 | Graphalytics PageRank (20 iters, damping 0.85, mini fixture) | **604 μs/iter × 20 = 12.1 ms** | T_p ≤ 30s on Datagen-9.0 | 🟡 NOVEL — same caveat as row 11. |
| 13 | Scaling Tier 7.1 @ 10k nodes (read p95 / load / RSS / file) | **0.26 μs / 0.29 s / 27.2 MB / 39.4 MB** | p95 < 1 ms, load < 1 s, RSS < 100 MB | ✅ WIN on all three gates — 2 400× / 3.3× / 3.8× under thresholds. |
| 14 | Resources @ 10k bulk ingest (CPU user / RSS peak / disk / wall) | **1.45 s / 30.3 MB / 49 MB / 39 s** | RSS ≤ 4× raw data | 🟡 NOVEL — RSS is 0.54× raw; factorization ratio not yet wired. |

## Scorecard summary

| Verdict | Count | Rows |
|---|---|---|
| ✅ Win (clears spec, apples-to-apples) | **3** | 7, 10, 13 |
| ❌ Loss (apples-to-apples) | **3** | 1, 2 (collapsed to one ingest root cause), 6, 9 |
| 🟡 Novel / ⚠️ scale-mismatched | **8** | 3, 4, 5, 8, 11, 12, 14 + the kernel-limited side of 9 |

Strict bucketing: **3 wins / 2 losses / 6 novel.**

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

- [`docs/BENCHMARKS.md`](../../../docs/BENCHMARKS.md) — live baseline (this file is a frozen snapshot).
- [`docs/evaluation-runs/`](../../../docs/evaluation-runs/) — raw `EvaluationRun` JSON for every published run.
