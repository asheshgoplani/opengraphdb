# OpenGraphDB 0.5.3 — Competitive Benchmark Baseline

> **0.5.1 measurement-commit note (relabeled 2026-05-06):** the N=5 medianed numbers below were measured on `main` at commit `1afcee3` (42 commits in `crates/ogdb-core/` past tag `v0.4.0`; commit `1afcee3` is contained by tags `v0.5.0` and `v0.5.1`). The earlier framing — that the v0.4.0 → v0.5.1 window carried "zero perf-relevant code changes" — was wrong: the v0.4.0..v0.5.1 range touches ogdb-core in 43 commits. So treat these numbers as a pre-0.5.0 baseline pinned at `1afcee3` and held forward through the v0.5.0 / v0.5.1 minor + patch releases without re-measurement; a fresh re-baseline against the v0.5.1 release commit is tracked as a v0.6.0 follow-up.

**Measurement date:** 2026-05-02 (N=5 re-baseline at 0.4.0; **all 14 rows in § 2** are this run after cycle-15 `cf97159` extended scope to rows 7-14 and cycle-16 `f72f7cd` extended scope to rows 1-2. The 2026-05-01 single-shot and 2026-04-25 0.3.0 N=5 medianed baselines are preserved as historical.).
**Branch:** `main` @ `1afcee3`
**Harness:** `crates/ogdb-eval` — `RunAllConfig::full` via `cli_runner::run_all`, plus `graphalytics::{run_bfs, run_pagerank}` and `criterion_ingest::ingest_criterion_dir`. Source: `crates/ogdb-eval/tests/publish_baseline.rs` (default `OGDB_EVAL_BASELINE_ITERS=5` since cycle-9).
**Raw run JSON:** [`documentation/evaluation-runs/baseline-2026-05-02.json`](evaluation-runs/baseline-2026-05-02.json) (15 `EvaluationRun`s, schema v1.0, version=0.4.0, N=5 medianed, warm-up driver pass discarded). The 2026-05-01 single-shot JSON is preserved at [`baseline-2026-05-01.json`](evaluation-runs/baseline-2026-05-01.json), and the 2026-04-25 0.3.0 N=5 medianed baseline at [`baseline-2026-04-25.json`](evaluation-runs/baseline-2026-04-25.json), for longitudinal diff.
**Historical baseline:** [`documentation/evaluation-runs/baseline-2026-04-23.json`](evaluation-runs/baseline-2026-04-23.json) preserved for diff-engine longitudinal comparisons.

## Scope and honesty policy

> **Baseline-version note (relabeled 2026-05-06; supersedes the
> 2026-05-05 cycle-15 audit wording).** All 14 rows in § 2 below
> are sourced from
> [`baseline-2026-05-02.json`](evaluation-runs/baseline-2026-05-02.json)
> (15 `EvaluationRun`s, schema v1.0, i9-10920X bench box, governor
> `powersave` with warm-up driver pass — `performance` not writeable
> from this conductor). The measurement was taken on `main` at
> commit `1afcee3`, which is **42 commits past tag `v0.4.0` (in
> `crates/ogdb-core/`)** and **contained by tags `v0.5.0` and
> `v0.5.1`** (`git tag --contains 1afcee3` confirms). Treat these
> numbers as a pre-0.5.0 N=5 baseline pinned at `1afcee3` and held
> forward through the v0.5.0 / v0.5.1 releases without
> re-measurement; rows are tagged `(carry-fwd from 1afcee3)` in the
> § 2 column header. The earlier framing — that the JSON encodes
> a literal "0.4.0 N=5" run — was empirically loose: the JSON file
> stamps `version=0.4.0` because the workspace `Cargo.toml` had not
> yet rolled to 0.5.0 at measurement time, but the commit itself
> already carries 42 ogdb-core commits past the 0.4.0 tag.
> `scripts/check-benchmarks-version.sh` gates on the column-header
> marker so the headline-vs-column-header drift caught in cycle-15
> cannot recur silently. The 2026-04-25 0.3.0 N=5 medianed baseline
> at
> [`baseline-2026-04-25.json`](evaluation-runs/baseline-2026-04-25.json),
> the 2026-05-01 single-shot at
> [`baseline-2026-05-01.json`](evaluation-runs/baseline-2026-05-01.json),
> and the 2026-04-23 historical baseline are preserved in-tree for
> longitudinal diff.
>
> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15).** The
> earlier wording that claimed carry-forward rows were "stable
> across the 0.3.0 → 0.4.0 perf-sensitive code paths" was
> empirically false against the JSON below and has been removed;
> the table is the actual measured drift, published transparently:
>
> | Row | Metric | 0.3.0 N=5 | 0.4.0 N=5 | Δ |
> |---|---|---|---|---|
> | 1 | bulk ingest (nodes/s) | 254 | 251 | −1.2 % |
> | 2 | streaming ingest (nodes/s) | 302 | 300 | −0.7 % |
> | 3 | read p95 (μs) | 11.2 | 6.8 | −39 % (improvement) |
> | 4 | 2-hop p95 (μs) | 17.2 | 25.8 | **+50 % regression — § 4.2** |
> | 5 | IS-1 p95 (μs) | 232 | 163 | −30 % (improvement) |
> | 6 | mutation p95 (ms) | 13.7 | 13.0 | −5 % (flat) |
> | 7 | enrichment p95 (ms) | 45.4 | 46.7 | +2.9 % |
> | 7 | enrichment p99 (ms) | 114.0 | 112.6 | −1.2 % |
> | 8 | hybrid p50 (μs) | 184 | 204 | **+10.9 % — exceeds 10 % latency gate** |
> | 8 | hybrid p95 (μs) | 223 | 233 | +4.4 % |
> | 9 | concurrent commits/s | 300.5 | 294.6 | −1.8 % |
> | 10 | rerank p95 (μs) | 1.35 | 1.34 | flat |
> | 11 | BFS levels (μs) | 42.7 | 48.5 | **+13.5 % regression — § 4.7** |
> | 12 | PageRank iter (μs) | 604 | 652 | **+8.0 % regression — § 4.7** |
> | 13 | scaling 10k read p95 (μs) | 0.26 | 0.38 | **+44 % — § 4.2** |
> | 13 | scaling 10k load (s) | 0.29 | 0.32 | +10 % |
> | 13 | scaling 10k RSS (MB) | 27.2 | 28.0 | +3 % |
> | 14 | resources cpu_user (s) | 1.45 | 1.51 | +4 % |
> | 14 | resources rss_peak (MB) | 30.3 | 28.0 | −7.6 % (improvement) |
>
> Rows 8 (p50), 11, 12, and 13 (read p95) breach the published
> `evaluator-diff-engine` 5 %-throughput / 10 %-latency thresholds
> (`.claude/release-tests.yaml`). Profile follow-ups are folded into
> § 4.2 (scaling) and § 4.7 (Graphalytics at Datagen-9.0).

This document is the public competitive-comparison sheet for OpenGraphDB 0.5.1 (carry-fwd from commit `1afcee3`, N=5; see Baseline-version note above). Per the project's transparency directive we publish *every* measurement — wins, losses, and axes where no public baseline exists — with enough methodology context that a reader can reproduce or challenge the numbers.

Where OpenGraphDB loses to a competitor, we flag the gap as a follow-up in **Section 4**. Where OpenGraphDB wins, we cite the measurement protocol (dataset, iterations, hardware, warmup) so the reader can decide whether the comparison is apples-to-apples.

All OpenGraphDB numbers below are the **median of N=5 release-build iterations** with **1 warm-up iteration discarded** (CPU governor pinned to `performance` when writeable; warning logged otherwise — see methodology). p99.9 is excluded from this baseline because tail samples remain noisy at N=5; the manifest gate requires N≥5 median for tail comparisons. Numbers are not LDBC-audited. They are self-reported — on the same transparency tier as Memgraph Benchgraph and the Kuzu prrao87 study, and a step above Neo4j / Neptune / Nebula (which publish ratios or partial percentiles only).

## 1. Methodology

- **Build profile:** `cargo build --release -p ogdb-eval` (Rust release, opt-level=3, LTO default).
- **Workload driver:** `RunAllConfig::full` (see `crates/ogdb-eval/src/drivers/cli_runner.rs`). Sizes:
  - Streaming ingest: 30 s wall-clock budget, batch=64.
  - Bulk ingest: 10 000 nodes + 9 999 edges, single write-tx.
  - Point read: 1 000 `neighbors()` samples over the 10 k-node bulk graph.
  - 2-hop traversal: 1 000 seed samples.
  - Mutation: 1 000 per-update write-tx.
  - LDBC SNB IS-1: 1 000 queries against the in-tree LDBC mini fixture (100 Persons + 500 KNOWS).
  - AI-agent drivers: 100 enrichment docs × (10 entities + 15 edges); 1 000 hybrid nodes / 100 queries / dim=16; 4 concurrent threads × 500 ops; 100 rerank candidates.
  - Scaling tier: 10 k nodes.
  - Graphalytics BFS: seed=0, max_hops=3 on the LDBC mini.
  - Graphalytics PageRank: 20 iterations, damping=0.85 on the LDBC mini.
- **Warm-up:** one `throughput::ingest_streaming(5 s)` pass is run before the measured iterations and its `EvaluationRun` is discarded. This primes the build-cache and page-cache so iter-1 isn't punished. The warm-up driver is the single most impactful lever for cold-cache variance; the previous (2026-04-23) baseline ran without it.
- **CPU governor:** the harness probes `/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` and tries to set it to `performance`. If the file is non-writeable (typical without sudo), the harness logs a one-line warning and proceeds — the warm-up pass alone closes most of the variance gap. To pin the governor for a true performance run, invoke as `sudo cpupower frequency-set -g performance` before the harness or run the harness as root.
- **Iterations:** **N=5** release-mode iterations. Per-driver sample counts within an iter are listed above. For each `EvaluationRun` (matched by `(suite, subsuite, dataset)`), each metric is the median across the 5 iters using lower-median (conservative; never reports a value that didn't actually occur in the sample). p99.9 metrics are dropped from the medianed core — even at N=5 the tail is too noisy to publish; the manifest gate requires N≥5 median for tail comparisons. Per-iter percentiles still use nearest-rank (`idx = ceil(p·N)−1`). See `crates/ogdb-eval/src/drivers/common.rs::percentiles_extended` and `crates/ogdb-eval/src/drivers/multi_iter.rs::median_aggregate`.
- **Single-shot post-pass:** Graphalytics BFS / PageRank, criterion-ingest, and skill_quality run once after the medianed core. Their numbers are stable enough single-shot that looping them per-iter would only inflate runtime without improving signal.
- **Platform metadata** (captured verbatim in each `EvaluationRun`):
  - OS: Linux x86_64 (kernel 6.17.0-19-generic)
  - CPU: Intel Core i9-10920X @ 3.50 GHz (12-core HEDT, non-cloud bench box)
  - Build profile: `release`
  - OpenGraphDB version: 0.5.1 (numbers carried forward from N=5 baseline at commit `1afcee3` — see top-of-doc note)

**HNSW thresholds (added 2026-05-01 per eval Finding 2).** The vector-search backend has two scale-dependent fall-throughs that users should know about when reasoning about latency:

- `HNSW_MIN_N = 256` (`crates/ogdb-core/src/lib.rs::HNSW_MIN_N`) — vector indexes with fewer than 256 entries skip the HNSW build entirely and serve queries via brute-force scan. Latency curves on small corpora therefore look different from the published numbers (which assume HNSW is in use).
- `HNSW_BITMAP_BRUTE_THRESHOLD = 32` (`crates/ogdb-core/src/lib.rs::HNSW_BITMAP_BRUTE_THRESHOLD`) — filtered vector queries (where a Cypher `WHERE` clause prunes candidates before the kNN search) fall back to brute force when fewer than 32 rows survive the filter. Heavily-filtered queries are therefore exact, not approximate.
- `ef_construction = 400`, `ef_search = 128`, `seed = 0xC0FFEE` (`crates/ogdb-core/src/lib.rs::HNSW_EF_CONSTRUCTION` / `::HNSW_EF_SEARCH` / `::HNSW_BUILDER_SEED`) — tuning constants for the `instant-distance` builder. These are pinned for reproducibility; they govern recall@10 ≥ 0.95 (gate: `crates/ogdb-core/tests/hnsw_recall_at_10_over_0_95_at_10k.rs`) and p95 ≤ 5 ms (gate: `crates/ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs`) at N=10k, d=384.
- **Commit-time rebuild (eval Finding 2 fix + cycle-2 C2-A5 refinement):** prior to 2026-05-01, `commit_txn` rebuilt every HNSW from scratch on every transaction commit, costing hundreds of ms per *unrelated* edge-only commit. cycle-1's fix gated on `touched_nodes.is_empty() == false` — closing the pure-edge / no-op case. cycle-2 (this branch) tightens the gate further: the rebuild also skips when the txn touched nodes but only modified property keys that aren't in the vector-index catalog (e.g. updating `last_modified` on Doc nodes that carry an `embedding` index). Node creation, label changes, and mutations to indexed property keys still trigger the rebuild — see `crates/ogdb-core/tests/c2_a5_hnsw_skip_rebuild_on_unrelated_property.rs` for the regression pin. True incremental insert (the L-effort backend swap from `instant-distance` to `usearch` / `hnsw_rs`, or a delta-buffer adapter) is tracked as a v0.6.0 follow-up: the row-6 mutation p99 of 15.6 ms still includes the full rebuild on `embedding`-touching commits.

**Hardware caveat.** The spec's Workstation tier is AWS r7i.4xlarge (16 vCPU / 128 GB / NVMe). Our bench box is a 12-core Skylake-X desktop — single-NUMA, older uarch, different memory bandwidth. Numbers here should be read as a *lower bound* on what the SF10 Workstation run will report once we re-run on r7i.

## 2. Competitive comparison table

Columns as specified. `Target (fastest-in-market)` is the best-in-class threshold from each competitor's published numbers (Neo4j Cypher Tuning Guide, Memgraph Benchmarks 2024, KuzuDB v0.7 release notes — see Section 5 for source links). Verdict legend: ✅ win / ❌ loss / 🟡 novel (no public baseline) / 🟡 directional indicator (smaller-tier signal, not apples-to-apples) / ⚠️ scale-mismatched (we ran at a smaller tier than competitors publish at — directional only).

| # | Metric | OpenGraphDB 0.5.1 (carry-fwd from `1afcee3`, N=5) | Neo4j published | Memgraph published | KuzuDB (historical) | Target (fastest-in-market) | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Bulk ingest, 10 k nodes + 10 k edges (nodes/s, single write-tx) | **251 nodes/s** (0.4.0, `throughput::ingest_bulk`, N=5 median, 2026-05-02 re-baseline) | ≈ 3.3 k nodes/s @ 100 k+2.4 M (derived: 30.64 s, [prrao87 study](https://github.com/prrao87/kuzudb-study)) | ≈ 295 k nodes/s @ 100 k ([blog](https://memgraph.com/blog/memgraph-or-neo4j-analyzing-write-speed-performance), 339 ms) | **≈ 172 k nodes/s** @ 100 k+2.4 M (0.58 s, prrao87) | ≥ 500 M rels/hr ≈ 139 k rels/s (spec 1.1 best-in-class) | ❌ **LOSS** — 670× behind Kuzu, 1 150× behind Memgraph on the same-scale workload. Root cause: driver's naïve "one `begin_write`/`commit` per node" path. Fix tracked in Section 4.1. |
| 2 | Streaming ingest (nodes/s sustained, 30 s window, batch=64) | **300 nodes/s** (0.4.0, `throughput::ingest_streaming`, N=5 median, 2026-05-02 re-baseline) | not published | ≥ 10 k tx/s on mixed 30 %-write ([Benchgraph](https://memgraph.com/benchgraph)) | not published | ≥ 100 k tx/s (spec 1.2 best-in-class) | ❌ **LOSS** — 33× behind Memgraph's weakest Benchgraph number. Same root cause as row 1. |
| 3 | Point read, `neighbors()` p50 / p95 / p99 (μs) @ 10 k nodes, **cold**, p99.9 dropped (N=5 noise) | **5.8 / 6.8 / 11.8 μs**, 166 k qps (0.4.0, N=5 median, 2026-05-02 re-baseline) | ≈ 27.96 ms p99 on Pokec small, cold ([Memgraph blog](https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison)) | **1.09 ms p99** on Pokec small, cold, 32 k qps isolated (Benchgraph) | ≤ 0.3 ms p50 on LDBC-study (prrao87) | p95 < 5 ms (spec 2.1 IS-1..7 SF10 warm) | ❌ **LOSS verified at 10 k vs Neo4j 5.x Cypher-over-HTTP** (p50 0.71 ms vs 2.54 ms = ✅ WIN; p95 20.5 ms vs 5.7 ms = ❌ LOSS; p99 31.2 ms vs 7.6 ms = ❌ LOSS — Tier-1 run 2026-05-05, see §2.2). The embedded `neighbors()` numbers in this row remain authoritative for the embedded API path; over the same Cypher-over-HTTP shape Neo4j wins on tail. SF10 / Pokec apples-to-apples is Tier 2. |
| 4 | 2-hop traversal p50 / p95 / p99 (μs) @ 10 k nodes, cold, p99.9 dropped (N=5 noise) | **22.9 / 25.8 / 36.0 μs**, 48 k qps (0.4.0, N=5 median, 2026-05-02 re-baseline) | 2-hop at SF1 typically 5–20 ms p95 (maxdemarzi, various) | not published at equivalent shape | Kuzu Q8 (2-degree path): 8.6 ms vs Neo4j 3.22 s at LDBC-scale ([Data Quarry](https://thedataquarry.com/blog/embedded-db-2/)) | p95 < 100 ms (spec 2.2 IC-1..7 SF10 warm) | ❌ **LOSS verified at 10 k vs Neo4j 5.x Cypher-over-HTTP** (p50 15.7 ms vs 3.83 ms; p95 25.3 ms vs 6.75 ms; p99 28.2 ms vs 8.77 ms — Tier-1 run 2026-05-05, see §2.2). The embedded-API numbers in this row remain authoritative for that path; the Cypher chained-`-[]->()-[]->()` form runs ~10× behind Neo4j's planner on this shape. SF1 / SF10 LDBC IC apples-to-apples is Tier 2. |
| 5 | LDBC SNB IS-1 p50 / p95 / p99 (μs), 1 000 queries, p99.9 dropped (N=5 noise) | **18.3 / 163 / 222 μs**, 25.9 k qps @ LDBC mini (100 persons, 0.4.0, N=5 median, 2026-05-02 re-baseline) | none (Neo4j has no LDBC audit) | SF0.1/1/3 internal runs, not published as percentile tables | no LDBC audit; CIDR'23 covers complex reads | p95 < 5 ms @ SF10 (spec 4.1.x + 2.1) | 🟡 **NOVEL — scale mismatch** — LDBC SNB mini fixture has no published SF equivalent. IS-1 at SF10 is Phase-1 Must Ship (Section 4.3). |
| 6 | Single-tx mutation p95 / p99 (μs), 1 000 samples, p99.9 dropped (N=5 noise) | **12 981 / 15 939 μs**, 72 ops/s (0.4.0, N=5 median, 2026-05-02 re-baseline) | not published as percentile tables | 132× Neo4j mixed 30 %-write (ratio only; absolute tx/s not disclosed) | not published | ≥ 100 k ops/s with p99.9 < 1 s (spec 1.5 + 2.5) | ❌ **LOSS on throughput** — 72 ops/s vs ≥ 10 k ops/s competitive threshold. p95 ≈ 13 ms / p99 ≈ 16 ms. p99.9 is dropped from the medianed core (still noisy at N=5); the 720 ms p99.9 outlier seen in the 2026-05-01 single-shot is filed as a profile-the-tail follow-up under Section 4.4. |
| 7 | Enrichment round-trip `t_persist` p50 / p95 / p99 (ms), 100 docs × 10 ent + 15 edges | **38.8 / 46.7 / 112.6 ms** (0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline) | nothing published on this axis | nothing published on this axis | nothing published on this axis | p50 < 15 ms, p95 < 40 ms (spec B.1 best-in-class) | ✅ **WIN on competitive, MISS on best-in-class** — p95 of 47 ms clears the 150 ms competitive threshold by 3.2×, but misses the 40 ms best-in-class bar by 7 ms. First public number for this metric. |
| 8 | Hybrid retrieval (vector kNN + 1-hop) p50 / p95 / p99 (μs), 100 queries × 1 000 nodes × dim=16 | **204 / 233 / 246 μs** (latency only, 0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline; NDCG deferred) | Neo4j Vector Lucene-HNSW: no published latency-quality pair | mgvector: no published latency-quality pair | NaviX VLDB'25: paper only, no pair at BEIR scale | p95 < 80 ms + NDCG@10 ≥ dense-SOTA + 3 pp (spec B.3 best-in-class) | 🟡 **NOVEL — latency beats threshold, quality deferred** — 0.23 ms p95 is 343× under the 80 ms best-in-class bar, but quality (NDCG@10) is deferred: no BEIR corpus in-tree yet. Composite-SLA claim waits on Section 4.5. |
| 9 | Concurrent multi-agent writes (commits/s), N=4 threads × 500 ops | **295 commits/s** (0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline), conflict_rate = 0.0 (single-writer kernel → separate DB per thread) | Aura: ~5 k w/s under contention (marketing) | not published as a curve | not published | ≥ 10 k commits/s @ N=64, conflict < 3 % (spec B.5 best-in-class) | ❌ **LOSS — under-scaled and kernel-limited** — we ran N=4, spec requires N=64. More importantly, `ogdb-core` is single-writer today, so each thread owns its own DB and the conflict_rate = 0 is mechanical, not a real measurement. Multi-writer is Section 4.6. |
| 10 | Graph-feature re-ranking batch p50 / p95 / p99 (μs), 100 candidates × 1-hop | **1.28 / 1.34 / 1.62 μs** (batch 153 μs total, 0.4.0, N=5 median, 2026-05-02 re-baseline) | not published | not published | not published | p95 < 50 ms, beats ZeroEntropy zerank-1 class (spec B.6 best-in-class) | ✅ **WIN — significant headroom** — batch p95 of 1.34 μs is ≈ 128 000× faster than Cohere Rerank 3.5 (171.5 ms, [ZeroEntropy article](https://www.zeroentropy.dev/articles/lightning-fast-reranking-with-zerank-1)) and ≈ 37 000× under the best-in-class bar. **Caveat (synthetic boost — read carefully):** the boost is a synthetic `Σ neighbour_id`, not a learned neighbour-similarity dot product. A production boost computing a learned dot-product (or short MLP) over neighbour embeddings adds real per-candidate work — likely ~1–5 μs per candidate at d=16 and meaningfully more at d=384 — so the headline 128 000× ratio is best read as "graph-traversal versus neural forward pass," not "OpenGraphDB rerank versus production Cohere on equivalent scoring." Even with realistic learned-boost overhead the figure is still expected to clear the 50 ms competitive bar by orders of magnitude, but the apples-to-apples production comparison waits on a learned-boost implementation. |
| 11 | Graphalytics BFS (μs + nodes visited), seed=0, max_hops=3 | **48.5 μs**, 70 nodes visited, 3 levels @ LDBC mini (100 nodes, 0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline) | not published | not published | not published | T_p ≤ 12 s on Datagen-9.0 (≈ SF1000), EVPS ≥ 500 M (spec 4.3.1 best-in-class) | 🟡 **NOVEL — scale mismatch** — Graphalytics grades at scale-tier XL (log₁₀(n+m) ≥ 9.0); we ran tier 0. Cannot claim the bar until we run on Datagen-9.0. Section 4.7. |
| 12 | Graphalytics PageRank (iter μs / n), 20 iterations, damping=0.85 | **652 μs/iter × 20 = 13.0 ms** total @ 100 nodes (0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline) | TigerGraph: 6.7× speedup on 8 nodes (ratio only) | not published | not published | T_p ≤ 30 s on Datagen-9.0, EVPS ≥ 200 M (spec 4.3.2 best-in-class) | 🟡 **NOVEL — scale mismatch** — same caveat as row 11. |
| 13 | Scaling Tier 7.1 (10 k nodes): read p95 / bulk-load wall-clock / RSS | **read p95 = 0.38 μs, load = 0.32 s, RSS = 28.0 MB, file = 39.4 MB** (0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline) | not published at this tier | not published at this tier | embedded; sub-second load expected, not published | p95 < 1 ms, load < 1 s, RSS < 100 MB (spec 7.1) | ✅ **WIN on all three gates** — read p95 is 2 600× under the threshold, load 3.1× under, RSS 3.6× under. |
| 14 | Resources — 10 k-node bulk ingest CPU / RSS / disk | **CPU user 1.51 s, RSS peak 28.0 MB, disk 49 MB, wall 40 s** (0.5.1, 0.4.0 N=5 carry-forward, 2026-05-02 re-baseline) | not published | not published | Kuzu advertises "embedded, low-memory"; no percentile data | RSS ≤ 4× raw data; factorization ratio ≥ 5× (spec 3.1, 3.6) | 🟡 **NOVEL — factorization ratio not yet wired** — RSS 28 MB on 49 MB data ≈ 0.57× raw; passes the 4× budget by a wide margin, but we don't yet emit a factorization-ratio metric so the deep Kuzu-class comparison can't be made. Section 4.8. |

### 2.2 Apples-to-apples vs Neo4j Community 5.x — 10 k tier (Tier 1, run 2026-05-05)

> **Verified vs Neo4j on the same hardware, same workload, same Cypher
> shape, same N=5 / lower-median methodology.** Plan source:
> Tier-1 of the apples-to-apples Neo4j-comparison plan (drafted in the
> in-flight `eval/plan-neo4j-comparison-cfb3d40` branch; the planning
> directory is `.gitignore`'d on `main` per repo convention, so the plan
> itself ships with the eventual feature merge).
> Harness lives at [`scripts/competitor-bench/`](../scripts/competitor-bench/).
> Frozen run JSONs (evidence for the verdicts in this section): [`scripts/competitor-bench/results-2026-05-05/`](../scripts/competitor-bench/results-2026-05-05/) — 6 iters × 2 engines `<engine>-iter<N>.json` + `summary.json` + `summary.md`. Re-running `run-all.sh` writes to a sibling `results/` dir (gitignored).

**Workload (identical Cypher on both engines):**

```
ingest:     10 000 nodes + 9 999 edges (path graph 0→1→…→9999), single
            transaction, batch=1 000 via UNWIND on Neo4j and POST /import on
            OpenGraphDB.
point-read: MATCH (n:Bench {id: $id}) RETURN n.id           — 1 000 random ids
2-hop:      MATCH (n:Bench)-[:LINK]->(x)-[:LINK]->(m)
            WHERE n.id = $id RETURN m.id LIMIT 100          — 1 000 random seeds
```

The chained 2-hop is used in place of `MATCH (n)-[*2]-(m)` because OpenGraphDB
0.5.1's variable-length matcher does not yet expand `*2` to two edges (bug
filed; chaining produces identical result-shape and runs through the same
planner on Neo4j).

**Methodology:** N=5 measured iters + 1 warm-up discarded; lower-median across
iters; per-iter percentiles use nearest-rank (`ceil(q·N) − 1`) — identical to
[`crates/ogdb-eval/src/drivers/multi_iter.rs`](../crates/ogdb-eval/src/drivers/multi_iter.rs)
and `common.rs::percentiles_extended`. Cold cache: `sysctl vm.drop_caches=3`
between iters; the Neo4j container is recreated `--rm` each iter and the
OpenGraphDB database file is wiped + re-init'd, so engine-internal cache is
also cold. Governor `powersave` (writeable governor not available on this
box; warning logged, run proceeds — same posture as the 2026-05-02 baseline).

**Engines:**

- **OpenGraphDB 0.5.1** (release build, `cargo build --release -p ogdb-cli`),
  HTTP/JSON `POST /query` and `POST /import`, single-writer kernel.
- **Neo4j Community 5.x** —
  Docker image `neo4j:5-community@sha256:b357872da95a164c5243ca8d9060601130717ff43cee3c829402fab46209a412`,
  Bolt 5 (Neo4j's wire protocol) over `neo4j-driver` 6.2.0,
  `NEO4J_dbms_memory_heap_max__size=8G` / `NEO4J_dbms_memory_pagecache_size=4G`
  (per blocking-decision #3 in the plan: equal-RSS rule capped at 12 GB).

**Hardware:** Intel Core i9-10920X @ 3.5 GHz (12-core HEDT, 24 threads),
Linux kernel 6.17.0-19-generic, governor `powersave`, 64 GB RAM. Same box as
the 2026-05-02 baseline.

| Metric | OpenGraphDB 0.5.1 | Neo4j 5-community | Verdict |
|---|---|---|---|
| Bulk ingest 10k+10k (nodes/s, single tx) | **263** | 6,102 | ❌ LOSS |
| Point-read p50 | **0.71 ms** | 2.54 ms | ✅ WIN |
| Point-read p95 | **20.5 ms** | 5.71 ms | ❌ LOSS |
| Point-read p99 | **31.2 ms** | 7.65 ms | ❌ LOSS |
| 2-hop p50      | **15.7 ms** | 3.83 ms | ❌ LOSS |
| 2-hop p95      | **25.3 ms** | 6.75 ms | ❌ LOSS |
| 2-hop p99      | **28.2 ms** | 8.77 ms | ❌ LOSS |

**What this run confirms.**

- **Bulk ingest LOSS** is consistent with row 1's 251 nodes/s embedded number
  — Neo4j's batched `UNWIND $rows … CREATE (…)` is ~23× faster than
  OpenGraphDB's per-record `apply_import_records` path. Same root cause
  (follow-up #1 in §4); now confirmed against the headline incumbent at the
  same scale.
- **Point-read p50 WIN (0.71 ms vs 2.54 ms = 3.6×)** — OpenGraphDB's
  HTTP+JSON minimum round-trip is genuinely lighter than Bolt's connection
  overhead at `n=10 k`. The embedded API (row 3 headline: 5.8 / 6.8 / 11.8 μs)
  is faster still by ~120×; the 0.71 ms here is the cost the Cypher parser +
  HTTP layer add on top of the kernel.
- **Tail LOSS at point-read p95 / p99** — OpenGraphDB's distribution is
  bimodal (p50 0.71 ms, p95 20.5 ms): every iter shows a tight head and a
  fat tail at ~20 ms. Likely sources: (a) HTTP server's per-request worker
  thread spin-up, (b) Cypher planner cache invalidation under cold-cache
  conditions, (c) freelist / page-cache miss on the property column. Profile
  follow-up filed in §4 (new follow-up #12 below).
- **2-hop LOSS across all percentiles** — chained `(n)-[]->(x)-[]->(m)` runs
  ~10× behind Neo4j's planner. Neo4j ships an index-backed seed (`n.id`) and
  fans out via its bolt-v5 streaming reader; OpenGraphDB's chained-pattern
  planner does two label scans on the intermediate edge expansion. Profile
  follow-up filed in §4 (new follow-up #13 below).

**What this run does *not* claim.**

- This is not the SF1 / SF10 / Pokec 1.6 M apples-to-apples — that's Tier 2
  in the comparison plan. Today's verdict is **at the 10 k tier only**, and
  the row 3/4 verdict footnote says so explicitly.
- The HTTP+JSON shape penalises OpenGraphDB's tail; the embedded API
  (`Database::neighbors()`) numbers in row 3 remain the authoritative
  embedded-path latency. Both shapes are real workloads; the Tier-1 run is
  the apples-to-apples Cypher comparison the user asked for.
- `shortestPath` IC queries are skipped per blocking-decision #5 in the plan.
- Per blocking-decision #4 the run is cold-cache only; warm-cache columns
  graduate to Tier 3.

**Reproducing this run.** ≤ 30 minutes wall-clock on a comparable workstation:

```bash
cargo build --release -p ogdb-cli
python3 -m venv .venv && .venv/bin/pip install neo4j
docker pull neo4j:5-community
scripts/competitor-bench/run-all.sh
# → scripts/competitor-bench/results/{summary.md,summary.json}
```

The harness (`run-all.sh`, `drivers/{neo4j,opengraphdb}.py`, `reduce.py`)
brings up a fresh container per iter, drops OS page cache between iters,
runs the workload, dumps per-iter JSON, then medianes. See
[`scripts/competitor-bench/README.md`](../scripts/competitor-bench/README.md).

### 2.1 Scorecard summary

| Verdict | Count | Metrics |
|---|---|---|
| ✅ Verified WIN (apples-to-apples against a published spec threshold) | **2** | 13 (scaling tier 10 k — clears all three internal gates; 10 k-tier internal threshold), §2.2 point-read p50 (verified vs Neo4j 5.x at the 10 k tier — 0.71 ms vs 2.54 ms = 3.6×) |
| ✅⚠️ WIN at competitive bar / MISS (or caveated) at best-in-class | **2** | 7 (enrichment p95: clears the 150 ms competitive threshold by 3.2× but misses the 40 ms best-in-class bar by 7 ms), 10 (rerank batch p95: clears the 50 ms competitive bar by orders of magnitude but the boost is a synthetic sum-of-ids — not a learned dot-product — so the headline ratio is "graph-traversal vs. neural forward pass," not an apples-to-apples production-rerank comparison) |
| ❌ Loss (apples-to-apples, clear gap) | **5** | 1 (bulk ingest), 2 (streaming ingest), 3 (point-read p95/p99 vs Neo4j Cypher-over-HTTP — verified Tier-1 §2.2), 4 (2-hop all percentiles vs Neo4j Cypher-over-HTTP — verified Tier-1 §2.2), 6 (mutation throughput), 9 (concurrent writes — under-scaled + kernel-limited) — five distinct root causes (ingest pattern, per-tx overhead, single-writer kernel, HTTP+Cypher tail variance, chained-pattern planner) |
| 🟡 Novel / 🟡 directional indicator / ⚠️ scale-mismatched (no public apples-to-apples comparable yet) | **5** | 5 (IS-1 on mini), 8 (hybrid retrieval — NDCG deferred), 11 (BFS on mini), 12 (PageRank on mini), 14 (resources — factorization ratio not wired) |

Using the stricter "verified wins / caveated wins / clean losses / novel" bucketing: **2 verified wins (row 13 + §2.2 point-read p50) / 2 caveated wins / 4 losses (rows 1, 2, §2.2 row 3 tail + row 4, row 6, row 9) / 5 novel-or-directional**. Rows 3 and 4 graduated from 🟡 directional to ❌ verified-LOSS at the 10 k tier in the 2026-05-05 Tier-1 run; rows 5, 8, 11, 12, 14 remain novel pending Tier 2 (LDBC SF1) and Tier 3 (Datagen-9.0 + warm cache).

## 3. What's true about each win (methodology disclosure)

- **Row 7 — Enrichment p95 = 46.7 ms (0.4.0 N=5 median, carried forward to 0.5.1).** Measured on `ai_agent::enrichment_roundtrip(db_dir, 100, 10, 15)`: 100 documents, 10 entities + 15 edges per document, one `begin_write` / `commit` per document. Storage latency only (no live LLM in the path). Comparable to spec B.1's `t_persist` definition. Hardware: i9-10920X / Linux. Warm-up driver pass discarded; per-iter cache state primed.
- **Row 10 — Rerank batch p95 = 1.35 μs (N=5 median).** Measured on `ai_agent::re_ranking(db_dir, 1000, 100)`: 1 000-node graph, 100 candidates per batch, 1-hop boost computation per candidate. The boost function is a synthetic `Σ neighbour_id`, not a learned similarity — see caveat in the row. Comparison baseline (Cohere Rerank 3.5, 171.5 ms small-payload) is a generic cross-encoder doing a neural forward pass, which is structurally different from a graph-traversal boost; the comparison is directional but legitimate as a "graph-native versus neural-forward-pass" contrast.
- **Row 13 — Scaling 10 k tier (0.4.0 N=5 median, carried forward to 0.5.1).** Measured on `scaling::run_tier(dir, ScalingTier::Tier10K)`: 10 000 bare-node inserts in a single write-tx, then 1 000 `neighbors()` samples. Warm-up pass discarded. This is the spec's smallest scaling tier and was built as a regression-test floor, not as a competitive claim — but at 28.0 MB RSS / 0.32 s load / 0.38 μs read p95 it comfortably beats every other embedded-graph-DB's published floor numbers where they exist.

## 4. Follow-ups (where the numbers need to improve or the harness needs to grow)

1. **Bulk-ingest path is naïve.** The driver does one `begin_write` / `commit` per node. Implement a proper batched bulk loader (COPY-FROM-Parquet equivalent) and re-measure. Target: match or beat Kuzu's 172 k nodes/s at the 100 k+2.4 M scale. (Rows 1, 2, 6.)
2. **Scale up to SF1/SF10.** Our 10 k-node fixture is not directly comparable to Memgraph's Pokec (1.6 M) or LDBC SF10 (73 k persons / 30 M nodes / 176 M edges). Next measurement tier: run `scaling::run_tier(_, Tier100K)` and a real LDBC SF1 loader. (Rows 3, 4.)
3. **LDBC SNB Interactive IS-1..7 + IC-1..14 at SF10.** Mini fixture is a correctness smoke, not a competitive claim. Must ship Phase 1. (Row 5.)
4. **Mutation p99.9 = 719 ms tail.** Profile the outlier — likely a flush / page-cache miss. The p99→p99.9 ratio of 56× is abnormal. (Row 6.)
5. **BEIR corpus + NDCG@10 harness.** Hybrid retrieval has no quality number. Build a BEIR ingest + NDCG@10 evaluator (spec B.3). Until then the hybrid-retrieval latency win is half a claim. (Row 8.)
6. **Multi-writer kernel + concurrent-multi-agent-writes at N=64.** `ogdb-core` is single-writer today; concurrent_rate measurement is mechanical. Ship a real MVCC or RW-lock path, then re-run the spec B.5 curve to N=256. (Row 9.)
7. **Graphalytics at Datagen-9.0 (XL tier).** BFS and PageRank at 100-node mini are correctness smokes. Need an LDBC Datagen fetcher + loader before we can claim tier-XL performance. (Rows 11, 12.)
8. **Factorization-ratio metric (Kuzu axis).** Wire into the resources driver; emit alongside every multi-hop query metric. (Row 14.)
9. **Cold-start to first query (spec 3.5).** Not yet measured. Add to the resources driver.
10. **Warm-cache variants.** Every number above is cold. Add a `warmup_queries` knob to each driver and re-publish a "warm" column for every latency row. Brings us onto Memgraph Benchgraph's full isolated×mixed×realistic grid.
11. ~~**N=5 re-baseline at 0.4.0 on the i9-10920X bench box** (cycle-9 perf surface audit).~~ **Done 2026-05-02** — all 14 rows above now carry fresh 0.4.0 N=5 medians (cycle-9 wave: rows 3-6 + 10; cycle-15 `cf97159`: rows 7-14; cycle-16 `f72f7cd`: rows 1-2) from [`baseline-2026-05-02.json`](evaluation-runs/baseline-2026-05-02.json); `OGDB_EVAL_BASELINE_ITERS` now defaults to 5 in `crates/ogdb-eval/tests/publish_baseline.rs` so the methodology contract isn't operator-dependent. The N=5-vs-N=5 0.3.0 → 0.4.0 deltas are summarized in the Baseline-version note in § "Scope and honesty policy" above; the row-4 traversal p95 +50 % regression is the only one that warrants a profile pass and is folded into follow-up #2 (scaling) above.
12. **Cypher-over-HTTP point-read tail variance (§2.2 row).** OpenGraphDB's distribution is bimodal: every iter shows a tight head (p50 0.71 ms) and a fat tail (p95 20 ms). Likely sources: (a) HTTP server's per-request worker thread spin-up, (b) Cypher planner cache invalidation under cold-cache, (c) freelist / page-cache miss on the property column. Profile the outlier and either close the tail or document the workload class where it is unavoidable. Closing this is the path from "p50 WIN, p95 LOSS" to "p95 WIN" against Neo4j 5.x at the 10 k tier.
13. **2-hop chained-pattern planner (§2.2 row).** OpenGraphDB's chained `(n)-[]->(x)-[]->(m)` runs ~10× behind Neo4j's planner: Neo4j seed-binds via the `Bench(id)` index then streams the two edge expansions through Bolt; OpenGraphDB does two label scans on the intermediate edge expansion. Wiring the existing label catalog into the chained-edge planner (and/or fixing the `[*2]` variable-length matcher to actually expand to two edges so the optimiser has more freedom) is the targeted fix. Closing this turns row 4 from ❌ LOSS into a likely ✅ WIN at the 10 k tier.

## 5. Reproducing this run

```bash
cd crates/ogdb-eval
cargo build --release
# Single-shot (legacy, single iter; warm-up still runs, p99.9 retained):
OGDB_EVAL_BASELINE_JSON=/tmp/baseline.json \
OGDB_EVAL_BASELINE_MD=/tmp/auto-summary.md \
  cargo test --release --test publish_baseline -- --nocapture

# N=5 median (new default for published baselines):
OGDB_EVAL_BASELINE_JSON=/tmp/baseline-N5.json \
OGDB_EVAL_BASELINE_MD=/tmp/auto-summary-N5.md \
OGDB_EVAL_BASELINE_ITERS=5 \
  cargo test --release --test publish_baseline -- --nocapture
```

Expected wall-clock: ≈ 150 s single-shot, ≈ 12 min for N=5 median, on the i9-10920X bench box. Shorter on r7i.4xlarge. To pin the CPU governor for a true performance run, prefix with `sudo cpupower frequency-set -g performance` or run as root; the harness logs a warning and proceeds without pinning if it can't write `scaling_governor` itself.

## 6. Source citations

All published-competitor numbers above synthesize the following public sources:

- Neo4j 2-hop / write speed: [max demarzi 2023](https://maxdemarzi.com/2023/01/11/bullshit-graph-database-performance-benchmarks/), [Neo4j docs](https://neo4j.com/docs/operations-manual/current/performance/).
- Memgraph: [Benchgraph](https://memgraph.com/benchgraph), [vs-Neo4j latency](https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison), [write-speed analysis](https://memgraph.com/blog/memgraph-or-neo4j-analyzing-write-speed-performance).
- KuzuDB: [prrao87 study](https://github.com/prrao87/kuzudb-study), [Data Quarry embedded-db series](https://thedataquarry.com/blog/embedded-db-2/), [CIDR'23](https://www.cidrdb.org/cidr2023/papers/p48-jin.pdf).
- Cohere Rerank 3.5 latency baseline: [ZeroEntropy zerank-1 article](https://www.zeroentropy.dev/articles/lightning-fast-reranking-with-zerank-1).
- LDBC audit FDRs: [GraphScope SNB Interactive SF100/300/1000, 2024-05-14](https://ldbcouncil.org/docs/audits/snb/LDBC_SNB_I_20240514_SF100-300-1000_graphscope.pdf), [TigerGraph SNB BI SF1000, 2024-10-10](https://ldbcouncil.org/benchmarks/snb/LDBC_SNB_BI_20241010_SF1000_tigergraph.pdf).

## 7. Auto-generated summary

A mechanically-generated per-metric table (one row per `(suite, subsuite, metric)`) is written alongside the baseline JSON at [`documentation/evaluation-runs/auto-summary.md`](evaluation-runs/auto-summary.md) by `ogdb_eval::drivers::cli_runner::write_benchmarks_md`. That file is the raw data behind this document; this document is the hand-curated narrative on top.
