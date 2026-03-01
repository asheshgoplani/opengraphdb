# Phase 5: Frontend Polish & Knowledge Graph Showcase - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish all frontend pages to production quality with a Linear/Vercel-inspired aesthetic. Add a knowledge graph showcase section to the landing page featuring real-world recognizable datasets. Redesign the playground with a split-pane layout, multiple switchable datasets, and visible database connection. Upgrade graph visualization rendering quality. Verify every page visually with Playwright screenshot tests.

</domain>

<decisions>
## Implementation Decisions

### Example Graphs Showcase (Landing Page)
- Interactive mini-graphs embedded in cards on the landing page
- Show real-world famous dataset references: Wikidata (90B+ triples), IMDB movie graph, PubMed citation network, etc.
- Each card shows dataset name, scale/node count, and a live mini-graph preview
- Mini-graphs are animated with physics simulation; hovering highlights connections and shows tooltips with node info (no drag)
- Clicking a showcase card navigates to /playground with that dataset loaded
- 2-3 showcase examples covering different domains

### Playground Redesign
- Split-pane layout: left side has Cypher editor with query buttons, right side has graph canvas
- Shows live connection status badge ("Connected to OpenGraphDB") + query execution timing (e.g., "12ms")
- Supports multiple switchable sample datasets via dropdown (movies, social network, fraud detection)
- Each dataset has its own set of guided queries
- Guided queries presented as cards showing Cypher, brief explanation, and expected result count. Click to run
- Stats panel showing node count, edge count, label count for current dataset

### Landing Page Visual Upgrade
- Live animated graph background behind hero text (subtle, slow-moving nodes and edges)
- Section flow: Hero + Knowledge Graph Showcase + Features + Getting Started + Footer
- Famous dataset references in the showcase section (Wikidata, IMDB, PubMed, etc.)
- Polished sticky nav with proper logo/wordmark, smooth scroll to sections, Playground + App buttons, blur backdrop
- Keep existing features (4 cards) and getting started (3 steps) sections but polish them heavily

### Graph Visualization Quality
- Keep react-force-graph-2d but heavily polish: better node shapes, gradient colors, glow effects, smoother animations, better edge rendering, proper color-coded legend
- Aim for a professional, mature look rather than the current basic rendering
- Improve node rendering: larger labels, better contrast, visual hierarchy
- Add graph legend showing node label colors

### Visual Quality Bar
- Target aesthetic: Linear / Vercel style (modern SaaS, dark backgrounds, subtle gradients, smooth transitions, refined typography)
- Push the existing shadcn/ui + Tailwind CSS v3 design system to premium quality
- Animation approach: subtle and purposeful (smooth page transitions, gentle hover effects, fade-in on scroll for landing page sections). Motion serves clarity, not decoration
- Every page must look polished in both light and dark mode
- Visual verification via Playwright screenshot tests for every page and key states

### Claude's Discretion
- Exact graph color palette and gradient choices
- Loading skeleton designs
- Error state styling
- Exact spacing and typography scale
- Node shape details (circle variants, border styles)
- Dark mode specific color adjustments
- Playwright test structure and baseline management

</decisions>

<specifics>
## Specific Ideas

- Landing page hero should feel like Linear or Vercel's landing page: bold, modern, with a live animated graph background that subtly communicates "graph database"
- Knowledge graph showcase should communicate "OpenGraphDB handles real-world scale" by referencing famous datasets people recognize (Wikidata, IMDB, PubMed)
- Playground split-pane should feel like Neo4j Browser but with a more modern aesthetic
- Query cards in playground should show the Cypher, explain what it does, and show expected results
- The connection status badge must be prominent so visitors immediately see the playground is connected to a real database
- Graph visualization should look mature and professional, not like a demo or prototype

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GraphCanvas` (src/components/graph/GraphCanvas.tsx): force-graph-2d wrapper with resize handling, node/edge click, colors. Will need heavy visual upgrades
- `NodeRenderer` (src/components/graph/NodeRenderer.ts): Custom canvas node painting. Primary target for visual polish
- `useGraphColors` (src/components/graph/useGraphColors.ts): Theme-aware color system for graph
- `Card` component (shadcn/ui): Used in FeaturesSection, reusable for showcase cards
- `Button`, `Badge`, `Dialog`, `Sheet`, `Table`, `Accordion`, `Input`: Full shadcn/ui toolkit available
- `MOVIES_SAMPLE` dataset (src/data/sampleGraph.ts): 18 nodes, 31 links. Needs 2 more datasets (social, fraud)
- `runPlaygroundQuery()`: Dataset query filter. Needs extension for multiple datasets

### Established Patterns
- Tailwind CSS v3 for all styling (no CSS modules, no styled-components)
- shadcn/ui components with `cn()` utility for class merging
- Zustand for client state (graph store), TanStack Query for server state
- React Router for navigation (/, /playground, /app)
- Lucide React for icons

### Integration Points
- `PlaygroundPage.tsx`: Needs full redesign (split pane, dataset switcher, query cards)
- `LandingPage.tsx`: Needs new showcase section, hero background, nav upgrade
- `HeroSection.tsx`: Needs animated graph background
- `FeaturesSection.tsx`: Needs visual polish
- `GettingStartedSection.tsx`: Needs visual polish
- `sampleGraph.ts`: Needs 2 additional sample datasets with query filters
- Router (App.tsx or equivalent): May need updated playground routes for dataset param

</code_context>

<deferred>
## Deferred Ideas

- 3D graph visualization (WebGL/Three.js) for a future "wow" phase
- Comparison table vs Neo4j/ArangoDB/etc on landing page
- CI integration for Playwright visual regression tests (manual review for now)

</deferred>

---

*Phase: 05-frontend-polish-and-showcase*
*Context gathered: 2026-03-01*
