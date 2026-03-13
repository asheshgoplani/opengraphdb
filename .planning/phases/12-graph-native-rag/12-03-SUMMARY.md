---
phase: 12-graph-native-rag
plan: 03
subsystem: database
tags: [lopdf, pulldown-cmark, document-ingestion, rag, graph, fulltext, vector]

# Dependency graph
requires:
  - phase: 12-graph-native-rag
    provides: "hybrid_rag_retrieve, community detection, vector/fulltext indexes in ogdb-core"
provides:
  - "Database::ingest_document() pipeline converting PDF/Markdown/plaintext into graph structure"
  - "DocumentFormat, IngestConfig, IngestResult, ParsedSection public types"
  - "document-ingest feature flag in ogdb-core with lopdf and pulldown-cmark deps"
affects:
  - "12-graph-native-rag (plans 04, 05 can ingest documents to retrieve over)"
  - "13-ai-demo-experience (RAG demo can use ingest_document to populate knowledge graph)"

# Tech tracking
tech-stack:
  added:
    - "lopdf v0.34 (PDF text extraction)"
    - "pulldown-cmark v0.13 (Markdown parsing with heading hierarchy)"
  patterns:
    - "document-ingest optional feature flag behind Cargo feature gate"
    - "Parser functions as free functions with #[cfg(feature)] guards"
    - "Vectors stored as PropertyValue::Vector in node properties (not via separate add call)"
    - "ingest_document on Database directly (consistent with other RAG methods)"
    - "Idempotent index creation via create_fulltext_index/create_vector_index (ignore-if-exists)"

key-files:
  created: []
  modified:
    - "crates/ogdb-core/Cargo.toml - document-ingest feature + lopdf + pulldown-cmark deps"
    - "crates/ogdb-core/src/lib.rs - DocumentFormat/IngestConfig/IngestResult/ParsedSection types, parser functions, ingest_document method, 9 unit tests"

key-decisions:
  - "ingest_document placed on Database directly (not a fictional TransactionSnapshot) for API consistency with build_community_summaries, hybrid_rag_retrieve"
  - "Vectors stored as PropertyValue::Vector on Content node properties; rebuild_vector_indexes_from_catalog called post-ingest for queryability"
  - "Plan's BTreeMap<String, Value> API adapted to real PropertyMap = BTreeMap<String, PropertyValue>"
  - "Plan's create_edge/vector_index_add API adapted to real add_typed_edge/PropertyValue::Vector"
  - "Tests use Database::init() + temp_db_path() (no create_in_memory exists)"

patterns-established:
  - "Document graph schema: :Document → :Section (via CONTAINS) → :Content (via HAS_CONTENT)"
  - "Cross-reference detection: title mentions of 3+ word section titles create :REFERENCES edges"
  - "PDF heading heuristic: ALL CAPS or Title Case short lines detected as headings"
  - "Word-count chunking via chunk_content() shared between plaintext and large sections"

requirements-completed: [RAG-04]

# Metrics
duration: 25min
completed: 2026-03-13
---

# Phase 12 Plan 03: Document Ingestion Pipeline Summary

**PDF and Markdown ingestion pipeline that converts documents into :Document/:Section/:Content graph with fulltext and vector indexing, using lopdf and pulldown-cmark**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-13T00:00:00Z
- **Completed:** 2026-03-13T00:25:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- `Database::ingest_document()` method converts PDF/Markdown/plaintext into a navigable graph
- Graph structure: `:Document` root, `:Section` nodes per heading, `:Content` leaf nodes per chunk, with `:CONTAINS`, `:HAS_CONTENT`, and `:REFERENCES` edges
- PDF parsing via lopdf with heuristic heading detection (ALL CAPS / Title Case short lines)
- Markdown parsing via pulldown-cmark preserving H1 through H6 hierarchy
- Plain text chunking by word count with configurable `max_chunk_words`
- Optional embedding callback stores vectors as `PropertyValue::Vector` for automatic HNSW indexing
- Cross-reference detection creates `:REFERENCES` edges between sections that mention each other's 3+ word titles
- 9 unit tests covering all paths including error cases

## Task Commits

1. **Task 1 + 2: Ingestion types, parsers, and pipeline** - `47e0a22` (feat)
2. **Task 3: Unit tests** - `b30a46d` (test)

## Files Created/Modified

- `/Users/ashesh/opengraphdb/crates/ogdb-core/Cargo.toml` - Added `document-ingest` feature, `lopdf` and `pulldown-cmark` optional deps
- `/Users/ashesh/opengraphdb/crates/ogdb-core/src/lib.rs` - All new types, parsers, pipeline, tests

## Decisions Made

- The plan specified `TransactionSnapshot` with a fictional API. The real API uses `Database` directly with `create_node_with(&[String], &PropertyMap)` and `add_typed_edge(u64, u64, &str, &PropertyMap)`. Adapted automatically (Rule 1 / Rule 3).
- The plan specified `Value` enum (Cypher result type). Actual storage uses `PropertyValue`. Adapted automatically.
- The plan specified `vector_index_add(index_name, node_id, &[f32])`. Actual pattern is storing `PropertyValue::Vector` as a node property and calling `rebuild_vector_indexes_from_catalog` post-ingest.
- `ingest_document` placed on `Database` (not `WriteTransaction`) to match the pattern used by all other RAG methods in the codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted fictional API to real ogdb-core API**
- **Found during:** Task 2 (ingest_document implementation)
- **Issue:** Plan referenced `TransactionSnapshot::create_node(&[&str], &BTreeMap<String, Value>)`, `create_edge`, and `vector_index_add` which do not exist in the codebase
- **Fix:** Used `Database::create_node_with(&[String], &PropertyMap)`, `add_typed_edge(&str, &PropertyMap)`, and `PropertyValue::Vector` node property storage
- **Files modified:** `crates/ogdb-core/src/lib.rs`
- **Verification:** `cargo check -p ogdb-core --features document-ingest` passes, all 9 tests green

**2. [Rule 1 - Bug] Adapted test API from fictional `Database::create_in_memory()` to real `Database::init()`**
- **Found during:** Task 3 (unit tests)
- **Issue:** Plan tests used `db.begin_write()` + `txn.ingest_document()` and `db.snapshot()` which don't exist
- **Fix:** Tests use `Database::init(temp_db_path(...))` and `db.ingest_document()` directly
- **Files modified:** `crates/ogdb-core/src/lib.rs`
- **Verification:** All 9 tests pass

---

**Total deviations:** 2 auto-fixed (both Rule 1 - API adaptation)
**Impact on plan:** Required for functionality. Plan was written against a planned API that doesn't yet exist in ogdb-core. All required behaviors implemented correctly.

## Issues Encountered

- Python heredoc in test insertion escaped `!` characters in Rust macros (`assert!`, `vec!`). Fixed via `sed` substitution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Document ingestion pipeline ready for Phase 12-04 (MCP tool exposure) and 12-05
- `ingest_document` accepts any `Fn(&str) -> Vec<f32>` for embedding, making it pluggable with any embedding provider
- Cross-reference graph enables multi-hop retrieval via `:REFERENCES` edges

---
*Phase: 12-graph-native-rag*
*Completed: 2026-03-13*
