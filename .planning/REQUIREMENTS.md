# Requirements: OpenGraphDB Frontend

**Defined:** 2026-03-01
**Core Value:** Developers can visually explore and query their graph data through an interactive Cypher query interface with force-directed graph visualization

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Application scaffolded with React + TypeScript + Vite + Tailwind + shadcn/ui
- [ ] **FOUND-02**: Route-based code splitting delivers initial bundle under 500KB
- [ ] **FOUND-03**: Dark mode works across all surfaces including graph canvas
- [ ] **FOUND-04**: Responsive layout works on desktop and tablet viewports
- [ ] **FOUND-05**: Configurable server URL for backend connection (default localhost:8080)
- [ ] **FOUND-06**: Typed API client layer isolates all HTTP calls to backend REST endpoints

### Graph Visualization

- [ ] **GRAPH-01**: User can view query results as a force-directed graph with nodes as labeled circles colored by label
- [ ] **GRAPH-02**: User can view edges as directional lines labeled by relationship type
- [ ] **GRAPH-03**: User can click a node to inspect its properties in a side panel
- [ ] **GRAPH-04**: User can click an edge to inspect its properties in a side panel
- [ ] **GRAPH-05**: User can drag nodes to reposition them in the graph canvas
- [ ] **GRAPH-06**: User can scroll to zoom in and out of the graph
- [ ] **GRAPH-07**: User can toggle between graph view and table view of query results
- [ ] **GRAPH-08**: Result set is capped with a configurable LIMIT to prevent browser crashes on large queries

### Query Editor

- [ ] **QUERY-01**: User can write Cypher queries in an editor with syntax highlighting
- [ ] **QUERY-02**: User can get schema-aware autocomplete suggestions for labels, relationship types, and property keys
- [ ] **QUERY-03**: User can execute queries with Ctrl+Enter keyboard shortcut
- [ ] **QUERY-04**: User can browse query history persisted across browser sessions
- [ ] **QUERY-05**: User can navigate history with Ctrl+Up/Down keyboard shortcuts
- [ ] **QUERY-06**: User can save/bookmark frequently used queries
- [ ] **QUERY-07**: User can re-run any query from history or saved queries
- [ ] **QUERY-08**: User can export query results as JSON
- [ ] **QUERY-09**: User can export query results as CSV

### Schema and Health

- [ ] **SCHEMA-01**: User can browse database schema showing node labels, relationship types, and property keys
- [ ] **SCHEMA-02**: User can see database connection health status indicator (connected/disconnected)

### Demo and Showcase

- [ ] **DEMO-01**: User sees a landing page with hero section explaining OpenGraphDB's key differentiators
- [ ] **DEMO-02**: User sees feature highlights and getting started guide on the landing page
- [ ] **DEMO-03**: User can access an interactive playground with a pre-loaded sample graph
- [ ] **DEMO-04**: User can run guided example queries in the playground that demonstrate graph visualization

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

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
- **EXPLORE-05**: User can set query parameters via a key-value editor panel
- **EXPLORE-06**: User can apply rule-based conditional styling to nodes by property values

### AI Integration

- **AI-01**: User can generate Cypher queries from natural language input
- **AI-02**: User can view MCP tool call activity from AI agents

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| User authentication/authorization | Not needed for v1 local-first developer tool |
| Multi-database support | Single database connection sufficient for v1 |
| Real-time streaming/subscriptions | Standard request-response sufficient; adds WebSocket complexity |
| Mobile-optimized layout | Desktop and tablet focus per spec |
| Bolt protocol from browser | Would need WebSocket bridge; HTTP REST is sufficient |
| SPARQL query editor | OpenGraphDB does not support SPARQL; Cypher-first |
| Full no-code graph builder | Target user writes Cypher; defer visual query building |
| Render entire graph by default | Hairball problem; use LIMIT-bounded defaults instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| GRAPH-01 | Phase 1 | Pending |
| GRAPH-02 | Phase 1 | Pending |
| GRAPH-03 | Phase 1 | Pending |
| GRAPH-04 | Phase 1 | Pending |
| GRAPH-05 | Phase 1 | Pending |
| GRAPH-06 | Phase 1 | Pending |
| GRAPH-07 | Phase 1 | Pending |
| GRAPH-08 | Phase 1 | Pending |
| QUERY-01 | Phase 2 | Pending |
| QUERY-02 | Phase 2 | Pending |
| QUERY-03 | Phase 2 | Pending |
| QUERY-04 | Phase 2 | Pending |
| QUERY-05 | Phase 2 | Pending |
| QUERY-06 | Phase 2 | Pending |
| QUERY-07 | Phase 2 | Pending |
| QUERY-08 | Phase 2 | Pending |
| QUERY-09 | Phase 2 | Pending |
| SCHEMA-01 | Phase 3 | Pending |
| SCHEMA-02 | Phase 1 | Pending |
| DEMO-01 | Phase 4 | Pending |
| DEMO-02 | Phase 4 | Pending |
| DEMO-03 | Phase 4 | Pending |
| DEMO-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after initial definition*
