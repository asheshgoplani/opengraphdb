# Phase 6: Production Demo Datasets & Live Backend Integration - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Visitors can see OpenGraphDB working with rich, realistic data served from the actual backend. Create recognizable demo datasets loaded into the real database, wire the frontend to query them live (while keeping offline fallback), and provide a reproducible seed script. The frontend stops faking it with static JSON and showcases real query execution.

</domain>

<decisions>
## Implementation Decisions

### Dataset domains & scale
- Movies is the flagship dataset, using real movie data (actual titles, actors, directors like "The Matrix", "Keanu Reeves")
- Keep and expand existing social network and fraud detection datasets as secondary domains (currently ~15-18 nodes each, expand to ~200-500 nodes each)
- Target medium scale: ~200-500 nodes per dataset. Enough to feel substantial and real without overwhelming the graph canvas
- Three datasets total: movies (flagship), social (expanded), fraud (expanded)

### Live vs static mode
- Dual mode: keep the current offline playground as a fallback, add a "Live" mode toggle that switches to real backend queries
- When offline (no backend running), playground works exactly as today with in-memory data
- When live, guided query cards send actual Cypher to the backend via POST /query
- Hybrid query execution: guided queries use real Cypher AND show it in an editor so users can modify and re-run
- Landing page keeps static previews for instant rendering; clicking showcase cards opens the playground in live mode with the selected dataset
- /app route on connect: show schema panel (labels, relationship types) and suggest starter queries for loaded demo datasets. User clicks to run. No blank screen.

### Demo query showcase
- Progressive difficulty: start simple (MATCH all movies), build to medium (find collaborators), end with advanced (shortest path, recommendation patterns)
- Present queries as category tabs + query cards: group by category ("Explore", "Traverse", "Analyze") with cards showing Cypher, plain-English description, and expected result preview
- Show query execution timing prominently on every result (badge: "32ms", "12ms"). Trust-builder showing OpenGraphDB is fast.
- 5-8 demo queries per dataset, each highlighting a different capability

### Seed workflow & developer experience
- Store datasets as JSON import files matching the backend's import format: {nodes:[], edges:[]}. One file per dataset.
- Shell script at scripts/seed-demo.sh that creates/resets the database and loads all datasets via ogdb CLI commands
- Idempotent: delete existing database file, create fresh, import all datasets. Clean slate every time.
- Database path configurable via OGDB_DEMO_DB env var, defaulting to data/demo.ogdb (gitignored)

### Claude's Discretion
- Exact movie/actor/director selection for the movies dataset (aim for well-known, diverse films across decades)
- Specific category names and groupings for demo query tabs
- Social and fraud dataset expansion details (characters, relationships)
- Loading skeleton and error state designs for live mode
- Exact Cypher queries for each demo (as long as they follow progressive difficulty pattern)

</decisions>

<specifics>
## Specific Ideas

- Movies dataset should feel like Neo4j's classic movies graph but bigger and richer: actual movies, real actors, real directors, genre relationships, award nominations
- The dual mode toggle should be visually clear: visitors should immediately understand whether they're seeing live data or static samples
- Query timing display builds trust: "This isn't a mockup, it's a real database responding in 12ms"
- The seed script should be a one-liner experience: `./scripts/seed-demo.sh` and you have a fully loaded demo database ready to serve

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/data/datasets.ts`: Central dataset registry with `DatasetKey`, `DatasetMeta`, `getDatasetList()`, `getDatasetQueries()`, `runDatasetQuery()`. Can be extended with a "live" mode path
- `frontend/src/data/sampleGraph.ts`: Movies dataset (18 nodes, 31 links). Needs expansion to ~200-500 nodes
- `frontend/src/data/socialGraph.ts`: Social dataset (15 nodes, 30 links) with `GuidedQuery` interface defining `key`, `label`, `description`, `cypher`, `expectedResultCount`, `filterFn`
- `frontend/src/data/fraudGraph.ts`: Fraud dataset (17 nodes, 25 links) with similar structure
- `frontend/src/api/client.ts`: `ApiClient` class with `health()`, `query()`, `schema()` methods
- `frontend/src/api/queries.ts`: React Query hooks: `useHealthCheck()`, `useCypherQuery()`, `useSchemaQuery()`
- `frontend/src/components/landing/ShowcaseSection.tsx`: Uses `getDatasetList()` and `runDatasetQuery()` for mini-graph previews
- `frontend/src/components/playground/ConnectionBadge.tsx`: Shows "Sample Data" and timing. Needs live mode variant
- `frontend/src/components/playground/DatasetSwitcher.tsx`: Select element for switching datasets

### Established Patterns
- Zustand stores with localStorage persistence (`useSettingsStore` for server URL, `useGraphStore` for graph state)
- React Query for API interactions (5s polling for health, mutations for queries)
- In-memory `filterFn` pattern for playground queries (current offline approach)
- `GraphData` type: `{ nodes: GraphNode[], links: GraphEdge[] }` used throughout canvas rendering

### Integration Points
- **CRITICAL FIX NEEDED**: Backend `/query` returns `{columns, rows, row_count}` but frontend `transform.ts` expects `{nodes, relationships}`. The transform layer must be updated to parse graph data from row-based results, OR a graph-specific response format must be added to the backend.
- **CRITICAL FIX NEEDED**: Backend `/schema` returns `edge_types` but frontend `SchemaResponse` expects `relationshipTypes`. Field name mismatch.
- Backend `POST /import` accepts `{nodes:[], edges:[]}` JSON format, perfect for loading seed data
- Backend `ogdb import <path> <file>` CLI supports JSON/JSONL/CSV import
- Playground route `/playground` accepts `?dataset=` URL param for dataset selection

</code_context>

<deferred>
## Deferred Ideas

- Write-mode in playground (let visitors CREATE nodes/relationships live) — future phase
- Performance benchmarking page showing query timing across different dataset sizes — future phase
- User-uploadable datasets — future phase

</deferred>

---

*Phase: 06-demo-datasets-and-live-backend*
*Context gathered: 2026-03-01*
