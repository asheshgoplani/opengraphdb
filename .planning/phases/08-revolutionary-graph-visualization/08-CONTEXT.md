# Phase 8: Revolutionary Graph Visualization - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Modern production-grade graph rendering with five capabilities: (1) geographic map rendering for Air Routes dataset, (2) large dataset support for 1000+ nodes, (3) Linear/Vercel/Figma-level modern aesthetic, (4) real-time query trace animation showing actual backend traversal paths, and (5) clear, big, modern node rendering with smooth animations. This phase transforms the existing force-directed graph into a world-class visualization system.

</domain>

<decisions>
## Implementation Decisions

### Geographic Map Rendering
- Air Routes airports plotted by actual lat/lon coordinates on a world map
- Routes rendered as curved arcs between airports on the map
- Use a lightweight map library (deck.gl, Mapbox GL JS, or react-map-gl) for tile-based world map rendering
- Geographic mode activates automatically when Air Routes dataset is selected (dataset has lat/lon properties)
- Force-directed mode remains the default for non-geographic datasets
- Dark-themed map tiles to match the app's dark mode aesthetic
- Airport nodes rendered as glowing dots sized by connectivity (number of routes)
- Route arcs should have subtle animation (directional flow or pulse)

### Large Dataset Support (1000+ Nodes)
- Current react-force-graph-2d may need to be replaced or supplemented for 1000+ node performance
- Evaluate WebGL-based rendering (force-graph with WebGL renderer, deck.gl ScatterplotLayer, or custom Canvas optimization)
- Implement level-of-detail: at zoom-out, nodes become simple dots; at zoom-in, show labels and details
- Virtual viewport culling: only render nodes visible in the current viewport
- Cluster/aggregate dense regions at low zoom levels
- Progressive loading: render visible subset first, then fill in rest
- Target: 60fps interaction (pan/zoom) with 2000+ nodes

### Modern Aesthetic (Linear/Vercel/Figma Quality)
- Nodes: large, clearly readable labels with high contrast
- Smooth spring-based animations for all transitions (node enter/exit, layout changes, selection)
- Subtle glow/bloom effects on active/hovered nodes
- Edge rendering: thin, elegant lines with directional indicators
- Color palette: sophisticated, muted tones with vibrant accents for highlights
- Selection state: clean ring/outline, not garish highlight
- Background: subtle grid or dot pattern (like Figma's canvas)
- Typography on nodes: Inter/system font, properly sized, never overlapping
- Smooth camera transitions when focusing on a node or subgraph

### Query Trace Animation (Key Differentiator)
- Backend: new EXPLAIN/PROFILE-style endpoint that returns visited node IDs in traversal order
- The trace data must be REAL traversal data from actual query execution, NOT fake/simulated animation
- Backend endpoint: `POST /query/trace` or `POST /query?trace=true` returning `{ results: ..., trace: { visitedNodeIds: string[], visitedEdgeIds: string[], steps: [{nodeId, timestamp}] } }`
- Frontend: WebSocket or SSE stream for real-time delivery of trace steps as query executes
- Animation: nodes light up sequentially like neurons firing, with a ripple/pulse effect
- Traversed edges glow/animate in the direction of traversal
- Animation speed: configurable playback speed (0.5x, 1x, 2x, 5x)
- After animation completes, traversed path remains highlighted with option to replay
- Color: distinct "trace" color (electric blue or cyan) that stands out from normal node colors
- Non-traversed nodes dim/fade during trace playback to create focus

### Node Rendering Quality
- Large, clear circular nodes with readable labels inside or below
- Node size scales with importance (degree centrality or property-based)
- Smooth enter/exit animations when nodes are added/removed from view
- Hover state: subtle scale-up + info tooltip
- Selected state: clean ring + property panel opens
- Edge labels: readable, positioned at midpoint, never overlapping nodes
- Anti-aliased rendering throughout

### Claude's Discretion
- Exact map tile provider (Mapbox, MapTiler, or open-source tiles)
- WebGL library choice for large dataset rendering
- Exact animation easing curves and timing
- Cluster visualization design at low zoom
- SSE vs WebSocket choice for trace streaming (SSE preferred for simplicity)
- Trace endpoint exact API shape
- Whether to use canvas or WebGL for the main graph renderer

</decisions>

<specifics>
## Specific Ideas

- "Like a brain firing neurons" for the query trace animation: nodes pulse with light as the query traverses them, creating a ripple effect through the graph
- Geographic rendering should feel like flightradar24 or similar aviation tracking tools, with the world map as backdrop and routes as elegant arcs
- The trace animation is the KEY DIFFERENTIATOR of the entire product: no other graph database tool shows you the actual traversal path of your query in real time
- Modern aesthetic references: Linear (clean, minimal, purposeful), Vercel (dark mode excellence), Figma (canvas interaction quality)
- Large dataset rendering should feel like exploring a universe: smooth zoom from macro overview to micro detail

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GraphCanvas.tsx`: Core graph component, uses react-force-graph-2d with custom nodeCanvasObject. Will need major extension or replacement for geographic + WebGL modes
- `NodeRenderer.ts`: Custom canvas painting logic for nodes. Can be adapted for enhanced rendering
- `useGraphColors.ts`: Theme-aware color hook. Extend for trace colors and geographic palette
- `canvasColors.ts`: Color type definitions. Add trace animation colors
- `airRoutesGraph.ts`: 46 airports with full lat/lon coordinates, 80+ routes with distances. Geographic data already exists
- `datasets.ts`: Dataset registry. Add geographic capability flag per dataset
- `HeroGraphBackground.tsx`: Animated background graph on landing page. Could share animation utilities
- Tailwind animations: fadeIn, slideUp, scaleIn already defined in tailwind.config.js

### Established Patterns
- Zustand for state management: graph selection, settings, query state
- React Query for server data: health checks, query execution, schema
- shadcn/ui + Radix for UI components
- Vite with code splitting (separate vendor chunks)
- Dark mode via CSS variables + ThemeProvider
- Canvas-based graph rendering (not SVG)

### Integration Points
- `PlaygroundPage.tsx`: Hosts GraphCanvas, DatasetSwitcher, guided queries. Geographic mode toggle goes here
- `api/client.ts`: Add trace query endpoint (`queryWithTrace()`)
- `api/queries.ts`: Add React Query hook for trace queries
- `api/transform.ts`: Add trace data transform
- `stores/graph.ts`: Extend with trace state (active trace, animation progress, traversed nodes)
- `types/graph.ts`: Extend GraphNode with geographic coords, trace state
- `AppRouter.tsx`: No new routes needed, visualization upgrades happen in existing views

</code_context>

<deferred>
## Deferred Ideas

None: discussion stayed within phase scope

</deferred>

---

*Phase: 08-revolutionary-graph-visualization*
*Context gathered: 2026-03-02*
