# Error Prevention for OpenGraphDB Cypher

Avoid these common mistakes when writing Cypher queries for OpenGraphDB.

## 1. Missing Labels in MATCH

Always specify a node label. Bare `MATCH (n)` scans every node in the database:

```cypher
// Wrong: full scan
MATCH (n) WHERE n.name = 'Alice' RETURN n

// Correct: label-filtered scan
MATCH (n:Person) WHERE n.name = 'Alice' RETURN n
```

If you do not know the label, call `browse_schema` first.

## 2. Unbounded Variable-Length Paths

Never use `[*]` without bounds. This traverses the entire reachable graph and can exhaust memory:

```cypher
// Wrong: unbounded, potentially infinite
MATCH (a)-[*]->(b) RETURN a, b

// Correct: bounded to 3 hops
MATCH (a:Person)-[:KNOWS*1..3]->(b:Person) RETURN a, b
```

Maximum recommended: `*1..5`. For deeper traversals, use the `shortest_path` MCP tool.

## 3. DELETE Without DETACH

Deleting a node that has relationships will fail. Use `DETACH DELETE` to remove the node and all its relationships:

```cypher
// Wrong: fails if node has any relationships
MATCH (n:Person {name: 'Alice'}) DELETE n

// Correct: removes node and all connected relationships
MATCH (n:Person {name: 'Alice'}) DETACH DELETE n
```

Only use bare `DELETE` when you have already deleted all relationships or when you intentionally want the query to fail if relationships exist.

## 4. Property Type Mismatches

Cypher is type-aware. Comparing a string to an integer returns no results without error:

```cypher
// Wrong: comparing string to number (silent mismatch)
MATCH (n:Person) WHERE n.age = '30' RETURN n

// Correct: use matching types
MATCH (n:Person) WHERE n.age = 30 RETURN n
```

Use `toInteger()`, `toFloat()`, or `toString()` for explicit type conversion when needed:

```cypher
MATCH (n:Person) WHERE toInteger(n.yearStr) > 2000 RETURN n
```

## 5. Case Sensitivity in Labels and Properties

Cypher keywords (MATCH, RETURN, WHERE) are case-insensitive, but labels and property keys are case-sensitive:

```cypher
// These match DIFFERENT labels
MATCH (n:Person) RETURN n    // label "Person"
MATCH (n:person) RETURN n    // label "person" (different!)
MATCH (n:PERSON) RETURN n    // label "PERSON" (different!)
```

Always verify exact label and property names via `browse_schema`. Do not guess the casing.

## 6. Missing RETURN in Read Queries

Every read query requires a RETURN clause. Omitting it produces no output:

```cypher
// Wrong: no output
MATCH (n:Person) WHERE n.age > 30

// Correct: returns results
MATCH (n:Person) WHERE n.age > 30 RETURN n
```

Write queries (CREATE, SET, DELETE) do not require RETURN, but add one if you want confirmation of what changed:

```cypher
CREATE (n:Person {name: 'Alice'}) RETURN n
```

## 7. Overwriting All Properties with SET

`SET n = {...}` replaces ALL properties on the node. Use `SET n += {...}` or individual property assignments to preserve existing data:

```cypher
// Wrong: replaces ALL properties (name, age, email, etc. all gone)
MATCH (n:Person {name: 'Alice'})
SET n = {city: 'NYC'}

// Correct: adds/updates city, preserves everything else
MATCH (n:Person {name: 'Alice'})
SET n += {city: 'NYC'}

// Also correct: set individual property
MATCH (n:Person {name: 'Alice'})
SET n.city = 'NYC'
```

## 8. MERGE on Too Many Properties

MERGE creates a new node when the entire pattern does not match. Merging on multiple properties creates duplicates whenever any single property differs:

```cypher
// Wrong: creates duplicate if age or city differs
MERGE (n:Person {name: 'Alice', age: 30, city: 'NYC'})

// Correct: merge on unique identifier, set other properties
MERGE (n:Person {email: 'alice@example.com'})
ON CREATE SET n.name = 'Alice', n.age = 30, n.city = 'NYC'
ON MATCH SET n.lastSeen = timestamp()
```

MERGE on the smallest set of properties that uniquely identifies the entity.

## 9. String Operations on Non-String Properties

CONTAINS, STARTS WITH, and ENDS WITH operate on strings. If a property might be a non-string type, wrap it in `toString()`:

```cypher
// Might fail silently if n.code is an integer
MATCH (n:Product) WHERE n.code CONTAINS '42' RETURN n

// Safe: explicit conversion
MATCH (n:Product) WHERE toString(n.code) CONTAINS '42' RETURN n
```

## 10. Semicolons Between Statements

OpenGraphDB supports multi-statement queries separated by `;`. Each statement executes independently in sequence:

```cypher
CREATE (a:Person {name: 'Alice'});
CREATE (b:Person {name: 'Bob'});
MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
CREATE (a)-[:KNOWS]->(b)
```

Be aware that variables do not carry across semicolons. Each statement starts with a fresh scope.

## 11. Using Vector/Text Search in Cypher

Vector and full-text search capabilities are NOT available as Cypher functions. They use separate specialized indexes:

```cypher
// Wrong: these are not valid Cypher
MATCH (n:Document) WHERE vector_similarity(n.embedding, [...]) > 0.8 RETURN n
MATCH (n:Article) WHERE fulltext(n.body, 'graph database') RETURN n

// Correct: use MCP tools
// vector_search(label: "Document", property: "embedding", query_vector: [...], top_k: 10)
// text_search(query: "graph database", label: "Article", properties: ["body"])
```

## 12. Forgetting DISTINCT with Relationship Traversals

Traversals that pass through hub nodes can produce duplicate results. Use DISTINCT to deduplicate:

```cypher
// May return duplicates if multiple paths exist
MATCH (a:Person)-[:KNOWS*1..2]->(b:Person) RETURN b.name

// Correct: deduplicated
MATCH (a:Person)-[:KNOWS*1..2]->(b:Person) RETURN DISTINCT b.name
```
