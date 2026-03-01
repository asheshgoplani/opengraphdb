# Phase 6: Production Demo Datasets & Live Backend Integration - Research

**Researched:** 2026-03-01
**Domain:** Backend API integration, dataset design, frontend live-mode architecture
**Confidence:** HIGH (all findings from direct source code inspection)

## Summary

Phase 6 wires the frontend playground to a real OpenGraphDB backend running rich demo datasets. The core challenge is a structural mismatch: the frontend was built expecting a Neo4j-style `{nodes, relationships}` response format, but the actual backend returns a row-columnar `{columns, rows, row_count}` format where nodes are just integer IDs. Additionally, the schema endpoint uses `edge_types` but the frontend type expects `relationshipTypes`.

The implementation has three distinct tracks: (1) fix the frontend-backend interface mismatches, (2) create rich demo JSON datasets and a seed script, (3) add a live-mode toggle to the playground that queries the real backend.

**Primary recommendation:** Transform query responses in the frontend by writing graph-aware Cypher queries that project node/edge data as property maps using `PROPERTIES(n)`, then reconstruct `GraphData` from the columnar row results. Do not change the backend response format.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Movies is the flagship dataset using real movie data (actual titles, actors, directors like "The Matrix", "Keanu Reeves")
- Keep and expand existing social network and fraud detection datasets as secondary domains (currently ~15-18 nodes each, expand to ~200-500 nodes each)
- Target medium scale: ~200-500 nodes per dataset
- Three datasets total: movies (flagship), social (expanded), fraud (expanded)
- Dual mode: keep current offline playground as fallback, add a "Live" mode toggle
- When offline, playground works exactly as today with in-memory data
- When live, guided query cards send actual Cypher to the backend via POST /query
- Hybrid query execution: guided queries use real Cypher AND show it in an editor
- Landing page keeps static previews for instant rendering
- /app route on connect: show schema panel and suggest starter queries
- Progressive difficulty: simple -> medium -> advanced
- Category tabs: "Explore", "Traverse", "Analyze" with cards showing Cypher, description, result preview
- Show query execution timing prominently on every result ("32ms", "12ms")
- 5-8 demo queries per dataset
- Store datasets as JSON import files: `{nodes:[], edges:[]}` format
- Shell script at `scripts/seed-demo.sh`, idempotent reset and reload
- Database path configurable via `OGDB_DEMO_DB` env var, defaulting to `data/demo.ogdb`

### Claude's Discretion
- Exact movie/actor/director selection
- Specific category names and groupings for demo query tabs
- Social and fraud dataset expansion details
- Loading skeleton and error state designs for live mode
- Exact Cypher queries for each demo

### Deferred Ideas (OUT OF SCOPE)
- Write-mode in playground (let visitors CREATE nodes/relationships live)
- Performance benchmarking page showing query timing across dataset sizes
- User-uploadable datasets
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEMO-03 | User can access an interactive playground with a pre-loaded sample graph | Expanded datasets in JSON import format, expanded offline data |
| DEMO-04 | User can run guided example queries demonstrating graph visualization | Live-mode toggle, transform layer, Cypher query design |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@tanstack/react-query` | existing | API mutations and queries | `useMutation` for live Cypher queries |
| `zustand` + `persist` | existing | Settings and graph state | Add `isLiveMode` to settings or playground state |
| `react-router-dom` | existing | Route params (`?dataset=`, `?mode=live`) | Already used for dataset param |
| `fetch` (built-in) | n/a | HTTP to backend | Already in `ApiClient` |

### No New Dependencies Required
All tooling for live mode is already in the project. The work is configuration and transformation logic.

**Seed script runtime:** bash (no Node required; `ogdb` CLI binary must be in PATH or at known path)

## Architecture Patterns

### Backend Response Formats (VERIFIED from source code)

#### POST /query
Request: `{"query": "MATCH (n:Movie) RETURN n.title AS title, n.released AS released"}`

Response (HIGH confidence, verified from `QueryResult::to_json()` in `ogdb-core/src/lib.rs:830`):
```json
{
  "columns": ["title", "released"],
  "rows": [
    {"title": "The Matrix", "released": 1999},
    {"title": "Inception", "released": 2010}
  ],
  "row_count": 2
}
```

**CRITICAL FINDING:** When a query returns a bare node variable (`RETURN n`), the value in each row is just the integer node ID (`{"n": 0}`), not a full node object. This is because `RuntimeValue::Node(u64)` is converted to `PropertyValue::I64(node_id)` via `runtime_to_property_value()` before JSON serialization.

**Working approach for graph data:** Write Cypher queries that explicitly project properties using `PROPERTIES(n)`:
```cypher
MATCH (m:Movie)
RETURN m.title AS title, m.released AS released, PROPERTIES(m) AS props
```

Or for relationship traversals:
```cypher
MATCH (p:Person)-[r:ACTED_IN]->(m:Movie)
RETURN p.name AS person, m.title AS movie, PROPERTIES(p) AS personProps, PROPERTIES(m) AS movieProps
```

**Supported Cypher functions** (verified from source): `PROPERTIES(n)`, `KEYS(n)`, `SIZE()`, `LENGTH()`, `TOUPPER()`, `TOLOWER()`, `HEAD()`, `TAIL()`, `RANGE()`, `COALESCE()`, `DATE()`, `DATETIME()`, `DURATION()`, `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `COLLECT`.

**NOT supported:** `id(n)`, `labels(n)`, `type(r)`, `startNode(r)`, `endNode(r)` — these standard Cypher introspection functions are absent from the function evaluator.

#### GET /schema
Response (HIGH confidence, verified from `dispatch_http_request` in `lib.rs:3905`):
```json
{
  "labels": ["Movie", "Person"],
  "edge_types": ["ACTED_IN", "DIRECTED"],
  "property_keys": ["born", "name", "released", "title"]
}
```

Frontend `SchemaResponse` type expects `relationshipTypes` and `propertyKeys`. Two fixes needed:
1. `edge_types` → `relationshipTypes`
2. `property_keys` → `propertyKeys`

#### POST /import
Request body (HIGH confidence, verified from `JsonGraphPayload` struct at `lib.rs:4678`):
```json
{
  "nodes": [
    {"id": 0, "labels": ["Movie"], "properties": {"title": "The Matrix", "released": 1999}},
    {"id": 1, "labels": ["Person"], "properties": {"name": "Keanu Reeves", "born": 1964}}
  ],
  "edges": [
    {"src": 1, "dst": 0, "type": "ACTED_IN", "properties": {"roles": ["Neo"]}}
  ]
}
```

**CRITICAL CONSTRAINT:** Node `id` must be a `u64` (unsigned 64-bit integer). The existing social graph uses string IDs like `"u1"`, `"acc-001"` — these will NOT work for import. All IDs in JSON import files must be sequential integers starting from 0.

Response on success:
```json
{"status": "ok", "imported_nodes": 1, "imported_edges": 1}
```

#### GET /health
Response: `{"status": "ok"}` (200) or connection refused (no backend).

#### CORS
**CRITICAL FINDING:** The backend HTTP server does NOT set any CORS headers (verified: `write_http_response` at `lib.rs:3609` only writes `Content-Type`, `Content-Length`, `Connection`). The Vite dev server already has a proxy configured at `/api` → `http://localhost:8080` (verified: `vite.config.ts`). However, `ApiClient` currently uses the full URL from settings (e.g., `http://localhost:8080`), bypassing the proxy.

**Options:**
1. Keep direct URL access — works in production when frontend and backend are same origin or CORS is added to backend
2. Use `/api` proxy path in dev — requires detecting dev vs prod environment or always routing through Vite proxy
3. Add CORS headers to backend — simplest cross-origin fix but requires backend code change

**Recommended:** For the live mode toggle, use the existing `serverUrl` from settings (default `http://localhost:8080`). Since the backend serves locally in the demo scenario, CORS won't be an issue for same-machine requests. Document this in the seed script. If cross-origin issues arise, the Vite proxy `/api` path is already wired.

### Transform Layer Strategy

The existing `transform.ts` expects `{nodes, relationships}` but the backend returns `{columns, rows, row_count}`. The fix is to update the transform to parse the row-based format.

For graph visualization, the frontend must use "graph-mode" Cypher queries that return enough data per row to reconstruct nodes and edges. Two strategies:

**Strategy A: Dedicated Graph Queries (Recommended)**
Write specific Cypher queries for each demo visualization that return node/edge data as named columns with enough information:

```cypher
-- Node-only query (movies):
MATCH (m:Movie)
RETURN m.title AS title, m.released AS year, PROPERTIES(m) AS props
-- Transform: each row is a node with label "Movie", id synthesized from row index

-- Relationship query (acted-in):
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name AS personName, m.title AS movieTitle, PROPERTIES(p) AS personProps, PROPERTIES(m) AS movieProps
-- Transform: deduplicate nodes, create edges
```

**Strategy B: ID-passing Queries**
Since `id(n)` doesn't exist, use the `id` property if nodes are created with it, or include the backend node ID by injecting it as a property during import (`"_id": 0`). Then query `RETURN n._id AS nid, PROPERTIES(n) AS props`.

**Recommended approach (Strategy A):** Do not rely on backend-assigned IDs for graph visualization. Instead, each demo query knows its structure and assigns stable display IDs from the row data. The transform layer converts row results into `GraphData` by treating each unique value in a "node" column as a node.

### Live Mode Toggle Architecture

The playground needs a `isLiveMode` boolean state. When live:
1. `handleQueryRun` calls `ApiClient.query(cypher)` via `useCypherQuery` hook
2. Response is parsed by an updated `transformQueryResponse()` that handles `{columns, rows, row_count}`
3. Query timing comes from the mutation's lifecycle (`performance.now()` around the mutation call)
4. ConnectionBadge shows "Live" with timing vs "Sample Data"

When offline:
1. Works exactly as today using `runDatasetQuery()`
2. ConnectionBadge shows "Sample Data"

The `GuidedQuery` interface needs to preserve the `cypher` field — it already has it. In live mode, each `QueryCard` click sends `query.cypher` directly to the backend.

### Playground Page Changes

```
PlaygroundPage
├── header: mode toggle (offline/live) + ConnectionBadge
├── sidebar:
│   ├── DatasetSwitcher (existing)
│   ├── GuidedQueries (existing QueryCards + category grouping)
│   └── StatsPanel (existing)
└── main: GraphCanvas (existing)
```

New state needed:
```typescript
const [isLiveMode, setIsLiveMode] = useState(false)
const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'error'>('idle')
```

### Recommended Project Structure

```
scripts/
└── seed-demo.sh              # Seed script (new)

frontend/src/
├── api/
│   ├── client.ts             # Already exists — no changes needed
│   ├── queries.ts            # Already exists — no changes needed
│   └── transform.ts          # UPDATE: handle {columns, rows, row_count}
├── data/
│   ├── datasets.ts           # UPDATE: add liveQuery to GuidedQuery interface
│   ├── sampleGraph.ts        # UPDATE: expand to 200-500 nodes
│   ├── socialGraph.ts        # UPDATE: expand to 200-500 nodes
│   └── fraudGraph.ts         # UPDATE: expand to 200-500 nodes
├── types/
│   └── api.ts                # UPDATE: fix SchemaResponse field names
├── components/playground/
│   ├── ConnectionBadge.tsx   # UPDATE: live vs offline states
│   └── [new] LiveModeToggle.tsx
└── pages/
    └── PlaygroundPage.tsx    # UPDATE: live mode state and handlers

data/                         # Git-ignored directory (new)
└── demo.ogdb                 # Created by seed script

datasets/                     # New directory for import files
├── movies.json               # ~200-500 nodes
├── social.json               # ~200-500 nodes
└── fraud.json                # ~200-500 nodes
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP requests to backend | Custom fetch wrappers | Existing `ApiClient` class | Already handles errors, base URL |
| React server state | Manual loading/error state | `useMutation` from TanStack Query | Already wired, handles retries |
| Settings persistence | Manual localStorage | Zustand `persist` middleware | Already used for serverUrl |
| Query timing | `setTimeout` tricks | `performance.now()` around mutation call | Already used in offline mode |
| CORS proxy | Custom proxy server | Vite `server.proxy` already at `/api` | Already configured |
| Demo data deduplication | Custom diff logic | Just use idempotent seed script (delete + recreate) | Simpler than tracking state |

**Key insight:** The offline playground is a filterFn over in-memory data. The live playground is a fetch to the backend. The `GuidedQuery` already carries `cypher` — that's the query to send. The transform layer is the only new code needed for the live path.

## Common Pitfalls

### Pitfall 1: Node IDs must be u64 in Import Files
**What goes wrong:** Import JSON with string IDs like `"u1"` silently fails or errors.
**Why it happens:** `JsonNodeRecord.id` is `u64` — it deserializes from JSON numbers only.
**How to avoid:** All node IDs in `{nodes:[], edges:[]}` import files must be sequential unsigned integers (0, 1, 2...). String IDs in the existing TypeScript data files are fine for offline mode but cannot be used in import files.
**Warning signs:** `invalid json import payload` error from backend on seed.

### Pitfall 2: `id()` and `labels()` Cypher Functions Don't Exist
**What goes wrong:** Query `MATCH (n) RETURN id(n) AS id, labels(n) AS labels` returns null for all values.
**Why it happens:** These functions are not in the executor's FunctionCall handler — unrecognized functions return `RuntimeValue::Null`.
**How to avoid:** Use property access (`n.title`, `n.name`) and `PROPERTIES(n)` for the properties map. Embed the label as a property during import (`"_label": "Movie"`) or use label-specific queries per demo card (e.g., `MATCH (m:Movie)`).
**Warning signs:** Graph visualization shows nodes with no labels or empty property panels.

### Pitfall 3: RETURN n Returns Just an Integer, Not a Node Object
**What goes wrong:** `MATCH (n) RETURN n` produces `{"columns": ["n"], "rows": [{"n": 0}], "row_count": 1}`. Trying to extract node data from the integer `0` fails.
**Why it happens:** `RuntimeValue::Node(u64)` → `PropertyValue::I64(node_id)` during materialization.
**How to avoid:** Always use property-projecting queries for graph visualization. For each demo query, return named columns: `RETURN m.title AS title, m.released AS released`.
**Warning signs:** Graph canvas shows no nodes, or nodes with no properties.

### Pitfall 4: Schema Field Name Mismatch
**What goes wrong:** `SchemaPanel` shows empty relationship types because `schema.relationshipTypes` is undefined (backend returns `edge_types`).
**Why it happens:** Frontend `SchemaResponse` type has `relationshipTypes` and `propertyKeys`, but backend sends `edge_types` and `property_keys`.
**How to avoid:** Fix `SchemaResponse` type AND the transform in `useSchemaQuery` or in `ApiClient.schema()` to rename the fields.
**Warning signs:** Schema panel shows labels but empty relationship types list.

### Pitfall 5: CORS in Non-Proxy Scenarios
**What goes wrong:** When the frontend is served from a different origin than the backend, all fetch calls fail with CORS errors.
**Why it happens:** Backend has no `Access-Control-Allow-Origin` headers.
**How to avoid:** In the seed demo scenario, the frontend is served via `vite dev` which proxies through `/api`. Document in the seed script that users should also start Vite dev. For production builds, serve both from the same origin or add CORS to backend.
**Warning signs:** Browser console shows "CORS error" or "blocked by CORS policy".

### Pitfall 6: Duplicate Edges in Graph Visualization
**What goes wrong:** When a query returns multiple rows that share the same source/target nodes, deduplication logic in the transform creates duplicate node entries.
**Why it happens:** Each row in a relationship query returns both nodes and the edge. Without deduplication by node "identity", the same actor appears multiple times.
**How to avoid:** In the live transform layer, use a `Map<string, GraphNode>` keyed by a unique identifier (e.g., `Movie:The Matrix`) to deduplicate nodes before building the `GraphData`.
**Warning signs:** Graph shows multiple copies of the same node overlapping.

### Pitfall 7: Social/Fraud Expanded Datasets with String IDs Offline but Integer IDs for Import
**What goes wrong:** The expanded TypeScript offline datasets use string IDs (`"u1"`, `"acc-001"`) which the import JSON cannot use.
**Why it happens:** The offline `GraphData` format uses `string | number` IDs. The backend import requires `u64`.
**How to avoid:** Maintain two parallel representations: TypeScript offline data (string IDs fine) and JSON import files (integer IDs, sequential from 0). The mapping is: u1=100, u2=101... for social; acc-001=200... for fraud.
**Warning signs:** Import fails with "invalid json import payload" or node not found for edge.

## Code Examples

Verified patterns from source code and existing codebase:

### Backend Import JSON Format (HIGH confidence)
```json
{
  "nodes": [
    {"id": 0, "labels": ["Movie"], "properties": {"title": "The Matrix", "released": 1999, "_label": "Movie"}},
    {"id": 1, "labels": ["Person"], "properties": {"name": "Keanu Reeves", "born": 1964, "_label": "Person"}}
  ],
  "edges": [
    {"src": 1, "dst": 0, "type": "ACTED_IN", "properties": {"roles": ["Neo"]}}
  ]
}
```

Note: `_label` as a property is optional but helps since `labels(n)` is not supported in Cypher.

### Updated SchemaResponse Type Fix
```typescript
// frontend/src/types/api.ts - BEFORE
export interface SchemaResponse {
  labels: string[]
  relationshipTypes: string[]
  propertyKeys: string[]
}

// AFTER: match what backend actually sends
export interface SchemaResponse {
  labels: string[]
  edge_types: string[]       // backend sends this
  property_keys: string[]    // backend sends this
  // keep aliases for backward compat if schema panel uses old names
}
```

Or fix in the client:
```typescript
// frontend/src/api/client.ts
async schema(): Promise<SchemaResponse> {
  const raw = await this.request<{labels: string[], edge_types: string[], property_keys: string[]}>('/schema')
  return {
    labels: raw.labels,
    relationshipTypes: raw.edge_types,
    propertyKeys: raw.property_keys,
  }
}
```

### Updated Transform for Live Mode (HIGH confidence)
```typescript
// frontend/src/api/transform.ts

interface BackendQueryResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

// For a query like:
// MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
// RETURN p.name AS personName, PROPERTIES(p) AS personProps,
//        m.title AS movieTitle, PROPERTIES(m) AS movieProps
interface GraphQueryDescriptor {
  nodeColumns: Array<{
    nameCol: string       // column with unique name (e.g., "personName")
    propsCol: string      // column with PROPERTIES(n) map (e.g., "personProps")
    label: string         // synthetic label for visualization
  }>
  edgeDescriptors?: Array<{
    srcCol: string        // column identifying edge source
    dstCol: string        // column identifying edge target
    type: string          // relationship type
  }>
}

export function transformLiveResponse(
  response: BackendQueryResponse,
  descriptor: GraphQueryDescriptor
): GraphData {
  const nodeMap = new Map<string, GraphNode>()
  const links: GraphEdge[] = []

  for (const row of response.rows) {
    for (const { nameCol, propsCol, label } of descriptor.nodeColumns) {
      const name = String(row[nameCol] ?? '')
      if (!name || name === 'null') continue
      const key = `${label}:${name}`
      if (!nodeMap.has(key)) {
        const props = (row[propsCol] as Record<string, unknown>) ?? {}
        nodeMap.set(key, {
          id: key,
          labels: [label],
          properties: props,
          label,
        })
      }
    }
    // Add edge if edge descriptors present
    if (descriptor.edgeDescriptors) {
      for (const { srcCol, dstCol, type } of descriptor.edgeDescriptors) {
        const srcLabel = descriptor.nodeColumns.find(c => c.nameCol === srcCol)?.label ?? ''
        const dstLabel = descriptor.nodeColumns.find(c => c.nameCol === dstCol)?.label ?? ''
        const srcName = String(row[srcCol] ?? '')
        const dstName = String(row[dstCol] ?? '')
        if (!srcName || !dstName) continue
        links.push({
          id: `${srcName}--${type}--${dstName}`,
          source: `${srcLabel}:${srcName}`,
          target: `${dstLabel}:${dstName}`,
          type,
          properties: {},
        })
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), links }
}
```

### Demo Query Card Extended Interface
```typescript
// frontend/src/data/datasets.ts

export interface GuidedQuery {
  key: string
  label: string
  description: string
  cypher: string
  expectedResultCount: number
  filterFn: (data: GraphData) => GraphData  // offline mode
  // NEW: live mode descriptor for transform
  liveDescriptor?: GraphQueryDescriptor
  category?: 'Explore' | 'Traverse' | 'Analyze'
  timingHint?: string  // e.g., "expected < 5ms"
}
```

### Seed Script Pattern (idempotent)
```bash
#!/usr/bin/env bash
# scripts/seed-demo.sh
set -euo pipefail

OGDB_DEMO_DB="${OGDB_DEMO_DB:-data/demo.ogdb}"
OGDB_BIN="${OGDB_BIN:-ogdb}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATASETS_DIR="$SCRIPT_DIR/../datasets"

echo "Seeding demo database at: $OGDB_DEMO_DB"

# Idempotent: delete and recreate
if [ -f "$OGDB_DEMO_DB" ]; then
  echo "Removing existing database..."
  rm -f "$OGDB_DEMO_DB" "${OGDB_DEMO_DB}-wal" "${OGDB_DEMO_DB}-meta.json"
fi

mkdir -p "$(dirname "$OGDB_DEMO_DB")"

echo "Creating database..."
"$OGDB_BIN" init "$OGDB_DEMO_DB"

echo "Importing movies dataset..."
"$OGDB_BIN" import "$OGDB_DEMO_DB" "$DATASETS_DIR/movies.json"

echo "Importing social dataset..."
"$OGDB_BIN" import "$OGDB_DEMO_DB" "$DATASETS_DIR/social.json"

echo "Importing fraud dataset..."
"$OGDB_BIN" import "$OGDB_DEMO_DB" "$DATASETS_DIR/fraud.json"

echo "Done. Start the server:"
echo "  ogdb serve \$OGDB_DEMO_DB --http"
```

### Movies Dataset Design (~200-500 nodes)

The expanded movies dataset should include (at minimum):
- **Movies (30-50):** Real titles across decades: The Matrix trilogy, Star Wars series, The Godfather, Inception, Pulp Fiction, The Dark Knight trilogy, Forrest Gump, The Shawshank Redemption, Jurassic Park, Titanic, Schindler's List, Good Will Hunting, The Silence of the Lambs, Fight Club, Interstellar, Avengers series, Top Gun + Maverick, Cast Away, Philadelphia
- **Persons (100-200):** Real actors and directors: Keanu Reeves, Tom Hanks, Meryl Streep, Leonardo DiCaprio, Morgan Freeman, Tom Cruise, Jodie Foster, Anthony Hopkins, Brad Pitt, Matt Damon, Wachowskis, Christopher Nolan, Steven Spielberg, Francis Ford Coppola, Quentin Tarantino
- **Genres (8-12):** Action, Drama, Thriller, Sci-Fi, Crime, Comedy, Animation, Horror, Romance, Documentary
- **Relationships:** ACTED_IN (with roles property), DIRECTED, WROTE, IN_GENRE, NOMINATED_FOR (connect movies to award categories)

Node IDs: sequential integers starting from 0.
Movie nodes: id 0-49
Person nodes: id 50-249
Genre nodes: id 250-261

### Cypher Queries for Demo Cards

**Movies dataset (6 demo queries):**

Explore category:
```cypher
-- "All movies" (simple)
MATCH (m:Movie) RETURN m.title AS title, m.released AS year, PROPERTIES(m) AS props

-- "Cast directory" (medium)
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name AS person, m.title AS movie, PROPERTIES(p) AS personProps, PROPERTIES(m) AS movieProps
```

Traverse category:
```cypher
-- "Director filmography"
MATCH (p:Person)-[:DIRECTED]->(m:Movie)
RETURN p.name AS director, m.title AS movie, PROPERTIES(p) AS personProps, PROPERTIES(m) AS movieProps

-- "Genre map"
MATCH (m:Movie)-[:IN_GENRE]->(g:Genre)
RETURN m.title AS movie, g.name AS genre, PROPERTIES(m) AS movieProps, PROPERTIES(g) AS genreProps
```

Analyze category:
```cypher
-- "Actor collaborations" (find actors who appeared in same movies)
MATCH (a1:Person)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(a2:Person)
WHERE a1.name < a2.name
RETURN a1.name AS actor1, a2.name AS actor2, m.title AS sharedMovie,
       PROPERTIES(a1) AS actor1Props, PROPERTIES(a2) AS actor2Props, PROPERTIES(m) AS movieProps

-- "Prolific directors"
MATCH (p:Person)-[:DIRECTED]->(m:Movie)
RETURN p.name AS director, COUNT(m) AS movieCount, PROPERTIES(p) AS props
ORDER BY movieCount DESC
LIMIT 10
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static JSON mock data | Live backend query | Phase 6 | Real query performance visible |
| Offline-only playground | Dual offline + live | Phase 6 | Demo shows real OpenGraphDB |
| Mocked timing labels | Real `elapsed_micros` from backend | Phase 6 | Trust-builder for evaluators |

**Deprecated/outdated:**
- The existing `QueryResponse` type in `api.ts` (expects `{nodes, relationships}`) is wrong relative to the backend. This was presumably aspirational from Phase 1 and was never connected to a real backend.

## Open Questions

1. **Does `ogdb import` append to or replace existing data?**
   - What we know: The import command adds records; there is no replace/upsert by ID behavior visible in the code
   - What's unclear: If we run `ogdb import` twice, do node IDs conflict? The backend checks for duplicate IDs via `apply_import_node_record`
   - Recommendation: Use the idempotent pattern: delete database file, recreate, then import. The seed script should always start fresh.

2. **Which node ID range does each dataset get?**
   - What we know: All three datasets will be imported into one database; IDs must be globally unique u64 values
   - What's unclear: Whether we use separate ID ranges per dataset or a single sequential global range
   - Recommendation: Use separate non-overlapping ranges: movies 0-499, social 500-999, fraud 1000-1499. This keeps datasets conceptually separate even in the shared database.

3. **Does the backend support filtering by a `_dataset` property?**
   - What we know: Property-filtered queries work (`MATCH (n {_dataset: "movies"})`)
   - What's unclear: Index availability for property filtering performance
   - Recommendation: Add `"_dataset": "movies"` to every node's properties. This allows dataset-scoped queries in live mode: `MATCH (m:Movie {_dataset: "movies"}) RETURN m.title AS title`.

4. **Is `COUNT(m)` supported in the ORDER BY + LIMIT pattern?**
   - What we know: `COUNT` is listed as a supported aggregation in the planner
   - What's unclear: Whether GROUP BY style aggregation with ORDER BY works end-to-end
   - Recommendation: Test during Wave 0 with a simple `MATCH (n:Movie) RETURN COUNT(n) AS c` before using in demo queries.

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `/Users/ashesh/opengraphdb/crates/ogdb-cli/src/lib.rs` — HTTP dispatch, import format, schema format, response writing
- Direct source code inspection of `/Users/ashesh/opengraphdb/crates/ogdb-core/src/lib.rs` — QueryResult.to_json(), PropertyValue serialization, FunctionCall evaluation, RuntimeValue conversion
- Direct file inspection of all frontend source files — transform.ts, client.ts, queries.ts, datasets.ts, types/api.ts, stores/settings.ts, PlaygroundPage.tsx, vite.config.ts

### Secondary (HIGH confidence, from same codebase)
- Integration test at `lib.rs:14449` — confirmed exact `/query` response format with `row_count`
- Integration test at `lib.rs:14629` — confirmed `/import` payload format and success response
- Integration test at `lib.rs:14517` — confirmed `/schema` returns `labels` and `edge_types` array

### Tertiary (MEDIUM confidence)
- Neo4j movies dataset structure (prior knowledge) — for dataset design inspiration
- General Cypher pattern matching knowledge — for demo query design

## Metadata

**Confidence breakdown:**
- Backend response formats: HIGH — read directly from Rust source and integration tests
- Import format: HIGH — read from struct definitions and integration tests
- Unsupported Cypher functions: HIGH — verified absence from FunctionCall evaluator
- CORS gap: HIGH — verified `write_http_response` sends no CORS headers
- Transform strategy: HIGH — based on confirmed data shapes from both sides
- Dataset design: MEDIUM — based on prior knowledge of what makes demo datasets effective
- Specific Cypher queries: MEDIUM — functional patterns are right, exact query correctness needs runtime validation

**Research date:** 2026-03-01
**Valid until:** Stable — backend source code would need to change to invalidate these findings
