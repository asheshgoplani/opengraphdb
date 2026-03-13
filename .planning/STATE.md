---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-13T05:43:07Z"
progress:
  total_phases: 14
  completed_phases: 12
  total_plans: 46
  completed_plans: 42
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** AI-first graph database where developers install skills to work with graph data through natural language, and visitors can talk to knowledge graphs live on the website
**Current focus:** Milestone v2.0 — Phase 12 Complete; RAG benchmark suite done; ready for Phase 13

## Current Position

Phase: 13 (AI Demo Experience) — Not started
Plan: 13-01 next
Status: Phase 12 complete (all 5 plans done); Leiden + RRF + document ingestion + RAG API/HTTP/MCP + benchmark suite
Last activity: 2026-03-13 — Phase 12 Plan 05 executed: RAG benchmark dataset (30 Q&A), criterion harness, accuracy test, RESULTS.md

```
Milestone 2 Progress: [########  ] 3/4 phases complete
Phase 10: [3/3] Complete — npm MCP server docs, integration tests, publish-ready package
Phase 11: [5/5] Complete — 4 skills, eval framework, README, publish-ready package
Phase 12: [5/5] Complete — Leiden, RRF hybrid RAG, document ingestion, RAG API+MCP, benchmark suite
Phase 13: [ ] Not started
```

## Performance Metrics

**Velocity:**
- Total plans completed: 27
- Average duration: ~15 min/plan
- Total execution time: ~6.75 hours (estimated)

**By Phase:**

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 1. Foundation and Graph Visualization | 5/5 | Complete | 2026-03-01 |
| 2. Cypher Editor and Query Workflow | 3/3 | Complete | 2026-03-01 |
| 3. Schema Browser | 1/1 | Complete | 2026-03-01 |
| 4. Landing Page and Playground | 3/3 | Complete | 2026-03-01 |
| 5. Frontend Polish & Knowledge Graph Showcase | 6/6 | Complete | 2026-03-01 |
| 6. Production Demo Datasets & Live Backend Integration | 3/3 | Complete | 2026-03-01 |
| 7. Real-World Famous Dataset Showcase | 3/3 | Complete | 2026-03-02 |
| 8. Revolutionary Graph Visualization | 3/3 | Complete | 2026-03-02 |
| 9. AI Knowledge Graph Assistant | 3/3 | Complete | 2026-03-03 |
| 10. MCP Server for OpenGraphDB | 3/3 | Complete | 2026-03-12 |
| 11. Developer Skills & CLI | 5/5 | Complete | 2026-03-12 |
| 12. Graph-Native RAG Engine | 5/5 | Complete | 2026-03-13 |
| 13. AI Demo Experience | 0/3 | Not started | — |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Use React + TypeScript + Vite + Tailwind + shadcn/ui per spec
- [Init]: Use react-force-graph-2d (canvas renderer) for graph visualization
- [Init]: Use CodeMirror 6 + @neo4j-cypher/react-codemirror@next for Cypher editor
- [Init]: Use TanStack Query for server state, Zustand for client state
- [Phase 1]: Tailwind v3 selected (per global CLAUDE.md preference)
- [Phase 2]: CodeMirror Cypher editor integrated with schema-aware autocomplete
- [Phase 3]: Schema panel with accordion sections for labels, types, properties
- [Phase 4]: Movies sample graph chosen for playground dataset
- [Phase 5]: Linear/Vercel aesthetic target, keep react-force-graph-2d but heavy polish
- [Phase 5]: Real-world graph showcase (Wikidata, IMDB, PubMed references)
- [Phase 5]: Split-pane playground with multiple datasets, query cards, connection status
- [Phase 5]: Playwright screenshot tests for visual verification
- [Phase 6]: Movies flagship (real data, ~200-500 nodes), expand social & fraud secondaries
- [Phase 6]: Dual mode playground (offline fallback + live backend toggle)
- [Phase 6]: JSON import files + shell seed script, idempotent reset & reload
- [Phase 7]: 4 famous datasets: MovieLens (subset), Air Routes (full), GoT (full), Wikidata (slice)
- [Phase 7]: Replace existing 3 synthetic datasets with 4 real-world famous datasets
- [Phase 7]: Download scripts fetch from original sources, convert, import via seed pipeline
- [Phase 7]: Air Routes must preserve lat/long for Phase 8 geographic rendering
- [Phase 07-real-world-famous-dataset-showcase]: Node IDs use short dataset prefixes (ml-, ar-, got-, wd-) to prevent collision with live backend numeric IDs
- [Phase 07-real-world-famous-dataset-showcase]: Air Routes airports use accurate real-world float lat/lon coordinates for Phase 8 geographic rendering
- [Phase 07-01]: ID ranges: MovieLens 0-99999, Air Routes 1M+, GoT 2M+, Wikidata 3M+ for zero-collision coexistence
- [Phase 07-01]: Air Routes CSV uses typed column suffixes (lat:double, code:string) - must use exact names in conversion
- [Phase 07-01]: Nobel Prize API returns multilingual dicts not strings - use get_en() helper to extract English values
- [Phase 07-03]: ShowcaseSection grid uses md:grid-cols-2 lg:grid-cols-4 for responsive 2x2 on medium, 1x4 on large screens
- [Phase 07-03]: Landing heading updated to 'Famous Graph Datasets' reflecting real-world benchmark nature
- [Phase 08-02]: TraceCollector instruments real traversal at PhysicalScan/PhysicalExpand, propagated through Filter/Project/Sort/Limit recursively
- [Phase 08-02]: POST /query/trace SSE endpoint intercepts before dispatch_http_request in serve_http loop — existing /query unchanged
- [Phase 08-02]: Frontend SSE parsing uses fetch + ReadableStream (not EventSource which lacks POST support)
- [Phase 08-revolutionary-graph-visualization]: MapLibre Map component imported as MapLibreMap alias to prevent shadowing JS global Map constructor causing TS7009 errors
- [Phase 08-01]: GeoCanvas uses CARTO Dark Matter tiles (no API key) with deck.gl ScatterplotLayer for airports and ArcLayer for great-circle routes with pulse animation
- [Phase 08-01]: isGeographic flag on DatasetMeta auto-activates geographic mode when Air Routes dataset is selected — no user toggle needed
- [Phase 08-03]: Viewport culling uses ctx.getTransform() to compute graph-space visible bounds — avoids react-force-graph-2d needing to expose viewport rect
- [Phase 09-01]: Dynamic imports per adapter: avoids bundling all AI SDKs in main chunk; each provider loaded only when createProvider() is called
- [Phase 09-01]: Singleton WebLLM engine: module-level variable prevents re-downloading model weights across re-renders
- [Phase 09-01]: System message separation in Anthropic adapter: Anthropic API takes system as top-level param, not in messages array
- [Phase 09-01]: Google Gemini uses @google/genai (GA May 2025) not deprecated @google/generative-ai
- [Phase 09-01]: createProvider factory is async (Promise-returning) to support dynamic imports — callers must await it
- [Phase 09-02]: Streamdown used over react-markdown for AI message rendering — handles unterminated code fences during token streaming without visual glitching
- [Phase 09-02]: Run Query and Copy buttons rendered only after isStreaming === false to prevent premature Cypher block extraction
- [Phase 09-02]: AIChatPanel accepts onSendMessage and onRunQuery as props; AI provider calls wired in Plan 03
- [Phase 09-03]: useAIChat hook wraps provider lifecycle, sends messages via rolling window, feeds trace results/errors back to AI automatically
- [Phase 09-03]: AIChatPanel rendered once per route (Header for /app via AppShell, PlaygroundPage for /playground) using shared Zustand store for open state
- [Phase 09-03]: MCPActivityPanel added as collapsible Activity section at bottom of AIChatPanel
- [Phase 09-03]: runCypherFromAI calls clearTrace() before executing to prevent animation conflicts (per Pitfall 5)
- [Milestone 2 Roadmap]: MCP server published as @opengraphdb/mcp, zero-config via npx
- [Milestone 2 Roadmap]: Skills built to Skills 2.0 open standard, portable across Claude Code, Copilot, Codex, Cursor
- [Milestone 2 Roadmap]: Graph-native RAG uses PageIndex-style navigation (graph IS the index, no separate construction)
- [Milestone 2 Roadmap]: Phase 12 RAG depends on Phase 10 MCP (RAG tools are MCP-exposed); Phase 13 depends on both 10 and 12
- [Phase 10-01]: @modelcontextprotocol/sdk v1 (stable) used — not v2 (pre-alpha)
- [Phase 10-01]: Native fetch (Node 18+) for HTTP client — no external HTTP library needed
- [Phase 10-01]: Tool registration via registerXxx(server, client) factory functions for clean separation
- [Phase 10-01]: Dual-block content responses: human-readable text + raw JSON for LLM flexibility
- [Phase 10-01]: search_nodes fetches schema first to build dynamic WHERE clause across string properties
- [Phase 10-01]: OGDB_URL env var with http://localhost:8080 default for zero-config local development
- [Phase 10-02]: browse_schema/execute_cypher/get_node_neighborhood are pure aliases to existing handlers — zero duplication, full backward compat
- [Phase 10-02]: Standardized tools appear first in tools/list so AI agents discover them before legacy names
- [Phase 10-02]: search_nodes builds dynamic Cypher WHERE clause from schema property_keys — avoids hardcoded property assumptions
- [Phase 10-02]: graph://schema is the single MCP resource exposed; both resources/list and resources/read implemented
- [Phase 10-02]: Rust and npm MCP servers now expose identical tool surface for consistent AI agent experience
- [Phase 10-mcp-server]: Integration tests use node:test (built-in) and spawn server at port 19999 for protocol testing without live DB
- [Phase 10-mcp-server]: VS Code Copilot config uses 'servers' key (not 'mcpServers') per VS Code MCP spec
- [Phase 11-01]: Skills 2.0 structure: SKILL.md master file + rules/*.md for detailed patterns, portable across platforms
- [Phase 11-01]: Node built-ins only for install script (fs, path, process): zero runtime dependencies
- [Phase 11-01]: Four platform targets: Claude Code (.claude/skills/), Cursor (.cursorrules), Copilot (.github/copilot-instructions.md), Codex (.codex/instructions.md)
- [Phase 11-01]: ogdb-cypher rules written as AI instructions (second person imperative), not developer documentation
- [Phase 11-03]: All data-import Cypher uses MERGE for idempotency, never bare CREATE for data import
- [Phase 11-03]: RDF files delegated to import_rdf MCP tool, never manually converted to Cypher
- [Phase 11-03]: Two-pass import: nodes first, relationships second, to avoid missing endpoint errors
- [Phase 11-03]: Batch size tiers: <100 individual, 100-10K UNWIND batches, 10K+ POST /import API
- [Phase 11-02]: graph-explore uses 5 strategies (top-down, bottom-up, goal-directed, pattern discovery, temporal) selected by graph size and user intent
- [Phase 11-02]: schema-advisor covers 8 good patterns + 6 anti-patterns with before/after Cypher examples
- [Phase 11-02]: RDF mapping includes both import_rdf and export_rdf workflows with _uri property preservation for round-trip fidelity
- [Phase 11-04]: Eval files use JSON content with .eval.yaml extension: no YAML parser dependency, JSON.parse fallback in runner
- [Phase 11-04]: Eval runner in src/eval-runner.ts (not evals/runner.ts) to preserve TypeScript rootDir: src and dist layout
- [Phase 11-04]: A/B comparison generates prompts for external LLM evaluation, avoiding API key requirements in eval framework
- [Phase 11-05]: README written developer-focused (176 lines, 10 sections) with no marketing language
- [Phase 11-05]: Install output enhanced with rule count summary and MCP server recommendation tip
- [Phase 11-05]: Package metadata finalized with homepage, bugs, author, mcp keyword for npm discoverability
- [Phase 12-01]: Leiden signature uses resolution: f64 parameter matching Louvain's modularity optimization
- [Phase 12-01]: EdgeRecord has no edge_type field; edge types retrieved via edge_type_at(eid, snapshot_txn_id)
- [Phase 12-01]: Summarize callback edge triples use String (owned) not &str to avoid lifetime complications
- [Phase 12-01]: community_leiden and build_community_hierarchy exposed on Database, ReadTransaction, and ReadSnapshot
- [Phase 12-03]: ingest_document placed on Database directly (not WriteTransaction) to match pattern of other RAG methods
- [Phase 12-03]: Vectors stored as PropertyValue::Vector on Content node properties; rebuild_vector_indexes_from_catalog called post-ingest
- [Phase 12-03]: Plan's BTreeMap<String, Value> / TransactionSnapshot API adapted to real PropertyMap / Database API
- [Phase 12-03]: document-ingest feature flag gates lopdf + pulldown-cmark; enabled in default feature set
- [Phase 12-02]: rrf_fuse is pub(crate) free function (not a method on Database) to enable direct unit testing
- [Phase 12-02]: Graph traversal iterates edge_records directly for edge-type filtering (consistent with collect_undirected_neighbors_at)
- [Phase 12-02]: community_leiden_at called lazily only when graph traversal signal active or community_id filter specified
- [Phase 12-02]: Existing hybrid_rag_retrieve (alpha-blending) preserved unchanged for backward compatibility
- [Phase 12-04]: HTTP endpoints for RAG placed in ogdb-cli/src/lib.rs (dispatch_http_request), not ogdb-core — HTTP server lives in CLI crate
- [Phase 12-04]: NodeSummary and EnrichedRagResult use BTreeMap<String, PropertyValue> (PropertyMap) to match codebase types
- [Phase 12-04]: rag_results_to_json uses property_value_to_export_json (CLI-private) for consistent property serialization
- [Phase 12-04]: ingest_document HTTP endpoint uses shared_db.with_write(|db| db.ingest_document(...)) — method is on Database not ReadSnapshot
- [Phase 12-04]: 4 MCP tools registered in @opengraphdb/mcp bringing total to 9 tools (browse_communities, drill_into_community, hybrid_search, ingest_document)
- [Phase 12-05]: Integration test in tests/rag_accuracy.rs (not bench file) so cargo test -p ogdb-bench discovers it — #[cfg(test)] in criterion bench files is not run by cargo test
- [Phase 12-05]: fake_embed() character-frequency vectors for reproducible benchmarks without external embedding model; EMBED_DIMS=64
- [Phase 12-05]: Non-degradation threshold 0.8x for hybrid vs vector-only MRR; fake embeddings make vector signal noise so only gross degradation should fail
- [Phase 12-05]: ogdb-core in [dependencies] not [dev-dependencies] in ogdb-bench so bench binary and integration tests share same crate resolution

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-13
Stopped at: Completed 12-05-PLAN.md — RAG benchmark suite, 30-question dataset, criterion harness, accuracy test, RESULTS.md; Phase 12 complete
Resume at: Phase 13 Plan 01
