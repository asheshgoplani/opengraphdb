# Architecture Research

**Domain:** Graph database frontend SPA (React + TypeScript)
**Researched:** 2026-03-01
**Confidence:** HIGH (React patterns), MEDIUM (graph-DB-specific patterns)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser SPA                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Query Page  │  │  Admin Page  │  │  Landing/Demo Page   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐  │
│  │                    Feature Components                      │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │CypherEditor│  │ GraphCanvas  │  │  PropertyPanel   │   │  │
│  │  └────────────┘  └──────────────┘  └──────────────────┘   │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │ResultsTable│  │ AdminMetrics │  │  SchemaExplorer  │   │  │
│  │  └────────────┘  └──────────────┘  └──────────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     State Layer                           │   │
│  │  ┌──────────────────┐     ┌─────────────────────────┐   │   │
│  │  │ Zustand (client) │     │ TanStack Query (server) │   │   │
│  │  │  graph selection │     │  /query, /health,       │   │   │
│  │  │  UI preferences  │     │  /metrics, /schema      │   │   │
│  │  │  editor state    │     │  /import, /export       │   │   │
│  │  └──────────────────┘     └─────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     API Client Layer                      │   │
│  │         Typed HTTP client (fetch-based, no lib)          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                               │ HTTP REST
                               ▼
                  ┌────────────────────────┐
                  │   OpenGraphDB Server   │
                  │   localhost:8080       │
                  │                        │
                  │  POST /query           │
                  │  GET  /health          │
                  │  GET  /metrics         │
                  │  GET  /schema          │
                  │  POST /import          │
                  │  POST /export          │
                  └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Router | Route-to-page mapping, code splitting per route | React Router v6 with lazy() |
| CypherEditor | Syntax-highlighted Cypher input, history, autocomplete | CodeMirror 6 + @neo4j-cypher/react-codemirror |
| GraphCanvas | Force-directed 2D node/edge rendering, pan/zoom/click/drag | react-force-graph-2d or Reagraph (WebGL) |
| PropertyPanel | Displays selected node/edge properties in sidebar | Shadcn/ui Sheet or aside panel |
| ResultsTable | Tabular fallback view of query results | Shadcn/ui Table |
| QueryHistoryPanel | Persisted list of past queries with re-run | Zustand slice, localStorage backup |
| AdminMetrics | Health status, metric charts, server info | Shadcn/ui cards + lightweight chart lib |
| SchemaExplorer | Browsable list of node labels, edge types, property keys | Read-only tree/list from /schema |
| ImportExportPanel | File upload for CSV/JSON import, download trigger | HTML file input + fetch POST |
| IndexManager | List existing indexes, form to create new | Table + modal form |
| LandingHero | Marketing/demo landing with feature highlights | Static markup + Tailwind |
| Playground | Pre-loaded sample graph with guided query prompts | Static sample data + CypherEditor |

## Recommended Project Structure

```
src/
├── api/                    # All HTTP client code — one file per resource
│   ├── client.ts           # Base fetch wrapper, server URL config, error normalization
│   ├── query.ts            # POST /query — execute Cypher, parse graph result
│   ├── health.ts           # GET /health
│   ├── metrics.ts          # GET /metrics
│   ├── schema.ts           # GET /schema
│   ├── import.ts           # POST /import
│   └── export.ts           # POST /export
│
├── features/               # Feature-scoped components, hooks, types
│   ├── editor/             # Cypher editor feature
│   │   ├── CypherEditor.tsx
│   │   ├── useQueryHistory.ts
│   │   └── types.ts
│   ├── graph/              # Graph canvas and interaction
│   │   ├── GraphCanvas.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── useGraphSelection.ts
│   │   ├── graphTransform.ts   # API result → graph lib data format
│   │   └── types.ts
│   ├── results/            # Table view and export
│   │   ├── ResultsTable.tsx
│   │   ├── ExportButton.tsx
│   │   └── types.ts
│   ├── admin/              # Admin dashboard feature
│   │   ├── MetricsPanel.tsx
│   │   ├── HealthBadge.tsx
│   │   ├── SchemaExplorer.tsx
│   │   ├── IndexManager.tsx
│   │   ├── ImportExportPanel.tsx
│   │   └── types.ts
│   └── demo/               # Landing and playground
│       ├── LandingHero.tsx
│       ├── Playground.tsx
│       └── sampleData.ts
│
├── pages/                  # Route-level page shells (thin wrappers)
│   ├── QueryPage.tsx       # Assembles editor + canvas + results
│   ├── AdminPage.tsx       # Assembles admin feature components
│   └── LandingPage.tsx     # Landing + playground
│
├── store/                  # Zustand stores for client state
│   ├── graphStore.ts       # Selected nodes/edges, layout state
│   ├── editorStore.ts      # Query text, history list, saved queries
│   └── settingsStore.ts    # Server URL, theme preference
│
├── hooks/                  # Cross-feature hooks
│   ├── useExecuteQuery.ts  # TanStack Query mutation for POST /query
│   ├── useHealth.ts        # TanStack Query for GET /health
│   ├── useMetrics.ts       # TanStack Query for GET /metrics
│   └── useSchema.ts        # TanStack Query for GET /schema
│
├── components/             # Truly shared, presentational components
│   ├── Layout.tsx          # Shell with sidebar nav and topbar
│   ├── Sidebar.tsx
│   └── ThemeToggle.tsx
│
├── lib/                    # Non-React utilities
│   ├── utils.ts            # cn() helper for Tailwind class merging
│   └── config.ts           # Runtime config (server URL from env/localStorage)
│
├── router.tsx              # Route definitions with lazy imports
├── main.tsx                # React entry point, providers
└── index.css               # Tailwind base imports
```

### Structure Rationale

- **api/:** All network calls in one place. No component ever calls fetch directly. This is the only place server URL configuration and error normalization live. Replacing or mocking the backend only requires changing this folder.
- **features/:** Feature co-location. The graph feature owns its canvas, selection hook, and data transform. The editor feature owns its history. Moving a feature means moving one folder.
- **pages/:** Thin page shells assemble features. They own layout decisions (split pane, full-width) but contain no business logic.
- **store/:** Zustand for client-only state. Graph selection, editor text, and settings never touch the server — they live here.
- **hooks/:** TanStack Query hooks centralize server state: caching, staleness, background refetch, error handling. One hook per API endpoint.

## Architectural Patterns

### Pattern 1: Server State via TanStack Query, Client State via Zustand

**What:** Use two distinct state mechanisms. TanStack Query handles all data that originates from the server (query results, health, metrics, schema). Zustand handles all purely client state (which node is selected, what text is in the editor, user preferences).

**When to use:** Always — this is the baseline pattern for the entire app.

**Trade-offs:** Requires discipline to assign state to the right bucket. Benefit is that server state gets caching, background refetch, and optimistic updates for free without custom logic.

**Example:**
```typescript
// Server state — TanStack Query
function useExecuteQuery() {
  return useMutation({
    mutationFn: (cypher: string) => api.query.execute(cypher),
  });
}

// Client state — Zustand
const useGraphStore = create<GraphState>((set) => ({
  selectedNodeId: null,
  selectNode: (id: string | null) => set({ selectedNodeId: id }),
}));
```

### Pattern 2: API Layer Isolation

**What:** All HTTP calls go through typed functions in `src/api/`. Components and hooks import from api/, never construct fetch calls themselves. The API layer normalizes errors and parses responses to typed structures.

**When to use:** From day one. Prevents server URL, error handling, and response parsing logic from spreading into components.

**Trade-offs:** Slightly more boilerplate than calling fetch inline. Benefit is that changing the server API contract requires only api/ changes — page components stay untouched.

**Example:**
```typescript
// src/api/query.ts
export async function executeQuery(cypher: string): Promise<GraphResult> {
  const res = await fetch(`${getServerUrl()}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: cypher }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return parseGraphResult(await res.json());
}
```

### Pattern 3: Result Transform at the API Boundary

**What:** Convert raw API response into a graph-library-specific format at the api/ or feature/graph/ boundary. The GraphCanvas component receives normalized `{ nodes, edges }` — never raw JSON from the server.

**When to use:** Immediately — the backend response schema and the visualization library's schema will never be identical.

**Trade-offs:** Adds a transform step. Benefit is that switching graph libraries (react-force-graph to Reagraph) only requires changing `graphTransform.ts`, not all components consuming graph data.

**Example:**
```typescript
// features/graph/graphTransform.ts
export function toGraphLibFormat(result: GraphResult): GraphData {
  return {
    nodes: result.nodes.map(n => ({ id: n.id, label: n.labels[0], ...n.properties })),
    links: result.edges.map(e => ({ source: e.from, target: e.to, type: e.type })),
  };
}
```

### Pattern 4: Route-Based Code Splitting

**What:** Each page (`QueryPage`, `AdminPage`, `LandingPage`) is imported with React's `lazy()`. The graph visualization library (heavy) and the Cypher editor (heavy) are both loaded only when their route is visited.

**When to use:** From day one. CodeMirror 6 and a graph rendering library together add significant bundle weight.

**Trade-offs:** Adds `<Suspense>` wrapper at router level. Benefit is fast initial load for landing/demo page which most evaluators see first.

**Example:**
```typescript
// router.tsx
const QueryPage = lazy(() => import('./pages/QueryPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/query', element: <Suspense fallback={<Spinner />}><QueryPage /></Suspense> },
  { path: '/admin', element: <Suspense fallback={<Spinner />}><AdminPage /></Suspense> },
]);
```

## Data Flow

### Query Execution Flow

```
[User types Cypher in CypherEditor]
         ↓
[Submit triggers useExecuteQuery mutation]
         ↓
[api/query.ts: POST /query → raw JSON response]
         ↓
[parseGraphResult: raw JSON → typed GraphResult]
         ↓
[toGraphLibFormat: GraphResult → { nodes, links }]
         ↓
         ├── [GraphCanvas: renders force-directed graph]
         └── [ResultsTable: renders tabular view]
                  ↓
         [User clicks node in GraphCanvas]
                  ↓
         [graphStore.selectNode(id)]
                  ↓
         [PropertyPanel: reads selectedNodeId from store, shows properties]
```

### Settings and Configuration Flow

```
[User sets server URL in settings]
         ↓
[settingsStore: persists to localStorage]
         ↓
[api/client.ts: getServerUrl() reads from store/localStorage]
         ↓
[All subsequent API calls use new URL]
```

### Admin Data Flow

```
[AdminPage mounts]
         ↓
[useHealth(), useMetrics(), useSchema() — TanStack Query auto-fetches]
         ↓
[Cached responses rendered in MetricsPanel, HealthBadge, SchemaExplorer]
         ↓
[TanStack Query background refetch on window focus]
```

### State Management Summary

```
[Zustand Store]                          [TanStack Query Cache]
   selectedNodeId                            /query results
   editorText                                /health response
   queryHistory[]                            /metrics response
   savedQueries[]                            /schema response
   serverUrl
   theme
         ↓                                         ↓
[Components subscribe via hooks]      [Components consume via useQuery/useMutation]
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single developer, prototype | Single Zustand store, no splitting needed. Feature folders optional. |
| Small team, stable features | Feature folder structure as described. Route-based code splitting from the start. |
| Multiple teams, many features | Full feature isolation: each feature exports only a public surface. Barrel exports to enforce boundaries. |

### Scaling Priorities

1. **First bottleneck: graph rendering performance.** SVG and HTML Canvas renderers degrade at ~10,000 nodes. Switch from react-force-graph (Canvas) to Reagraph (WebGL) if larger graphs become a use case. The `graphTransform.ts` boundary makes this swap cheap.
2. **Second bottleneck: editor bundle size.** Monaco Editor is 5-10 MB uncompressed. CodeMirror 6 is ~300 KB. Start with CodeMirror + @neo4j-cypher/react-codemirror. Only switch to Monaco if richer IDE features are demanded.

## Anti-Patterns

### Anti-Pattern 1: Direct Fetch in Components

**What people do:** Write `fetch('/query', ...)` inside a `useEffect` inside a page component.
**Why it's wrong:** Server URL, error handling, and response parsing spread across every component. Changing the API contract requires hunting all call sites.
**Do this instead:** Route all network calls through `src/api/`. Components import typed functions.

### Anti-Pattern 2: Global Redux / Single Giant Store

**What people do:** Put everything — selected node, query results, health data, schema — in a single Redux store with reducers.
**Why it's wrong:** Graph result cache, background refetch, and staleness logic must be re-implemented manually. Redux is overkill for a tool with limited team collaboration needs.
**Do this instead:** TanStack Query for server state. Zustand only for client state. Neither needs Redux.

### Anti-Pattern 3: Embedding the Graph Library in a Page Component

**What people do:** Import react-force-graph directly into `QueryPage.tsx` and pass raw API response props.
**Why it's wrong:** QueryPage becomes tightly coupled to one library's prop contract. Swapping the visualization library requires rewriting the page.
**Do this instead:** Wrap the graph library in `GraphCanvas.tsx` (feature boundary). The page passes normalized `{ nodes, edges }` — not library-specific data. `graphTransform.ts` owns the conversion.

### Anti-Pattern 4: Loading Heavy Libraries on the Landing Route

**What people do:** No code splitting — the full SPA bundle (editor + graph lib) loads on the landing/demo page.
**Why it's wrong:** Evaluators and first-time visitors see the landing page first. A 5-10 MB synchronous bundle is a poor first impression.
**Do this instead:** Route-based code splitting. Landing page is pure Tailwind markup with no heavy imports. Editor and graph libraries load only when `/query` is visited.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenGraphDB HTTP API | Typed fetch functions in `src/api/` | One function per endpoint. Server URL configurable at runtime via settingsStore. |
| Browser localStorage | Via Zustand persist middleware | Persists server URL, theme, query history, saved queries. No external service needed. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| pages/ → features/ | React component composition (import and render) | Pages assemble feature components. No business logic in pages. |
| features/ → api/ | Direct import of typed api functions into hooks | Hooks live at features/ or hooks/. Components do not call api/ directly. |
| features/ → store/ | Zustand hooks (`useGraphStore`, `useEditorStore`) | Cross-feature reads/writes go through the store, not prop drilling. |
| GraphCanvas ↔ PropertyPanel | Zustand shared store (selectedNodeId) | GraphCanvas writes selection; PropertyPanel reads it. No prop chain. |
| api/ → server | HTTP fetch | Only outbound boundary. All inbound is via polling (TanStack Query) not push. |

## Build Order Implications

Build order is driven by dependency direction: nothing upstream should block something downstream.

1. **Foundation (no dependencies):** `src/api/` + `src/lib/` + `src/store/`. These have zero React component dependencies. Build and test independently. API layer can be exercised against a running OpenGraphDB instance before any UI exists.

2. **Hooks layer (depends on api/ and store/):** `src/hooks/`. All TanStack Query hooks. Testable with mocked api/ functions.

3. **Feature components (depend on hooks and store/):** Build features in dependency order:
   - `features/editor/` first — pure input component, no visualization dependency
   - `features/results/` second — table view, no graph library dependency
   - `features/graph/` third — depends on graphTransform, graph library
   - `features/admin/` independently — depends only on hooks/useHealth, useMetrics, useSchema
   - `features/demo/` independently — mostly static, uses sample data

4. **Pages (depend on all feature components):** `src/pages/`. Thin assembly shells. Build last.

5. **Router + Entry (depend on pages):** `src/router.tsx` + `src/main.tsx`. Wire everything together.

This order means admin dashboard features can be built in parallel with graph visualization features — they share only the api/ and store/ layers.

## Sources

- [Neo4j Browser Architecture (DeepWiki)](https://deepwiki.com/neo4j/neo4j-browser) — MEDIUM confidence (third-party analysis of Neo4j Browser codebase)
- [AWS Graph Explorer (GitHub)](https://github.com/aws/graph-explorer) — MEDIUM confidence (real production graph DB frontend for reference)
- [react-force-graph (GitHub)](https://github.com/vasturiano/react-force-graph) — HIGH confidence (official library repo)
- [Reagraph WebGL Graph for React](https://reagraph.dev/) — HIGH confidence (official docs)
- [TanStack Query docs](https://tanstack.com/query/latest) — HIGH confidence (official docs)
- [Zustand + TanStack Query pattern (DEV Community)](https://dev.to/martinrojas/federated-state-done-right-zustand-tanstack-query-and-the-patterns-that-actually-work-27c0) — MEDIUM confidence (community article)
- [@neo4j-cypher/react-codemirror (npm)](https://www.npmjs.com/package/@neo4j-cypher/react-codemirror) — HIGH confidence (official Neo4j package)
- [Graph visualization rendering performance study (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12061801/) — HIGH confidence (peer-reviewed paper)
- [React feature-based folder structure (Robin Wieruch)](https://www.robinwieruch.de/react-folder-structure/) — MEDIUM confidence (widely cited community best practice)
- [React SPA code splitting with Vite (DEV Community)](https://dev.to/seyedahmaddv/how-to-build-a-faster-single-page-application-spa-using-vite-and-react-1i58) — MEDIUM confidence

---
*Architecture research for: OpenGraphDB Frontend SPA*
*Researched: 2026-03-01*
