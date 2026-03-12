# OpenGraphDB Frontend & Developer Tools

## What This Is

A web-based frontend for OpenGraphDB that combines interactive graph exploration, an AI-powered knowledge graph assistant, and a showcase/demo experience, plus a developer toolchain (MCP server, AI coding skills, graph-native RAG) that lets any AI agent work with graph data natively. It targets developers building with graph data, AI agent builders integrating knowledge graphs, and evaluators trying OpenGraphDB for the first time.

## Core Value

AI-first graph database where developers install skills to work with graph data through natural language, and visitors can talk to knowledge graphs live on the website.

## Current Milestone: v2.0 AI-First Developer Tools & Demo

**Goal:** Make OpenGraphDB the first graph database with native AI agent integration: MCP server for any AI tool, developer skills for coding assistants, graph-native RAG for intelligent retrieval, and a live demo where visitors talk to knowledge graphs.

**Target features:**
- MCP server exposing graph operations to any AI agent
- Developer skills (NL-to-Cypher, schema advisor, graph explorer, data import) for Claude Code, Copilot, Codex, Cursor
- Graph-native RAG engine (PageIndex-style navigation, Leiden communities, hybrid BM25+vector+graph retrieval)
- Interactive "Talk to Your Knowledge Graph" demo on the website

## Requirements

### Validated

<!-- Shipped and confirmed valuable (Milestone 1, Phases 1-9). -->

- ✓ Cypher query editor with syntax highlighting, autocomplete, and history — Phase 2
- ✓ Force-directed graph visualization with interactive manipulation — Phase 1
- ✓ Node/edge property inspection via side panel — Phase 1
- ✓ Tabular results view (toggle between graph and table) — Phase 1
- ✓ Query history with re-run capability — Phase 2
- ✓ Saved/bookmarked queries — Phase 2
- ✓ Export results as JSON and CSV — Phase 2
- ✓ Schema browser (labels, types, properties) — Phase 3
- ✓ Landing/demo page with hero section, feature highlights — Phase 4
- ✓ Interactive playground with pre-loaded sample graph and guided queries — Phase 4
- ✓ Production polish with Linear/Vercel aesthetic — Phase 5
- ✓ 4 famous real-world datasets (MovieLens, Air Routes, GoT, Wikidata) — Phase 7
- ✓ Geographic map rendering for Air Routes — Phase 8
- ✓ Query trace animation (real-time traversal visualization) — Phase 8
- ✓ AI chatbot with NL-to-Cypher, multi-provider, streaming — Phase 9
- ✓ Dark mode, responsive layout, code-split routes — Phase 1

### Active

<!-- Current scope: Milestone 2 (Phases 10-13). -->

- [ ] MCP server exposing graph operations (schema, Cypher, neighborhood, search)
- [ ] Developer skills with evals (ogdb-cypher, graph-explore, schema-advisor, data-import)
- [ ] Graph-native RAG (PageIndex navigation, Leiden communities, hybrid retrieval, document ingestion)
- [ ] Live "Talk to Your Knowledge Graph" demo on website

### Out of Scope

- User authentication/authorization — not needed for v1 local-first tool
- Multi-database support — single database connection for v1
- Real-time streaming/subscriptions — standard request-response sufficient
- Mobile-optimized layout — desktop and tablet focus
- Bolt protocol from browser — would need WebSocket bridge, HTTP REST is sufficient

## Context

OpenGraphDB is a graph database with an HTTP REST API (default localhost:8080). The frontend connects to endpoints: POST /query, GET /health, GET /metrics, GET /schema, POST /import, POST /export. The backend is a Rust-based system with Cypher query support. The frontend is a production-quality SPA with graph visualization, AI chatbot, geographic maps, and query trace animation (Milestone 1 complete).

Milestone 2 adds an AI developer toolchain layer. Research basis: PageIndex (vectorless RAG, 98.7% accuracy on FinanceBench), Anthropic Skills 2.0 (evals, open standard), Anthropic Contextual Retrieval (BM25 + contextual embeddings), Microsoft GraphRAG (community detection + hierarchical summaries). Key insight: a graph database IS a hierarchical navigable index; OpenGraphDB exposes graph topology as a PageIndex-style navigable index via MCP.

## Constraints

- **Tech Stack (Frontend)**: React + TypeScript, Tailwind CSS + Shadcn/ui, Vite
- **Tech Stack (MCP/Skills)**: TypeScript, npm-publishable packages
- **Tech Stack (RAG)**: Rust (tantivy for BM25, usearch for vectors, Leiden for communities)
- **Deployment**: Frontend as standalone SPA; MCP server as npm package (`npx` installable)
- **Backend API**: HTTP REST; MCP server wraps the REST API
- **Skills Standard**: Skills 2.0 open standard (portable across Claude Code, Copilot, Codex, Cursor)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + TypeScript + Vite | Specified in frontend spec, modern standard stack | ✓ Good |
| Tailwind CSS + Shadcn/ui | Rapid UI development with consistent design | ✓ Good |
| SPA architecture | Standalone static files, code-split by route | ✓ Good |
| HTTP REST API connection | Bolt protocol requires WebSocket bridge, HTTP is simpler | ✓ Good |
| react-force-graph-2d | Canvas renderer, good performance for 1000+ nodes | ✓ Good |
| CodeMirror 6 for Cypher | @neo4j-cypher/react-codemirror, schema-aware autocomplete | ✓ Good |
| deck.gl + MapLibre for geo | No API key needed, great arc rendering for Air Routes | ✓ Good |
| MCP server as npm package | Zero-config setup via `npx`, standard MCP protocol | — Pending |
| Skills 2.0 framework | Open standard, evals, cross-platform portability | — Pending |
| PageIndex-style graph navigation | Graph IS a hierarchical index, no separate index construction needed | — Pending |

---
*Last updated: 2026-03-12 after milestone v2.0 formalization*
