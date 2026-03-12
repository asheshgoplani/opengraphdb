# Query Optimization for OpenGraphDB

Follow these rules to write performant Cypher queries against OpenGraphDB. The database uses a double CSR edge layout with label bitmaps and property indexes for fast traversal.

## 1. Always Use LIMIT

Never return unbounded result sets. Every exploratory query must include LIMIT:

```cypher
// Exploration: LIMIT 25
MATCH (n:Person) RETURN n LIMIT 25

// Analysis: LIMIT 100
MATCH (n:Person)-[:KNOWS]->(m:Person) RETURN n.name, m.name LIMIT 100

// Counting: no LIMIT needed (returns a single row)
MATCH (n:Person) RETURN count(n) AS total
```

Default to LIMIT 25 for exploration, LIMIT 100 for analysis. Only omit LIMIT for aggregation queries that return a single row or for intentional full-scan operations the user explicitly requests.

## 2. Always Specify Node Labels

OpenGraphDB uses roaring bitmap label indexes. Specifying a label narrows the scan to only nodes with that label:

```cypher
// Fast: label bitmap filters first
MATCH (n:Person) WHERE n.age > 30 RETURN n LIMIT 25

// Slow: scans all nodes in the database
MATCH (n) WHERE n.age > 30 RETURN n LIMIT 25
```

If you do not know the label, call `browse_schema` first. Never write `MATCH (n)` without a label unless the user explicitly asks for cross-label queries.

## 3. Put Indexed Properties First in WHERE

Place indexed property predicates before non-indexed ones. OpenGraphDB evaluates WHERE left to right and can short-circuit on indexed lookups:

```cypher
// Preferred: indexed property first
MATCH (n:Person) WHERE n.email = 'alice@example.com' AND n.active = true RETURN n

// Less efficient: non-indexed property first
MATCH (n:Person) WHERE n.active = true AND n.email = 'alice@example.com' RETURN n
```

If unsure which properties are indexed, call `browse_schema` to check.

## 4. Bound Variable-Length Paths

Always specify a maximum hop count. Unbounded paths can traverse the entire graph:

```cypher
// Safe: bounded to 3 hops
MATCH (a:Person)-[:KNOWS*1..3]->(b:Person) RETURN a, b

// Dangerous: traverses until memory exhaustion
MATCH (a:Person)-[:KNOWS*]->(b:Person) RETURN a, b
```

Maximum recommended depth: 5 hops. For deeper traversals, use the `shortest_path` or `subgraph` MCP tools which have built-in depth limits.

## 5. Aggregate Before Expanding

When combining aggregation with further pattern matching, aggregate in a WITH clause before joining with more patterns:

```cypher
// Efficient: aggregate first, then expand
MATCH (n:Person)-[:KNOWS]->(friend)
WITH n, count(friend) AS friendCount
WHERE friendCount > 5
MATCH (n)-[:WORKS_AT]->(c:Company)
RETURN n.name, friendCount, c.name

// Inefficient: expand everything then aggregate
MATCH (n:Person)-[:KNOWS]->(friend), (n)-[:WORKS_AT]->(c:Company)
RETURN n.name, count(friend) AS friendCount, c.name
```

The second form creates a cartesian product between friends and companies before aggregating.

## 6. Return Only Needed Properties

Access specific properties instead of returning full nodes. This reduces data transfer and avoids serializing unnecessary fields:

```cypher
// Efficient: return only what you need
MATCH (n:Person) RETURN n.name, n.email LIMIT 25

// Wasteful: serializes all properties for every node
MATCH (n:Person) RETURN n LIMIT 25
```

Return full nodes only when you need to inspect all properties or when the user explicitly requests it.

## 7. Use OPTIONAL MATCH Correctly

Use OPTIONAL MATCH (not MATCH) for nullable relationships. A regular MATCH filters out nodes that lack the relationship:

```cypher
// Correct: returns all persons, company is null if not employed
MATCH (n:Person)
OPTIONAL MATCH (n)-[:WORKS_AT]->(c:Company)
RETURN n.name, c.name

// Wrong: filters out unemployed persons entirely
MATCH (n:Person)-[:WORKS_AT]->(c:Company)
RETURN n.name, c.name
```

## 8. Prefer count() Over Client-Side Counting

Let the database count rather than returning rows and counting on the client:

```cypher
// Fast: database counts internally
MATCH (n:Person) RETURN count(n) AS total

// Slow: transfers all nodes, client counts
MATCH (n:Person) RETURN n
```

## 9. Use UNWIND for Batch Operations

Process multiple items in a single query instead of issuing many individual queries:

```cypher
// Single batch query (efficient)
UNWIND $names AS name
MERGE (n:Person {name: name})
RETURN count(n) AS created

// Multiple individual queries (inefficient, requires round-trips)
// MERGE (n:Person {name: 'Alice'})
// MERGE (n:Person {name: 'Bob'})
// MERGE (n:Person {name: 'Charlie'})
```

## 10. Use MCP Tools for Specialized Operations

Do not reimplement functionality that MCP tools handle natively:

| Operation | Use MCP Tool | Do NOT Use Cypher |
|-----------|-------------|-------------------|
| Semantic similarity | `vector_search` | Manual distance calculations |
| Full-text search | `text_search` | `WHERE n.text CONTAINS '...'` for large text |
| Shortest path | `shortest_path` | Complex path traversals |
| Neighborhood | `get_node_neighborhood` | `MATCH (n)-[*1..1]-(m) WHERE id(n) = ...` |
| Schema discovery | `browse_schema` | `CALL db.schema()` |

The MCP tools are optimized for these operations and often use specialized indexes (usearch for vectors, tantivy for text) that Cypher cannot access.
