---
phase: 12-graph-native-rag
plan: 04
subsystem: api
tags: [rust, typescript, mcp, rag, community-detection, hybrid-search, http]

# Dependency graph
requires:
  - phase: 12-01
    provides: CommunityHierarchy with top_level/children_of/members_of, build_community_hierarchy_at
  - phase: 12-02
    provides: hybrid_rag_retrieve_rrf_at, RrfConfig, RetrievalSignal, RagResult
  - phase: 12-03
    provides: ingest_document, IngestConfig, IngestResult, DocumentFormat
  - phase: 10-mcp-server
    provides: MCP server scaffolding, OpenGraphDBClient, McpServer, registerXxx pattern
provides:
  - DrillResult enum (SubCommunities / Members) and NodeSummary type
  - EnrichedRagResult type with node labels and properties
  - browse_communities on ReadSnapshot (PageIndex table-of-contents)
  - drill_into_community on ReadSnapshot (hierarchy navigation)
  - rag_hybrid_search on ReadSnapshot (RRF-fused retrieval with enrichment)
  - POST /rag/communities HTTP endpoint in ogdb-cli
  - POST /rag/drill HTTP endpoint in ogdb-cli
  - POST /rag/search HTTP endpoint in ogdb-cli
  - POST /rag/ingest HTTP endpoint in ogdb-cli
  - 4 MCP tools registered in @opengraphdb/mcp (9 total)
  - base64_decode helper for PDF binary upload
  - rag_results_to_json helper for HTTP serialization
affects: [13-ai-demo-experience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RAG HTTP endpoints follow dispatch_http_request match pattern in ogdb-cli/src/lib.rs"
    - "MCP tools follow registerXxx(server, client) factory pattern with dual-block content (human text + raw JSON)"
    - "EnrichedRagResult wraps RagResult and adds labels/properties fetched via node_labels/node_properties"
    - "HTTP /rag/ingest accepts content (plain) or content_base64 (binary) with format field"

key-files:
  created:
    - mcp/src/tools/browse-communities.ts
    - mcp/src/tools/drill-into-community.ts
    - mcp/src/tools/hybrid-search.ts
    - mcp/src/tools/ingest-document.ts
  modified:
    - crates/ogdb-core/src/lib.rs
    - crates/ogdb-cli/src/lib.rs
    - mcp/src/client.ts
    - mcp/src/index.ts

key-decisions:
  - "HTTP endpoints for RAG placed in ogdb-cli/src/lib.rs (dispatch_http_request), not ogdb-core — HTTP server lives in CLI crate"
  - "NodeSummary and EnrichedRagResult use BTreeMap<String, PropertyValue> (not Value) to match the codebase's PropertyMap type"
  - "rag_results_to_json uses property_value_to_export_json (CLI-private function) for consistent property serialization"
  - "browse_communities and drill_into_community use default resolutions [1.0, 0.5] when none provided"
  - "ingest_document HTTP endpoint uses shared_db.with_write(|db| db.ingest_document(...)) — ingest_document is on Database, not ReadSnapshot"

requirements-completed: [RAG-01, RAG-03, RAG-04, RAG-05]

# Metrics
duration: 40min
completed: 2026-03-13
---

# Phase 12 Plan 04: RAG API and MCP Tools Summary

**Four MCP tools exposing full RAG pipeline: browse_communities, drill_into_community, hybrid_search, and ingest_document via HTTP endpoints and @opengraphdb/mcp**

## Performance

- **Duration:** 40 min
- **Started:** 2026-03-13T00:52:54Z
- **Completed:** 2026-03-13T01:33:18Z
- **Tasks:** 4
- **Files modified:** 6 (4 created, 2 modified in Rust; 2 modified in TypeScript)

## Accomplishments

- Added `browse_communities`, `drill_into_community`, and `rag_hybrid_search` convenience methods to `ReadSnapshot` with new types `DrillResult`, `NodeSummary`, `EnrichedRagResult`
- Added 4 HTTP endpoints in ogdb-cli (`/rag/communities`, `/rag/drill`, `/rag/search`, `/rag/ingest`) following the existing `dispatch_http_request` pattern
- Registered 4 MCP tools in @opengraphdb/mcp bringing total tool count to 9; TypeScript compiles without errors
- 4 integration tests pass covering empty graph, non-existent community, empty query, and enriched results edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RAG navigation API methods on ReadSnapshot** - `3b4e116` (feat)
2. **Task 2: Add HTTP API endpoints for RAG operations** - `b2d4103` (feat)
3. **Task 3: Register MCP tools for RAG pipeline in @opengraphdb/mcp** - `a43a262` (feat)
4. **Task 4: Integration tests for RAG API** - `1f848e0` (test)

## Files Created/Modified

- `crates/ogdb-core/src/lib.rs` - DrillResult/NodeSummary/EnrichedRagResult types; browse_communities, drill_into_community, rag_hybrid_search on ReadSnapshot; 4 integration tests
- `crates/ogdb-cli/src/lib.rs` - POST /rag/communities, /rag/drill, /rag/search, /rag/ingest endpoints; rag_results_to_json and base64_decode helpers
- `mcp/src/client.ts` - CommunitySummaryResponse, DrillResultResponse, EnrichedRagResultResponse, IngestResultResponse interfaces; ragBrowseCommunities, ragDrillIntoCommunity, ragHybridSearch, ragIngestDocument methods
- `mcp/src/index.ts` - Import and register 4 RAG tools
- `mcp/src/tools/browse-communities.ts` - browse_communities MCP tool wrapping POST /rag/communities
- `mcp/src/tools/drill-into-community.ts` - drill_into_community MCP tool wrapping POST /rag/drill
- `mcp/src/tools/hybrid-search.ts` - hybrid_search MCP tool wrapping POST /rag/search
- `mcp/src/tools/ingest-document.ts` - ingest_document MCP tool wrapping POST /rag/ingest

## Decisions Made

- HTTP endpoints for RAG placed in `ogdb-cli/src/lib.rs` inside `dispatch_http_request`, not in `ogdb-core` as the plan stated. The HTTP server lives in the CLI crate; ogdb-core has no HTTP server code.
- `NodeSummary` and `EnrichedRagResult` use `BTreeMap<String, PropertyValue>` to match the codebase's `PropertyMap` type alias rather than `serde_json::Value`.
- `rag_results_to_json` uses `property_value_to_export_json` (existing CLI function) for consistent JSON rendering of PropertyValue variants.
- `ingest_document` is on `Database` (mutable reference), not on `ReadSnapshot`, so the `/rag/ingest` endpoint uses `shared_db.with_write(|db| db.ingest_document(...))`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HTTP server location corrected from ogdb-core to ogdb-cli**
- **Found during:** Task 2 (Add HTTP API endpoints)
- **Issue:** Plan specified adding HTTP endpoints to `crates/ogdb-core/src/lib.rs` but the HTTP server is actually in `crates/ogdb-cli/src/lib.rs`
- **Fix:** Added all `/rag/*` endpoints to `dispatch_http_request` in ogdb-cli
- **Files modified:** `crates/ogdb-cli/src/lib.rs`
- **Verification:** `cargo check -p ogdb-cli` passes
- **Committed in:** `b2d4103` (Task 2 commit)

**2. [Rule 1 - Bug] Used PropertyMap types (not serde_json::Value) for NodeSummary/EnrichedRagResult**
- **Found during:** Task 1 (Add RAG navigation API methods)
- **Issue:** Plan showed `BTreeMap<String, Value>` but the codebase uses `BTreeMap<String, PropertyValue>` (aka `PropertyMap`)
- **Fix:** Used `PropertyMap` = `BTreeMap<String, PropertyValue>` which already derives Serialize/Deserialize
- **Files modified:** `crates/ogdb-core/src/lib.rs`
- **Verification:** `cargo check -p ogdb-core` passes
- **Committed in:** `3b4e116` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs: misidentified file location, mismatched type)
**Impact on plan:** Both corrections necessary for compilation. No scope creep.

## Issues Encountered

- `property_value_to_json` not visible in ogdb-cli scope; the correct function name is `property_value_to_export_json` (defined locally in ogdb-cli). Fixed inline.
- Unused imports (`NodeSummary`, `RrfConfig`) from initial ogdb_core import in ogdb-cli; removed in fix pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12 Plan 05 (if any) or Phase 13 (AI Demo Experience) can use all 4 MCP tools
- LLM agents connected via MCP can now call browse_communities, drill_into_community, hybrid_search, ingest_document
- HTTP API at `/rag/*` ready for programmatic integration
- All RAG requirements RAG-01, RAG-03, RAG-04, RAG-05 satisfied

---
*Phase: 12-graph-native-rag*
*Completed: 2026-03-13*
