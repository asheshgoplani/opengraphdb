# Phase 1: Foundation and Graph Visualization - Research

**Researched:** 2026-03-01
**Domain:** React SPA with force-directed graph visualization
**Confidence:** HIGH

## Summary

Phase 1 builds a greenfield React + TypeScript SPA that connects to OpenGraphDB's HTTP REST API and renders query results as an interactive force-directed graph. The tech stack is well-established: Vite for build tooling, Tailwind CSS v3 with shadcn/ui for styling, react-force-graph-2d for the canvas-based graph, Zustand for client state, and TanStack Query for server state. All libraries are mature, actively maintained, and widely used together.

The primary technical challenge is integrating a canvas-based graph renderer (react-force-graph-2d) with a DOM-based UI framework (React + shadcn/ui) while maintaining dark mode consistency across both rendering surfaces. The canvas does not inherit CSS variables, so theme colors must be passed explicitly to canvas drawing callbacks.

**Primary recommendation:** Use Tailwind CSS v3.4.x with shadcn@2.3.0 (the v3-compatible CLI version). Use react-force-graph-2d with custom `nodeCanvasObject` for labeled, colored nodes. Keep the initial route structure minimal and use React.lazy for future code-splitting readiness.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Neo4j Browser inspired layout: primary workspace is a large graph canvas occupying the main content area
- Split panel design: simple query input (textarea) at top, graph canvas fills remaining space below
- Side panel slides in from the right when a node or edge is selected (shadcn Sheet component)
- Table view replaces the graph canvas area when toggled (not side-by-side)
- Empty state: centered message in canvas area with "Run a query to see results" prompt and example query suggestion
- Server URL configured via a settings dialog accessible from a toolbar/header icon (gear icon)
- Default server URL: `http://localhost:8080` pre-filled
- Connection status shown as a colored dot in the header (green = connected, red = disconnected, amber = connecting)
- Health check polls GET /health on configurable interval (5 seconds)
- Simple textarea for query input in Phase 1 (not CodeMirror); Phase 2 replaces this with the full Cypher editor
- "Run" button next to textarea, plus Ctrl+Enter shortcut
- On query error: inline error message below the textarea with the error text from the backend response
- Click to select (not hover): clicking a node or edge in the graph opens the side panel with properties
- Side panel is a right-anchored slide-in panel (shadcn Sheet)
- Panel shows: element type (node/edge), all properties as key-value pairs, label(s) for nodes, relationship type for edges
- Clicking canvas background or pressing Escape closes the panel
- Panel width: ~320px, does not resize the graph canvas (overlays it)
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

### Deferred Ideas (OUT OF SCOPE)
- Full Cypher editor with syntax highlighting and autocomplete (Phase 2)
- Schema browser sidebar (Phase 3)
- Landing page and playground (Phase 4)
- Admin dashboard metrics charts (v2)
- Import/export UI (v2)
- Node expansion via double-click (v2)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Application scaffolded with React + TypeScript + Vite + Tailwind + shadcn/ui | Standard Stack section covers exact versions and setup commands |
| FOUND-02 | Route-based code splitting delivers initial bundle under 500KB | Architecture Patterns covers React.lazy + Vite manualChunks strategy |
| FOUND-03 | Dark mode works across all surfaces including graph canvas | Code Examples section covers CSS variable bridging to canvas |
| FOUND-04 | Responsive layout works on desktop and tablet viewports | Tailwind responsive utilities; graph canvas auto-resizes via container queries |
| FOUND-05 | Configurable server URL for backend connection (default localhost:8080) | Zustand persisted store pattern; Vite proxy config |
| FOUND-06 | Typed API client layer isolates all HTTP calls to backend REST endpoints | Architecture Patterns covers typed fetch wrapper pattern |
| GRAPH-01 | Force-directed graph with nodes as labeled circles colored by label | react-force-graph-2d nodeCanvasObject with custom painting |
| GRAPH-02 | Edges as directional lines labeled by relationship type | react-force-graph-2d linkDirectionalArrowLength + linkCanvasObjectMode |
| GRAPH-03 | Click node to inspect properties in side panel | onNodeClick callback + shadcn Sheet |
| GRAPH-04 | Click edge to inspect properties in side panel | onLinkClick callback + shadcn Sheet |
| GRAPH-05 | Drag nodes to reposition | Built-in enableNodeDrag prop (default enabled) |
| GRAPH-06 | Scroll to zoom | Built-in enableZoomInteraction prop (default enabled) |
| GRAPH-07 | Toggle between graph view and table view | Client state toggle in Zustand; TanStack Table for table view |
| GRAPH-08 | Result set capped with configurable LIMIT | Query wrapper adds LIMIT clause; banner shows truncation info |
| SCHEMA-02 | Database connection health status indicator | TanStack Query polling with refetchInterval on GET /health |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3 | UI framework | Stable, widely supported; React 19 too new for shadcn v3 compat |
| react-dom | ^18.3 | DOM rendering | Paired with React 18 |
| typescript | ^5.5 | Type safety | Required by all typed dependencies |
| vite | ^6.x | Build tool + dev server | Fast HMR, native ESM, tree-shaking, proxy support |
| tailwindcss | ^3.4.19 | Utility-first CSS | Global CLAUDE.md mandates v3; shadcn@2.3.0 supports v3 |
| react-force-graph-2d | ^1.29.1 | Force-directed graph canvas | Canvas-based, 67K weekly downloads, active maintenance |
| @tanstack/react-query | ^5.90 | Server state (API data) | Caching, polling, background refetch for health/query |
| zustand | ^5.0 | Client state (UI, settings) | Minimal API, no boilerplate, middleware for persistence |
| react-router-dom | ^7.13 | Client-side routing | Standard SPA routing with lazy route support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-table | ^8.21 | Headless table logic | Table view of query results (GRAPH-07) |
| lucide-react | ^0.575 | Icon set | Sun/moon toggle, gear icon, connection status icons |
| clsx | ^2.1 | Conditional class names | shadcn/ui cn() utility dependency |
| tailwind-merge | ^3.5 | Tailwind class merging | shadcn/ui cn() utility dependency |
| class-variance-authority | ^0.7 | Component variant API | shadcn/ui component styling |
| @radix-ui/react-dialog | latest | Dialog primitive | Settings dialog (server URL config) |
| @radix-ui/react-sheet | latest | Sheet primitive | Side panel for node/edge properties (via shadcn Sheet) |
| tailwindcss-animate | ^1.0 | Animation utilities | shadcn/ui animation dependency (Tailwind v3 version) |

### Dev Dependencies
| Library | Version | Purpose |
|---------|---------|---------|
| @types/react | ^18.3 | React type definitions |
| @types/react-dom | ^18.3 | ReactDOM type definitions |
| postcss | ^8 | CSS processing (Tailwind v3 requirement) |
| autoprefixer | ^10 | Vendor prefixing (Tailwind v3 requirement) |
| @vitejs/plugin-react | ^4 | Vite React plugin (Fast Refresh) |
| eslint | ^9 | Linting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-force-graph-2d | vis-network | vis-network is DOM-based (SVG), slower beyond 200 nodes; canvas is needed for 500+ |
| react-force-graph-2d | sigma.js / @react-sigma/core | Sigma is WebGL-based, heavier; 2D canvas sufficient for this use case |
| Zustand | Jotai | Jotai is atom-based; Zustand's store model is simpler for this scope |
| TanStack Query | SWR | TanStack Query has better devtools, mutation support, and polling built in |
| Tailwind v3 | Tailwind v4 | v4 is CSS-first config; global CLAUDE.md mandates v3; shadcn@2.3.0 is v3-compatible |

**Installation:**
```bash
# Create project
npm create vite@latest frontend -- --template react-ts
cd frontend

# Core dependencies
npm install react-force-graph-2d @tanstack/react-query @tanstack/react-table zustand react-router-dom lucide-react clsx tailwind-merge class-variance-authority

# Tailwind v3 setup
npm install -D tailwindcss@^3.4.0 postcss autoprefixer tailwindcss-animate
npx tailwindcss init -p

# shadcn/ui init (use v3-compatible CLI)
npx shadcn@2.3.0 init
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/
├── public/
├── src/
│   ├── api/              # Typed API client layer (FOUND-06)
│   │   ├── client.ts     # Base fetch wrapper with error handling
│   │   ├── queries.ts    # TanStack Query hooks (useQuery, useMutation)
│   │   └── types.ts      # API response/request types
│   ├── components/
│   │   ├── ui/           # shadcn/ui components (auto-generated)
│   │   ├── graph/        # Graph canvas components
│   │   │   ├── GraphCanvas.tsx      # react-force-graph-2d wrapper
│   │   │   ├── NodeRenderer.ts      # nodeCanvasObject logic
│   │   │   └── GraphControls.tsx    # Zoom/fit controls
│   │   ├── layout/       # App shell, header, panels
│   │   │   ├── AppShell.tsx
│   │   │   ├── Header.tsx
│   │   │   └── PropertyPanel.tsx    # Side panel (shadcn Sheet)
│   │   ├── query/        # Query input components
│   │   │   ├── QueryInput.tsx       # Textarea + Run button
│   │   │   └── QueryError.tsx       # Error display
│   │   └── results/      # Result view components
│   │       ├── ResultsView.tsx      # Graph/Table toggle container
│   │       └── TableView.tsx        # TanStack Table view
│   ├── hooks/            # Custom hooks
│   ├── lib/              # Utilities (cn(), constants)
│   │   └── utils.ts      # cn() function
│   ├── stores/           # Zustand stores
│   │   ├── settings.ts   # Server URL, theme, result limit
│   │   ├── query.ts      # Current query, results, view mode
│   │   └── graph.ts      # Selected node/edge, graph state
│   ├── types/            # Shared TypeScript types
│   │   ├── graph.ts      # Node, Edge, QueryResult types
│   │   └── api.ts        # API endpoint types
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css         # Tailwind directives + CSS variables
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
└── package.json
```

### Pattern 1: Typed API Client with TanStack Query
**What:** A thin fetch wrapper that provides type safety for all API calls, consumed through TanStack Query hooks.
**When to use:** Every backend API call goes through this layer.
**Example:**
```typescript
// src/api/client.ts
const DEFAULT_BASE_URL = 'http://localhost:8080';

export class ApiClient {
  constructor(private baseUrl: string = DEFAULT_BASE_URL) {}

  async query(cypher: string): Promise<QueryResult> {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cypher }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(err.message, res.status);
    }
    return res.json();
  }

  async health(): Promise<HealthStatus> {
    const res = await fetch(`${this.baseUrl}/health`);
    return { connected: res.ok };
  }
}

// src/api/queries.ts
export function useHealthCheck() {
  const baseUrl = useSettingsStore((s) => s.serverUrl);
  const client = useMemo(() => new ApiClient(baseUrl), [baseUrl]);
  return useQuery({
    queryKey: ['health', baseUrl],
    queryFn: () => client.health(),
    refetchInterval: 5000,
    retry: false,
  });
}
```

### Pattern 2: Zustand Store with Persistence
**What:** Client state stored in Zustand with localStorage persistence for settings.
**When to use:** Server URL, theme preference, result limit.
**Example:**
```typescript
// src/stores/settings.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  serverUrl: string;
  theme: 'light' | 'dark' | 'system';
  resultLimit: number;
  setServerUrl: (url: string) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setResultLimit: (limit: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl: 'http://localhost:8080',
      theme: 'system',
      resultLimit: 500,
      setServerUrl: (serverUrl) => set({ serverUrl }),
      setTheme: (theme) => set({ theme }),
      setResultLimit: (resultLimit) => set({ resultLimit }),
    }),
    { name: 'ogdb-settings' }
  )
);
```

### Pattern 3: Canvas Theme Bridging
**What:** Since canvas does not inherit CSS variables, theme colors must be read from the Zustand store or resolved from the DOM and passed to canvas callbacks.
**When to use:** All nodeCanvasObject and linkCanvasObject callbacks.
**Example:**
```typescript
// Read resolved theme and pass to graph
const isDark = useResolvedTheme() === 'dark';
const canvasColors = isDark
  ? { bg: '#1a1a2e', text: '#e0e0e0', edge: '#4a4a6a', border: '#2a2a4e' }
  : { bg: '#ffffff', text: '#1a1a1a', edge: '#cccccc', border: '#e0e0e0' };
```

### Anti-Patterns to Avoid
- **Mixing server and client state in one store:** TanStack Query owns API data; Zustand owns UI state. Never cache API responses in Zustand.
- **Direct fetch calls in components:** All API calls must go through the typed client layer. Components only use TanStack Query hooks.
- **Inline canvas colors:** Never hardcode colors in nodeCanvasObject. Always derive from theme state.
- **SVG-based graphs at scale:** SVG DOM nodes become slow beyond 200 elements. The canvas renderer in react-force-graph-2d is chosen specifically for performance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Force-directed layout | Custom d3-force integration | react-force-graph-2d | Handles canvas rendering, interaction, zoom, drag out of the box |
| Data table | Custom `<table>` markup | @tanstack/react-table + shadcn Table | Sorting, pagination, column visibility are deceptively complex |
| Theme toggle | Custom localStorage + media query logic | shadcn/ui theme provider pattern | System preference detection, SSR-safe, flash prevention |
| API polling | setInterval + fetch | TanStack Query refetchInterval | Handles stale-while-revalidate, error retry, window focus |
| Side panel | Custom positioned div | shadcn Sheet (Radix Dialog) | Handles focus trap, escape key, click-outside, animations |
| Class merging | String concatenation | cn() from clsx + tailwind-merge | Resolves Tailwind class conflicts (e.g., `p-2 p-4` -> `p-4`) |

**Key insight:** Every "simple" UI interaction (panel close on escape, focus trap, theme flash prevention) has 5+ edge cases. Use battle-tested primitives.

## Common Pitfalls

### Pitfall 1: Canvas does not respond to CSS dark mode
**What goes wrong:** Graph canvas stays white/light when dark mode is toggled because canvas uses explicit fill colors, not CSS.
**Why it happens:** `<canvas>` is a bitmap surface. CSS custom properties and Tailwind classes have zero effect on canvas drawing operations.
**How to avoid:** Read theme from Zustand store, derive canvas color palette, pass to `backgroundColor` prop and all `nodeCanvasObject`/`linkCanvasObject` callbacks.
**Warning signs:** Graph canvas looks "stuck" in light mode while the rest of the UI switches.

### Pitfall 2: react-force-graph-2d re-renders reset the simulation
**What goes wrong:** Graph simulation restarts on every React re-render, causing nodes to "jump" back to random positions.
**Why it happens:** Passing new object references (graphData, nodeCanvasObject) on every render triggers a full simulation restart.
**How to avoid:** Memoize `graphData` with `useMemo`, memoize callback functions with `useCallback`. Keep the graph data reference stable unless the actual data changes.
**Warning signs:** Nodes jump to random positions when hovering, selecting, or toggling views.

### Pitfall 3: TanStack Query and Zustand state duplication
**What goes wrong:** Query results stored in both TanStack Query cache AND a Zustand store, leading to stale data and synchronization bugs.
**Why it happens:** Developers "copy" query results into Zustand for convenience, then forget to invalidate the Zustand copy.
**How to avoid:** Strict rule: TanStack Query owns all server data. Zustand stores ONLY client-side state (theme, selected node, view mode, server URL). Derived data computed with selectors, not duplicated.
**Warning signs:** UI shows stale data after a new query runs.

### Pitfall 4: Tailwind v3 vs v4 mismatch with shadcn/ui
**What goes wrong:** `npx shadcn init` defaults to Tailwind v4 + React 19 in 2026. Running it in a Tailwind v3 project generates incompatible configuration.
**Why it happens:** shadcn/ui's default init now assumes Tailwind v4. The v3-compatible path requires using `shadcn@2.3.0` explicitly.
**How to avoid:** Use `npx shadcn@2.3.0 init` for Tailwind v3 projects. Verify `tailwind.config.js` exists (v3 uses JS config, v4 uses CSS-first).
**Warning signs:** Missing `tailwind.config.js`, `@import "tailwindcss"` syntax instead of `@tailwind` directives.

### Pitfall 5: Bundle size exceeds 500KB with uncontrolled imports
**What goes wrong:** Initial bundle bloats past 500KB because all route components and libraries load eagerly.
**Why it happens:** Default Vite config bundles everything into a single chunk. Large libraries (react-force-graph-2d pulls in d3-force-3d) contribute significantly.
**How to avoid:** Use React.lazy for route-level code splitting. Configure Vite `build.rollupOptions.output.manualChunks` to isolate vendor code. Tree-shake icon imports (import specific icons from lucide-react, not the barrel export).
**Warning signs:** `npx vite build` reports chunks over 500KB.

### Pitfall 6: Graph canvas does not resize on container changes
**What goes wrong:** Graph canvas has a fixed size and does not adapt when the browser window resizes or a side panel opens.
**Why it happens:** react-force-graph-2d reads `width` and `height` props. If not updated on resize, the canvas stays at its initial dimensions.
**How to avoid:** Use a ResizeObserver (or a hook like `useResizeObserver`) on the graph container and pass dynamic width/height to ForceGraph2D.
**Warning signs:** Graph overflows its container or leaves empty space after resize.

## Code Examples

### Custom Node Rendering with Labels and Colors
```typescript
// src/components/graph/NodeRenderer.ts
const LABEL_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#a855f7',
];

export function getLabelColor(label: string, labelIndex: Map<string, number>): string {
  if (!labelIndex.has(label)) {
    labelIndex.set(label, labelIndex.size);
  }
  return LABEL_COLORS[labelIndex.get(label)! % LABEL_COLORS.length];
}

export function paintNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  colors: CanvasColors,
  labelIndex: Map<string, number>,
) {
  const label = node.label || node.id?.toString() || '';
  const nodeColor = getLabelColor(node.labels?.[0] || 'default', labelIndex);
  const radius = 6;
  const fontSize = Math.max(10 / globalScale, 2);

  // Draw circle
  ctx.beginPath();
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
  ctx.fillStyle = nodeColor;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Draw label
  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.text;
  const truncated = label.length > 15 ? label.slice(0, 12) + '...' : label;
  ctx.fillText(truncated, node.x!, node.y! + radius + 2);
}
```

### Health Check with TanStack Query Polling
```typescript
// src/api/queries.ts
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../stores/settings';

export function useHealthCheck() {
  const serverUrl = useSettingsStore((s) => s.serverUrl);
  return useQuery({
    queryKey: ['health', serverUrl],
    queryFn: async () => {
      const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error('Unhealthy');
      return { connected: true as const };
    },
    refetchInterval: 5000,
    retry: false,
    placeholderData: { connected: false as const },
  });
}
```

### Theme Provider Pattern (shadcn-compatible)
```typescript
// src/components/ThemeProvider.tsx
import { useSettingsStore } from '../stores/settings';
import { useEffect } from 'react';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(systemDark ? 'dark' : 'light');
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return <>{children}</>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redux + Redux Thunk for all state | Zustand (client) + TanStack Query (server) | 2023-2024 | 40% less boilerplate, automatic caching |
| D3.js manual force simulation | react-force-graph-2d wrapper | 2020+ | No manual DOM manipulation, declarative API |
| CSS Modules / styled-components | Tailwind CSS + shadcn/ui | 2023+ | Utility-first, copy-paste components, consistent dark mode |
| shadcn + Tailwind v4 (default) | shadcn@2.3.0 + Tailwind v3 | 2025 | v3 still supported; must use explicit CLI version |
| Create React App | Vite | 2022+ | 10x faster HMR, native ESM, smaller bundles |

**Deprecated/outdated:**
- Create React App: no longer maintained, Vite is the standard
- Redux for simple apps: overkill for this scope; Zustand + TanStack Query covers all needs
- tailwindcss-animate for Tailwind v4: replaced by tw-animate-css (but we're on v3, so tailwindcss-animate is correct)

## Open Questions

1. **OpenGraphDB POST /query response shape**
   - What we know: Backend has a POST /query endpoint that accepts Cypher
   - What's unclear: Exact response JSON structure (nodes, edges, properties format)
   - Recommendation: Define a TypeScript interface based on the expected Neo4j-like structure (nodes with id/labels/properties, relationships with id/type/startNode/endNode/properties). Validate against actual backend when integration testing.

2. **GET /health response shape**
   - What we know: Endpoint exists at GET /health
   - What's unclear: Whether it returns JSON body or just HTTP status
   - Recommendation: Check for HTTP 200 OK as the health signal. Parse JSON body if available for richer status info.

3. **Tailwind v3 vs v4 decision resolution**
   - What we know: Global CLAUDE.md says v3. STATE.md flags this as a blocker.
   - What's unclear: Whether user has a strong preference
   - Recommendation: Use Tailwind v3 per global CLAUDE.md. This is the safe choice: v3 is stable, well-documented, and shadcn@2.3.0 fully supports it.

## Sources

### Primary (HIGH confidence)
- npm registry: react-force-graph-2d@1.29.1, zustand@5.0.11, @tanstack/react-query@5.90.21, @tanstack/react-table@8.21.3
- GitHub vasturiano/react-force-graph: API reference for nodeCanvasObject, backgroundColor, onNodeClick
- shadcn/ui official docs: Tailwind v4 migration page confirms v3 still supported with shadcn@2.3.0

### Secondary (MEDIUM confidence)
- Web search: Vite + React lazy code splitting strategies verified against Vite docs
- Web search: Zustand + TanStack Query integration patterns verified across multiple sources

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, all versions verified via npm registry
- Architecture: HIGH, patterns are well-established in React ecosystem
- Pitfalls: HIGH, common issues documented across multiple sources

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable ecosystem, no fast-moving dependencies)
