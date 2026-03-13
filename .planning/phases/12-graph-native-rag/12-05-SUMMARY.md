---
phase: 12-graph-native-rag
plan: 05
subsystem: benchmarking
tags: [criterion, rag, retrieval, bm25, vector-search, rrf, graph-traversal, benchmark]

requires:
  - phase: 12-graph-native-rag plan 03
    provides: ingest_document (PDF/Markdown to graph structure)
  - phase: 12-graph-native-rag plan 04
    provides: hybrid_rag_retrieve_rrf, RAG HTTP endpoints, MCP tools

provides:
  - 30-question curated Q&A dataset covering AI, ML, graph databases
  - criterion benchmark comparing BM25-only, vector-only, full hybrid RRF retrieval
  - integration test measuring Recall@5, Precision@5, MRR across 30 questions
  - RESULTS.md with actual measured metrics and limitations documentation

affects: [phase-13-ai-demo-experience, any phase building on RAG quality evidence]

tech-stack:
  added:
    - criterion 0.5 (latency benchmarking via bench harness)
    - serde/serde_json in ogdb-bench (question dataset deserialization)
  patterns:
    - Deterministic fake_embed() using character-frequency vectors for reproducible benchmarks without external embedding models
    - Integration test in tests/ directory (not bench file) for accuracy metrics
    - Ground-truth section matching via slug comparison against node title/text properties

key-files:
  created:
    - benchmarks/rag/dataset/README.md
    - benchmarks/rag/dataset/questions.json (30 Q&A pairs with relevant_sections ground truth)
    - benchmarks/rag/dataset/documents/ai-overview.md
    - benchmarks/rag/dataset/documents/machine-learning.md
    - benchmarks/rag/dataset/documents/graph-databases.md
    - benchmarks/rag/RESULTS.md (actual measured results with analysis)
    - crates/ogdb-bench/benches/rag_benchmark.rs (criterion benchmark)
    - crates/ogdb-bench/tests/rag_accuracy.rs (accuracy comparison integration test)
  modified:
    - crates/ogdb-bench/Cargo.toml (added serde, serde_json, criterion dev-dep, bench entry)

key-decisions:
  - "Integration test placed in tests/rag_accuracy.rs (not inside bench file) so cargo test -p ogdb-bench discovers it correctly"
  - "EMBED_DIMS=64 for fake embeddings: large enough to test vector path, small enough for fast test execution"
  - "Score_retrieval uses slug-based matching (section#slug -> node title/text contains slug) rather than exact node ID matching, since ingest_document creates nodes with section headings as titles"
  - "Non-degradation threshold set at 0.8x (not equality): fake embeddings make vector signal noise so only gross degradation should fail"
  - "ogdb-bench Cargo.toml: ogdb-core in [dependencies] (not [dev-dependencies]) so both benches and tests share the same dependency"

requirements-completed: [RAG-03]

duration: 12min
completed: 2026-03-13
---

# Phase 12 Plan 05: RAG Benchmark Suite Summary

**Criterion benchmark + 30-question curated dataset measuring Recall@5, Precision@5, MRR across BM25-only, vector-only, BM25+Vector, and Full Hybrid RRF strategies; Full Hybrid achieves highest Recall@5 (0.419 vs 0.286 vector-only, +46%)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-13T05:30:35Z
- **Completed:** 2026-03-13T05:43:07Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Curated Q&A dataset: 3 interconnected Markdown documents (~1700 words total) covering AI, machine learning, and graph databases; 30 questions testing BM25 (keyword), vector (semantic), graph traversal (relational), and community (scoped) retrieval signals
- Criterion benchmark harness comparing 3 latency strategies (BM25-only, vector-only, full hybrid RRF) across 30 queries
- Integration test measuring accuracy metrics; test passes with assertion that hybrid MRR >= 0.8x vector-only MRR
- Actual benchmark results documented in RESULTS.md including measured numbers and analysis of fake embedding limitation

## Task Commits

1. **Task 1: Create benchmark dataset** - `d76b267` (feat)
2. **Task 2: Build benchmark harness** - `4471845` (feat)
3. **Task 3: Run benchmarks and document results** - `481e4d5` (feat)

## Measured Results (from actual test run)

| Strategy | Recall@5 | Precision@5 | MRR |
|----------|----------|-------------|-----|
| BM25 only | 0.100 | 0.020 | 0.067 |
| Vector only | 0.286 | 0.093 | 0.181 |
| BM25 + Vector | 0.386 | 0.113 | 0.248 |
| Full Hybrid (RRF) | 0.419 | 0.120 | 0.248 |

Full Hybrid achieves the highest Recall@5 (+46% over vector-only). BM25+Vector and
Full Hybrid tie on MRR, with graph traversal contributing the marginal recall improvement.

## Files Created/Modified

- `benchmarks/rag/dataset/README.md` - Dataset format, metrics definitions, reproduction instructions
- `benchmarks/rag/dataset/questions.json` - 30 Q&A pairs with relevant_sections ground truth, difficulty, and signal metadata
- `benchmarks/rag/dataset/documents/ai-overview.md` - AI history, types (narrow/general), applications, ethics
- `benchmarks/rag/dataset/documents/machine-learning.md` - Supervised/unsupervised/RL, neural networks, evaluation
- `benchmarks/rag/dataset/documents/graph-databases.md` - Property graphs, traversal, algorithms, knowledge graphs, graph-native RAG
- `benchmarks/rag/RESULTS.md` - Measured accuracy table, latency notes, analysis, limitations
- `crates/ogdb-bench/benches/rag_benchmark.rs` - Criterion benchmark for BM25-only, vector-only, hybrid RRF
- `crates/ogdb-bench/tests/rag_accuracy.rs` - Integration test: accuracy comparison with assertions
- `crates/ogdb-bench/Cargo.toml` - Added serde, serde_json, criterion dev-dep, bench section

## Decisions Made

- Integration test in `tests/rag_accuracy.rs` rather than inside bench file: `#[cfg(test)]` in a criterion bench file is not discovered by `cargo test -p ogdb-bench` (bench files use their own test runner). Integration tests in `tests/` are discovered correctly.
- `EMBED_DIMS=64`: large enough to exercise the vector index code path with non-trivial dimension, small enough that test runs in ~18 seconds.
- Ground-truth matching via section slug comparison (not node ID): `ingest_document` creates Content nodes whose text contains section content; matching by slug against `title`/`text` properties is robust to node ID ordering.
- Non-degradation threshold 0.8x: since fake embeddings produce noise vectors, exact equality or even parity between hybrid and vector-only is not a meaningful bar. 20% tolerance ensures the test catches genuine regressions (pipeline returning empty results, RRF scoring backwards) without being sensitive to embedding-quality noise.
- `ogdb-core` in `[dependencies]` (not `[dev-dependencies]`): both `benches/` and `tests/` need it, and placing it only in `[dev-dependencies]` would silently drop it from `cargo build` of the crate itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PropertyValue lacks `as_str()` helper method**
- **Found during:** Task 2 (benchmark harness)
- **Issue:** Plan's code template called `.and_then(|v| v.as_str())` on `PropertyValue`, but the type has no `as_str` method; only pattern matching works
- **Fix:** Replaced `.and_then(|v| v.as_str())` with `match ... PropertyValue::String(s) => s.to_lowercase()` pattern matching
- **Files modified:** `crates/ogdb-bench/benches/rag_benchmark.rs`, `crates/ogdb-bench/tests/rag_accuracy.rs`
- **Verification:** `cargo check -p ogdb-bench` passes
- **Committed in:** 4471845 (Task 2 commit)

**2. [Rule 1 - Bug] Test module in bench file not discovered by `cargo test`**
- **Found during:** Task 2 (initial test run attempt)
- **Issue:** `#[cfg(test)]` module inside `benches/rag_benchmark.rs` is not run by `cargo test -p ogdb-bench` because criterion bench files use a different test harness
- **Fix:** Moved accuracy comparison test to `crates/ogdb-bench/tests/rag_accuracy.rs` as an integration test, which is correctly discovered
- **Files modified:** `crates/ogdb-bench/tests/rag_accuracy.rs` (created), `crates/ogdb-bench/benches/rag_benchmark.rs` (removed test module)
- **Verification:** `cargo test -p ogdb-bench test_rag_accuracy_comparison` finds and runs the test
- **Committed in:** 4471845 (Task 2 commit)

**3. [Rule 3 - Blocking] Duplicate ogdb-core in Cargo.toml**
- **Found during:** Task 2 (Cargo.toml update)
- **Issue:** Plan template had `ogdb-core` in both `[dependencies]` and `[dev-dependencies]`, causing a duplicate dependency
- **Fix:** Kept `ogdb-core` only in `[dependencies]` so both the bench binary and integration tests share the same crate resolution
- **Files modified:** `crates/ogdb-bench/Cargo.toml`
- **Verification:** `cargo check -p ogdb-bench` passes without warnings
- **Committed in:** 4471845 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 bug, 1 blocking)
**Impact on plan:** All auto-fixes were necessary for compilation and test discoverability. No scope changes.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None. The benchmark is fully self-contained: fake embeddings are computed in-process, documents are embedded as static strings via `include_str!()`, and questions are loaded from the bundled JSON file.

## Next Phase Readiness

- Phase 12 is now complete (Plans 01-05 all done)
- Phase 13 (AI Demo Experience) can use `benchmarks/rag/RESULTS.md` as evidence for the RAG story
- The benchmark suite serves as a regression test: running `cargo test -p ogdb-bench` after any RAG changes will catch quality regressions

---
*Phase: 12-graph-native-rag*
*Completed: 2026-03-13*
