# RAG Benchmark Dataset

## Overview

A curated dataset for measuring Graph-Native RAG retrieval quality.
Contains 3 interconnected documents spanning AI, machine learning,
and graph database topics with 30 question/answer pairs.

## Format

### documents/

Markdown files ingested into OpenGraphDB via `ingest_document()`.
Each document has clear section structure to enable community detection
and graph traversal.

### questions.json

Array of question objects:

```json
{
  "id": "q01",
  "question": "What is supervised learning?",
  "answer": "Supervised learning uses labeled training data...",
  "relevant_sections": ["machine-learning.md#supervised-learning"],
  "difficulty": "simple",
  "requires_cross_doc": false
}
```

**Fields:**

- `id`: Unique question identifier
- `question`: The query string (as an end-user or AI agent would phrase it)
- `answer`: Ground-truth answer text
- `relevant_sections`: List of `document.md#section-slug` references identifying
  which document sections contain the answer
- `difficulty`: `"simple"` (single section), `"medium"` (multi-section same doc),
  or `"hard"` (cross-document reasoning)
- `requires_cross_doc`: Whether answering requires traversing references across
  multiple documents

## Retrieval Signal Coverage

The 30 questions are designed to exercise all four retrieval signals:

| Category | Count | Signal Tested |
|----------|-------|---------------|
| Exact keyword match | 8 | BM25 advantage |
| Semantic similarity | 7 | Vector advantage |
| Structural/relational | 8 | Graph traversal advantage |
| Community-scoped | 7 | Hierarchy advantage |

## Metrics

- **Recall@k**: Fraction of relevant sections found in top-k results
- **Precision@k**: Fraction of top-k results that are relevant
- **MRR**: Mean Reciprocal Rank (1/rank of first relevant result)
- **Latency**: Query execution time in microseconds

## Reproduction

```bash
# Run accuracy comparison test (prints metrics table)
cargo test -p ogdb-bench test_rag_accuracy_comparison -- --nocapture

# Run criterion latency benchmarks
cargo bench -p ogdb-bench --bench rag_benchmark
```

## Limitations

This dataset uses **fake embeddings** (character-frequency vectors normalized to
unit length) for reproducibility without requiring an external embedding model.
The vector signal is therefore noise relative to semantic meaning.

See `RESULTS.md` for a full explanation of how BM25 and graph traversal signals
compensate for this limitation, and what results would look like with real
embeddings.
