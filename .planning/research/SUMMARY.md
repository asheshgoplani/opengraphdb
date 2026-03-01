# Project Research Summary

**Project:** OpenGraphDB Web Frontend
**Domain:** Graph database browser SPA (React, graph visualization, Cypher editor, admin dashboard)
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

OpenGraphDB's web frontend is a developer-facing single-page application in a well-understood product category alongside Neo4j Browser, Memgraph Lab, and ArangoDB Web UI. Experts build these as pure SPAs with three distinct surfaces: a Cypher query editor paired with a force-directed graph canvas, a schema and admin dashboard, and a landing/playground page for first-time evaluators. The recommended approach is React 19 + Vite 7 + TanStack Router/Query + Zustand for state, CodeMirror 6 with the official Neo4j Cypher extension for the editor, and react-force-graph-2d (canvas renderer) for visualization. All these choices are current stable versions, fully compatible with each other, and produce the smallest possible bundle while covering the required feature surface.

The most significant architectural pattern is strict state segregation: all server-originated data (query results, schema, health, metrics) goes through TanStack Query; all client-only data (selected node, editor text, preferences, history) lives in Zustand. This division eliminates an entire class of cache-invalidation bugs and prevents manual refetch logic from spreading into components. A typed API layer in `src/api/` isolates all HTTP calls and a dedicated `graphTransform.ts` at the feature boundary decouples the visualization library from the rest of the app, making a future library swap a single-file change.

The principal risks are front-loaded in Phase 1. Four performance and correctness issues must be resolved before any interactive feature is built: choosing the right rendering backend (Canvas, not SVG), enforcing a result cap before the graph renders, keeping force-simulation positions in refs not React state, and lazy-loading both the editor and the graph library behind route-based code splitting. Missing any of these in Phase 1 requires a costly refactor; addressing them upfront is straightforward. Security risk is concentrated in Phase 2: every filter, search, or parameter input must use parameterized Cypher. No string concatenation of user input into Cypher at any layer, ever.

## Key Findings

### Recommended Stack

The stack is pinned to current stable versions as of March 2026 and verified against npm. React 19 + shadcn/ui 3.8.5 + Tailwind v4 is the canonical new-project combination; shadcn/ui defaulted to v4 for new installs as of February 2025. Note that the global CLAUDE.md preference is Tailwind v3, but for a new project integrating shadcn/ui this conflicts with shadcn's own defaults. The STACK.md recommendation is to use v4 for this new project; if v3 is enforced, verify shadcn compatibility explicitly before scaffolding.

For the Cypher editor, `@neo4j-cypher/react-codemirror@next` (2.0.0-next.26.5) is the correct package. The `latest` tag is frozen at 1.0.4 from April 2024. The `next` tag is what Neo4j Browser itself uses. The CodeMirror 6 core adds ~300KB; the entire editor feature lazy-loaded adds under 500KB. This is the strongest reason to prefer CodeMirror over Monaco (4-6MB).

**Core technologies:**
- React 19.2.4: UI model. Current stable, concurrent features and Suspense support, required for TanStack Router's Suspense-based loader API.
- TypeScript 5.9.3: Type safety. Catches API contract mismatches at compile time; essential for typed API layer.
- Vite 7.3.1: Build tooling. Native ESM HMR, zero-config TS/JSX, fastest dev iteration available.
- TanStack Router 1.163.3: Routing. Best-in-class type-safe SPA routing; route params and search params are TypeScript-verified.
- TanStack Query 5.90.21: Server state. Handles caching, background refetch, mutation side effects for all backend API calls.
- Zustand 5.0.11: Client state. Graph selection, editor text, preferences, query history. 3KB, no boilerplate.
- CodeMirror 6 + @neo4j-cypher/react-codemirror@next: Cypher editor. Official Neo4j package with syntax, autocomplete, linting.
- react-force-graph 1.48.2: Graph visualization. Canvas renderer, handles up to ~5k nodes, React component API.
- shadcn/ui 3.8.5: Component library. Copy-paste model, no dependency lock-in, Tailwind-native.
- TanStack Table 8.21.3: Tabular result view. Headless, pairs naturally with shadcn/ui table components.
- Recharts 3.7.0: Admin metrics charts. SVG, composable, Tailwind-friendly.
- Vitest 4.0.18: Testing. Reuses Vite config pipeline; zero extra setup for ESM + TypeScript.

**What NOT to use:**
- Next.js or Remix: SSR overhead for a local static SPA.
- Monaco Editor: 4-6MB bundle, no first-party Cypher mode.
- `@neo4j-cypher/react-codemirror@latest`: Frozen at 1.0.4; use `@next`.
- Redux: Excessive boilerplate; Zustand covers all required state.
- Tailwind v3 (for new installs): Conflicts with shadcn/ui defaults.

### Expected Features

The feature landscape divides cleanly into three tiers. The v1 launch set is the minimum to feel like a credible graph database tool. The v1.x set adds operational and exploration power. The v2+ set defers AI and MCP integration until the platform is stable.

**Must have (table stakes) for v1 launch:**
- Cypher query editor with syntax highlighting and schema-aware autocomplete
- Force-directed graph visualization of query results
- Toggle between graph view and table view
- Node and edge property inspection via side panel
- Query history persisted across sessions
- Saved/bookmarked queries
- Database schema browser (labels, rel-types, property keys)
- Connection configuration (server URL) with health/status indicator
- Export query results as JSON and CSV
- Dark mode
- Landing/demo page with hero section and feature highlights
- Playground with pre-loaded sample graph and guided queries

**Should have (v1.x, after core is validated):**
- Admin dashboard: node/edge count, storage size, query latency charts
- Import/export UI: drag-and-drop CSV/JSON with progress indicator
- Query execution plan viewer (EXPLAIN/PROFILE response rendering)
- Node expansion via click (expand neighborhood without writing Cypher)
- Index management UI (list and create indexes)
- Clickable schema diagram (schema rendered as a mini force graph)
- Rule-based/conditional node styling (color by property value)
- Query parameters panel ($param key-value editor)

**Defer (v2+):**
- Natural language/AI-assisted Cypher generation (requires LLM integration)
- MCP integration panel showing agent activity (build after MCP server is mature)
- Cypher reference sidebar (covered by external docs initially)
- Multi-result pane / pinnable frames (polish feature)

**Anti-features to avoid:**
- Rendering the entire graph by default (hairball problem; use LIMIT and count-first flow)
- Real-time push/subscription view (out of scope per SPEC.md; use manual refresh)
- SPARQL editor (explicitly not supported)
- Frontend authentication and access control (out of scope v1)
- Bolt protocol from browser (HTTP REST only)

### Architecture Approach

The SPA is organized into four strict layers: a typed API client in `src/api/` that owns all HTTP calls and error normalization; a dual state layer of TanStack Query for server state and Zustand for client state; feature-scoped components in `src/features/` (editor, graph, results, admin, demo); and thin page shells in `src/pages/` that assemble features. There is no business logic in pages, no fetch calls in components, and no library-specific data structures crossing feature boundaries. The `graphTransform.ts` file at the feature/graph boundary converts typed API responses to visualization library format, decoupling the two completely.

**Major components:**
1. CypherEditor (features/editor/) — CodeMirror 6 with Cypher extension; owns history, autocomplete, keyboard shortcuts
2. GraphCanvas (features/graph/) — react-force-graph-2d wrapper; receives normalized `{nodes, links}` only; owns canvas interaction and node selection via Zustand
3. PropertyPanel (features/graph/) — reads selectedNodeId from Zustand graphStore; renders node/edge properties in a shadcn Sheet
4. ResultsTable (features/results/) — TanStack Table + shadcn Table; renders tabular fallback of query results
5. SchemaExplorer (features/admin/) — tree/list view of labels, rel-types, property keys from GET /schema
6. MetricsPanel + HealthBadge (features/admin/) — Recharts charts from GET /metrics, shared single polling interval
7. ImportExportPanel (features/admin/) — HTML file input with size guard, streaming upload, progress feedback
8. Playground + LandingHero (features/demo/) — static sample data + guided query prompts; no backend required for demo

**Build order driven by dependency direction:**
1. `src/api/` + `src/lib/` + `src/store/` (no React dependencies; testable against running backend)
2. `src/hooks/` (TanStack Query hooks over api/ functions)
3. Feature components in order: editor, results, graph, admin, demo (admin and demo are independent and can be built in parallel with graph)
4. `src/pages/` (thin assembly shells)
5. `src/router.tsx` + `src/main.tsx` (entry point)

### Critical Pitfalls

1. **SVG renderer chosen without benchmarking** — Use react-force-graph-2d (canvas) by default, not SVG-based alternatives. Run a 1k-node stress test during library selection in Phase 1 before committing. SVG degrades at 500 nodes; canvas handles ~5k; WebGL (Reagraph) handles ~10k. Recovery cost if wrong: HIGH (full library rewrite).

2. **Unbounded Cypher query results crashing the browser** — Inject a `LIMIT 500` cap in the query execution layer (`api/query.ts`) before any result reaches the visualization layer. Show "Showing 500 of N nodes" banner whenever the cap fires. This must be in place before the graph canvas renders anything. Recovery cost if missing: LOW (add one injection point), but the user experience is catastrophic until fixed.

3. **Force simulation positions stored in React state** — Keep node x/y positions in refs, not React state. Storing positions in state causes 60 rerenders per second during simulation, making the UI unresponsive. Separate data (which nodes exist, in state) from layout (where nodes are positioned, in refs). React DevTools profiler is the verification tool. Recovery cost: HIGH (requires refactoring all graph interaction code).

4. **Editor or graph library in the main bundle** — Both CodeMirror/Cypher extension and react-force-graph must be loaded via React.lazy() behind route-based code splitting. The landing page (seen first by evaluators) must be pure Tailwind markup with no heavy imports. Initial bundle target: under 500KB. Recovery cost: MEDIUM (adding lazy boundaries after the fact requires testing all Suspense fallbacks).

5. **User input interpolated into Cypher strings** — Any filter, search, or property value input must use parameterized queries. No string concatenation of user input into Cypher anywhere in the codebase. Labels and rel-types that cannot be parameterized must be validated against an allowlist from the schema response. This is the Cypher injection vector (CVE-2024-8309 class). Establish this pattern in Phase 2 before any filter UI is built.

## Implications for Roadmap

Based on combined research, four phases are suggested. Phase 1 is the non-negotiable foundation where all performance and correctness pitfalls must be addressed. Phase 2 delivers the interactive core product. Phase 3 adds operational features. Phase 4 delivers the evaluation experience and differentiators.

### Phase 1: Foundation and Graph Visualization Core

**Rationale:** Architecture, API layer, state management, and the graph canvas are prerequisites for everything else. All four critical rendering and performance pitfalls (SVG choice, unbounded results, force simulation state, bundle splitting) must be resolved here. Nothing built on top of a wrong foundation is recoverable cheaply.

**Delivers:** Running SPA with project scaffold, API client layer, Zustand stores, TanStack Query hooks, working graph canvas rendering query results with proper state management, result cap enforced, lazy loading in place, dark mode working across all surfaces (including the canvas).

**Addresses from FEATURES.md:** Force-directed graph visualization, toggle between graph and table view, node/edge property inspection side panel, connection configuration, health/status indicator, dark mode.

**Avoids from PITFALLS.md:** SVG renderer trap, unbounded query results, force simulation positions in React state, Monaco in main bundle, dark mode CSS variable conflicts with graph canvas, hardcoded server URL.

**Research flag:** Standard patterns. Vite scaffold + TanStack setup is well-documented. react-force-graph integration has known patterns. The 1k-node benchmark is the only non-standard validation step.

### Phase 2: Cypher Editor and Query Workflow

**Rationale:** The query editor is the primary user interface. It depends on the API layer and state management from Phase 1 but is otherwise independent of graph rendering complexity. Building it second keeps Phase 1 focused on visualization correctness. The security pattern (parameterized queries) must be established here before any filter UI is constructed.

**Delivers:** Full Cypher editor with syntax highlighting, schema-aware autocomplete (once /schema is available from backend), query history persisted to localStorage (with cap and QuotaExceededError handling), saved/bookmarked queries, keyboard shortcuts (Ctrl+Enter to run, Ctrl+Up/Down for history), export results as JSON and CSV, CORS proxy configured for development.

**Addresses from FEATURES.md:** Cypher editor, schema-aware autocomplete, query history, saved queries, export results.

**Avoids from PITFALLS.md:** Cypher injection (parameterized query pattern established here), CORS misconfiguration (Vite proxy configured here), localStorage quota errors (cap at 100 entries, try/catch on all writes), node label crowding (label visibility strategy established here).

**Research flag:** @neo4j-cypher/react-codemirror@next is the `next` tag package — verify the exact setup process against npm at implementation time. The package is actively maintained by Neo4j but is pre-1.0 versioned.

### Phase 3: Admin Dashboard and Data Management

**Rationale:** Admin and data management features depend on the API layer and schema browser from earlier phases, but are independent of each other and can be built in parallel. The shared metrics poller pattern (one poller, not one per widget) must be established before any individual widget is built. Import UI must have file size limits designed before file upload is implemented.

**Delivers:** Schema browser (labels, rel-types, property keys from GET /schema with manual refresh), admin metrics dashboard (node/edge count, storage size, query latency via GET /metrics with 15-second shared poller, paused on hidden tab), database health monitoring, import UI (CSV/JSON with 50MB size guard and streaming upload), export UI, index management UI (list and create via schema endpoints).

**Addresses from FEATURES.md:** Database schema browser, admin dashboard, import/export UI, index management UI.

**Avoids from PITFALLS.md:** Stale schema browser (manual refresh button, TTL cache, refresh after import), aggressive metrics polling (single shared poller, 15s interval, Page Visibility API pause), large file import crash (ReadableStream upload, 50MB limit with user-facing error).

**Research flag:** Standard patterns for metrics dashboards and file upload. Schema browser design depends on the exact shape of the GET /schema response from OpenGraphDB's backend. Validate schema response format before building the browser component.

### Phase 4: Landing Page, Playground, and Differentiators

**Rationale:** The evaluation experience (landing page + playground) requires a stable core product to link to. These features are entirely additive. They share no state with the query or admin surfaces except the connection configuration. Building last means the playground can link to a real, working query interface rather than a demo stub.

**Delivers:** Landing/demo page with hero section, feature highlight grid, and getting-started code snippets; playground with pre-loaded sample graph (movies or social network dataset, bundled as static JSON) and step-by-step guided queries; query execution plan viewer (EXPLAIN/PROFILE response rendering); node expansion via click (right-click or double-click sends neighborhood query); clickable schema diagram (schema rendered as mini force graph); query parameters panel ($param key-value editor).

**Addresses from FEATURES.md:** Landing/demo page, playground with guided queries (v1 differentiators), query plan viewer, node expansion (v1.x features), clickable schema diagram, query parameters panel.

**Avoids from PITFALLS.md:** Layout thrash on node expansion (pin existing node positions before adding neighbors; use alphaDecay management).

**Research flag:** Node expansion and layout-pinning strategy may need a research pass. The specific react-force-graph APIs for node pinning (`fx`, `fy` properties, alpha management) should be verified against the library's current GitHub documentation before implementation. The playground sample dataset selection is a product decision that needs validation.

### Phase Ordering Rationale

- Phase 1 first because four out of five critical pitfalls from PITFALLS.md are Phase 1 issues. Getting the rendering backend and state management wrong creates expensive rewrites; getting them right is straightforward with the documented patterns.
- Phase 2 second because the query editor is the product's primary surface and its localStorage and security patterns must be in place before any Phase 3 or Phase 4 features introduce user-controlled inputs.
- Phase 3 third because admin and schema features depend on the API layer from Phase 1 and the schema data that Phase 2 autocomplete also uses. The metrics poller is a shared resource that should be established before individual dashboard widgets are built.
- Phase 4 last because the playground and landing page are most compelling when they link to a real, stable product. Query plan viewer and node expansion build on the graph canvas from Phase 1 and the query execution layer from Phase 2.
- Admin features in Phase 3 are parallelizable internally (schema browser, metrics panel, import/export, and index manager are independent of each other).

### Research Flags

Needs deeper research during planning:
- **Phase 2:** `@neo4j-cypher/react-codemirror@next` setup and configuration. The `next` tag is pre-1.0 and documentation may lag behind the npm package. Verify exact peer dependency requirements and CodeMirror 6 version compatibility at implementation time.
- **Phase 3:** OpenGraphDB's GET /schema response shape. The schema browser, autocomplete provider, and clickable schema diagram all depend on a stable schema API response format. The backend spec must be confirmed before these features are built.
- **Phase 4:** react-force-graph node pinning API for incremental expansion. The `fx`/`fy` pinning pattern is documented in GitHub issues rather than official docs. Verify against the current library version before implementing expand-neighbors.

Standard patterns (can skip research-phase):
- **Phase 1:** Vite + React + TanStack Router/Query + Zustand scaffold. Extremely well-documented with official docs. react-force-graph-2d canvas setup is documented in the library README.
- **Phase 3:** Recharts admin metrics charts. Composable SVG charts with standard React patterns; official docs are comprehensive.
- **Phase 4:** Landing page and playground. Pure React + Tailwind markup with bundled static JSON dataset. No novel integration required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified against npm registry on 2026-03-01. Compatibility matrix (React 19, Tailwind v4, shadcn/ui 3.8.5) confirmed against official docs. One flag: @neo4j-cypher/react-codemirror@next is pre-1.0. |
| Features | HIGH | Based on direct documentation and GitHub review of Neo4j Browser, Memgraph Lab, ArangoDB Web UI, TigerGraph GraphStudio, G.V(). Feature table stakes are consistent across all reviewed products. |
| Architecture | HIGH (React patterns) / MEDIUM (graph-DB-specific) | Standard React SPA patterns are extremely well-documented. Graph-DB-specific patterns (force simulation state management, schema browser refresh) are sourced from community and GitHub issues rather than official documentation. |
| Pitfalls | HIGH (critical/performance) / MEDIUM (UX/integration) | Critical pitfalls are verified via GitHub issues, academic benchmarks, and CVE documentation. UX and integration pitfalls are sourced from community articles. |

**Overall confidence:** HIGH

### Gaps to Address

- **Tailwind v3 vs v4 conflict:** Global CLAUDE.md specifies Tailwind v3; STACK.md recommends v4 for new installs with shadcn/ui. This must be resolved as a first decision before scaffolding. If v3 is required, verify shadcn/ui compatibility and document the override.
- **GET /schema response format:** The exact JSON structure from OpenGraphDB's backend is not specified in this research. The schema browser, autocomplete, clickable schema diagram, and index manager all depend on it. Confirm the response shape before Phase 3 implementation.
- **EXPLAIN/PROFILE response format:** The query execution plan viewer (Phase 4) depends on the backend returning structured plan data for EXPLAIN/PROFILE-prefixed queries. Confirm the response format before building the plan renderer.
- **Sample dataset for playground:** The playground requires a curated dataset (suggested: movies graph, social network). The actual dataset selection and the Cypher query guide are product decisions not resolved by this research. Needs a brief content review pass before Phase 4.
- **Backend CORS configuration:** OpenGraphDB's HTTP server must be configured with explicit CORS headers for both the Vite dev server origin (localhost:5173) and any production deployment origin. This is a backend requirement that must be coordinated; the frontend's Vite proxy only covers development.

## Sources

### Primary (HIGH confidence)
- npm registry live queries (2026-03-01): all package versions in STACK.md
- shadcn/ui Tailwind v4 docs (ui.shadcn.com/docs/tailwind-v4): React 19 + Tailwind v4 compatibility
- TanStack Router official docs (tanstack.com/router): SPA mode, type safety
- TanStack Query v5 official docs (tanstack.com/query): Suspense support, mutation API
- react-force-graph GitHub (github.com/vasturiano/react-force-graph): Features, renderer options, performance issues
- Reagraph official docs (reagraph.dev): WebGL rendering alternative
- @neo4j-cypher/react-codemirror npm (npmjs.com): Version confirmation, `next` vs `latest` tag
- Neo4j Browser documentation (neo4j.com/docs/browser-manual): Feature reference
- Memgraph Lab features (memgraph.com/docs/memgraph-lab): Feature reference
- Neo4j Knowledge Base: Cypher injection protection
- CVE-2024-8309 (Keysight): Cypher injection via LangChain GraphCypherQAChain
- Graph visualization rendering performance (IMLD Academic Paper): SVG/Canvas/WebGL thresholds

### Secondary (MEDIUM confidence)
- TanStack Router vs React Router v7 comparison (Medium, Jan 2026): Routing decision
- Zustand + TanStack Query pattern (DEV Community): State management split
- Cylynx JS graph library comparison: Visualization library selection
- Sourcegraph Monaco to CodeMirror migration: Bundle size comparison
- React feature-based folder structure (Robin Wieruch): Project structure rationale
- Cambridge Intelligence: Graph visualization UX pitfalls, hairball problem, large graph rendering
- SVG Genie Benchmark (2025): SVG vs Canvas vs WebGL rendering thresholds
- Neo4j cypher-editor GitHub (github.com/neo4j/cypher-editor): Package deprecation confirmation

### Tertiary (LOW confidence)
- neo4j/cypher-language-support GitHub: Marked early-stage and not recommended for production use
- react-force-graph GitHub Issues #223, #226: Performance at 12k+ elements, rerender on node color change (issues, not official benchmarks)

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
