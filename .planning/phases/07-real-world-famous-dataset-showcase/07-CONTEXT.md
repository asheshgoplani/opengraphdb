# Phase 7: Real-World Famous Dataset Showcase - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Import 4 industry-standard, well-known datasets that every graph DB vendor uses as pre-built showcases: MovieLens 25M, Air Routes (Kelvin Lawrence), Game of Thrones, and a Wikidata subset. Includes download scripts, format conversion to OpenGraphDB import format, seed scripts, guided queries for the playground, and landing page updates. This replaces the existing synthetic demo datasets with real, recognizable data.

</domain>

<decisions>
## Implementation Decisions

### Dataset Scale & Sampling
- **MovieLens**: Curated subset (~5K-10K movies with representative ratings from the 25M dataset). Full 25M ratings is too large for demo; keep recognizable MovieLens branding and structure
- **Air Routes**: Full dataset (3,500 airports, ~50K routes with lat/long coordinates). Reasonable size, and geographic data is critical for Phase 8's map rendering
- **Game of Thrones**: Full dataset (~400 characters with interactions broken down by season). Small enough to import completely; seasonal breakdown is the unique analytical value
- **Wikidata**: Curated thematic slice (Nobel Prize winners, countries, organizations, or similar). Target ~2K-5K entities with rich interconnections that demonstrate knowledge graph patterns

### Frontend Showcase Integration
- **Replace existing datasets**: The 3 existing synthetic datasets (movies, social, fraud) are replaced by the 4 famous real-world datasets. MovieLens replaces the synthetic movies graph; the other two synthetic datasets are retired
- **DatasetKey type**: Expand from `'movies' | 'social' | 'fraud'` to `'movielens' | 'airroutes' | 'got' | 'wikidata'`
- **Landing page ShowcaseSection**: Update to feature the 4 new datasets with real stats, recognizable domain names, and descriptions highlighting why each dataset is famous in the graph DB community
- **Playground DatasetSwitcher**: Each dataset gets its own entry with dataset-specific guided queries. The existing switcher pattern supports this
- **Dataset cards**: Show real node/edge counts, recognizable domain branding, 2-3 sentence description of the dataset's significance

### Data Pipeline Design
- **Download scripts**: Scripts in `scripts/` fetch from original sources (grouplens.org for MovieLens, GitHub for Air Routes and GoT, Wikidata SPARQL/dumps for Wikidata)
- **Format conversion**: Each dataset gets a conversion script that transforms original formats (CSV, JSON, TTL/SPARQL results) into OpenGraphDB's JSON import format
- **Not bundled in repo**: Data is downloaded at seed time, not committed to the repo. Cache downloaded files in `data/cache/` to avoid re-downloading
- **Seed script**: Extend existing `seed-demo.sh` to handle all 4 datasets. Add `--dataset` flag for individual dataset seeding. Keep idempotent (delete and recreate on each run)
- **Offline fallback**: Frontend keeps small static subsets (~50-100 nodes each) for offline playground mode, similar to current pattern

### Guided Query Design
- **5-7 guided queries per dataset**, categorized as Explore/Traverse/Analyze (matches existing GuidedQuery interface)
- **MovieLens queries**: Recommendation-style patterns ("movies similar viewers liked", "top-rated by genre", "actor collaboration networks", "connecting path between two actors"). Showcase graph-powered recommendations
- **Air Routes queries**: Geographic/pathfinding patterns ("routes from airport X", "shortest path between cities", "hub airports by connection count", "routes by continent"). These prepare for Phase 8's geographic rendering
- **GoT queries**: Character interaction networks ("interactions by season", "most connected characters", "house alliances", "character bridges between houses"). Narrative-driven graph exploration
- **Wikidata queries**: Knowledge graph patterns ("Nobel laureates by country", "organization relationships", "country connections through shared institutions"). Demonstrates semantic/knowledge graph use cases

### Claude's Discretion
- Exact node/edge counts for MovieLens and Wikidata subsets (within the target ranges above)
- Specific Wikidata SPARQL query or dump slice strategy
- Offline fallback subset selection criteria
- Conversion script implementation details (Python vs shell vs Node)
- Loading skeleton and progress indicators during dataset import

</decisions>

<specifics>
## Specific Ideas

- These are the 4 datasets that every graph database vendor (Neo4j, TigerGraph, Amazon Neptune) uses in their demos. Using the same datasets lets evaluators directly compare OpenGraphDB
- MovieLens source: https://grouplens.org/datasets/movielens/25m/
- Air Routes source: https://github.com/krlawrence/graph (Kelvin Lawrence's "Practical Gremlin" dataset)
- GoT source: https://github.com/neo4j-examples/game-of-thrones
- Wikidata source: https://dumps.wikimedia.org or SPARQL endpoint at https://query.wikidata.org
- Air Routes dataset MUST preserve lat/long coordinates on airport nodes since Phase 8 will render them on a geographic map
- The landing page should make visitors think "oh, they have REAL data, not toy examples"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `datasets.ts`: Dataset registry with `DatasetKey`, `DatasetMeta`, `DatasetEntry`, `GuidedQuery` interfaces. Extend this for new datasets
- `GuidedQuery` interface already supports `category`, `liveDescriptor`, `filterFn`, and `cypher` fields
- `ShowcaseSection.tsx` + `ShowcaseCard.tsx`: Landing page showcase cards that render dataset previews with mini-graphs
- `DatasetSwitcher.tsx`: Playground dataset selector, already supports multiple datasets
- `QueryCard.tsx`: Guided query cards with category grouping (Explore/Traverse/Analyze)
- `ConnectionBadge.tsx` + `LiveModeToggle.tsx`: Live backend integration components
- `seed-demo.sh`: Existing seed script that imports JSON datasets via `ogdb import`
- `datasets/` directory: Contains JSON import files (movies.json, social.json, fraud.json)

### Established Patterns
- Datasets defined as TypeScript modules exporting `GraphData` + `GuidedQuery[]` for offline mode
- JSON import format for backend: files in `datasets/` consumed by `ogdb import`
- `cloneGraphData`, `buildRelationshipSubgraph` helpers for query result filtering
- `buildDatasetMeta` for computing node/edge counts and label lists
- `GraphQueryDescriptor` for live mode query result transformation

### Integration Points
- `DATASETS` record in `datasets.ts`: Central registry, replace entries with new datasets
- `ShowcaseSection.tsx`: Iterates `getDatasetList()`, update to show 4 famous datasets
- `seed-demo.sh`: Extend with download + convert + import pipeline for each dataset
- `frontend/src/data/`: Add new dataset modules (movieLensGraph.ts, airRoutesGraph.ts, gotGraph.ts, wikidataGraph.ts)
- `api/client.ts`: No changes needed; existing query/schema/health endpoints serve new data
- Landing page and playground routes: No structural changes; data swap only

</code_context>

<deferred>
## Deferred Ideas

- Geographic map rendering for Air Routes (lat/long visualization) belongs to Phase 8
- Query trace animation (traversal highlighting) belongs to Phase 8
- AI-powered natural language queries over these datasets belongs to Phase 9
- User-uploaded custom datasets are out of scope for this phase (this is pre-built showcases only)

</deferred>

---

*Phase: 07-real-world-famous-dataset-showcase*
*Context gathered: 2026-03-02*
