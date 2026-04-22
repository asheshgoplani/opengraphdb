# Sentence embeddings + hybrid RRF search

**Status:** stub — detailed walkthrough lands in a follow-up slice.

## What this pattern is

Compute sentence embeddings on a corpus with `sentence-transformers`, store
them as a vector property on graph nodes, then retrieve with a hybrid search
that fuses vector similarity and full-text relevance via Reciprocal Rank
Fusion (RRF).

## Why use OpenGraphDB here

- `usearch` is integrated in-process for vector ANN. No sidecar vector DB.
- `tantivy` provides full-text on the same nodes.
- `db.hybrid_search(text=..., vector=..., k=...)` performs the RRF fusion in
  one round-trip. One storage engine, one transaction, one snapshot.

## Reference snippet

See `AIIntegrationSection.tsx` pattern 2 (landing page).

## Related

- `ARCHITECTURE.md` §8 — vector / full-text
- `SPEC.md` §5 — hybrid query operators
