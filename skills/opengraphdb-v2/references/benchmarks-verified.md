# OpenGraphDB benchmarks: verified + caveated rows only

This is a deliberately narrow view of [`documentation/BENCHMARKS.md`](../../../documentation/BENCHMARKS.md).
It carries forward only the rows where we can make an apples-to-apples
claim against a published spec threshold. The other rows in the live
benchmark file are real measurements but cannot yet make that claim
(novel / scale-mismatched / single-tier) and live in
[`benchmarks-snapshot.md`](benchmarks-snapshot.md) instead.

The user's standing rule is "be careful with claims". This file is the
trust anchor; it should not embarrass us if quoted verbatim into a deck.

## Methodology, in one paragraph

Median of N=5 release-build iterations, one warm-up discarded. Hardware:
Intel Core i9-10920X (12-core HEDT, Linux, kernel 6.17). CPU governor
pinned to `performance` when writeable. p99.9 dropped from medianed core
because at N=5 the tail is too noisy to publish (manifest gate requires
N≥5 median for tail comparisons). Source:
`crates/ogdb-eval/tests/publish_baseline.rs`. Measurement date: 2026-05-02
(0.4.0 N=5 medianed re-baseline; carried forward to 0.5.1 because the
0.4.0 → 0.5.1 patch-release window touched no perf-relevant code).

## ✅ Verified WIN (apples-to-apples against published spec threshold)

### Row 13 — Scaling Tier 7.1 @ 10k nodes

| Axis | OpenGraphDB 0.5.1 | Spec target | Ratio under threshold |
|---|---|---|---|
| Read p95 | **0.38 μs** | < 1 ms (= 1 000 μs) | 2 600× |
| Bulk-load wall-clock | **0.32 s** | < 1 s | 3.1× |
| RSS peak | **28.0 MB** | < 100 MB | 3.6× |
| File size on disk | **39.4 MB** | (no spec target) | informational |

All three gates clear at the same tier. This is the single row in the
14-row scorecard where verdict is unconditional ✅ verified WIN.

**What this is not:** this is a 10k-tier internal threshold from the spec,
not a competitor-published competitive bar at the same scale. Apples-to-
apples against Memgraph / Kuzu Pokec at 1.6M nodes is a separate run
deferred to v0.6.0. Read this row as: "at the 10k tier, the engine clears
its own published spec by ≥ 3×." Not as: "OpenGraphDB beats Neo4j."

## ✅ Caveated WIN (clears competitive bar, with documented asterisk)

### Row 7 — Enrichment round-trip `t_persist`

100 docs × (10 entities + 15 edges) per doc, single write-tx per doc.

| Percentile | OpenGraphDB 0.5.1 | Best-in-class spec | Competitive spec |
|---|---|---|---|
| p50 | **38.8 ms** | < 15 ms | < 50 ms |
| p95 | **46.7 ms** | < 40 ms | < 150 ms |
| p99 | **112.6 ms** | (not specified) | (not specified) |

**Verdict:** ✅ WIN on competitive bar (p95 of 47 ms is 3.2× under the
150 ms competitive threshold). MISS on best-in-class bar (47 ms vs the
40 ms target — off by 7 ms). First public number for this metric.

**Use this for:** sizing GraphRAG ingest budgets. An agent enriching 1k
docs at this rate finishes the persist phase in ~47 s p95.

**Don't use this for:** "OpenGraphDB beats best-in-class on enrichment."
It does not, off by 17%.

### Row 10 — Graph-feature rerank batch

100 candidates × 1-hop neighbour traversal per candidate, batch.

| Percentile | OpenGraphDB 0.5.1 | Spec target |
|---|---|---|
| Per-candidate p50 / p95 / p99 | **1.28 / 1.34 / 1.62 μs** | (no per-candidate spec) |
| Whole-batch wall-clock | **153 μs** | (no whole-batch spec) |
| Effective rate | ≈ 65 000 batches/s | p95 < 50 ms |

**Headline ratio:** ≈ 128 000× faster than [Cohere Rerank 3.5 (171.5 ms,
ZeroEntropy article)](https://www.zeroentropy.dev/articles/lightning-fast-reranking-with-zerank-1)
and ≈ 37 000× under the best-in-class 50 ms bar.

**Caveat (load-bearing).** The boost computed here is a synthetic
`Σ neighbour_id`, not a learned neighbour-similarity dot product. A
production boost computing a learned dot-product (or short MLP) over
neighbour embeddings adds real per-candidate work — likely ~1–5 μs per
candidate at d=16, meaningfully more at d=384. So the headline 128 000×
ratio is best read as "graph-traversal versus neural forward pass," NOT
as "OpenGraphDB rerank versus production Cohere on equivalent scoring."

Even with realistic learned-boost overhead, the figure is still expected
to clear the 50 ms competitive bar by orders of magnitude. But the
apples-to-apples production comparison waits on a learned-boost
implementation. Tracked: BENCHMARKS §B.6 follow-up.

**Use this for:** "graph traversal is not the bottleneck on 100-candidate
1-hop rerank pipelines."

**Don't use this for:** "OpenGraphDB is 128 000× faster than Cohere
Rerank." Apples-to-oranges.

## What's NOT in this file (and why)

The other 11 rows in the live scorecard are deliberately excluded here
because they cannot make an apples-to-apples claim against a published
threshold today:

- **Row 1, 2, 6, 9** — known losses or kernel-limited regressions. See
  [`benchmarks-snapshot.md`](benchmarks-snapshot.md) for the full
  context, the workaround, and the tracking issue.
- **Rows 3, 4, 5, 8, 11, 12, 14** — novel / scale-mismatched. Real
  measurements at 10k-node tier or mini-fixture, but competitors
  publish at SF10 / Pokec 1.6M / Datagen-9.0 XL. Until we run the
  apples-to-apples re-bench, these are directional indicators, not
  verifiable claims.

Including them in this trust-anchor file would dilute the signal. They
live next door, with full caveats, in
[`benchmarks-snapshot.md`](benchmarks-snapshot.md).

## Reproduce

```bash
cd crates/ogdb-eval
cargo build --release

OGDB_EVAL_BASELINE_JSON=/tmp/baseline-N5.json \
OGDB_EVAL_BASELINE_MD=/tmp/auto-summary-N5.md \
OGDB_EVAL_BASELINE_ITERS=5 \
  cargo test --release --test publish_baseline -- --nocapture
```

Expected wall-clock: ~12 min N=5 median on the i9-10920X bench box.

## See also

- [`documentation/BENCHMARKS.md`](../../../documentation/BENCHMARKS.md) — live baseline, all 14 rows, full source links.
- [`benchmarks-snapshot.md`](benchmarks-snapshot.md) — frozen 14-row scorecard, including losses + novel rows.
- [`documentation/evaluation-runs/`](../../../documentation/evaluation-runs/) — raw `EvaluationRun` JSON for every published run.
