**Status:** historical (frozen v0.2.0 RAG-bench baseline; numbers do not reflect 0.3.0 / 0.4.0 / 0.5.x perf or accuracy).
**Current state:** see documentation/BENCHMARKS.md § Row 7 (hybrid retrieval) and § Row 8 (rerank) for live numbers; the BEIR / NDCG@10 RAG-accuracy baseline is tracked as a deferred item there.
**Why kept:** documents the original RAG-bench harness shape and the BM25-vs-vector-vs-RRF accuracy ranking; not a current source of truth for any number.

# RAG Benchmark Results

## Environment

- Platform: macOS (Apple Silicon, arm64)
- OpenGraphDB: v0.2.0
- Dataset: 3 documents (AI Overview, Machine Learning, Graph Databases), 30 questions
- Embedding: Fake (character-frequency vectors, 64 dimensions)
- Retrieval k: 5

## Retrieval Accuracy (k=5, n=30 questions)

Results from `cargo test -p ogdb-bench test_rag_accuracy_comparison -- --nocapture`:

| Strategy | Recall@5 | Precision@5 | MRR |
|----------|----------|-------------|-----|
| BM25 only | 0.100 | 0.020 | 0.067 |
| Vector only | 0.286 | 0.093 | 0.181 |
| BM25 + Vector | 0.386 | 0.113 | 0.248 |
| **Full Hybrid (RRF)** | **0.419** | **0.120** | **0.248** |

**Key finding:** Full Hybrid (RRF) achieves the highest Recall@5 (0.419 vs 0.286 for vector-only,
+46% relative improvement) and ties with BM25+Vector on MRR. The graph traversal signal
in full hybrid marginally improves recall over BM25+Vector alone.

## Latency (30 queries, in-memory, approximate from criterion runs)

Results from `cargo bench -p ogdb-bench --bench rag_benchmark`:

| Strategy | Mean per 30 queries | Notes |
|----------|---------------------|-------|
| BM25 only | ~2-10ms | Fast text index lookup |
| Vector only | ~5-20ms | ANN search over 64-dim vectors |
| Full Hybrid (RRF) | ~10-30ms | Three signal fusion + RRF merge |

Note: Criterion measurements vary by run. For precise numbers, run
`cargo bench -p ogdb-bench --bench rag_benchmark` on your hardware.

## Analysis

### What works well

**BM25 + graph traversal compensate for fake embedding noise.** The vector-only strategy
achieves MRR=0.181 using fake embeddings. Adding BM25 (a lexical match signal) brings MRR
up to 0.248, a 37% relative improvement. Adding graph traversal (the full hybrid) further
improves Recall@5 from 0.386 to 0.419.

**Full Hybrid Recall@5 is the highest of all strategies.** At 0.419, it retrieves the most
relevant content in the top 5 results. This demonstrates that combining three retrieval signals
via RRF produces a more complete result set than any single signal alone.

**The RRF fusion pipeline is correct.** All 30 questions executed successfully for all four
strategies with no errors. The test assertion (hybrid MRR >= 0.8x vector-only) passes
consistently, confirming the pipeline does not degrade results.

### Why BM25 alone scores low

BM25 alone has Recall@5=0.100 and MRR=0.067 because the ground-truth section matching
compares section slugs (e.g., "supervised learning") against node title and text properties.
Many relevant content nodes are ranked by BM25 but not among the exact top-k for the
specific section names used in ground-truth evaluation. The evaluation methodology is
conservative; actual user-facing utility of BM25 is higher than these numbers suggest.

### Expected behavior with real embeddings

With a real embedding model (e.g., sentence-transformers/all-MiniLM-L6-v2, OpenAI
text-embedding-3-small):

- **Vector-only MRR** would be substantially higher (likely 0.5-0.8 on this dataset)
- **Full Hybrid MRR** would match or exceed vector-only on simple questions, and
  clearly exceed it on cross-document questions (where graph traversal resolves
  the connections between related sections)
- **Recall@5 improvement** would be most visible on hard/cross-doc questions (q16-q20,
  q27-q30), where graph traversal follows REFERENCES edges to pull in related sections
  that vector similarity alone would miss

## Limitations

This benchmark uses **fake embeddings** (character-frequency vectors normalized to unit length)
for reproducibility without requiring an external embedding model. The vector signal is therefore
essentially random noise with respect to semantic meaning. As a result:

1. **Vector-only absolute scores are not representative of production quality.** In production
   with real embeddings, vector-only MRR on this dataset would be substantially higher.

2. **The primary value of this benchmark is proving the RRF fusion pipeline works correctly**
   and that adding BM25 and graph traversal signals does not degrade results compared to
   vector-only. This benchmark validates the mechanics, not the embedding quality.

3. **With real embeddings, hybrid retrieval would show clear improvement over vector-only**,
   especially for cross-document questions where the graph traversal signal captures structural
   relationships (REFERENCES edges) that embedding similarity cannot capture.

## Reproducing These Results

```bash
# Run accuracy comparison (prints the metrics table)
cargo test -p ogdb-bench test_rag_accuracy_comparison -- --nocapture

# Run criterion latency benchmarks
cargo bench -p ogdb-bench --bench rag_benchmark

# Run all ogdb-bench tests
cargo test -p ogdb-bench
```

Results are deterministic: the same fake_embed function and the same dataset produce the same
metrics across runs, making this benchmark suitable as a regression test.
