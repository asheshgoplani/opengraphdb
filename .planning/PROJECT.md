# OpenGraphDB Frontend

## What This Is

A web-based frontend for OpenGraphDB that combines interactive graph exploration, database administration, and a showcase/demo experience into a single application. It targets developers exploring graph data, operators monitoring database health, and evaluators trying OpenGraphDB for the first time.

## Core Value

Developers can visually explore and query their graph data through an interactive Cypher query interface with force-directed graph visualization.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Cypher query editor with syntax highlighting, autocomplete, and history
- [ ] Force-directed graph visualization of query results (nodes as labeled circles, edges as directional lines)
- [ ] Interactive graph manipulation (click to expand, double-click to collapse, drag to reposition, scroll to zoom)
- [ ] Node/edge property inspection via side panel
- [ ] Tabular results view (toggle between graph and table)
- [ ] Query history with re-run capability
- [ ] Saved/bookmarked queries
- [ ] Export results as JSON and CSV
- [ ] Admin dashboard with health status, metrics, schema browser
- [ ] Import/export UI for CSV/JSON files
- [ ] Index management (view and create)
- [ ] Landing/demo page with hero section, feature highlights, getting started guide
- [ ] Interactive playground with pre-loaded sample graph and guided queries
- [ ] Dark mode support
- [ ] Responsive layout (desktop and tablet)
- [ ] Code-split by route for fast initial load
- [ ] Configurable server URL for backend connection

### Out of Scope

- User authentication/authorization — not needed for v1 local-first tool
- Multi-database support — single database connection for v1
- Real-time streaming/subscriptions — standard request-response sufficient
- Mobile-optimized layout — desktop and tablet focus
- Bolt protocol from browser — would need WebSocket bridge, HTTP REST is sufficient

## Context

OpenGraphDB is a graph database with an HTTP REST API (default localhost:8080). The frontend connects to endpoints: POST /query, GET /health, GET /metrics, GET /schema, POST /import, POST /export. The backend is a Rust-based system with Cypher query support. This frontend will be served as a standalone SPA by any static file server, with future capability to be served directly by OpenGraphDB's HTTP server.

## Constraints

- **Tech Stack**: React + TypeScript, Tailwind CSS + Shadcn/ui, Vite for build tooling
- **Graph Rendering**: Must use a graph visualization library (react-force-graph, cytoscape.js, or d3-force)
- **Code Editor**: Monaco Editor or CodeMirror for Cypher editor
- **Deployment**: Must work as standalone SPA served by any static file server
- **Backend API**: HTTP REST only (no WebSocket/Bolt protocol from browser)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + TypeScript + Vite | Specified in frontend spec, modern standard stack | — Pending |
| Tailwind CSS + Shadcn/ui | Specified in spec, rapid UI development with consistent design | — Pending |
| SPA architecture | Must work as standalone static files, code-split by route | — Pending |
| HTTP REST API connection | Bolt protocol requires WebSocket bridge, HTTP is simpler | — Pending |

---
*Last updated: 2026-03-01 after initialization*
