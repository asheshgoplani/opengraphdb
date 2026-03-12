# Roadmap: OpenGraphDB

## Overview

OpenGraphDB is an AI-first graph database. The project has two tracks:

1. **Developer Tools** (CLI + Skills + MCP): Developers install OpenGraphDB skills in Claude Code, Copilot, Codex, or any MCP-compatible tool and can query, explore, and manage their graph DB through natural language. The skills are the product for developers.
2. **Demo Website** (Frontend): A showcase where visitors experience OpenGraphDB's AI capabilities live: talk to a knowledge graph, see query traces, explore datasets interactively.

Each phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and Graph Visualization** - Scaffold, API client, state management, and a working force-directed graph canvas with dark mode and responsive layout
- [x] **Phase 2: Cypher Editor and Query Workflow** - Full Cypher editor with syntax highlighting, autocomplete, history, saved queries, keyboard shortcuts, and export
- [x] **Phase 3: Schema Browser** - Schema exploration showing node labels, relationship types, and property keys from the backend
- [x] **Phase 4: Landing Page and Playground** - Hero landing page with feature highlights and an interactive playground with pre-loaded sample graph and guided queries
- [x] **Phase 5: Frontend Polish & Knowledge Graph Showcase** - Polish all pages to production quality with Linear/Vercel aesthetic, real-world knowledge graph showcase, redesigned playground with split-pane layout, and Playwright visual verification
- [x] **Phase 6: Production Demo Datasets & Live Backend Integration** - Create rich, realistic demo datasets loaded into the actual OpenGraphDB database, wire frontend to showcase live backend queries, and provide a seed script for reproducible demo data

- [x] **Phase 7: Real-World Famous Dataset Showcase** - Import 4 industry-standard datasets (MovieLens, Air Routes, Game of Thrones, Wikidata subset) as pre-built showcases with download scripts, format conversion, guided queries, and landing page updates
- [x] **Phase 8: Revolutionary Graph Visualization** - Modern production-grade graph rendering with geographic maps, large dataset support, and real-time query trace animation showing traversal paths (completed 2026-03-01)
- [x] **Phase 9: AI Knowledge Graph Assistant** - Provider-agnostic chatbot converting natural language to Cypher with configurable API keys, free default model, and integration with query trace animation

---

### Milestone 2: AI-First Developer Tools & Demo (Phases 10-13)

- [x] **Phase 10: MCP Server for OpenGraphDB** - First-class MCP server exposing graph operations (schema browse, Cypher execute, neighborhood explore, hybrid search) so any AI agent can work with the graph database natively (completed 2026-03-12)
- [x] **Phase 11: Developer Skills & CLI** - OpenGraphDB-specific skills (ogdb-cypher, graph-explore, schema-advisor, data-import) built with Skills 2.0 framework including evals and benchmarks, published as open standard skills portable across Claude Code, Copilot, Codex, Cursor (completed 2026-03-12)
- [ ] **Phase 12: Graph-Native RAG Engine** - PageIndex-style hierarchical navigation over graph structure, Leiden community detection with summaries, hybrid retrieval (BM25 + vector + graph traversal + RRF fusion), document ingestion pipeline
- [ ] **Phase 13: AI Demo Experience** - Interactive "Talk to Your Knowledge Graph" demo on the website where visitors ask natural language questions against pre-loaded famous datasets, see Cypher generated live, watch query trace animations, and explore results visually

## Phase Details

### Milestone 2 Context

**Research basis**: PageIndex (vectorless RAG, 98.7% accuracy on FinanceBench), Anthropic Skills 2.0 (evals, /batch, open standard), Anthropic Contextual Retrieval (BM25 + contextual embeddings), Microsoft GraphRAG (community detection + hierarchical summaries).

**Key insight**: A graph database IS a hierarchical navigable index. PageIndex manually constructs tree structures from flat documents. OpenGraphDB already HAS connected structure natively. We expose graph topology as a PageIndex-style navigable index via MCP, giving LLMs the ability to reason over graph structure instead of doing blind vector similarity search.

**Research artifacts**:
- `research/pageindex-sparse-indexing-research.md` (detailed PageIndex + hybrid retrieval analysis)
- Skills 2.0 research (API endpoints, cross-platform standard, eval framework)

### Phase 1: Foundation and Graph Visualization
**Goal**: A running SPA where users can connect to OpenGraphDB, run a query, and see results as an interactive force-directed graph with dark mode working across all surfaces
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05, GRAPH-06, GRAPH-07, GRAPH-08, SCHEMA-02
**Success Criteria** (what must be TRUE):
  1. User can open the app, enter a backend server URL, and see a connected/disconnected health status indicator update in real time
  2. User can run a Cypher query and see results rendered as a force-directed graph with nodes as labeled, label-colored circles and edges as directional lines labeled by relationship type
  3. User can click any node to see its properties in a side panel, click any edge to see its properties, drag nodes to reposition them, and scroll to zoom
  4. User can toggle between graph view and tabular view of the same query results without re-executing the query
  5. The app works in dark mode across all surfaces including the graph canvas, displays correctly on desktop and tablet viewports, and the initial bundle is under 500KB
**Plans**: TBD

### Phase 2: Cypher Editor and Query Workflow
**Goal**: Users can write, execute, manage, and export Cypher queries through a full-featured editor that persists history across sessions
**Depends on**: Phase 1
**Requirements**: QUERY-01, QUERY-02, QUERY-03, QUERY-04, QUERY-05, QUERY-06, QUERY-07, QUERY-08, QUERY-09
**Success Criteria** (what must be TRUE):
  1. User can write Cypher in an editor with syntax highlighting and execute it with Ctrl+Enter
  2. User can receive schema-aware autocomplete suggestions for node labels, relationship types, and property keys while typing
  3. User can browse the full query history that persists after closing and reopening the browser, navigate entries with Ctrl+Up/Down, and re-run any entry
  4. User can save/bookmark a query, name it, and re-run it from the saved list at any time
  5. User can export query results as a JSON file and as a CSV file from the results panel
**Plans**: 3 plans
  - [x] 02-01-PLAN.md — Install CypherEditor, create history store and schema hook, replace textarea with full editor
  - [x] 02-02-PLAN.md — Export utilities (JSON/CSV) with tests and wire export buttons into ResultsBanner
  - [x] 02-03-PLAN.md — History panel, saved queries panel, save-query dialog, wire into Header and editor

### Phase 3: Schema Browser
**Goal**: Users can explore the full database schema including node labels, relationship types, and property keys without writing a query
**Depends on**: Phase 2
**Requirements**: SCHEMA-01
**Success Criteria** (what must be TRUE):
  1. User can open the schema browser and see all node labels, relationship types, and property keys currently in the database
  2. User can manually refresh the schema view and see updated results after data changes
**Plans**: 1 plan
  - [x] 03-01-PLAN.md — Install Accordion, create SchemaPanel with three collapsible sections, wire into Header

### Phase 4: Landing Page and Playground
**Goal**: First-time evaluators can learn what OpenGraphDB does from a landing page and explore a pre-loaded sample graph through guided queries without configuring a backend
**Depends on**: Phase 1
**Requirements**: DEMO-01, DEMO-02, DEMO-03, DEMO-04
**Success Criteria** (what must be TRUE):
  1. User lands on a hero page that explains OpenGraphDB's key differentiators and includes a getting started guide with feature highlights
  2. User can navigate to the interactive playground without connecting a backend and see a pre-loaded sample graph rendered as a force-directed visualization
  3. User can run guided example queries in the playground that demonstrate graph visualization and see results update in the graph canvas
**Plans**: 3 plans
  - [x] 04-01-PLAN.md — Wire React Router, create movies sample dataset, implement playground query filter with tests
  - [x] 04-02-PLAN.md — Landing page with hero section, feature highlights, and getting started guide
  - [x] 04-03-PLAN.md — Playground page with GraphCanvas, guided query buttons, and Header wordmark link

### Phase 5: Frontend Polish & Knowledge Graph Showcase
**Goal**: Polish all frontend pages to production quality with showcase knowledge graph examples, improved playground UX, and full visual verification
**Depends on**: Phase 4
**Requirements**: Visual polish, knowledge graph showcase, playground redesign, Playwright visual testing
**Success Criteria** (what must be TRUE):
  1. Landing page has a live animated graph hero background and a knowledge graph showcase section referencing real-world datasets (Wikidata, IMDB, PubMed) with interactive mini-graph previews
  2. Playground uses a split-pane layout (editor + graph), shows live database connection status with query timing, and supports multiple switchable sample datasets
  3. Graph visualization rendering is professionally polished with gradient colors, glow effects, proper legend, and clear labels
  4. Every page achieves a Linear/Vercel-level aesthetic with subtle purposeful animations, polished dark mode, and refined typography
  5. Playwright screenshot tests verify every page looks correct with real data in both light and dark mode
**Plans**: 6 plans
  - [x] 05-01-PLAN.md — Graph visualization polish (gradients, glow, legend) + Tailwind animation utilities
  - [x] 05-02-PLAN.md — Sample datasets (social network, fraud detection) + unified dataset registry with tests
  - [x] 05-03-PLAN.md — Landing page redesign (animated hero, showcase cards, nav, polished sections)
  - [x] 05-04-PLAN.md — Playground redesign (split-pane, dataset switcher, query cards, connection badge)
  - [x] 05-05-PLAN.md — App page polish (header glass effect, connection status, results banner, property panel)
  - [x] 05-06-PLAN.md — Playwright E2E visual tests for all pages in light/dark mode

### Phase 6: Production Demo Datasets & Live Backend Integration
**Goal**: Visitors can see OpenGraphDB working with rich, realistic data served from the actual backend, with recognizable demo datasets that build trust and showcase capabilities
**Depends on**: Phase 5
**Requirements**: DEMO-03, DEMO-04
**Success Criteria** (what must be TRUE):
  1. At least two rich demo datasets (recognizable domains like movies, knowledge graphs) are loaded into the actual OpenGraphDB database via Cypher CREATE statements or ogdb import
  2. The frontend landing page and playground showcase these datasets with data served from the live backend, not static JSON
  3. Demo queries demonstrate OpenGraphDB's capabilities including graph traversal, pattern matching, and relationship exploration
  4. A seed script can recreate all demo data from scratch at any time
  5. The /app route connects to the backend and lets users query the demo data interactively with meaningful results
**Plans**: 3 plans
  - [x] 06-01-PLAN.md — Three JSON import datasets (movies flagship, social, fraud) + idempotent seed shell script
  - [x] 06-02-PLAN.md — API layer fixes (schema normalization, row-based transform), extended GuidedQuery interface, expanded offline datasets
  - [x] 06-03-PLAN.md — Playground live mode toggle, category-grouped query cards, loading skeleton, updated ConnectionBadge

### Phase 7: Real-World Famous Dataset Showcase
**Goal**: Import 4 industry-standard, well-known datasets (MovieLens, Air Routes, Game of Thrones, Wikidata subset) as pre-built showcases with download scripts, format conversion, guided queries, and landing page updates
**Depends on**: Phase 6
**Requirements**: SHOWCASE-01, SHOWCASE-02, SHOWCASE-03, SHOWCASE-04
**Success Criteria** (what must be TRUE):
  1. Four famous datasets (MovieLens subset, Air Routes full, GoT full, Wikidata slice) are importable via download + convert + seed pipeline
  2. Each dataset has 5-7 guided queries in the playground categorized as Explore/Traverse/Analyze
  3. Landing page showcase section features all 4 datasets with real stats and recognizable branding
  4. Seed script downloads from original sources, converts to import format, and loads into OpenGraphDB
  5. Air Routes dataset preserves lat/long coordinates on airport nodes for Phase 8 geographic rendering
**Plans**: 3 plans
  - [x] 07-01-PLAN.md — Download scripts, Python conversion scripts, and extended seed pipeline for all 4 datasets
  - [x] 07-02-PLAN.md — TypeScript offline fallback modules with hand-curated data and guided queries for all 4 datasets
  - [x] 07-03-PLAN.md — Wire new datasets into registry, update tests, and adjust showcase grid layout

### Phase 8: Revolutionary Graph Visualization
**Goal**: Modern production-grade graph rendering with geographic map rendering for Air Routes, large dataset support (1000s of nodes), and real-time query trace animation showing node traversal paths
**Depends on**: Phase 7
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04
**Success Criteria** (what must be TRUE):
  1. Air Routes dataset renders airports on a geographic map with routes as arcs
  2. Graph rendering handles 1000+ nodes without performance degradation
  3. Query execution returns trace data (visited node IDs) via an EXPLAIN-like endpoint
  4. Frontend displays real-time traversal animation (nodes light up as query traverses them) via WebSocket/SSE
  5. Graph rendering is aesthetically modern and production-grade
**Plans**: 3 plans
  - [x] 08-01-PLAN.md — Geographic map rendering (deck.gl + MapLibre) with type/state foundation
  - [x] 08-02-PLAN.md — Backend trace endpoint (TraceCollector + SSE streaming) and frontend API client
  - [ ] 08-03-PLAN.md — LOD performance optimization, viewport culling, and trace animation with controls

### Phase 9: AI Knowledge Graph Assistant
**Goal**: Provider-agnostic AI chatbot that converts natural language to Cypher queries with configurable API keys, free default model, and integration with query trace animation
**Depends on**: Phase 8
**Requirements**: AI-01, AI-02, AI-03, AI-04
**Success Criteria** (what must be TRUE):
  1. Users can type natural language questions and receive Cypher queries that execute against the knowledge graph
  2. Users can configure their own API keys (OpenAI, Anthropic, Google Gemini) via a settings UI, stored in localStorage only
  3. A free default model works out of the box without any API key
  4. When AI generates and runs a query, the graph trace animation shows the data path
  5. All API calls happen client-side; keys are never sent to the backend
**Plans**: 3 plans
  - [x] 09-01-PLAN.md — AI provider SDKs, ChatProvider interface, 5 provider adapters, system prompt, settings store extension, SettingsDialog AI section
  - [x] 09-02-PLAN.md — Zustand ephemeral chat store, AIChatPanel (Sheet), AIChatMessage (streaming markdown), download progress bar, typing indicator
  - [x] 09-03-PLAN.md — useAIChat orchestration hook, trace integration for AI queries, Header and PlaygroundPage wiring, MCP activity placeholder

### Phase 10: MCP Server for OpenGraphDB
**Goal**: Any AI agent (Claude, Copilot, Codex, Cursor) can connect to OpenGraphDB via MCP and browse schema, execute Cypher, explore neighborhoods, and search across the graph without writing code
**Depends on**: Phase 9 (existing HTTP API)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06
**Success Criteria** (what must be TRUE):
  1. An LLM connected via MCP can call `browse_schema` and receive the full graph schema (labels, relationship types, property keys) without any prior knowledge of the database
  2. An LLM can call `execute_cypher` with an arbitrary query string and receive structured results (nodes, edges, scalar values) that it can reason over
  3. An LLM can call `get_node_neighborhood` with a node ID, a depth, and optional edge type filters and receive the N-hop subgraph
  4. An LLM can call `search_nodes` with property key-value pairs and receive matching nodes with their properties
  5. A developer can install the MCP server by running `npx @opengraphdb/mcp` with no other configuration steps required
  6. A developer can copy ready-to-paste configuration snippets from the README for Claude Code, Cursor, and VS Code Copilot
**Plans**: 3 plans
  - [x] 10-01-PLAN.md — @opengraphdb/mcp npm package: 5 MCP tools, TypeScript build, stdio transport
  - [x] 10-02-PLAN.md — Rust MCP server alignment: standardized tool names, improved descriptions, MCP resources
  - [x] 10-03-PLAN.md — Configuration examples (Claude Code, Cursor, VS Code Copilot), README, integration tests

### Phase 11: Developer Skills & CLI
**Goal**: Developers install OpenGraphDB skills in their AI coding tool and get expert-level graph database assistance: NL-to-Cypher, schema design, data import, graph analysis, all with verified quality via evals
**Depends on**: Phase 10 (MCP server for live graph access)
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, SKILL-07
**Success Criteria** (what must be TRUE):
  1. A developer using `ogdb-cypher` skill receives Cypher queries that execute correctly against OpenGraphDB, verified by evals showing higher accuracy than without the skill
  2. A developer using `graph-explore` skill can describe a goal in natural language and receive guided traversal suggestions, schema-aware navigation, and subgraph explanations
  3. A developer using `schema-advisor` skill can describe a domain and receive a graph schema design with index recommendations and optional RDF ontology mapping
  4. A developer using `data-import` skill can point to a CSV, JSON, or RDF file and receive schema detection, validation feedback, and import-ready Cypher
  5. Each skill passes A/B benchmarks where task completion with the skill measurably outperforms task completion without the skill
  6. All four skills install as a single package via one command in Claude Code, Copilot, Codex, and Cursor
  7. Each skill ships with structured evals runnable via the Skills 2.0 eval framework, covering correctness, edge cases, and regression prevention
**Plans**: 5 plans
  - [x] 11-01-PLAN.md — npm package scaffold (@opengraphdb/skills) with cross-platform install CLI + ogdb-cypher skill (SKILL.md + 3 rule files)
  - [x] 11-02-PLAN.md — graph-explore skill (SKILL.md + 2 rule files) + schema-advisor skill (SKILL.md + 3 rule files)
  - [x] 11-03-PLAN.md — data-import skill (SKILL.md + 3 rule files) for CSV, JSON, and RDF import assistance
  - [x] 11-04-PLAN.md — Eval framework: 4 eval YAML files (34 test cases), eval runner with A/B scoring, CLI eval command
  - [x] 11-05-PLAN.md — README with platform guides, package finalization, npm pack verification

### Phase 12: Graph-Native RAG Engine
**Goal**: OpenGraphDB becomes a reasoning-based retrieval engine where LLMs navigate graph structure like a human expert navigates a document, combined with hybrid BM25 + vector + graph search for maximum retrieval accuracy
**Depends on**: Phase 10 (MCP server), existing tantivy + usearch support
**Requirements**: RAG-01, RAG-02, RAG-03, RAG-04, RAG-05
**Success Criteria** (what must be TRUE):
  1. An LLM using MCP can call `browse_communities` to see the top-level cluster overview, then `drill_into_community` to navigate into sub-clusters, following graph relationships at each level (PageIndex-style navigation)
  2. Running Leiden community detection on a graph produces hierarchical clusters, and each cluster node has an LLM-generated summary that describes the community's content
  3. A `hybrid_search` call returns results that fuse BM25 (tantivy), vector similarity (usearch), and graph traversal candidates via Reciprocal Rank Fusion, outperforming any single retrieval method alone
  4. An `ingest_document` call on a PDF or Markdown file produces a graph with sections as nodes, cross-references as edges, and both text and vector indexes populated
  5. All four RAG pipeline operations (`browse_communities`, `drill_into_community`, `hybrid_search`, `ingest_document`) are accessible as MCP tools
  6. Benchmark on a standard dataset (FinanceBench or equivalent) shows measurable improvement over pure vector RAG
**Plans**: 5 plans
  - [x] 12-01-PLAN.md — Leiden community detection algorithm and hierarchical community index with LLM-summary callbacks
  - [ ] 12-02-PLAN.md — Hybrid retrieval pipeline with RRF fusion: BM25 + vector + graph traversal (entity linking + BFS)
  - [ ] 12-03-PLAN.md — Document ingestion pipeline: PDF (lopdf) + Markdown (pulldown-cmark) → graph + text + vector indexes
  - [ ] 12-04-PLAN.md — RAG API methods and HTTP endpoints: browse_communities, drill_into_community, hybrid_search, ingest_document
  - [ ] 12-05-PLAN.md — RAG benchmark suite: 30 Q&A dataset, 4-strategy comparison, accuracy metrics

### Phase 13: AI Demo Experience
**Goal**: Website visitors can talk to a knowledge graph in natural language, see Cypher generated live, watch query trace animations, and explore results visually, all without installing anything
**Depends on**: Phase 10 (MCP), Phase 12 (RAG engine)
**Requirements**: DEMO-AI-01, DEMO-AI-02, DEMO-AI-03, DEMO-AI-04, DEMO-AI-05, DEMO-AI-06
**Success Criteria** (what must be TRUE):
  1. The landing page has a "Talk to Your Knowledge Graph" section where a visitor can type a natural language question and see a live AI-generated response without any account or setup
  2. The demo runs against at least one pre-loaded famous dataset (MovieLens, Air Routes, GoT, or Wikidata) using pre-computed offline data for zero-config, instant-response visitor experience (offline-first by design: no backend dependency required)
  3. Each AI response displays three visible artifacts: the generated Cypher query, the query trace animation on the graph canvas, and a natural language answer
  4. The demo page includes a "How it works" visual explainer showing the MCP + Skills + RAG pipeline at a glance
  5. A typical demo question receives a first token within 5 seconds, with streaming for longer responses
  6. The demo works with the free default model out of the box, and a visitor can optionally enter their own API key to switch to a premium model
**Plans**: 3 plans
  - [ ] 13-01-PLAN.md — Demo data infrastructure: suggested questions, pre-computed responses, demo store, useDemoChat hook, dataset-aware prompts, simulated trace
  - [ ] 13-02-PLAN.md — "Talk to Your Knowledge Graph" UI: DemoSection + 5 subcomponents (dataset selector, question chips, chat input, response card, graph canvas), landing page integration
  - [ ] 13-03-PLAN.md — "How It Works" pipeline explainer, demo polish, edge case handling, performance optimization

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Graph Visualization | 5/5 | Complete | 2026-03-01 |
| 2. Cypher Editor and Query Workflow | 3/3 | Complete | 2026-03-01 |
| 3. Schema Browser | 1/1 | Complete | 2026-03-01 |
| 4. Landing Page and Playground | 3/3 | Complete | 2026-03-01 |
| 5. Frontend Polish & Knowledge Graph Showcase | 6/6 | Complete | 2026-03-01 |
| 6. Production Demo Datasets & Live Backend Integration | 3/3 | Complete | 2026-03-01 |
| 7. Real-World Famous Dataset Showcase | 3/3 | Complete | 2026-03-02 |
| 8. Revolutionary Graph Visualization | 3/3 | Complete | 2026-03-01 |
| 9. AI Knowledge Graph Assistant | 3/3 | Complete | 2026-03-03 |
| **Milestone 2: AI-First** | | | |
| 10. MCP Server for OpenGraphDB | 4/3 | Complete    | 2026-03-12 |
| 11. Developer Skills & CLI | 5/5 | Complete | 2026-03-12 |
| 12. Graph-Native RAG Engine | 0/5 | Planning | — |
| 13. AI Demo Experience | 0/3 | Not started | — |
