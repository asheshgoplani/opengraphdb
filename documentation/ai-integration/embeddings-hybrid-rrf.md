# Sentence embeddings + hybrid RRF search

This page is a one-paragraph redirect. The full runnable walkthrough lives in
[`COOKBOOK.md` Recipe 2 — Hybrid retrieval](../COOKBOOK.md#recipe-2--hybrid-retrieval).

## What this pattern is

Compute sentence embeddings on a corpus with `sentence-transformers`, store them
as a vector property on graph nodes, then retrieve with a hybrid search that
fuses vector similarity and full-text relevance via Reciprocal Rank Fusion
(RRF).

## Real API surface (don't believe earlier drafts of this file)

- **Vector ANN backend:** `instant-distance` HNSW (not `usearch`). Tuning
  constants and acceptance gates live in
  [`../BENCHMARKS.md` § HNSW thresholds](../BENCHMARKS.md). Earlier drafts of
  this page cited `usearch` — that is wrong.
- **Full-text:** Tantivy in-process, on the same nodes. Schemaless;
  index-per-property via `CALL text.create_index(...)`.
- **Hybrid retrieval:** `Database::rag_hybrid_search(...)` in Rust
  (`crates/ogdb-core/src/lib.rs::rag_hybrid_search`), or `POST /rag/search`
  over HTTP. Both perform RRF fusion in one round-trip — one storage engine,
  one transaction, one snapshot. There is no `db.hybrid_search(...)` method —
  earlier drafts of this page invented a name that was never shipped.

## Related

- [`../COOKBOOK.md` Recipe 2](../COOKBOOK.md#recipe-2--hybrid-retrieval) — full runnable hybrid-retrieval walkthrough with curl + Python.
- [`../BENCHMARKS.md`](../BENCHMARKS.md) — HNSW thresholds + measured hybrid p50/p95/p99 numbers.
- `ARCHITECTURE.md` §8 — vector / full-text.
