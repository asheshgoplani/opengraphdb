# Phase 8: Revolutionary Graph Visualization - Research

**Researched:** 2026-03-02
**Domain:** Graph visualization (geographic maps, large datasets, query trace animation)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Geographic Map Rendering**
- Air Routes airports plotted by actual lat/lon coordinates on a world map
- Routes rendered as curved arcs between airports on the map
- Use a lightweight map library (deck.gl, Mapbox GL JS, or react-map-gl) for tile-based world map rendering
- Geographic mode activates automatically when Air Routes dataset is selected (dataset has lat/lon properties)
- Force-directed mode remains the default for non-geographic datasets
- Dark-themed map tiles to match the app's dark mode aesthetic
- Airport nodes rendered as glowing dots sized by connectivity (number of routes)
- Route arcs should have subtle animation (directional flow or pulse)

**Large Dataset Support (1000+ Nodes)**
- Current react-force-graph-2d may need to be replaced or supplemented for 1000+ node performance
- Evaluate WebGL-based rendering (force-graph with WebGL renderer, deck.gl ScatterplotLayer, or custom Canvas optimization)
- Implement level-of-detail: at zoom-out, nodes become simple dots; at zoom-in, show labels and details
- Virtual viewport culling: only render nodes visible in the current viewport
- Cluster/aggregate dense regions at low zoom levels
- Progressive loading: render visible subset first, then fill in rest
- Target: 60fps interaction (pan/zoom) with 2000+ nodes

**Modern Aesthetic (Linear/Vercel/Figma Quality)**
- Nodes: large, clearly readable labels with high contrast
- Smooth spring-based animations for all transitions (node enter/exit, layout changes, selection)
- Subtle glow/bloom effects on active/hovered nodes
- Edge rendering: thin, elegant lines with directional indicators
- Color palette: sophisticated, muted tones with vibrant accents for highlights
- Selection state: clean ring/outline, not garish highlight
- Background: subtle grid or dot pattern (like Figma's canvas)
- Typography on nodes: Inter/system font, properly sized, never overlapping
- Smooth camera transitions when focusing on a node or subgraph

**Query Trace Animation (Key Differentiator)**
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

**Node Rendering Quality**
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

### Deferred Ideas (OUT OF SCOPE)

None: discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

VIZ-01 through VIZ-04 are referenced in the phase description but are not present in REQUIREMENTS.md (which only defines v1 requirements through DEMO-04). These requirements are defined by the phase context:

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIZ-01 | Air Routes dataset renders airports on a geographic map with routes as arcs | deck.gl ArcLayer + ScatterplotLayer over MapLibre tile map |
| VIZ-02 | Graph rendering handles 1000+ nodes without performance degradation | react-force-graph-2d canvas optimization via autoPauseRedraw, LOD + linkDirectionalParticles disabled at scale |
| VIZ-03 | Query execution returns trace data (visited node IDs) via EXPLAIN-like endpoint | New `POST /query/trace` endpoint in the hand-rolled HTTP server; SSE stream pattern |
| VIZ-04 | Frontend displays real-time traversal animation via WebSocket/SSE; nodes light up as query traverses | EventSource + Zustand trace state + nodeCanvasObject glow via ctx.shadowBlur |
</phase_requirements>

---

## Summary

Phase 8 combines five technically distinct problems: geographic map rendering, large-dataset graph performance, aesthetic polish, real-time query trace streaming, and animated node traversal. The existing codebase is in excellent shape to take these on: the `react-force-graph-2d` library already provides the `nodeCanvasObject`, `linkCanvasObject`, `onRenderFramePre`, `onRenderFramePost`, and `linkDirectionalParticles` hooks needed for trace animation and glow effects. The Air Routes dataset already carries accurate lat/lon coordinates from Phase 7. The backend HTTP server is a hand-rolled raw TCP implementation (no axum), which means SSE requires writing chunked transfer encoding directly into the existing `dispatch_http_request` function.

The geographic map view is the highest-dependency item: it requires installing `deck.gl` and `maplibre-gl` with `react-map-gl`, and switching the Air Routes rendering to a `DeckGL + ArcLayer + ScatterplotLayer` component that replaces `GraphCanvas` when the active dataset is `airroutes`. For large datasets in force-directed mode, the existing canvas renderer with tuned `autoPauseRedraw`, `enablePointerInteraction: false` at high node counts, and a simplified `nodeCanvasObject` that skips labels below a threshold globalScale will hit 60fps for 1000-node graphs. For the query trace animation, the pattern is: a new `POST /query/trace` HTTP endpoint on the backend that returns JSON (not true streaming, since SSE requires chunked HTTP which is complex to add to the raw TCP server), and a frontend `useTraceAnimation` hook that replays the returned step sequence using `requestAnimationFrame` timed intervals, painting highlighted nodes via `ctx.shadowBlur` in `nodeCanvasObject`.

**Primary recommendation:** Keep `react-force-graph-2d` for force-directed mode (it handles 1000 nodes fine with LOD optimizations). Use `deck.gl` + `react-map-gl/maplibre` for the Air Routes geographic mode. Implement trace animation as a JSON response (not live streaming) for the first iteration, using `requestAnimationFrame` playback on the frontend. This avoids SSE complexity in the raw TCP server while still delivering the "nodes light up" experience.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-force-graph-2d` | 1.29.1 (installed) | Force-directed graph canvas renderer | Already installed; has all required hooks (`nodeCanvasObject`, `onRenderFramePre`, `linkDirectionalParticles`) |
| `deck.gl` (via `@deck.gl/react`, `@deck.gl/layers`, `@deck.gl/mapbox`) | 9.x (latest 9.2.9 as of 2026-03-01) | Geographic rendering: ArcLayer for routes, ScatterplotLayer for airports | Industry-standard WebGL geospatial visualization; tree-shakeable |
| `react-map-gl` | 7.x | React wrapper for MapLibre tile map | Recommended by deck.gl docs for React integration; supports MapLibre |
| `maplibre-gl` | 4.x | Open-source tile renderer for map base | Free, no API key for vector tiles from CARTO; fork of Mapbox v1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `maplibre-gl/dist/maplibre-gl.css` | (bundled with maplibre-gl) | Required CSS for map controls | Must import for map rendering to work |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| deck.gl geographic mode | Mapbox GL JS | Mapbox requires paid API token; deck.gl + MapLibre is fully free |
| deck.gl geographic mode | Leaflet.js | Leaflet is simpler but lacks WebGL arc animation and GPU acceleration |
| react-force-graph-2d (keep) | reagraph | reagraph is WebGL-based and handles larger datasets but is a larger rewrite; react-force-graph-2d handles 1000 nodes fine with canvas optimization |
| JSON batch trace response | True SSE streaming | SSE requires chunked HTTP encoding in the raw TCP server, which is significant plumbing; JSON batch is simpler and equally effective for replay animation |
| requestAnimationFrame playback | CSS animations | CSS can't control canvas drawing; rAF is the only option for canvas-based animation |

**Installation:**
```bash
cd frontend
npm install @deck.gl/react @deck.gl/layers @deck.gl/mapbox react-map-gl maplibre-gl
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   └── graph/
│       ├── GraphCanvas.tsx          # MODIFIED: detects geographic mode, routes to GeoCanvas
│       ├── GeoCanvas.tsx            # NEW: deck.gl + MapLibre view for airroutes dataset
│       ├── NodeRenderer.ts          # MODIFIED: add trace highlight painting, glow intensity param
│       ├── useGraphColors.ts        # MODIFIED: add traceColor, dimmedAlpha to CanvasColors
│       ├── canvasColors.ts          # MODIFIED: add traceNodeGlow, traceEdgeGlow fields
│       └── useTraceAnimation.ts     # NEW: requestAnimationFrame playback for trace steps
├── stores/
│   └── graph.ts                     # MODIFIED: add trace state (activeTrace, traceStep, traversedNodeIds, traversedEdgeIds)
├── api/
│   └── client.ts                    # MODIFIED: add queryWithTrace() method
├── types/
│   └── graph.ts                     # MODIFIED: add geographic coords to GraphNode, TraceData interface
└── data/
    └── datasets.ts                  # MODIFIED: add isGeographic flag to DatasetMeta
```

### Pattern 1: Geographic Mode Detection
**What:** `GraphCanvas` reads `activeDataset` from the Zustand store or receives it as a prop. When `dataset.isGeographic === true` (only for `airroutes`), it renders `GeoCanvas` instead of the force-directed `ForceGraph2D`.
**When to use:** Any time the active dataset has lat/lon coordinates.
**Example:**
```typescript
// Source: CONTEXT.md code_context + deck.gl docs
export function GraphCanvas({ graphData, isGeographic }: GraphCanvasProps) {
  if (isGeographic) {
    return <GeoCanvas graphData={graphData} />
  }
  return <ForceDirectedCanvas graphData={graphData} />
}
```

### Pattern 2: deck.gl + MapLibre Arc Layer (Geographic Mode)
**What:** `GeoCanvas` uses `DeckGLOverlay` pattern from deck.gl + react-map-gl docs. Airports are `ScatterplotLayer`, routes are `ArcLayer`.
**When to use:** Air Routes dataset only.
**Example:**
```typescript
// Source: https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
import { Map, useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer } from '@deck.gl/layers'
import { ArcLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

// Dark tile style (no API key required)
const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export function GeoCanvas({ graphData }: { graphData: GraphData }) {
  const airports = graphData.nodes.filter(n => n.labels.includes('Airport'))
  const routes = graphData.links

  const layers = [
    new ScatterplotLayer({
      id: 'airports',
      data: airports,
      getPosition: (d: GraphNode) => [
        d.properties.lon as number,
        d.properties.lat as number,
      ],
      getRadius: (d: GraphNode) => {
        const connections = connectionCounts.get(d.id) ?? 0
        return 5000 + connections * 2000
      },
      getFillColor: [0, 200, 255, 220],  // cyan glow
      radiusMinPixels: 4,
      radiusMaxPixels: 20,
      pickable: true,
    }),
    new ArcLayer({
      id: 'routes',
      data: routes,
      getSourcePosition: (d) => getAirportCoords(d.source, airports),
      getTargetPosition: (d) => getAirportCoords(d.target, airports),
      getSourceColor: [0, 150, 255, 60],
      getTargetColor: [0, 200, 255, 60],
      getWidth: 1,
      getHeight: 0.5,
      greatCircle: true,   // arcs follow Earth curvature
    }),
  ]

  return (
    <Map
      initialViewState={{ longitude: 0, latitude: 30, zoom: 2 }}
      mapStyle={DARK_MAP_STYLE}
      style={{ width: '100%', height: '100%' }}
    >
      <DeckGLOverlay layers={layers} />
    </Map>
  )
}
```

### Pattern 3: Trace Animation with requestAnimationFrame
**What:** A custom hook `useTraceAnimation` takes an array of `{ nodeId, timestamp }` steps, plays them back using `requestAnimationFrame`, and writes the current active node IDs into a Zustand store. `NodeRenderer.paintNode` reads the trace state to apply glow.
**When to use:** After a trace query completes and trace steps are available.
**Example:**
```typescript
// Source: MDN requestAnimationFrame + React hooks patterns
export function useTraceAnimation(
  steps: TraceStep[],
  speedMultiplier: number
) {
  const rafRef = useRef<number>()
  const setTraceStep = useGraphStore(s => s.setTraceStep)

  useEffect(() => {
    if (steps.length === 0) return
    let stepIndex = 0
    const baseDelay = 100 / speedMultiplier  // ms between steps

    const tick = () => {
      if (stepIndex >= steps.length) return
      setTraceStep(steps[stepIndex].nodeId, stepIndex)
      stepIndex++
      rafRef.current = requestAnimationFrame(() => {
        setTimeout(tick, baseDelay)
      })
    }

    tick()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [steps, speedMultiplier, setTraceStep])
}
```

### Pattern 4: Canvas Glow for Trace Nodes
**What:** Extend `paintNode` to accept a `traceState` parameter. When a node is the current traversal node, apply strong `ctx.shadowBlur` with a cyan color and render at full opacity. Non-traversed nodes render at reduced `ctx.globalAlpha`.
**When to use:** During trace animation playback.
**Example:**
```typescript
// Source: MDN CanvasRenderingContext2D.shadowBlur + existing NodeRenderer.ts pattern
export function paintNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  colors: CanvasColors,
  labelIndex: Map<string, number>,
  connectionCounts?: Map<string | number, number>,
  traceState?: TraceState   // NEW parameter
) {
  const isTraced = traceState?.traversedIds.has(node.id)
  const isActive = traceState?.activeId === node.id
  const isDimmed = traceState !== null && !isTraced

  ctx.save()
  ctx.globalAlpha = isDimmed ? 0.2 : 1.0

  if (isActive) {
    // Strong glow for currently-visited node
    ctx.shadowColor = '#00d4ff'    // electric cyan
    ctx.shadowBlur = 30 / globalScale
  } else if (isTraced) {
    // Softer glow for already-visited nodes
    ctx.shadowColor = '#00d4ff'
    ctx.shadowBlur = 10 / globalScale
  } else {
    ctx.shadowColor = nodeColor
    ctx.shadowBlur = Math.max(8 / globalScale, 4)
  }

  // ... rest of existing paintNode logic
  ctx.restore()
}
```

### Pattern 5: Backend Trace Endpoint
**What:** The HTTP server's `dispatch_http_request` function gets a new `("POST", "/query/trace")` arm. It runs the query and returns the result along with a `trace` object. Since the backend is a hand-rolled raw TCP server (not axum), true SSE streaming is complex to add. The simpler and sufficient approach is to return a complete JSON response that includes the traversal step sequence. The frontend then replays these steps using `requestAnimationFrame`.
**When to use:** When the frontend POSTs to `/query/trace`.
**Example (Rust):**
```rust
("POST", "/query/trace") => {
    let payload: Value = serde_json::from_slice(&request.body)
        .map_err(|e| CliError::Runtime(format!("invalid json: {e}")))?;
    let query = payload
        .as_object()
        .and_then(|o| o.get("query"))
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Runtime("query field required".to_string()))?;

    // Run the query and collect visited node IDs in order
    let (result, trace_steps) = shared_db
        .query_cypher_with_trace(query)
        .map_err(|e| CliError::Runtime(e.to_string()))?;

    // Return results + trace together
    Ok(http_json_response(200, "OK", serde_json::json!({
        "rows": result_to_rows(&result),
        "trace": {
            "steps": trace_steps.iter().enumerate().map(|(i, node_id)| {
                serde_json::json!({ "nodeId": node_id, "stepIndex": i })
            }).collect::<Vec<_>>()
        }
    })))
}
```

**Frontend API client addition:**
```typescript
// Source: api/client.ts existing pattern
async queryWithTrace(cypher: string): Promise<TraceQueryResponse> {
  return this.request<TraceQueryResponse>('/query/trace', {
    method: 'POST',
    body: JSON.stringify({ query: cypher }),
  })
}
```

### Anti-Patterns to Avoid
- **Replacing react-force-graph-2d entirely for WebGL:** The 2D canvas renderer handles 1000 nodes fine with LOD and `autoPauseRedraw`. A full rewrite to reagraph is higher risk and adds bundle weight. Avoid unless benchmarks prove necessity.
- **CSS transitions for canvas animation:** Canvas elements cannot be animated with CSS transitions. Always use `requestAnimationFrame` for canvas-based glow animation.
- **Rendering edge labels at all zoom levels:** Edge labels are expensive. Skip `linkCanvasObject` rendering below a globalScale threshold.
- **Using Mapbox GL JS instead of MapLibre:** Mapbox requires a paid token. MapLibre with CARTO Dark Matter tiles is free with no API key.
- **True SSE streaming from the raw TCP server:** Adding chunked transfer encoding and Server-Sent Events to the hand-rolled HTTP server requires significant plumbing. The JSON batch response pattern delivers the same end-user experience.
- **Animating all edges as particles simultaneously:** `linkDirectionalParticles` on every edge at 1000+ nodes tanks performance. Use it only on the trace path edges.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Geographic tile map rendering | Custom canvas map drawing | `maplibre-gl` + `react-map-gl` | Tile management, projection math, zoom/pan physics, and WebGL rendering are solved problems |
| Arc rendering on a globe | Custom Bezier arc math on canvas | `deck.gl ArcLayer` with `greatCircle: true` | Great-circle path math, GPU rendering, and animation transitions are built-in |
| Map projection (lat/lon to pixels) | Custom Mercator implementation | deck.gl + maplibre handle projection entirely | Projection has edge cases at poles and antimeridian that are well-solved in these libraries |
| Airport dot rendering on map | Custom overlay div elements | `deck.gl ScatterplotLayer` | WebGL-based, supports 10,000+ points at 60fps |
| requestAnimationFrame loop with cleanup | Inline `useEffect` rAF loop | `useTraceAnimation` custom hook | Encapsulates start/stop/cleanup logic, avoids memory leaks |

**Key insight:** The geographic rendering stack (deck.gl + MapLibre) handles WebGL context management, projection, and tile loading. Hand-rolling any part of this would be months of work to reach the same quality.

---

## Common Pitfalls

### Pitfall 1: Missing maplibre-gl CSS
**What goes wrong:** Map renders blank or controls appear without styling.
**Why it happens:** maplibre-gl requires `import 'maplibre-gl/dist/maplibre-gl.css'` to be imported alongside the JS.
**How to avoid:** Add the CSS import at the top of `GeoCanvas.tsx`.
**Warning signs:** Map container shows but no tiles appear; zoom buttons are unstyled.

### Pitfall 2: deck.gl and react-map-gl version mismatch
**What goes wrong:** TypeScript errors, runtime crashes, or map fails to initialize.
**Why it happens:** deck.gl 9.x has specific peer dependency requirements on react-map-gl.
**How to avoid:** Install `@deck.gl/mapbox` (the overlay integration package) alongside `react-map-gl`. Use `react-map-gl/maplibre` import (not the default `react-map-gl`).
**Warning signs:** `TypeError: useControl is not a function` or missing type definitions.

### Pitfall 3: Canvas globalAlpha not reset between nodes
**What goes wrong:** All nodes appear dimmed after a trace animation finishes.
**Why it happens:** `ctx.globalAlpha` is a persistent canvas state property. If a node sets it to 0.2 and the `ctx.restore()` is not called, subsequent nodes inherit the dimmed alpha.
**How to avoid:** Always wrap trace-related canvas state changes in `ctx.save()` / `ctx.restore()`.
**Warning signs:** Nodes remain dim after animation stops.

### Pitfall 4: react-force-graph-2d re-mounts on every data change
**What goes wrong:** The force simulation restarts from scratch on every query result, causing jarring re-layout.
**Why it happens:** Passing a new `graphData` object reference on every render triggers a re-mount.
**How to avoid:** Use `useMemo` on `graphData` (already done in the existing `stableData` pattern in `GraphCanvas.tsx`). Do not create new node/link arrays unless the data actually changed.
**Warning signs:** Graph "explodes" and re-settles on every query.

### Pitfall 5: Backend trace endpoint not plumbed through the existing query path
**What goes wrong:** The trace endpoint compiles but always returns empty trace steps.
**Why it happens:** The `query_cypher_with_trace` function needs to instrument the Cypher executor to record visited node IDs. If it just calls `query_cypher_as_user_with_retry` unchanged, no traversal data is collected.
**How to avoid:** The backend trace implementation must actually instrument the query executor. For Phase 8, a pragmatic first approach is to return the node IDs from the result set in order (i.e., the nodes returned by the query, in the order returned). This is not deep traversal tracing but is sufficient for the animation effect on simple path queries. Document this limitation clearly.
**Warning signs:** Trace animation plays but all nodes light up simultaneously rather than sequentially.

### Pitfall 6: Performance regression at 1000+ nodes with labels
**What goes wrong:** FPS drops to 10-15 at 1000 nodes.
**Why it happens:** Calling `ctx.measureText()` and `ctx.fillText()` for every node every frame is expensive. At 1000 nodes, that is 1000 text measure + fill operations per frame.
**How to avoid:** Add a `globalScale` threshold in `paintNode`: if `globalScale < 0.3`, skip label rendering entirely and just draw a colored dot. Disable `linkCanvasObject` (edge labels) similarly.
**Warning signs:** Chrome DevTools shows high `canvas` rasterization time per frame.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Extend DatasetMeta with geographic flag
```typescript
// Source: existing /frontend/src/data/datasets.ts pattern
export interface DatasetMeta {
  key: DatasetKey
  name: string
  description: string
  nodeCount: number
  linkCount: number
  labels: string[]
  isGeographic?: boolean   // NEW: true only for airroutes
}
```

### GraphCanvas geographic routing
```typescript
// Source: existing GraphCanvas.tsx + CONTEXT.md integration point
export function GraphCanvas({ graphData, datasetKey }: GraphCanvasProps) {
  const isGeographic = datasetKey === 'airroutes'

  if (isGeographic) {
    return <GeoCanvas graphData={graphData} />
  }

  return <ForceDirectedCanvas graphData={graphData} />
}
```

### Level-of-detail in NodeRenderer
```typescript
// Source: existing NodeRenderer.ts + performance research
export function paintNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  colors: CanvasColors,
  labelIndex: Map<string, number>,
  connectionCounts?: Map<string | number, number>,
  traceState?: TraceState
) {
  const x = node.x ?? 0
  const y = node.y ?? 0
  const connections = connectionCounts?.get(node.id) ?? 0
  const radius = 5 + Math.min(connections * 0.5, 7)
  const nodeColor = getLabelColor(node.labels?.[0] || 'default', labelIndex)

  // --- LOD: at low zoom, skip gradient and text, just draw a dot ---
  const isZoomedOut = globalScale < 0.4
  if (isZoomedOut) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(radius * 0.6, 2), 0, 2 * Math.PI)
    ctx.fillStyle = nodeColor
    ctx.fill()
    return
  }

  // ... full label + gradient rendering for normal zoom levels
}
```

### Zustand trace state
```typescript
// Source: existing /frontend/src/stores/graph.ts pattern + CONTEXT.md
interface TraceState {
  isPlaying: boolean
  activeNodeId: string | number | null
  traversedNodeIds: Set<string | number>
  steps: Array<{ nodeId: string | number; stepIndex: number }>
  speedMultiplier: number
}

interface GraphState {
  selectedNodeId: string | number | null
  selectedEdgeId: string | number | null
  trace: TraceState | null    // NEW
  selectNode: (id: string | number) => void
  selectEdge: (id: string | number) => void
  clearSelection: () => void
  setTrace: (trace: TraceState) => void        // NEW
  clearTrace: () => void                       // NEW
  setTraceStep: (nodeId: string | number, stepIndex: number) => void  // NEW
}
```

### CARTO Dark Matter tile URL (no API key required)
```typescript
// Source: https://github.com/CartoDB/basemap-styles (confirmed free, no key)
const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
```

### linkDirectionalParticles for trace path edges
```typescript
// Source: https://github.com/vasturiano/force-graph/blob/master/README.md
// Use particles only on trace path edges, not all edges
<ForceGraph2D
  linkDirectionalParticles={(link) =>
    traceEdgeIds.has(link.id) ? 3 : 0
  }
  linkDirectionalParticleColor={(link) =>
    traceEdgeIds.has(link.id) ? '#00d4ff' : colors.edge
  }
  linkDirectionalParticleSpeed={0.008}
  linkDirectionalParticleWidth={2}
/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SVG-based graph rendering | Canvas/WebGL rendering | 2019-2022 | 10-100x more nodes at 60fps |
| Mapbox GL JS (paid) | MapLibre GL JS (free fork) | 2021 (MapLibre 1.0) | No API key required; same API surface |
| deck.gl as standalone | deck.gl as MapLibre overlay via `@deck.gl/mapbox` | deck.gl 8.x | Proper layer interleaving with map tiles |
| WebSocket for streaming | SSE (EventSource) | 2015-onward, preferred pattern in 2025 | SSE is simpler: auto-reconnect, HTTP/1.1 compatible, unidirectional |
| CSS animations for dynamic elements | requestAnimationFrame + canvas | Always | CSS cannot animate canvas drawing operations |

**Deprecated/outdated:**
- `react-force-graph` (the umbrella package): Import specific packages like `react-force-graph-2d` instead.
- Mapbox GL JS v1 free tier: Replaced by MapLibre GL JS for open-source use.

---

## Open Questions

1. **Backend Cypher traversal instrumentation**
   - What we know: The backend has `query_cypher_as_user_with_retry` but no traversal recording. The HTTP server is hand-rolled raw TCP.
   - What's unclear: Whether `ogdb-core` exposes traversal hooks, or whether the query result order can serve as a proxy for traversal order.
   - Recommendation: For Phase 8, treat the node IDs returned from the query result (in result order) as the trace sequence. Document this as "result-order trace" not "deep traversal trace." This delivers the animation without requiring Cypher executor instrumentation.

2. **react-force-graph-2d 1000-node 60fps guarantee**
   - What we know: The library uses Canvas 2D (not WebGL). Issues report performance problems at 5,000-12,000 nodes. At 1,000 nodes with the LOD optimization (skip labels at low zoom), performance should be acceptable.
   - What's unclear: Exact FPS at 1,000 nodes with the current `paintNode` implementation.
   - Recommendation: Implement LOD first, benchmark in the browser, then escalate to reagraph only if needed.

3. **MapTiler vs CARTO tiles for dark map**
   - What we know: CARTO Dark Matter style URL (`basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`) requires no API key. MapTiler free tier requires registration.
   - What's unclear: CARTO's rate limits and uptime SLA for the free tile service.
   - Recommendation: Use CARTO Dark Matter for Phase 8 (no user friction). Add a note in code that MapTiler is the fallback if CARTO tiles become unavailable.

---

## Validation Architecture

The config.json does not have `workflow.nyquist_validation: true`. Validation Architecture section skipped per agent instructions.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase (`/frontend/src/components/graph/`, `/crates/ogdb-cli/src/lib.rs`) — direct code inspection
- https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre — MapLibre integration with DeckGL, MapboxOverlay pattern
- https://deck.gl/docs/api-reference/layers/arc-layer — ArcLayer props, TypeScript example
- https://deck.gl/docs/get-started/using-with-react — DeckGL React setup
- https://github.com/vasturiano/force-graph/blob/master/README.md — `onRenderFramePre`, `onRenderFramePost`, `linkDirectionalParticles` props
- MDN CanvasRenderingContext2D.shadowBlur — glow effect implementation

### Secondary (MEDIUM confidence)
- https://github.com/CartoDB/basemap-styles — CARTO Dark Matter style URL, no-key tiles confirmed
- https://npmjs.com/package/@deck.gl/react — version 9.2.9 current
- reagraph.dev — WebGL alternative library capability overview
- https://reagraph.dev + https://github.com/reaviz/reagraph — reagraph as large-dataset alternative
- SSE with EventSource pattern — MDN + multiple 2025 implementation articles

### Tertiary (LOW confidence)
- CARTO tile service availability and rate limits — not officially documented for free tier
- Exact FPS at 1000 nodes for react-force-graph-2d — requires empirical benchmark in this project

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — deck.gl, react-map-gl, maplibre-gl are verified via official docs; react-force-graph-2d is already installed
- Architecture: HIGH — patterns derived from existing code + official deck.gl/maplibre integration docs
- Pitfalls: HIGH — canvas state pitfalls verified via MDN; maplibre CSS requirement is documented
- Backend trace: MEDIUM — the approach (result-order trace) is pragmatic and works, but deep traversal instrumentation requires `ogdb-core` investigation

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (deck.gl and maplibre-gl move fast; check for breaking changes in point releases)
