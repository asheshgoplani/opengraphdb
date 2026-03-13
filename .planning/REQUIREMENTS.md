# Requirements: OpenGraphDB

**Defined:** 2026-03-01 (v1.0), updated 2026-03-12 (v2.0)
**Core Value:** AI-first graph database where developers install skills to work with graph data through natural language, and visitors can talk to knowledge graphs live on the website

## v1 Requirements (Milestone 1: Complete)

All v1 requirements shipped in Phases 1-9.

### Foundation

- [x] **FOUND-01**: Application scaffolded with React + TypeScript + Vite + Tailwind + shadcn/ui
- [x] **FOUND-02**: Route-based code splitting delivers initial bundle under 500KB
- [x] **FOUND-03**: Dark mode works across all surfaces including graph canvas
- [x] **FOUND-04**: Responsive layout works on desktop and tablet viewports
- [x] **FOUND-05**: Configurable server URL for backend connection (default localhost:8080)
- [x] **FOUND-06**: Typed API client layer isolates all HTTP calls to backend REST endpoints

### Graph Visualization

- [x] **GRAPH-01**: User can view query results as a force-directed graph with nodes as labeled circles colored by label
- [x] **GRAPH-02**: User can view edges as directional lines labeled by relationship type
- [x] **GRAPH-03**: User can click a node to inspect its properties in a side panel
- [x] **GRAPH-04**: User can click an edge to inspect its properties in a side panel
- [x] **GRAPH-05**: User can drag nodes to reposition them in the graph canvas
- [x] **GRAPH-06**: User can scroll to zoom in and out of the graph
- [x] **GRAPH-07**: User can toggle between graph view and table view of query results
- [x] **GRAPH-08**: Result set is capped with a configurable LIMIT to prevent browser crashes on large queries

### Query Editor

- [x] **QUERY-01**: User can write Cypher queries in an editor with syntax highlighting
- [x] **QUERY-02**: User can get schema-aware autocomplete suggestions for labels, relationship types, and property keys
- [x] **QUERY-03**: User can execute queries with Ctrl+Enter keyboard shortcut
- [x] **QUERY-04**: User can browse query history persisted across browser sessions
- [x] **QUERY-05**: User can navigate history with Ctrl+Up/Down keyboard shortcuts
- [x] **QUERY-06**: User can save/bookmark frequently used queries
- [x] **QUERY-07**: User can re-run any query from history or saved queries
- [x] **QUERY-08**: User can export query results as JSON
- [x] **QUERY-09**: User can export query results as CSV

### Schema and Health

- [x] **SCHEMA-01**: User can browse database schema showing node labels, relationship types, and property keys
- [x] **SCHEMA-02**: User can see database connection health status indicator (connected/disconnected)

### Demo and Showcase

- [x] **DEMO-01**: User sees a landing page with hero section explaining OpenGraphDB's key differentiators
- [x] **DEMO-02**: User sees feature highlights and getting started guide on the landing page
- [x] **DEMO-03**: User can access an interactive playground with a pre-loaded sample graph
- [x] **DEMO-04**: User can run guided example queries in the playground that demonstrate graph visualization

### Advanced Visualization (Phases 7-8)

- [x] **SHOWCASE-01**: 4 famous datasets (MovieLens, Air Routes, GoT, Wikidata) importable via download + convert + seed pipeline
- [x] **SHOWCASE-02**: Each dataset has guided queries categorized as Explore/Traverse/Analyze
- [x] **SHOWCASE-03**: Landing page features all 4 datasets with real stats
- [x] **SHOWCASE-04**: Air Routes dataset preserves lat/long for geographic rendering
- [x] **VIZ-01**: Air Routes renders on geographic map with arcs
- [x] **VIZ-02**: Graph rendering handles 1000+ nodes without performance degradation
- [x] **VIZ-03**: Query execution returns trace data via EXPLAIN-like endpoint
- [x] **VIZ-04**: Frontend displays real-time traversal animation via SSE

### AI Assistant (Phase 9)

- [x] **AI-01**: User can type NL questions and receive Cypher queries that execute against the knowledge graph
- [x] **AI-02**: User can configure API keys (OpenAI, Anthropic, Google Gemini) via settings UI
- [x] **AI-03**: A free default model works without any API key
- [x] **AI-04**: AI-generated queries trigger graph trace animation

## v2 Requirements (Milestone 2: Active)

Requirements for Milestone v2.0. Each maps to roadmap phases 10-13.

### MCP Server

- [x] **MCP-01**: LLM can discover graph schema (labels, relationship types, properties) via browse_schema tool
- [x] **MCP-02**: LLM can execute arbitrary Cypher queries and receive structured results via execute_cypher tool
- [x] **MCP-03**: LLM can explore a node's N-hop neighborhood with configurable depth and edge type filters via get_node_neighborhood tool
- [x] **MCP-04**: LLM can search nodes by property values via search_nodes tool
- [x] **MCP-05**: MCP server is published as @opengraphdb/mcp npm package, installable via npx with zero config
- [x] **MCP-06**: README includes Claude Code, Cursor, and VS Code Copilot configuration examples

### Developer Skills

- [x] **SKILL-01**: ogdb-cypher skill generates correct, optimized Cypher for OpenGraphDB, validated by evals against TCK test cases
- [x] **SKILL-02**: graph-explore skill provides guided graph exploration with schema awareness, traversal suggestions, and subgraph explanations
- [x] **SKILL-03**: schema-advisor skill helps design graph schemas, suggests indexes, and provides RDF ontology mapping guidance
- [x] **SKILL-04**: data-import skill assists CSV/JSON/RDF import with schema detection, validation, and Cypher generation
- [x] **SKILL-05**: All skills pass A/B benchmarks showing measurable improvement in task completion
- [x] **SKILL-06**: Skills published as open standard package, installable in Claude Code, Copilot, Codex, and Cursor
- [x] **SKILL-07**: Each skill includes structured evals that run via the Skills 2.0 eval framework

### Graph-Native RAG

- [x] **RAG-01**: LLM can browse communities, drill into clusters, and follow relationships via MCP tools (PageIndex-style navigation)
- [x] **RAG-02**: Leiden community detection produces hierarchical clusters with LLM-generated summaries at each level
- [x] **RAG-03**: Hybrid retrieval pipeline combines BM25, vector, and graph traversal results via Reciprocal Rank Fusion
- [x] **RAG-04**: Document ingestion pipeline converts PDF/Markdown into graph structure with text and vector indexes
- [ ] **RAG-05**: MCP tools expose full RAG pipeline: browse_communities, drill_into_community, hybrid_search, ingest_document

### AI Demo Experience

- [ ] **DEMO-AI-01**: Landing page features "Talk to Your Knowledge Graph" section with NL input and live responses
- [ ] **DEMO-AI-02**: Demo works against pre-loaded famous datasets with no setup required
- [ ] **DEMO-AI-03**: Each AI response shows generated Cypher, query trace animation, and NL answer
- [ ] **DEMO-AI-04**: Demo includes "How it works" explainer showing MCP + Skills + RAG pipeline visually
- [ ] **DEMO-AI-05**: Response latency under 5 seconds for typical questions (streaming for longer)
- [ ] **DEMO-AI-06**: Works with free default model, option to use own API keys for better models

## Future Requirements

Deferred beyond Milestone 2. Tracked but not in current roadmap.

### Admin Dashboard

- **ADMIN-01**: User can view node count, edge count, and storage size metrics
- **ADMIN-02**: User can view query latency and throughput charts
- **ADMIN-03**: User can view active connections count

### Data Management

- **DATA-01**: User can import data by uploading CSV files through drag-and-drop UI
- **DATA-02**: User can import data by uploading JSON files through drag-and-drop UI
- **DATA-03**: User can trigger data export from the UI
- **DATA-04**: User can view and create indexes through an index management UI

### Advanced Exploration

- **EXPLORE-01**: User can double-click a node to expand its neighborhood relationships
- **EXPLORE-02**: User can double-click an expanded node to collapse it
- **EXPLORE-03**: User can view query execution plans for EXPLAIN/PROFILE queries
- **EXPLORE-04**: User can view schema as a clickable graph diagram

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| User authentication/authorization | Not needed for local-first developer tool |
| Multi-database support | Single database connection sufficient |
| Real-time streaming/subscriptions | Standard request-response sufficient |
| Mobile-optimized layout | Desktop and tablet focus |
| Bolt protocol from browser | HTTP REST is sufficient |
| SPARQL query editor | Cypher-first |
| Self-hosted LLM inference | Use external providers; free default via WebLLM |
| Multi-tenant RAG | Single-user graph navigation |
| Paid API gateway | All tools are open source, self-hosted |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-01 | Phase 10 | Complete (10-01) |
| MCP-02 | Phase 10 | Complete (10-01) |
| MCP-03 | Phase 10 | Complete (10-01) |
| MCP-04 | Phase 10 | Complete (10-01) |
| MCP-05 | Phase 10 | Complete (10-01) |
| MCP-06 | Phase 10 | Complete |
| SKILL-01 | Phase 11 | Complete |
| SKILL-02 | Phase 11 | Complete |
| SKILL-03 | Phase 11 | Complete |
| SKILL-04 | Phase 11 | Complete (11-03) |
| SKILL-05 | Phase 11 | Complete (11-04) |
| SKILL-06 | Phase 11 | Complete |
| SKILL-07 | Phase 11 | Complete (11-04) |
| RAG-01 | Phase 12 | Complete (12-01) |
| RAG-02 | Phase 12 | Complete (12-01) |
| RAG-03 | Phase 12 | Complete (12-02) |
| RAG-04 | Phase 12 | Complete (12-03) |
| RAG-05 | Phase 12 | Pending |
| DEMO-AI-01 | Phase 13 | Pending |
| DEMO-AI-02 | Phase 13 | Pending |
| DEMO-AI-03 | Phase 13 | Pending |
| DEMO-AI-04 | Phase 13 | Pending |
| DEMO-AI-05 | Phase 13 | Pending |
| DEMO-AI-06 | Phase 13 | Pending |

**Coverage:**
- v2 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-01 (v1), 2026-03-12 (v2)*
*Last updated: 2026-03-12 after Phase 11 Plan 04 execution (SKILL-05, SKILL-07 complete)*
