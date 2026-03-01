# Stack Research

**Domain:** Graph database web frontend (React SPA with graph visualization, Cypher editor, admin dashboard)
**Researched:** 2026-03-01
**Confidence:** HIGH (core framework, build tooling, UI library verified via npm; visualization and editor choices verified via multiple sources)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2.4 | UI component model | Specified in project constraints; React 19 is current stable with improved concurrent features and Suspense support |
| TypeScript | 5.9.3 | Type safety across codebase | Industry standard for SPAs; catches API contract mismatches between frontend and REST API at compile time |
| Vite | 7.3.1 | Build tool and dev server | Specified in project constraints; instant HMR via native ESM, zero-config TypeScript/JSX support, fastest iteration cycle available |
| Tailwind CSS | 4.2.1 | Utility-first styling | Specified in project constraints; v4 is current stable — NOTE: v4 breaks configuration (no tailwind.config.js; CSS-first config) and is now the default for new shadcn/ui projects |
| shadcn/ui | 3.8.5 (CLI) | Component library | Specified in project constraints; copy-paste component model means no dependency lock-in; fully compatible with React 19 and Tailwind v4 as of Feb 2025 |

> **Tailwind v3 vs v4 decision:** Project constraints mention "Tailwind CSS v3" by name. However, as of March 2026, shadcn/ui new installs default to Tailwind v4. v4 is stable and broadly supported. Recommend using v4 for new projects; only use v3 if integrating with an existing v3 codebase. This stack document assumes v4.

### Routing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TanStack Router | 1.163.3 | Client-side routing | Best-in-class type safety for SPAs — route paths, params, and search params are all TypeScript-verified. Pure SPA mode (no SSR overhead). Pairs naturally with TanStack Query. React Router v7 is also viable but its advanced type safety only activates in framework mode, which requires SSR infrastructure we do not want |

### Data Fetching and Server State

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TanStack Query | 5.90.21 | Server state, caching, request lifecycle | Handles caching, background refetch, loading/error states, and mutation side effects against the OpenGraphDB REST API. Avoids manual fetch boilerplate in every component. Suspense support is stable in v5, which pairs with TanStack Router's loader API |

### Client State

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Zustand | 5.0.11 | Global client-side state | Manages non-server state: active query text, query history (before persistence), graph layout preferences, sidebar open/close, dark mode override. ~3KB, no boilerplate, no provider wrapping. v5 uses React 18's useSyncExternalStore for consistent rendering. Jotai is a reasonable alternative for purely atomic state but Zustand's store model is easier to reason about for shared mutable state like query history |

### Graph Visualization

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| react-force-graph | 1.48.2 | Force-directed graph rendering | Specified as primary candidate in project constraints. Uses Canvas/WebGL via d3-force-3d physics. React component API. Handles 1,000-node graphs comfortably (documented issues start at 5k+ nodes). Cytoscape.js has stronger layout algorithms but is harder to integrate with React's rendering model. Reagraph (4.30.8, WebGL-native) is a strong alternative if clustering or multiple built-in layouts are needed upfront |

**Performance note:** For graphs above ~2,000 nodes, `react-force-graph` requires disabling pointer tracking and pausing canvas redraws during simulation. For OpenGraphDB's typical development use case (hundreds to low thousands of nodes in a single query result), this is not an issue. Build with pagination or result limits (`LIMIT` in Cypher) to prevent overloading the visualization layer.

### Cypher Query Editor

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| CodeMirror 6 | 6.0.2 (core) / 6.39.15 (@codemirror/view) | Code editor foundation | Lightweight modular core (~300KB). Neo4j publishes a first-party Cypher language extension for CodeMirror 6 |
| @neo4j-cypher/react-codemirror | 2.0.0-next (latest: 2.0.0-next.26.5) | Cypher syntax, autocomplete, linting | Official Neo4j package providing Cypher language mode for CodeMirror 6 with React wrapper. The `latest` tag on npm is stuck at 1.0.4 (April 2024); the `next` tag at 2.0.0-next.26.5 is actively developed and used by Neo4j Browser itself. Use `next` tag for new projects |

**Alternative — Monaco Editor (@monaco-editor/react 4.7.0):** Monaco is the VS Code editor engine. It is 5-10MB uncompressed (vs CodeMirror's ~300KB core) and has no first-party Cypher mode. Cypher could be implemented as a custom Monaco language using `@neo4j-cypher/editor-support` primitives, but this is significantly more integration work. Monaco is the right choice if you want a full IDE experience (diff view, multi-cursor, breadcrumbs) and bundle size is not a constraint. For this project, CodeMirror 6 is the correct choice.

### Admin Dashboard Charts

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Recharts | 3.7.0 | Metrics charts in admin dashboard | Composable SVG charts built for React. Integrates cleanly with Tailwind for styling. Used by Tremor under the hood. Direct usage gives more flexibility than Tremor's opinionated wrapper. Suitable for health metrics, query latency, index stats. For simple dashboards, Tremor is faster to set up but hides Recharts internals |

### Data Tables

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TanStack Table | 8.21.3 | Tabular query results view | Headless table engine — no CSS opinions, pairs perfectly with shadcn/ui table components. Handles sorting, filtering, pagination of query results. Used extensively alongside shadcn/ui in the React admin dashboard ecosystem |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | 2.1.1 | Conditional className merging | Used in every component for conditional Tailwind classes |
| tailwind-merge | 3.5.0 | Tailwind class conflict resolution | Prevents duplicate utility class issues when composing components; required by shadcn/ui's `cn()` pattern |
| lucide-react | 0.575.0 | Icon set | Official shadcn/ui icon library; consistent with component design language |
| date-fns | 4.1.0 | Date formatting | Lightweight date utility for formatting query timestamps, history timestamps |
| axios | 1.13.6 | HTTP client | Alternative to fetch for OpenGraphDB REST API calls. Provides request/response interceptors, automatic JSON parsing, and cleaner error handling. Optional: TanStack Query works equally well with plain fetch |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Vitest | 4.0.18 | Unit and component testing | Native Vite integration; reuses the same config pipeline, no separate Jest setup needed. Requires Vite ≥6.0.0 and Node ≥20 |
| @testing-library/react | 16.3.2 | Component testing utilities | Encourages user-centric tests against rendered output, not implementation details |
| ESLint | (Vite default) | Linting | Use Vite's built-in ESLint template configuration |
| Prettier | (any) | Code formatting | Standard formatting; configure to run on save |

## Installation

```bash
# Scaffold project
npm create vite@latest opengraphdb-ui -- --template react-ts
cd opengraphdb-ui

# Core runtime dependencies
npm install react-force-graph @tanstack/react-router @tanstack/react-query zustand recharts @tanstack/react-table clsx tailwind-merge lucide-react date-fns axios

# CodeMirror + Cypher editor
npm install codemirror @codemirror/view @codemirror/state @codemirror/lang-javascript
npm install @neo4j-cypher/react-codemirror@next

# shadcn/ui (interactive CLI, run after Tailwind setup)
npx shadcn@latest init

# Dev dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom

# TanStack Router Vite plugin (for file-based routing, optional)
npm install -D @tanstack/router-plugin
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| TanStack Router | React Router v7 | When you are already in a React Router project, or need Remix-style full-stack routing with SSR. For a pure SPA with strict TypeScript, TanStack Router is better |
| TanStack Router | React Router v6 | Never for new projects in 2026. v6 is superseded by v7 |
| react-force-graph | Reagraph | When you need built-in clustering, multiple non-force layouts (circular, hierarchical), or a more opinionated WebGL rendering pipeline. Reagraph (4.30.8) is WebGL-native and has strong defaults; react-force-graph requires more manual tuning for complex layouts |
| react-force-graph | Cytoscape.js | When graph analysis features (centrality, path finding, complex graph theory queries) matter more than force-directed physics feel. Cytoscape has no React component — requires manual ref wrappers |
| react-force-graph | D3-force directly | When you need complete control over every rendering detail. Substantially more code; no pre-built React component to start from |
| @neo4j-cypher/react-codemirror | @monaco-editor/react | When you want VS Code-class editor features (IntelliSense, diff view, multi-cursor, breadcrumbs) and bundle size (~5-10MB) is acceptable. Monaco has no first-party Cypher mode; requires custom language integration |
| CodeMirror 6 | CodeMirror 5 | Never. CodeMirror 5 is end-of-life; the Neo4j Cypher packages target CodeMirror 6 |
| Recharts | Tremor | When you want zero-configuration dashboard components with opinionated design. Tremor wraps Recharts and is faster to set up but hides lower-level chart control |
| Recharts | Chart.js / react-chartjs-2 | When rendering performance with very large datasets matters. Chart.js uses Canvas for rendering; Recharts uses SVG. For a metrics dashboard with modest data points, this is not relevant |
| Zustand | Jotai | When component-local shared state (not global app state) is the primary use case. Jotai's atomic model provides finer re-render control but is harder to reason about for larger shared state like query history |
| Zustand | Redux Toolkit | When the team is large and action-based audit trails for state mutations are required. For a single-person project or small team, Zustand's minimal API is faster |
| TanStack Query | SWR | TanStack Query v5 has stronger mutation support, parallel query handling, and Suspense integration. SWR is simpler for basic use cases but offers less for admin-style UIs |
| Vitest | Jest | For new Vite projects, Jest requires extra config to handle ESM and TypeScript. Vitest reuses Vite's pipeline with zero additional config |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Create React App (CRA) | Unmaintained since 2023; slow builds; no native ESM | Vite 7 |
| Next.js | SSR/RSC overhead for a local static SPA; requires Node server or edge runtime | Vite + TanStack Router in SPA mode |
| Remix | Full-stack framework with server-side data loading; incompatible with pure static SPA deployment | Vite + TanStack Router |
| Tailwind CSS v3 for new projects | shadcn/ui defaults to v4 for new installs as of Feb 2025; mixing v3/v4 patterns causes confusion | Tailwind CSS v4 |
| cypher-codemirror (old package) | Explicitly deprecated by Neo4j in favor of `@neo4j-cypher/react-codemirror` | @neo4j-cypher/react-codemirror@next |
| @neo4j-cypher/react-codemirror@latest | The `latest` tag is pinned at 1.0.4 (April 2024) and is not receiving updates; all active development is on `next` | @neo4j-cypher/react-codemirror@next |
| Redux / Redux Toolkit | Excessive boilerplate and indirection for a single-user local tool; Zustand handles all required state with far less code | Zustand |
| Material UI / Ant Design | Heavy component libraries with their own design systems; clashes with Tailwind utility approach and shadcn/ui | shadcn/ui |
| Styled Components / Emotion | CSS-in-JS adds runtime overhead and does not pair with Tailwind's utility-first approach | Tailwind CSS utilities + shadcn/ui |
| Webpack | Slower builds; Vite is the correct choice for new React projects in 2026 | Vite |
| Bolt protocol from browser | Requires a WebSocket bridge server; adds infrastructure complexity for no benefit over HTTP REST | OpenGraphDB HTTP REST API (POST /query etc.) |

## Stack Patterns by Variant

**If visualizing very large graphs (5k+ nodes/edges in a single result):**
- Switch to Reagraph (WebGL-native, better memory handling) or add a result limit enforced in the Cypher editor
- Disable pointer tracking in react-force-graph with `enablePointerInteraction={false}` for rendering-only mode
- Use web workers to offload simulation: `react-force-graph` supports `cooldownTicks` to pause simulation after stabilization

**If deploying as a static SPA (default):**
- Vite `build` output goes to `dist/` and is served by any static host or directly by OpenGraphDB's embedded HTTP server
- TanStack Router in SPA mode generates a single `index.html` shell; configure server to serve `index.html` for all routes

**If adding the interactive demo/playground page:**
- Pre-load a bundled sample dataset as a static JSON file imported at build time
- No backend connection required for the demo; use a local in-memory graph store
- Use `zustand` to hold demo graph state separate from live query state

**If query history needs persistence across sessions:**
- Store via `localStorage` keyed to the configured server URL
- Use `zustand` middleware (`persist`) to sync store slices to localStorage automatically

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| React 19 | shadcn/ui (3.8.5+) | Fully compatible as of Feb 2025 update |
| React 19 | TanStack Query 5.x | Fully compatible; Suspense support is stable |
| React 19 | TanStack Router 1.x | Fully compatible |
| React 19 | react-force-graph 1.48.2 | Compatible; uses functional React APIs |
| Tailwind v4 | shadcn/ui (3.8.5+) | Default for new projects; CSS-first config replaces tailwind.config.js |
| Tailwind v4 | Vitest 4.x | No conflict; Tailwind is runtime-only |
| @neo4j-cypher/react-codemirror@next | CodeMirror 6.x | Requires CodeMirror 6 core packages (codemirror, @codemirror/state, @codemirror/view) |
| Vite 7.x | Vitest 4.x | Requires Vite ≥6.0.0; Vite 7 is compatible |
| TanStack Router 1.x | TanStack Query 5.x | Designed to work together; Router's loader API can prefetch Query cache entries |

## Sources

- npm registry (live queries, 2026-03-01): react-force-graph@1.48.2, recharts@3.7.0, zustand@5.0.11, @tanstack/react-query@5.90.21, @tanstack/react-router@1.163.3, vite@7.3.1, react@19.2.4, typescript@5.9.3, tailwindcss@4.2.1, shadcn@3.8.5 (CLI), codemirror@6.0.2, vitest@4.0.18, @testing-library/react@16.3.2
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 compatibility confirmed HIGH
- [shadcn/ui React 19 docs](https://ui.shadcn.com/docs/react-19) — React 19 compatibility confirmed HIGH
- [TanStack Router overview](https://tanstack.com/router/latest/docs/overview) — SPA mode, type safety confirmed HIGH
- [TanStack Query v5 announcement](https://tanstack.com/blog/announcing-tanstack-query-v5) — Suspense support confirmed HIGH
- [react-force-graph GitHub](https://github.com/vasturiano/react-force-graph) — Features and performance limits MEDIUM (GitHub issues, not official benchmarks)
- [@neo4j-cypher/react-codemirror npm](https://www.npmjs.com/package/@neo4j-cypher/react-codemirror) — Version 2.0.0-next confirmed; `latest` tag frozen at 1.0.4 MEDIUM
- [neo4j/cypher-editor GitHub](https://github.com/neo4j/cypher-editor) — Deprecated cypher-codemirror; next recommended MEDIUM
- [neo4j/cypher-language-support GitHub](https://github.com/neo4j/cypher-language-support) — Early stage, not stable LOW (avoid for production)
- [Cylynx comparison: JS graph libraries](https://www.cylynx.io/blog/a-comparison-of-javascript-graph-network-visualisation-libraries/) — Visualization library comparison MEDIUM
- [Sourcegraph Monaco to CodeMirror migration](https://sourcegraph.com/blog/migrating-monaco-codemirror) — Size and DX comparison MEDIUM
- [TanStack Router vs React Router v7 (Jan 2026)](https://medium.com/ekino-france/tanstack-router-vs-react-router-v7-32dddc4fcd58) — Routing comparison MEDIUM
- [State management 2025 analysis](https://makersden.io/blog/react-state-management-in-2025) — Zustand recommendation MEDIUM

---
*Stack research for: OpenGraphDB web frontend (React SPA, graph visualization, Cypher editor, admin dashboard)*
*Researched: 2026-03-01*
