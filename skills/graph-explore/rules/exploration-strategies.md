# Exploration Strategies

Systematic strategies for exploring unknown graphs in OpenGraphDB. Choose a strategy
based on graph size, user intent, and the type of insight needed.

## 1. Top-Down Strategy (Large Graphs, 1000+ Nodes)

Use this when the graph is too large to inspect node by node. Work from the schema
level down to individual entities.

### Step 1: Label Distribution

Get label counts to understand the shape of the data:

```cypher
MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC
```

Identify hub labels (highest count) and rare labels (potential special entities).

### Step 2: Relationship Map

Map how label types connect to each other:

```cypher
MATCH (a)-[r]->(b)
RETURN labels(a)[0] AS from_label, type(r) AS rel_type, labels(b)[0] AS to_label, count(r) AS cnt
ORDER BY cnt DESC LIMIT 20
```

This gives you the "backbone" of the graph: which entity types are connected and how.

### Step 3: Sample Each Label

Pick the top 3-5 labels and sample nodes from each:

```cypher
MATCH (n:Person) RETURN n LIMIT 5
```

Look at property keys and values to understand what each entity type represents.

### Step 4: Hub Analysis

Find the most connected nodes in each major label:

```cypher
MATCH (n:Person)-[r]-() RETURN n.name, count(r) AS degree ORDER BY degree DESC LIMIT 10
```

Hub nodes are often the most interesting starting points for deeper exploration.

### Step 5: Deep-Dive

Pick interesting patterns from the relationship map and explore them:

```cypher
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)<-[:DIRECTED]-(d:Person)
RETURN p.name AS actor, m.title AS movie, d.name AS director
LIMIT 20
```

## 2. Bottom-Up Strategy (Small Graphs, Under 100 Nodes)

Use this when the graph is small enough to inspect comprehensively.

### Step 1: See Everything

```cypher
MATCH (n) RETURN n LIMIT 50
```

With small graphs, you can often view the entire node set.

### Step 2: All Relationships

```cypher
MATCH (a)-[r]->(b) RETURN a, type(r), b LIMIT 100
```

### Step 3: Connected Components

Identify clusters by finding which nodes are reachable from each other:

```cypher
MATCH (n) WHERE NOT (n)--() RETURN n AS isolated_nodes
```

Then for connected nodes, use `get_node_neighborhood` with depth 3-5 to trace
each cluster.

### Step 4: Summarize

With all data visible, create a complete picture: all entity types, all relationships,
and the overall graph topology.

## 3. Goal-Directed Strategy (User Has a Specific Question)

Use this when the user wants to answer a particular question, not explore generally.

### Step 1: Parse the Goal

Break the user's question into entities and relationships:
- "Who directed movies that Tom Hanks acted in?" => entities: Person (Tom Hanks), Movie; relationship: DIRECTED, ACTED_IN

### Step 2: Find Entry Entities

Use `search_nodes` with key terms from the goal:

```
search_nodes("Tom Hanks")
```

If search returns nothing, try variations or use Cypher:

```cypher
MATCH (n) WHERE n.name CONTAINS 'Hanks' RETURN n
```

### Step 3: Expand Toward the Answer

Use `get_node_neighborhood` from the entry entity, then filter by relevant
relationship types:

```cypher
MATCH (p:Person {name: 'Tom Hanks'})-[:ACTED_IN]->(m:Movie)<-[:DIRECTED]-(d:Person)
RETURN d.name AS director, m.title AS movie
```

### Step 4: Validate and Refine

Verify results make sense. If partial, expand the query. If too many results,
add constraints (time ranges, property filters, LIMIT).

## 4. Pattern Discovery Strategy (Finding Structural Patterns)

Use this when looking for structural characteristics of the graph rather than
specific data.

### Degree Distribution

Find the most and least connected nodes:

```cypher
MATCH (n)-[r]-() RETURN id(n), labels(n)[0] AS label, count(r) AS degree
ORDER BY degree DESC LIMIT 20
```

### Triangle Detection

Find tightly connected triads:

```cypher
MATCH (a)--(b)--(c)--(a)
RETURN labels(a)[0], labels(b)[0], labels(c)[0], count(*) AS triangles
LIMIT 10
```

### Star Patterns

Nodes with disproportionately high degree are often hubs or bridges:

```cypher
MATCH (n)-[r]-()
WITH n, count(r) AS degree
WHERE degree > 10
RETURN n, degree ORDER BY degree DESC
```

### Chain Patterns

Find long relationship chains:

```cypher
MATCH p = (a)-[*3..5]->(b)
WHERE a <> b
RETURN length(p) AS chain_length, [n IN nodes(p) | labels(n)[0]] AS types
LIMIT 10
```

### Bridge Detection

Find nodes whose removal would disconnect parts of the graph:

```cypher
MATCH (bridge)-[r]-()
WITH bridge, count(r) AS degree
WHERE degree >= 2
MATCH (bridge)--(neighbor)
WITH bridge, collect(DISTINCT neighbor) AS neighbors
WHERE size(neighbors) >= 2
RETURN bridge, size(neighbors) AS connections
ORDER BY connections DESC LIMIT 10
```

## 5. Temporal Exploration (If Temporal Data Exists)

Use this when the graph contains temporal properties or uses OpenGraphDB's temporal features.

### Step 1: Detect Temporal Properties

Check for timestamp-like properties:

```cypher
MATCH (n) WHERE n.created_at IS NOT NULL OR n.timestamp IS NOT NULL OR n.date IS NOT NULL
RETURN labels(n)[0] AS label, count(n) AS cnt
```

### Step 2: Time-Based Queries

If OpenGraphDB temporal query support is available:

```cypher
MATCH (n:Event) AT TIME '2024-01-01'
RETURN n
```

### Step 3: Version Comparison

Compare entity states across time points:

```cypher
MATCH (n:Person {name: 'Alice'}) AT TIME '2024-01-01' AS old
MATCH (n:Person {name: 'Alice'}) AT TIME '2024-06-01' AS new
RETURN old, new
```

### Step 4: Temporal Patterns

Look for time-based trends:

```cypher
MATCH (n:Event)
RETURN n.date AS date, count(n) AS events
ORDER BY date
```

## Choosing a Strategy

| Graph Size   | User Intent        | Recommended Strategy  |
|-------------|--------------------|-----------------------|
| 1000+ nodes | General exploration | Top-Down              |
| Under 100   | General exploration | Bottom-Up             |
| Any size    | Specific question   | Goal-Directed         |
| Any size    | Structural analysis | Pattern Discovery     |
| Any size    | Time-based analysis | Temporal Exploration  |

Strategies are not mutually exclusive. Start with one, then switch if findings suggest
a different approach would be more productive. For example, a Top-Down exploration might
reveal temporal properties, prompting a switch to Temporal Exploration for that subset.
