# Phase 1: Foundation and Graph Visualization - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold a React + TypeScript + Vite SPA with Tailwind + shadcn/ui. Wire it to OpenGraphDB's HTTP REST API with a typed client layer. Deliver an interactive force-directed graph canvas with node/edge property inspection, graph/table view toggle, result capping, dark mode, and responsive layout. A simple query input (textarea, not full Cypher editor) provides basic query execution capability until Phase 2 replaces it.

</domain>

<decisions>
## Implementation Decisions

### Graph canvas layout
- Neo4j Browser inspired layout: primary workspace is a large graph canvas occupying the main content area
- Split panel design: simple query input (textarea) at top, graph canvas fills remaining space below
- Side panel slides in from the right when a node or edge is selected (shadcn Sheet component)
- Table view replaces the graph canvas area when toggled (not side-by-side)
- Empty state: centered message in canvas area with "Run a query to see results" prompt and example query suggestion

### Connection and query UX
- Server URL configured via a settings dialog accessible from a toolbar/header icon (gear icon)
- Default server URL: `http://localhost:8080` pre-filled
- Connection status shown as a colored dot in the header (green = connected, red = disconnected, amber = connecting)
- Health check polls GET /health on configurable interval (5 seconds)
- Simple textarea for query input in Phase 1 (not CodeMirror); Phase 2 replaces this with the full Cypher editor
- "Run" button next to textarea, plus Ctrl+Enter shortcut
- On query error: inline error message below the textarea with the error text from the backend response

### Property panel behavior
- Click to select (not hover): clicking a node or edge in the graph opens the side panel with properties
- Side panel is a right-anchored slide-in panel (shadcn Sheet)
- Panel shows: element type (node/edge), all properties as key-value pairs, label(s) for nodes, relationship type for edges
- Clicking canvas background or pressing Escape closes the panel
- Panel width: ~320px, does not resize the graph canvas (overlays it)

### Color and theming
- Auto-assigned color palette: a predefined set of 12 distinct colors cycled by node label
- Palette works in both light and dark mode (sufficient contrast in both)
- Dark mode: dark gray canvas background (#1a1a2e or similar), light-colored node labels, subtle node borders
- Light mode: white/near-white canvas background, dark node labels
- Edge lines: muted gray in both modes, with subtle directional arrows
- Theme toggle in the header toolbar (sun/moon icon), respects system preference on first load, persists choice to localStorage
- Overall aesthetic: clean, developer-focused, similar to Linear or Vercel dashboard feel

### Claude's Discretion
- Exact spacing, typography scale, and component sizing
- Loading skeleton designs and spinner placement
- Error boundary handling and fallback UI
- Exact force simulation parameters (charge strength, link distance, alpha decay)
- Vite dev server proxy configuration details
- Exact responsive breakpoints for tablet adaptation

</decisions>

<specifics>
## Specific Ideas

- Graph canvas should feel like Neo4j Browser: the graph is the star, not a sidebar widget
- Health status indicator modeled after database connection dots in tools like TablePlus or DBeaver
- Table view should use TanStack Table with shadcn/ui table styling for consistency
- Result cap should show a banner like "Showing 500 of 2,341 results" when the limit fires, with option to increase
- Node labels should be visible on the graph canvas (not just on hover), truncated if too long
- Edge labels (relationship types) shown along the edge line, readable at default zoom

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None: greenfield frontend project, no existing frontend code

### Established Patterns
- Backend API: HTTP REST at localhost:8080 with endpoints POST /query, GET /health, GET /metrics, GET /schema
- Backend is Rust-based (crates/ directory); frontend is an independent SPA

### Integration Points
- Frontend connects to backend exclusively via HTTP REST
- Frontend will be served as a standalone static SPA (any static file server)
- Future: may be served directly by OpenGraphDB's HTTP server
- Vite dev server will need a proxy to backend API to avoid CORS during development

</code_context>

<deferred>
## Deferred Ideas

- Full Cypher editor with syntax highlighting and autocomplete (Phase 2)
- Schema browser sidebar (Phase 3)
- Landing page and playground (Phase 4)
- Admin dashboard metrics charts (v2)
- Import/export UI (v2)
- Node expansion via double-click (v2)

</deferred>

---

*Phase: 01-foundation-and-graph-visualization*
*Context gathered: 2026-03-01*
