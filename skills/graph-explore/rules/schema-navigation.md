# Schema Navigation

How to use schema information from `browse_schema` to guide efficient exploration
of OpenGraphDB graphs.

## Interpreting the Schema Response

When you call `browse_schema`, you receive labels, relationship types, and property keys.
Analyze them to build a mental model before running any data queries.

### Identify Central Entity Types

Central entities are the labels most likely connected to other labels. Look for:
- **High connectivity**: Labels that appear in many relationship type endpoints
- **Domain nouns**: Labels that represent real-world entities (Person, Product, City)
- **Large counts**: Labels with the most nodes (from `list_datasets` or label count queries)

```cypher
MATCH (n)-[r]-()
RETURN labels(n)[0] AS label, count(DISTINCT type(r)) AS rel_type_count
ORDER BY rel_type_count DESC
```

### Identify Junction Types

Junction or bridging types connect different domain areas:
- Labels that appear as endpoints for many different relationship types
- Labels with low node count but high relationship diversity
- Examples: Role (connects Person to Company), Review (connects Customer to Product)

### Assess Property Richness

Labels with many properties are often the most important entities:

```cypher
MATCH (n:Person) WITH n LIMIT 1 RETURN keys(n) AS properties
```

Repeat for each label to catalog available properties across entity types.

## Relationship Direction Matters

OpenGraphDB stores directed edges. Always check both directions when exploring
a label's connections. Missing one direction means missing half the relationships.

### Outgoing Relationships

```cypher
MATCH (a:Person)-[r]->(b)
RETURN type(r) AS rel_type, labels(b)[0] AS target_label, count(r) AS cnt
ORDER BY cnt DESC
```

### Incoming Relationships

```cypher
MATCH (a:Person)<-[r]-(b)
RETURN type(r) AS rel_type, labels(b)[0] AS source_label, count(r) AS cnt
ORDER BY cnt DESC
```

### Bidirectional Overview

Combine both directions for a complete picture of how a label participates in the graph:

```cypher
MATCH (a:Person)-[r]-(b)
RETURN type(r) AS rel_type, labels(b)[0] AS connected_label, count(r) AS cnt
ORDER BY cnt DESC
```

Use the undirected pattern `(a)-[r]-(b)` only for overview. Use directed patterns
for actual data queries to get correct semantics.

## Property-Based Entry Points

When searching for specific entities, use properties strategically.

### Text Search

Use `search_nodes` for broad text search across all string properties. This is the
fastest way to find entities when you know a name or keyword but not which label or
property holds it.

### Exact Match

When you know the label and property, use a WHERE clause for exact matching:

```cypher
MATCH (n:Person) WHERE n.email = 'alice@example.com' RETURN n
```

### Partial Match

For partial matches, use CONTAINS or STARTS WITH:

```cypher
MATCH (n:Person) WHERE n.name CONTAINS 'Alice' RETURN n
```

### Multiple Properties

If the first property does not match, try others. Check `browse_schema` for available
property keys, then try each one:

```cypher
MATCH (n) WHERE n.name = 'Alice' OR n.title = 'Alice' OR n.label = 'Alice' RETURN n
```

## Building a Mental Model

After initial exploration, organize your understanding into these categories:

### Entity Types and Counts

Create a table of all labels with their approximate node counts:

| Label      | Count | Key Properties           |
|------------|-------|--------------------------|
| Person     | 500   | name, age, email         |
| Movie      | 200   | title, year, genre       |
| Company    | 50    | name, industry, founded  |

### Relationship Map

Document how entity types connect:

```
Person --[ACTED_IN]--> Movie
Person --[DIRECTED]--> Movie
Person --[WORKS_AT]--> Company
Company --[LOCATED_IN]--> City
```

### High-Degree Nodes (Hubs)

Identify nodes with many connections. These are often good starting points:

```cypher
MATCH (n)-[r]-()
WITH n, labels(n)[0] AS label, count(r) AS degree
ORDER BY degree DESC LIMIT 10
RETURN label, n.name AS name, degree
```

### Isolated Nodes

Check for disconnected nodes that might indicate data quality issues:

```cypher
MATCH (n) WHERE NOT (n)--() RETURN labels(n)[0] AS label, count(n) AS isolated_count
```

### Density Assessment

Understand how densely connected the graph is:

```cypher
MATCH (n) WITH count(n) AS nodes
MATCH ()-[r]->() WITH nodes, count(r) AS edges
RETURN nodes, edges, toFloat(edges) / nodes AS avg_degree
```

A high average degree (over 5) suggests a densely connected graph. A low average
degree (under 2) suggests a sparse graph with many leaf nodes.
