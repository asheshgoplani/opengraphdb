# OpenGraphDB Cypher cheatsheet

Quick reference for the OGDB Cypher dialect. Use this when generating queries
in code or via `mcp__opengraphdb__execute_cypher`. For a full coverage matrix
vs. Neo4j, see `cypher-coverage.md`.

## Core patterns

```cypher
# nodes
(n)                              # any node, bound to n
(n:Person)                       # node with label
(n:Person {name: "Alice"})       # with properties
(n:Person:Customer)              # multi-label

# relationships
-[r]->                           # any directed
-[r:KNOWS]->                     # typed
-[r:KNOWS*1..3]->                # variable length 1..3 hops
-[r:KNOWS {since: 2020}]->       # with properties
```

## CRUD

```cypher
# create
CREATE (a:Person {name: 'Alice'})
CREATE (a)-[:KNOWS {since: 2020}]->(b)
MERGE (n:Person {email: $email})  # idempotent upsert

# read
MATCH (p:Person) WHERE p.age > 30 RETURN p ORDER BY p.age DESC LIMIT 10
MATCH (a:Person)-[:KNOWS*1..3]->(b:Person) RETURN DISTINCT b
OPTIONAL MATCH (p)-[:OWNS]->(c:Car) RETURN p.name, c.model

# update
MATCH (p:Person {name: 'Alice'}) SET p.age = 31, p:Customer
MATCH (p:Person {name: 'Bob'}) REMOVE p.age, p:Beta

# delete
MATCH (p:Person {name: 'Old'}) DETACH DELETE p   # confirm with user first!
```

## OGDB-specific extensions (NOT in Neo4j)

### Vector search inline

```cypher
MATCH (m:Movie)
WITH m, vector.distance(m.embedding, $query_vec, 'cosine') AS d
ORDER BY d ASC LIMIT 10
RETURN m, d
```

Or pre-built kNN:

```cypher
CALL ogdb.vector.knn('Movie', 'embedding', $query_vec, 10)
YIELD node, score
RETURN node.title, score
```

### Time-travel

```cypher
MATCH (p:Person) AT TIME '2024-01-01T00:00:00Z' RETURN p
CALL ogdb.temporal.diff('Person', '2024-01-01', '2024-12-31') YIELD changes
```

### Full-text

```cypher
CALL ogdb.text.search('content', 'climate AND carbon')
YIELD node, score
RETURN node.title, score LIMIT 20
```

### RDF round-trip

```cypher
CALL ogdb.rdf.import('/path/to/dataset.ttl')         # turtle, n-triples, jsonld, rdfxml
CALL ogdb.rdf.export('out.ttl', 'turtle')
```

### Hybrid (vector + graph + text in one query)

```cypher
CALL ogdb.hybrid_retrieve({
  vector: { embedding: $query_vec, label: 'Doc', prop: 'embedding', k: 50 },
  text:   { query: $user_query, label: 'Doc', prop: 'body' },
  graph:  { hops: 1, weight: 0.3 },
  rrf:    { k: 60 }
})
YIELD node, score, sources
RETURN node.title, score
```

## Indexes & constraints

```cypher
CREATE INDEX FOR (n:Person) ON (n.email)
CREATE VECTOR INDEX FOR (n:Movie) ON (n.embedding) OPTIONS { dim: 768, metric: 'cosine' }
CREATE FULLTEXT INDEX FOR (n:Doc) ON (n.body)
CREATE CONSTRAINT FOR (n:Person) REQUIRE n.email IS UNIQUE
```

## Aggregation & windowing

```cypher
MATCH (p:Person)-[:OWNS]->(c)
RETURN p.country, count(c) AS cars, avg(c.price) AS avg_price
ORDER BY cars DESC

# pattern comprehension
MATCH (p:Person)
RETURN p.name, [(p)-[:OWNS]->(c) | c.model] AS cars
```

## Transactions

```cypher
# multi-statement (Bolt / HTTP /transaction endpoint)
BEGIN
  CREATE (a:Account {balance: 100})
  CREATE (b:Account {balance: 50})
COMMIT

# OGDB MCP wraps each `execute_cypher` call in its own transaction
# — for atomicity across calls, use the HTTP transaction endpoint.
```

## What is NOT supported (yet)

- APOC procedures — use `ogdb.*` built-ins instead (see `migration-from-neo4j.md`).
- Cypher 25 / GQL syntax — OGDB targets openCypher 9 + extensions.
- Stored procedures — only built-in `ogdb.*` namespace today.
- Graph projections via `gds.*` — pending in v0.5.
- Cluster-only features (Fabric, USE database).

## Common gotchas

- **No implicit transactions** in `ogdb shell` — every statement is its own
  transaction. Wrap in `BEGIN ... COMMIT` for multi-statement atomicity.
- **DETACH DELETE is irreversible**. Always confirm node count first.
- **Vector dimensions are fixed at index creation**. To change `dim`, drop
  and recreate the index.
- **Property values are typed**: writing `SET p.age = "30"` makes age a
  string, not an int. Cast explicitly: `SET p.age = toInteger($v)`.
