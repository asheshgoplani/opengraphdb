# OpenGraphDB Cypher coverage (0.4.0)

Authoritative feature × status grid for Cypher in OpenGraphDB 0.4.0. Sources of
truth:

- `crates/ogdb-tck/src/lib.rs::should_skip_scenario` — TCK harness (Tier-1
  categories, skipped scenarios).
- `crates/ogdb-core/src/lib.rs::keyword_from_identifier` — keyword recogniser.
- `crates/ogdb-core/src/lib.rs::try_execute_builtin_call_query` — CALL
  whitelist dispatcher (the canonical source of the supported `CALL` surface;
  see the `db.*` rows in "OpenGraphDB Cypher extensions" below).
- `documentation/MIGRATION-FROM-NEO4J.md` §2 — published coverage delta.

0.4.0 made `UNWIND` a real `PhysicalUnwind` operator (was a CLI string-desugar
in 0.3.0); shipped HNSW ANN behind `CALL db.index.vector.queryNodes`; promoted
the LLM provider adapters (Anthropic / OpenAI / Local) used by
`semantic_distance(...)` and the `db.rag.*` calls behind feature flags.

Status legend:

- ✅ supported — works today, regression-tested.
- 🟡 partial — works for the common shape but has known gaps.
- ❌ not implemented — parser may accept, planner rejects, or feature is missing.
- 🔧 OpenGraphDB extension — not in stock openCypher.

## Tier-1 floor (TCK-enforced ≥ 50%)

| Clause | Status | Notes |
|---|---|---|
| `MATCH (n:Label)` | ✅ | Pattern matching with labels and property maps. |
| `MATCH (a)-[:TYPE]->(b)` | ✅ | Directed and undirected. Multi-hop via `*1..n`. |
| `OPTIONAL MATCH` | ✅ | Returns nulls for missing matches. |
| `WHERE` predicates | ✅ | `=`, `<>`, `<`, `<=`, `>`, `>=`, `IN`, `IS NULL`, `IS NOT NULL`, `CONTAINS`, `STARTS WITH`, `ENDS WITH`, `AND` / `OR` / `NOT` / `XOR`. |
| `RETURN` | ✅ | Bare names, property access (`n.name`), aliases (`AS`), expressions. |
| `RETURN DISTINCT` | ✅ | |
| `ORDER BY ... ASC \| DESC` | ✅ | Multiple keys allowed. |
| `SKIP n` / `LIMIT n` | ✅ | |
| `RETURN` of a bare node | 🟡 | Returns the node id (`i64`), not the property body. Use `RETURN properties(n)` or list each property explicitly. |
| `CREATE` | ✅ | Nodes, edges, paths. Not idempotent — prefer `MERGE`. |
| `DELETE` / `DETACH DELETE` | ✅ | |
| `SET` / `REMOVE` | ✅ | Property and label set/remove. |

The TCK harness enforces a **50% Tier-1 floor** as a regression gate. The full
external openCypher TCK pass-rate is *not* yet published — see
`crates/ogdb-tck/README.md` to run it yourself.

## Beyond Tier-1

| Clause | Status | Notes |
|---|---|---|
| `MERGE (n {key: v})` | ✅ | Idempotent; use for any data import. |
| `MERGE ... ON CREATE SET / ON MATCH SET` | ✅ | |
| `WITH` (pipeline) | ✅ | Including `WITH ... WHERE ...`. |
| `UNWIND` | ✅ | Use for batched parameterised writes (`UNWIND $rows AS row`). |
| `UNION` / `UNION ALL` | ✅ | |
| `EXISTS { ... }` subquery | ✅ | |
| `CASE WHEN ... THEN ... ELSE ... END` | ✅ | |
| Pattern comprehension `[(n)-->(m) \| m.name]` | ✅ | |
| Variable-length paths `(a)-[*1..3]->(b)` | ✅ | |
| `CREATE INDEX FOR (n:Label) ON (n.prop)` | ✅ | B-tree index. |
| `CALL vector.create_index(...)` | 🔧 | OpenGraphDB-specific HNSW vector-index procedure (see `documentation/MIGRATION-FROM-NEO4J.md` § "Index DDL" and `documentation/COOKBOOK.md` Recipe 2). |
| `CALL text.create_index(...)` | 🔧 | OpenGraphDB-specific Tantivy full-text-index procedure (same references). |
| Aggregations: `count`, `sum`, `avg`, `min`, `max`, `collect` | ✅ | |
| Scalar: `id`, `type`, `labels`, `keys`, `properties`, `exists`, `coalesce` | ✅ | |
| String: `toString`, `size`, `toUpper`, `toLower` | ✅ | |
| Numeric: `toInteger`, `toFloat`, `abs`, `ceil`, `floor`, `round` | ✅ | |
| List: `size`, `length`, `head`, `last`, `tail`, `range` | ✅ | |

## OpenGraphDB Cypher extensions (🔧)

| Feature | Form | Notes |
|---|---|---|
| Bitemporal `AT TIME` | `MATCH (a)-[r]->(b) AT TIME 1750000000000 RETURN b` | Timestamp in **milliseconds**. Edge-level `valid_from` / `valid_to` honoured. |
| Bitemporal `AT SYSTEM TIME` | `... AT SYSTEM TIME <ms> ...` | Transaction-time variant. |
| Vector distance (function) | `vector_distance(n.embedding, $q)` | Returns f32 distance; lower = closer. |
| Semantic distance (auto-embed) | `semantic_distance(n.text, 'query')` | Embeds the query string via the configured provider. Requires an auto-embedding index. |
| Full-text predicate / score | `text_search(n.body, 'q')`, `text_score(n.body, 'q')` | Tantivy under the hood. |
| `CALL db.index.vector.queryNodes(idx, vec, k)` | | Returns `node, score`. Yield clause supported. |
| `CALL db.index.fulltext.queryNodes(idx, q)` | | |
| `CALL db.index.hybrid.queryNodes(idx, vec, q, k)` | | RRF fusion of vector + full-text. |
| `CALL db.agent.storeEpisode(...)` / `db.agent.recall(...)` | | Agent-memory primitives. |
| `CALL db.rag.buildSummaries(...)` / `db.rag.retrieve(...)` | | GraphRAG. |
| `CALL db.algo.shortestPath(src, dst)` | | Built-in BFS-based path. |
| `CALL db.algo.community.labelPropagation(...)` | | |
| `CALL db.algo.community.louvain(...)` | | |
| `CALL db.algo.subgraph(seed, depth)` | | |
| `CALL db.indexes()` / `CALL db.audit.log(...)` | | Catalog + audit. |

## Not implemented

| Feature | Status | Workaround |
|---|---|---|
| `LOAD CSV FROM '...'` | ❌ | Use `ogdb import` CLI, the `POST /import` HTTP endpoint, or `UNWIND $rows AS row` with parameter binding. |
| `shortestPath()` Cypher function | ❌ | Use the `shortest_path` MCP tool or `CALL db.algo.shortestPath(src, dst)`. |
| Arbitrary user-defined `CALL` / `YIELD` | ❌ | Only the whitelisted `db.*` procedures above are supported. Most APOC procedures do not port — rewrite as plain Cypher or a small MCP tool. |
| `CALL { ... }` subqueries | ❌ | Use `WITH` + `UNWIND` to compose. |
| `FOREACH (x IN list \| ...)` | ❌ | Use `UNWIND` + write clause. |
| Map projection with `.{...}` shorthand | ❌ | Project each property explicitly. |
| `point()` / spatial types | ❌ | Store as `(lat, lon)` tuples and compute in app code. |
| `apoc.*` procedures | ❌ | Rewrite as plain Cypher or build a small MCP tool. |
| Stored procedures defined by the user | ❌ | No user-extension mechanism today. |
| Multi-database (`USE db`) | ❌ | One database per file. Use multiple processes if you need isolation. |

## TCK skip rules

The harness skips any scenario containing these tokens (`crates/ogdb-tck/src/lib.rs::should_skip_scenario`):

- `LOAD CSV`
- `SHORTESTPATH` (the function — the procedure form is fine)
- `CALL ` (against arbitrary procedures — covers everything outside the whitelist)
- `YIELD` (paired with the same arbitrary-CALL skip)

These are exactly the not-implemented entries above; the TCK skip list is the
mechanical statement of the gap.

## Bolt / driver compatibility

`ogdb-bolt` implements **Bolt v1 only** (`crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1`).
Modern Neo4j drivers may negotiate v4/v5 first and fail. For clean
compatibility use the HTTP `/query` endpoint or the MCP tool catalog.

## Where to escalate

- Want to know if a specific Cypher snippet runs? Try it in `ogdb shell <db>`.
  The parser error is usually self-explanatory.
- Want a Tier-1 number against the *upstream* openCypher TCK?
  `cargo run --release -p ogdb-tck -- /path/to/openCypher/tck`.
- Spotted a feature gap that's blocking a migration? Open an issue with the
  Cypher snippet and the workload it represents — it's how the roadmap is set.
