# Roadmap: OpenGraphDB Frontend

## Overview

Build a developer-facing SPA that lets users visually explore and query their graph data. The journey goes from a running scaffold with a working graph canvas, through a full Cypher query editor, to a schema browser, and finally a landing page and playground that lets evaluators experience the product end-to-end. Each phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and Graph Visualization** - Scaffold, API client, state management, and a working force-directed graph canvas with dark mode and responsive layout
- [x] **Phase 2: Cypher Editor and Query Workflow** - Full Cypher editor with syntax highlighting, autocomplete, history, saved queries, keyboard shortcuts, and export
- [x] **Phase 3: Schema Browser** - Schema exploration showing node labels, relationship types, and property keys from the backend
- [x] **Phase 4: Landing Page and Playground** - Hero landing page with feature highlights and an interactive playground with pre-loaded sample graph and guided queries
- [ ] **Phase 5: Frontend Polish & Knowledge Graph Showcase** - Polish all pages to production quality with Linear/Vercel aesthetic, real-world knowledge graph showcase, redesigned playground with split-pane layout, and Playwright visual verification

## Phase Details

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Graph Visualization | 5/5 | Complete | 2026-03-01 |
| 2. Cypher Editor and Query Workflow | 3/3 | Complete | 2026-03-01 |
| 3. Schema Browser | 1/1 | Complete | 2026-03-01 |
| 4. Landing Page and Playground | 3/3 | Complete | 2026-03-01 |
| 5. Frontend Polish & Knowledge Graph Showcase | 0/? | Not started | - |
