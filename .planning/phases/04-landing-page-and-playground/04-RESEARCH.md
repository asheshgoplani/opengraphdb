# Phase 4: Landing Page and Playground - Research

**Researched:** 2026-03-01
**Domain:** React SPA routing, static graph data, landing page composition with shadcn/ui
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEMO-01 | User sees a landing page with hero section explaining OpenGraphDB's key differentiators | React Router route + hero section built from existing shadcn Button/Badge + Tailwind prose |
| DEMO-02 | User sees feature highlights and getting started guide on the landing page | shadcn Card grid + ordered steps section, no new component library needed |
| DEMO-03 | User can access an interactive playground with a pre-loaded sample graph | Playground route uses existing GraphCanvas with hardcoded GraphData constant, no backend |
| DEMO-04 | User can run guided example queries in the playground that demonstrate graph visualization | Pre-defined query buttons populate a read-only executor that filters the in-memory dataset |
</phase_requirements>

---

## Summary

Phase 4 requires two new top-level routes wired into the existing SPA: a marketing landing page (`/`) and an interactive playground (`/playground`). The current application has no router yet — `main.tsx` renders `<App>` directly inside `QueryClientProvider`. Introducing `react-router-dom` (already installed at ^7.13.1) with `BrowserRouter + Routes + Route` is all that is needed to add the two new pages without disrupting the existing query/graph canvas flow, which becomes the `/app` route.

The playground's core requirement — a pre-loaded sample graph without a backend — is straightforward: define a hardcoded `GraphData` constant that matches the existing `GraphNode`/`GraphEdge` types from `/src/types/graph.ts`, then pass it directly to the existing `GraphCanvas` component. The guided queries are executed against this in-memory dataset using a pure filter function, not the real API. The movies graph dataset (Person/Movie nodes with ACTED_IN/DIRECTED/WROTE relationships) is the industry-standard sample for Cypher demonstrations; it is small (38 actors, 36 movies, ~170 edges), visually interesting, and immediately recognizable to graph database evaluators.

The landing page can be assembled entirely from Tailwind utilities and the shadcn/ui components already present in the codebase (`Button`, `Badge`), plus a `Card` component that will be added via `npx shadcn@latest add card`. No animation library or third-party marketing component is needed. The page must respect the existing dark/light theme because `ThemeProvider` wraps the entire app.

**Primary recommendation:** Wire `react-router-dom` v7 declarative mode into `main.tsx`, create `LandingPage` and `PlaygroundPage` route components, define the movies sample dataset as a TypeScript constant, and implement query filtering in a pure utility function.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-router-dom` | ^7.13.1 (already installed) | SPA routing, two new routes | Already in package.json; no new install needed |
| `react-force-graph-2d` | ^1.29.1 (already installed) | Graph canvas for playground | Same library used in main app canvas |
| shadcn/ui `Card` | latest (add via CLI) | Feature highlight cards on landing page | Consistent with existing shadcn component strategy |
| `React.lazy` + `Suspense` | React 19 (already installed) | Code-split landing page and playground chunks | Keeps initial bundle under 500KB (FOUND-02) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^0.575.0 (already installed) | Icons for feature highlight cards and CTA | Use existing icon set; no Heroicons or Feather needed |
| Node `test` runner | built-in (already used) | Unit tests for sample data filtering logic | Same test infrastructure as Phase 1 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardcoded TS constant for sample graph | Fetch from `/public/sample.json` at runtime | JSON fetch adds a loading state; TS constant is zero-latency and fully typed |
| `BrowserRouter + Routes` (declarative mode) | `createBrowserRouter + RouterProvider` (data mode) | Data mode adds loader/action machinery unnecessary for two static pages; declarative mode is lighter |
| shadcn Card (copy-paste) | Custom `div` with Tailwind prose | Card is already the project component pattern; inconsistent to skip it |
| React Joyride (guided tour overlay) | Simple query-button array | Product-tour libraries add 50KB+ and require step configuration; query buttons are simpler, sufficient for v1 |

**Installation:**

```bash
# react-router-dom already installed — no action needed
# Add shadcn card component
cd frontend && npx shadcn@latest add card
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── pages/
│   ├── LandingPage.tsx          # Hero + features + getting-started sections
│   └── PlaygroundPage.tsx       # Playground shell wrapping PlaygroundCanvas + query buttons
├── components/
│   ├── landing/
│   │   ├── HeroSection.tsx      # Headline, sub-copy, CTA buttons
│   │   ├── FeaturesSection.tsx  # Card grid of 3-4 key differentiators
│   │   └── GettingStartedSection.tsx  # Numbered steps / quick-start guide
│   └── playground/
│       ├── PlaygroundCanvas.tsx # GraphCanvas with sampleGraphData injected
│       └── QueryButtons.tsx     # Row of pre-defined guided query buttons
├── data/
│   └── sampleGraph.ts           # Hardcoded GraphData constant (movies dataset)
└── App.tsx                      # Existing — becomes /app route
```

### Pattern 1: Router Entry Point (Declarative Mode)

**What:** Wrap the app in `BrowserRouter` at `main.tsx` level, add `Routes/Route` inside a new top-level `Router.tsx` component.
**When to use:** Two or more pages needed, no SSR, no data loaders required.

```tsx
// src/main.tsx — updated
import { BrowserRouter } from 'react-router-dom'
// ...existing imports...

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

```tsx
// src/AppRouter.tsx
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import App from './App'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage'))

export function AppRouter() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/app" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
```

**Key detail:** The existing `App` component renders as the `/app` route — zero change to its internals.

### Pattern 2: Hardcoded Sample Graph Dataset

**What:** A typed TypeScript constant matching the existing `GraphData` interface. Passed directly to `GraphCanvas`.
**When to use:** Playground route, any time the real backend is unavailable or irrelevant.

```typescript
// src/data/sampleGraph.ts
import type { GraphData } from '@/types/graph'

export const MOVIES_SAMPLE: GraphData = {
  nodes: [
    { id: 1, labels: ['Movie'], properties: { title: 'The Matrix', released: 1999 }, label: 'Movie' },
    { id: 2, labels: ['Person'], properties: { name: 'Keanu Reeves', born: 1964 }, label: 'Person' },
    { id: 3, labels: ['Person'], properties: { name: 'Lana Wachowski', born: 1965 }, label: 'Person' },
    // ... ~20 nodes total for a visually meaningful but not overwhelming playground
  ],
  links: [
    { id: 'r1', source: 2, target: 1, type: 'ACTED_IN', properties: { roles: ['Neo'] } },
    { id: 'r2', source: 3, target: 1, type: 'DIRECTED', properties: {} },
    // ...
  ],
}
```

### Pattern 3: In-Memory Guided Query Filtering

**What:** A pure function that takes a query string key and returns a filtered subset of the sample dataset. Query buttons call this function and update local React state.
**When to use:** Playground guided queries — never call the real API.

```typescript
// src/data/sampleGraph.ts (extended)
export type PlaygroundQueryKey =
  | 'all'
  | 'movies-only'
  | 'actors-only'
  | 'acted-in'
  | 'directed'

export function runPlaygroundQuery(key: PlaygroundQueryKey): GraphData {
  switch (key) {
    case 'all': return MOVIES_SAMPLE
    case 'movies-only': return {
      nodes: MOVIES_SAMPLE.nodes.filter(n => n.labels.includes('Movie')),
      links: [],
    }
    case 'actors-only': return {
      nodes: MOVIES_SAMPLE.nodes.filter(n => n.labels.includes('Person')),
      links: [],
    }
    case 'acted-in': return filterByRelationshipType('ACTED_IN')
    case 'directed': return filterByRelationshipType('DIRECTED')
  }
}
```

The playground page manages `graphData` in local `useState`, updated on button click. No Zustand store, no API calls.

### Pattern 4: Landing Page Composition

**What:** Three stacked sections using Tailwind `max-w-5xl mx-auto` centering pattern. `ThemeProvider` already covers dark mode on all surfaces.
**When to use:** Any new full-page route that is not the main app shell.

```tsx
// src/pages/LandingPage.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { HeroSection } from '@/components/landing/HeroSection'
import { FeaturesSection } from '@/components/landing/FeaturesSection'
import { GettingStartedSection } from '@/components/landing/GettingStartedSection'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="h-12 border-b flex items-center px-4 justify-between">
        <span className="font-semibold">OpenGraphDB</span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild><Link to="/playground">Playground</Link></Button>
          <Button asChild><Link to="/app">Open App</Link></Button>
        </div>
      </nav>
      <HeroSection />
      <FeaturesSection />
      <GettingStartedSection />
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Using the real API in the playground:** The playground must work with zero backend. Never call `useCypherQuery` from playground components.
- **Storing playground graph state in Zustand:** Playground graph state is local to the playground page; it does not belong in the shared `useGraphStore`.
- **Omitting `React.lazy` on landing/playground pages:** These are large routes. Without lazy loading, they inflate the initial bundle and break FOUND-02.
- **Hardcoding hex colors on the landing page:** Use Tailwind semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`) so dark mode works automatically via the existing `ThemeProvider`.
- **Importing from `react-router` instead of `react-router-dom`:** The package installed is `react-router-dom`; importing from `react-router` would cause a module-not-found error unless the package is also installed. The v7 consolidation is a recommendation for new projects; the existing install is `react-router-dom` and that is what should be used.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Routing between pages | Custom URL hash switching or `window.location.href` | `react-router-dom` (already installed) | History management, link `<a>` semantics, active-link state handling |
| Force-directed layout for playground | Custom canvas physics | Existing `GraphCanvas` + `react-force-graph-2d` | Simulation, zoom, drag, node painting all already work |
| Dark mode on landing page | Separate CSS variables or `prefers-color-scheme` listener | Existing `ThemeProvider` wrapping | Already wraps the whole app; every new route inherits it for free |
| Feature cards | Raw `div` + border classes | `shadcn Card` (`npx shadcn@latest add card`) | Matches existing component vocabulary; accessible, themed |

**Key insight:** The existing Phase 1 infrastructure (GraphCanvas, ThemeProvider, useGraphColors, Zustand stores, Tailwind config) is reusable as-is for the playground. The only genuinely new building blocks are: route wiring, sample data constant, query filter function, and landing page copy.

---

## Common Pitfalls

### Pitfall 1: Breaking the Existing App Route

**What goes wrong:** `main.tsx` currently renders `<App>` at root. If you naively wrap it in a router and add routes, the existing `/` path now renders the landing page and the app is unreachable.
**Why it happens:** The existing app has no router, so the first route addition must explicitly move the app to a sub-path (e.g., `/app`).
**How to avoid:** In the same commit that adds `BrowserRouter`, move `<App>` to `<Route path="/app" element={<App />} />`. Update the `<Header>` "OpenGraphDB" wordmark to be a `<Link to="/app">` so users can navigate back.
**Warning signs:** If the landing page renders at `/` and you can't reach the query interface, the route migration is incomplete.

### Pitfall 2: Sample Dataset Too Large or Too Small

**What goes wrong:** Too many nodes (50+) cause a hairball in the force simulation before cooldown. Too few (5) make the playground look toy-like and don't demonstrate relationship diversity.
**Why it happens:** `react-force-graph-2d` starts with all nodes overlapping and lets the simulation settle; large datasets take too long.
**How to avoid:** Keep the sample dataset to 20–35 nodes and 30–60 edges. The movies subset (10–15 movies, 10–15 people, all relationship types) hits this target comfortably.
**Warning signs:** Force simulation still animating after 5 seconds at default `d3AlphaDecay`; nodes never fully settle.

### Pitfall 3: Guided Query Buttons Showing Disconnected Nodes

**What goes wrong:** A query like "show only ACTED_IN relationships" filters links to ACTED_IN type but forgets to prune nodes that have no remaining edges — orphan nodes appear.
**Why it happens:** Naive `links.filter(l => l.type === 'ACTED_IN')` keeps all nodes from the original dataset.
**How to avoid:** In `runPlaygroundQuery`, after filtering links, compute the set of node IDs that appear in the filtered links and filter nodes to only those IDs. Include a utility test for this behavior.
**Warning signs:** Node count stays high while link count drops; graph looks sparse with many disconnected circles.

### Pitfall 4: react-force-graph-2d Mutation of graphData

**What goes wrong:** `react-force-graph-2d` mutates the `nodes` array in place (adds `x`, `y`, `vx`, `vy` properties). If the playground reuses the same `MOVIES_SAMPLE` reference across query button clicks, the simulation diverges unexpectedly.
**Why it happens:** The library modifies node objects directly for simulation state.
**How to avoid:** In `runPlaygroundQuery`, always return new node objects: `nodes: filteredNodes.map(n => ({ ...n }))`. Do not return references to the original constant's node objects.
**Warning signs:** Second click on a query button shows nodes snapping to their positions from the previous simulation instead of resettling.

### Pitfall 5: Bundle Size Regression

**What goes wrong:** Adding landing page and playground page JS into the main chunk pushes the initial bundle over 500KB (breaking FOUND-02).
**Why it happens:** Without `React.lazy`, Vite bundles all routes into a single chunk.
**How to avoid:** Always use `lazy(() => import('./pages/LandingPage'))` and `lazy(() => import('./pages/PlaygroundPage'))`. Verify with `npm run build` and inspect the output chunk sizes. The `graph-vendor` chunk (react-force-graph-2d) is already in `vite.config.ts` manualChunks.
**Warning signs:** `dist/assets/index-*.js` chunk exceeds 500KB after adding landing page imports.

### Pitfall 6: ThemeProvider Context Missing on New Routes

**What goes wrong:** Landing page or playground renders in a permanent light or dark mode ignoring the user's stored preference.
**Why it happens:** This pitfall does NOT apply here — `ThemeProvider` already wraps the entire app at `main.tsx` level, so all routes inherit it. If a developer accidentally moves `ThemeProvider` inside `App`, it would break for other routes.
**How to avoid:** Keep `ThemeProvider` at `main.tsx` level, above `BrowserRouter`. Never move it into `App.tsx`.
**Warning signs:** Landing page shows wrong theme; `document.documentElement` class does not update when toggling theme from inside the app.

---

## Code Examples

### Minimal Playground Page

```tsx
// src/pages/PlaygroundPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { MOVIES_SAMPLE, runPlaygroundQuery, type PlaygroundQueryKey } from '@/data/sampleGraph'
import type { GraphData } from '@/types/graph'

const GUIDED_QUERIES: { key: PlaygroundQueryKey; label: string; description: string }[] = [
  { key: 'all',         label: 'All nodes',        description: 'MATCH (n) RETURN n LIMIT 50' },
  { key: 'acted-in',    label: 'Actors & movies',  description: 'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p, m' },
  { key: 'directed',    label: 'Directors',         description: 'MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p, m' },
  { key: 'movies-only', label: 'Movies only',       description: 'MATCH (m:Movie) RETURN m' },
]

export default function PlaygroundPage() {
  const [graphData, setGraphData] = useState<GraphData>(MOVIES_SAMPLE)
  const [activeKey, setActiveKey] = useState<PlaygroundQueryKey>('all')

  const handleQuery = (key: PlaygroundQueryKey) => {
    setActiveKey(key)
    setGraphData(runPlaygroundQuery(key))
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <nav className="h-12 border-b flex items-center px-4 gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/">← Back</Link></Button>
        <span className="font-semibold text-sm">Playground — sample movies graph</span>
      </nav>
      <div className="border-b bg-card p-3 flex flex-wrap gap-2">
        {GUIDED_QUERIES.map(q => (
          <Button
            key={q.key}
            variant={activeKey === q.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleQuery(q.key)}
          >
            {q.label}
          </Button>
        ))}
        <code className="ml-auto self-center text-xs text-muted-foreground hidden sm:block">
          {GUIDED_QUERIES.find(q => q.key === activeKey)?.description}
        </code>
      </div>
      <div className="flex-1 overflow-hidden">
        <GraphCanvas graphData={graphData} />
      </div>
    </div>
  )
}
```

### Node-preserving Filter Utility

```typescript
// src/data/sampleGraph.ts — filterByRelationshipType helper
function filterByRelationshipType(type: string): GraphData {
  const filteredLinks = MOVIES_SAMPLE.links.filter(l => l.type === type)
  const nodeIds = new Set<string | number>()
  filteredLinks.forEach(l => {
    nodeIds.add(typeof l.source === 'object' ? (l.source as GraphNode).id : l.source)
    nodeIds.add(typeof l.target === 'object' ? (l.target as GraphNode).id : l.target)
  })
  return {
    nodes: MOVIES_SAMPLE.nodes.filter(n => nodeIds.has(n.id)).map(n => ({ ...n })),
    links: filteredLinks.map(l => ({ ...l })),
  }
}
```

### Unit Test for Filter Utility

```typescript
// src/data/sampleGraph.test.ts
import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { runPlaygroundQuery, MOVIES_SAMPLE } from './sampleGraph.js'

test('runPlaygroundQuery all returns full dataset', () => {
  const result = runPlaygroundQuery('all')
  assert.equal(result.nodes.length, MOVIES_SAMPLE.nodes.length)
})

test('runPlaygroundQuery acted-in returns only nodes in ACTED_IN links', () => {
  const result = runPlaygroundQuery('acted-in')
  const linkedIds = new Set(result.links.flatMap(l => [l.source, l.target]))
  for (const node of result.nodes) {
    assert.ok(linkedIds.has(node.id), `node ${node.id} has no link`)
  }
})

test('runPlaygroundQuery returns new node objects (no mutation aliasing)', () => {
  const r1 = runPlaygroundQuery('all')
  const r2 = runPlaygroundQuery('all')
  assert.notStrictEqual(r1.nodes[0], r2.nodes[0])
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-router-dom` as separate package from `react-router` | v7 merged all into `react-router`; `react-router-dom` is a re-export shim | React Router v7 (Nov 2024) | Import from `react-router-dom` still works; no migration required since the package is already installed |
| `Switch` + `Route` JSX in v5/v6 | `Routes` + `Route` with `element` prop in v6/v7 | React Router v6 (2021) | Already using v7 which uses `element` prop pattern |
| Tour libraries (Joyride, Reactour) for guided demos | Simple query-button arrays for playground guidance | n/a — project decision | Eliminates 50–80KB of tour library JS; sufficient for v1 evaluator experience |

**Deprecated/outdated:**
- `<Switch>` component: removed in v6+; use `<Routes>` instead.
- `history` package: no longer needed separately; react-router manages history internally.
- `exact` prop on `<Route>`: removed in v6+; v6+ routes are exact by default.

---

## Open Questions

1. **Which specific movies to include in the sample dataset**
   - What we know: The Neo4j movies graph has 38 people + 36 movies + ~170 edges total.
   - What's unclear: Should the playground include the full dataset or a curated 20-node subset? Full dataset is more impressive but may slow simulation.
   - Recommendation: Start with a 15–20 node subset (5 movies, 10–12 people, ~25 edges) that covers all three relationship types (ACTED_IN, DIRECTED, WROTE). This is a product decision; current research recommends the smaller subset for playground responsiveness.

2. **Landing page copy and differentiators**
   - What we know: REQUIREMENTS.md says "OpenGraphDB's key differentiators"; ARCHITECTURE.md documents the product's design.
   - What's unclear: Which 3–4 differentiators should be highlighted on the features section? (e.g., embedded Rust core, Cypher-first, MCP AI access, MVCC).
   - Recommendation: Read `ARCHITECTURE.md` at plan time and extract 3–4 concrete differentiator bullets. This is copy-writing, not a technology question.

3. **Navigation from `/app` back to landing page**
   - What we know: The current `Header` does not use React Router; it has no links.
   - What's unclear: Should the "OpenGraphDB" wordmark in the existing `Header` link to `/` (landing) or stay static?
   - Recommendation: Make the wordmark a `<Link to="/">` in the existing `Header.tsx`. Minimal change, improves discoverability.

---

## Validation Architecture

> Skipped: `workflow.nyquist_validation` is not present in `.planning/config.json`.

---

## Sources

### Primary (HIGH confidence)
- `react-router-dom` ^7.13.1 — confirmed installed in `frontend/package.json`
- `react-force-graph-2d` ^1.29.1 — confirmed installed; `GraphCanvas.tsx` already uses it
- React Router official docs (https://reactrouter.com/start/modes) — three modes confirmed; declarative mode SPA pattern verified
- React Router SPA docs (https://reactrouter.com/how-to/spa) — SPA mode is framework-mode only; declarative mode is self-managed
- `frontend/src/types/graph.ts` — `GraphData`, `GraphNode`, `GraphEdge` interfaces confirmed; sample data must conform to these

### Secondary (MEDIUM confidence)
- WebSearch: React Router v7 `react-router-dom` vs `react-router` package consolidation — confirmed across multiple sources; `react-router-dom` still works as shim in v7
- WebSearch: Neo4j movies graph structure (Person/Movie, ACTED_IN/DIRECTED/WROTE) — confirmed via multiple neo4j sources; well-established sample dataset
- WebSearch: `React.lazy` + `Suspense` + Vite `manualChunks` code splitting — confirmed pattern for keeping bundle under 500KB

### Tertiary (LOW confidence)
- WebSearch: Landing page evaluator conversion patterns with shadcn — general community guidance; specific copy/layout is product judgment

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed; no new uncertain dependencies
- Architecture: HIGH — routing pattern is straightforward BrowserRouter declarative mode; GraphCanvas reuse confirmed by reading source
- Pitfalls: HIGH — react-force-graph-2d mutation behavior is a known library behavior (confirmed by source inspection of existing GraphCanvas usage); bundle size concern is verifiable with `npm run build`

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable libraries; 30-day window)
