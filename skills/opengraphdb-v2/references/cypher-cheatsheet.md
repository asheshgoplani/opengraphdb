# OpenGraphDB Cypher cheatsheet

Quick reference for the OGDB Cypher dialect. Use when generating queries
in code or via `mcp__opengraphdb__execute_cypher`. For a full coverage
matrix vs. Neo4j see [`cypher-coverage.md`](cypher-coverage.md).

The procedure namespace is `db.*` (matches Neo4j). The fake `ogdb.*`
namespace was never shipped; if you see it in older docs, treat it as a
typo for `db.*`.

## Core patterns

```cypher
// nodes
(n)                              // any node, bound to n
(n:Person)                       // node with label
(n:Person {name: "Alice"})       // with properties
(n:Person:Customer)              // multi-label

// relationships
-[r]->                           // any directed
-[r:KNOWS]->                     // typed
-[r:KNOWS*1..3]->                // variable length 1..3 hops
-[r:KNOWS {since: 2020}]->       // with properties
```

## CRUD

```cypher
// create
CREATE (a:Person {name: 'Alice'})
CREATE (a)-[:KNOWS {since: 2020}]->(b)
MERGE (n:Person {email: $email})  // idempotent upsert; prefer this for any import

// read
MATCH (p:Person) WHERE p.age > 30 RETURN p ORDER BY p.age DESC LIMIT 10
MATCH (a:Person)-[:KNOWS*1..3]->(b:Person) RETURN DISTINCT b
OPTIONAL MATCH (p)-[:OWNS]->(c:Car) RETURN p.name, c.model

// update
MATCH (p:Person {name: 'Alice'}) SET p.age = 31, p:Customer
MATCH (p:Person {name: 'Bob'}) REMOVE p.age, p:Beta

// delete
MATCH (p:Person {name: 'Old'}) DETACH DELETE p   // confirm with user first
```

## OGDB-specific extensions

### Vector search (built-in procedure)

`CALL db.index.vector.queryNodes(index_name, query_vec, k [, metric])` returns
nodes ordered by similarity, with a `score` column. Metric is one of
`cosine | euclidean | dot`.

```cypher
CALL db.index.vector.queryNodes('movie_embedding_idx', $query_vec, 10)
YIELD node, score
RETURN node.title, score
```

For inline scoring without an index, use the `vector_distance(vec_a, vec_b)`
function in a `WHERE` / `WITH` clause.

### Full-text search (built-in procedure)

`CALL db.index.fulltext.queryNodes(index_name, query_text [, k])` runs a
Lucene-syntax query against a tantivy full-text index.

```cypher
CALL db.index.fulltext.queryNodes('doc_body_idx', 'climate AND carbon', 20)
YIELD node, score
RETURN node.title, score
```

For inline (no index), use the `text_search(prop, query)` function.

### Hybrid retrieval (built-in procedure)

`CALL db.index.hybrid.queryNodes(vector_idx, vec, fulltext_idx, query, k, alpha, fusion)`
fuses vector + full-text in one round-trip. RRF fusion is the default
when `fusion = 'rrf'`.

```cypher
CALL db.index.hybrid.queryNodes(
  'doc_embedding_idx', $query_vec,
  'doc_body_idx',      $user_query,
  10,
  0.5,                 // alpha; 0 = pure text, 1 = pure vector
  'rrf'
)
YIELD node, score
RETURN node.title, score
```

For single-call hybrid + 1-hop graph context, prefer the HTTP `/rag/search`
endpoint; it RRF-fuses and walks edges in one call.

### Time-travel

```cypher
// `AT TIME` accepts a millisecond timestamp (NOT a datetime literal)
MATCH (p:Person) AT TIME 1704067200000 RETURN p
```

For temporal diff (compare graph state at two timestamps), use the MCP
tool `temporal_diff` (NOT a Cypher procedure):

```bash
curl -s -X POST $BASE/mcp/invoke -H 'Content-Type: application/json' \
  -d '{"name":"temporal_diff","arguments":{"timestamp_a":1700000000,"timestamp_b":1735689600}}'
```

Note: `AT TIME` takes milliseconds in Cypher; `temporal_diff` takes
seconds in MCP. Mismatch silently returns an empty snapshot.

### RDF round-trip

RDF I/O is exposed via the CLI and the `import_rdf` / `export_rdf` MCP
tools, NOT via Cypher procedures.

```bash
ogdb import-rdf mydb.ogdb dataset.ttl       # turtle, n-triples, rdf-xml
ogdb export-rdf mydb.ogdb out.ttl --format turtle
```

## Indexes & constraints

```cypher
CREATE INDEX FOR (n:Person) ON (n.email)
CREATE VECTOR INDEX movie_embedding_idx FOR (n:Movie) ON (n.embedding)
  OPTIONS { dim: 768, metric: 'cosine' }
CREATE FULLTEXT INDEX doc_body_idx FOR (n:Doc) ON (n.body)
CREATE CONSTRAINT FOR (n:Person) REQUIRE n.email IS UNIQUE
```

`CALL db.indexes()` lists every index with `name`, `kind`, `target_label`,
`properties`. Always introspect before assuming an index exists.

## Aggregation & windowing

```cypher
MATCH (p:Person)-[:OWNS]->(c)
RETURN p.country, count(c) AS cars, avg(c.price) AS avg_price
ORDER BY cars DESC

// pattern comprehension
MATCH (p:Person)
RETURN p.name, [(p)-[:OWNS]->(c) | c.model] AS cars
```

## Transactions

```cypher
// multi-statement (Bolt / HTTP /transaction endpoint)
BEGIN
  CREATE (a:Account {balance: 100})
  CREATE (b:Account {balance: 50})
COMMIT

// OGDB MCP wraps each `execute_cypher` call in its own transaction;
// for atomicity across calls, use the HTTP /transaction endpoint.
```

## What is NOT supported (yet)

- APOC procedures. Most rewrite cleanly as `db.*` built-ins or plain
  Cypher (see [`migration-from-neo4j.md`](migration-from-neo4j.md)).
- Cypher 25 / GQL syntax. OGDB targets openCypher 9 + extensions.
- Stored procedures from a user namespace. Only the engine-built `db.*`
  procedures are available.
- Graph projections via `gds.*`. Pending.
- Cluster-only features (Fabric, USE database).
- `LOAD CSV`. Use `ogdb import` or the HTTP `/import` endpoint.
- `shortestPath()` Cypher function. Use the `shortest_path` MCP tool.

## Common gotchas

- **No implicit transactions** in `ogdb shell`. Every statement is its own
  transaction. Wrap in `BEGIN ... COMMIT` for multi-statement atomicity.
- **DETACH DELETE is irreversible.** Always confirm node count first.
- **Vector dimensions are fixed at index creation.** To change `dim`, drop
  and recreate the index.
- **Vector dim mismatch returns nothing silently.** A dim=16 query against a
  dim=1536 index returns an empty result, not an error. Always
  `CALL db.indexes()` first.
- **Property values are typed.** Writing `SET p.age = "30"` makes age a
  string, not an int. Cast explicitly: `SET p.age = toInteger($v)`.
- **Bare-node `RETURN n` returns the node id, not the body.** Use
  `RETURN n.name` or `RETURN properties(n)`.
- **`AT TIME` uses milliseconds.** The `temporal_diff` MCP tool uses
  seconds. Don't mix the units.
