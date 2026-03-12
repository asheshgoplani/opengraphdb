# Cypher Query Patterns for OpenGraphDB

Use these patterns when constructing Cypher queries for OpenGraphDB. Every example uses correct syntax verified against the OpenGraphDB query engine.

## Node Patterns

Match nodes by label, properties, or both:

```cypher
// Any node (avoid in production, scans everything)
MATCH (n) RETURN n LIMIT 10

// Node with label
MATCH (n:Person) RETURN n LIMIT 25

// Node with label and property filter
MATCH (n:Person {name: 'Alice'}) RETURN n

// Node with parameterized property
MATCH (n:Person {name: $name}) RETURN n
```

Always specify a label when possible. Bare `(n)` triggers a full node scan.

## Relationship Patterns

Express graph traversals with direction and type:

```cypher
// Outgoing relationship
MATCH (a:Person)-[r:KNOWS]->(b:Person) RETURN a, r, b

// Incoming relationship
MATCH (a:Person)<-[r:FOLLOWS]-(b:Person) RETURN a, b

// Either direction
MATCH (a:Person)-[r:KNOWS]-(b:Person) RETURN a, b

// Any relationship type
MATCH (a:Person)-[r]->(b) RETURN a, type(r), b

// Variable-length path (always bound the range)
MATCH (a:Person)-[*1..3]->(b:Person) RETURN a, b

// Variable-length with relationship type
MATCH (a:Person)-[:KNOWS*1..2]->(b:Person) RETURN a, b
```

## MATCH with WHERE

Filter results using WHERE predicates after MATCH:

```cypher
// Property equality
MATCH (n:Person) WHERE n.name = 'Alice' RETURN n

// String matching
MATCH (n:Person) WHERE n.name CONTAINS 'ali' RETURN n
MATCH (n:Person) WHERE n.name STARTS WITH 'A' RETURN n
MATCH (n:Person) WHERE n.name ENDS WITH 'ce' RETURN n

// Comparison operators
MATCH (n:Person) WHERE n.age > 30 RETURN n
MATCH (n:Person) WHERE n.age >= 18 AND n.age <= 65 RETURN n

// Boolean logic
MATCH (n:Person) WHERE n.active = true AND (n.age > 25 OR n.role = 'admin') RETURN n

// NULL checks
MATCH (n:Person) WHERE n.email IS NOT NULL RETURN n
MATCH (n:Person) WHERE n.deleted IS NULL RETURN n

// IN list
MATCH (n:Person) WHERE n.age IN [25, 30, 35] RETURN n
MATCH (n:Person) WHERE n.status IN ['active', 'pending'] RETURN n

// Regular expression
MATCH (n:Person) WHERE n.name =~ '(?i)tom.*' RETURN n

// NOT equal
MATCH (n:Person) WHERE n.status <> 'deleted' RETURN n

// EXISTS subquery pattern
MATCH (n:Person) WHERE exists(n.email) RETURN n
```

## CREATE Patterns

Create nodes and relationships:

```cypher
// Create node with label and properties
CREATE (n:Person {name: 'Alice', age: 30, email: 'alice@example.com'})
RETURN n

// Create multiple nodes
CREATE (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
RETURN a, b

// Create relationship between existing nodes
MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
CREATE (a)-[r:KNOWS {since: 2024}]->(b)
RETURN r

// Create node and relationship in one statement
CREATE (a:Person {name: 'Alice'})-[:WORKS_AT]->(c:Company {name: 'Acme'})
RETURN a, c
```

## MERGE Patterns

MERGE finds or creates. Use it for idempotent operations:

```cypher
// Merge on unique identifier only
MERGE (n:Person {email: 'alice@example.com'})
ON CREATE SET n.name = 'Alice', n.created = timestamp()
ON MATCH SET n.lastSeen = timestamp()
RETURN n

// Merge relationship
MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
MERGE (a)-[r:KNOWS]->(b)
ON CREATE SET r.since = 2024
RETURN r
```

MERGE on the minimum set of properties needed for uniqueness. Merging on many properties creates duplicates when any one differs.

## SET and REMOVE Patterns

Update properties and labels:

```cypher
// Set single property
MATCH (n:Person {name: 'Alice'})
SET n.age = 31
RETURN n

// Set multiple properties
MATCH (n:Person {name: 'Alice'})
SET n.age = 31, n.city = 'NYC'
RETURN n

// Replace all properties (destructive, removes existing properties)
MATCH (n:Person {name: 'Alice'})
SET n = {name: 'Alice', age: 31}
RETURN n

// Add properties without removing existing ones
MATCH (n:Person {name: 'Alice'})
SET n += {city: 'NYC', verified: true}
RETURN n

// Remove a property
MATCH (n:Person {name: 'Alice'})
REMOVE n.tempField
RETURN n

// Add a label
MATCH (n:Person {name: 'Alice'})
SET n:Employee
RETURN n

// Remove a label
MATCH (n:Person {name: 'Alice'})
REMOVE n:Temp
RETURN n
```

## DELETE Patterns

Remove nodes and relationships:

```cypher
// Delete a relationship
MATCH (a:Person {name: 'Alice'})-[r:KNOWS]->(b:Person {name: 'Bob'})
DELETE r

// Delete a node (must have no relationships)
MATCH (n:Person {name: 'Alice'})
DELETE n

// Delete a node and all its relationships
MATCH (n:Person {name: 'Alice'})
DETACH DELETE n

// Delete all nodes of a label (use with caution)
MATCH (n:TempNode)
DETACH DELETE n
```

Always use `DETACH DELETE` unless you specifically need to fail when relationships exist.

## Aggregation Patterns

Aggregate results with implicit GROUP BY:

```cypher
// Count nodes by label
MATCH (n:Person) RETURN count(n) AS total

// Group and count
MATCH (n:Person) RETURN n.city AS city, count(n) AS residents ORDER BY residents DESC

// Multiple aggregations
MATCH (n:Person) RETURN avg(n.age) AS avgAge, min(n.age) AS youngest, max(n.age) AS oldest

// Sum
MATCH (n:Order) RETURN sum(n.amount) AS totalRevenue

// Collect into list
MATCH (n:Person)-[:LIVES_IN]->(c:City)
RETURN c.name AS city, collect(n.name) AS residents

// Count distinct
MATCH (n:Person)-[:VISITED]->(c:City)
RETURN n.name, count(DISTINCT c) AS uniqueCities
```

## WITH Chaining

Use WITH for multi-step queries. WITH acts as a pipeline stage:

```cypher
// Filter aggregation results
MATCH (n:Person)-[:KNOWS]->(friend)
WITH n, count(friend) AS friendCount
WHERE friendCount > 5
RETURN n.name, friendCount

// Order and limit before next stage
MATCH (n:Person)
WITH n ORDER BY n.age DESC LIMIT 10
MATCH (n)-[:WORKS_AT]->(c:Company)
RETURN n.name, c.name

// Introduce computed values
MATCH (n:Person)
WITH n, n.age * 365 AS ageDays
WHERE ageDays > 10000
RETURN n.name, ageDays
```

## UNWIND Patterns

Expand lists into rows for batch operations:

```cypher
// Process a list
UNWIND ['Alice', 'Bob', 'Charlie'] AS name
MATCH (n:Person {name: name})
RETURN n

// Batch create from list
UNWIND [{name: 'Alice', age: 30}, {name: 'Bob', age: 25}] AS props
CREATE (n:Person) SET n = props
RETURN n

// Flatten collected lists
MATCH (n:Person)-[:TAGGED]->(t:Tag)
WITH n, collect(t.name) AS tags
UNWIND tags AS tag
RETURN DISTINCT tag, count(*) AS usage ORDER BY usage DESC
```

## OPTIONAL MATCH

Use OPTIONAL MATCH when the pattern might not exist (like a LEFT JOIN):

```cypher
// Get person and their company (if they have one)
MATCH (n:Person)
OPTIONAL MATCH (n)-[:WORKS_AT]->(c:Company)
RETURN n.name, c.name AS company

// Count optional relationships
MATCH (n:Person)
OPTIONAL MATCH (n)-[:REVIEWED]->(m:Movie)
RETURN n.name, count(m) AS reviewCount
```

Use OPTIONAL MATCH when you want all nodes returned even when the relationship does not exist. A regular MATCH would filter out nodes without the relationship.

## Path Patterns

Work with paths and variable-length traversals:

```cypher
// Named path
MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*1..3]->(b:Person)
RETURN path, length(path) AS hops

// All paths between two nodes (bounded)
MATCH path = (a:Person {name: 'Alice'})-[*1..4]-(b:Person {name: 'Bob'})
RETURN path, length(path) AS hops
ORDER BY hops
LIMIT 5
```

For shortest path queries, prefer the `shortest_path` MCP tool over writing Cypher path queries manually.

## RETURN Variations

Control output format:

```cypher
// Aliased columns
MATCH (n:Person) RETURN n.name AS name, n.age AS age

// Distinct values
MATCH (n:Person)-[:LIVES_IN]->(c:City) RETURN DISTINCT c.name

// Ordered results
MATCH (n:Person) RETURN n.name, n.age ORDER BY n.age DESC

// Pagination
MATCH (n:Person) RETURN n.name ORDER BY n.name SKIP 20 LIMIT 10

// Count total
MATCH (n:Person) RETURN count(n) AS total
```

## OpenGraphDB Extensions

### Temporal Queries

Query the graph at a specific point in time using Unix timestamps:

```cypher
// Snapshot at a specific time
MATCH (n:Person) AT TIME 1700000000 RETURN n

// Compare state across time using temporal_diff MCP tool
```

Use `temporal_diff` MCP tool for comparing graph state between two timestamps. Do not try to write temporal comparison logic in Cypher.

### Vector Search

Use the `vector_search` MCP tool for semantic similarity:

```
vector_search(label: "Document", property: "embedding", query_vector: [...], top_k: 10)
```

Do NOT attempt vector operations in Cypher. Vector search runs on a separate usearch ANN index outside the Cypher engine.

### Full-Text Search

Use the `text_search` MCP tool for full-text search:

```
text_search(query: "graph database", label: "Article", properties: ["title", "body"], limit: 20)
```

Do NOT attempt full-text search in Cypher. Full-text search runs on a separate tantivy index outside the Cypher engine.

### RDF Import/Export

Use MCP tools for RDF operations:

```
import_rdf(data: "<turtle data>", format: "turtle")
export_rdf(label: "Person", format: "turtle")
```

Imported RDF nodes preserve their source URI in the `_uri` property for round-trip fidelity.

### Index Management

Create indexes for frequently queried properties:

```cypher
CREATE INDEX ON :Person(email)
CREATE INDEX ON :Movie(title)
```

Indexes accelerate property lookups in WHERE clauses and MERGE operations.
