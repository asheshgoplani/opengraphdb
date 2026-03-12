# Index Strategy

Index recommendations for OpenGraphDB. Follow these guidelines when advising users
on which properties to index and which to leave unindexed.

## Index Syntax

```cypher
CREATE INDEX ON :Label(property)
```

OpenGraphDB supports single-property indexes per label. Each index speeds up lookups
where the query filters on that specific label and property combination.

## When to Create Indexes

Index a property when ALL of the following are true:

1. **Used in WHERE clauses** for frequent queries
2. **Has reasonable cardinality** (more than 10-20 distinct values)
3. **Used for lookups, not scans** (exact match, range, or prefix queries)

### Properties to Index

| Property Type         | Examples                    | Why Index                                |
|-----------------------|-----------------------------|------------------------------------------|
| Unique identifiers    | name, email, id, sku        | Point lookups by identity                |
| Frequently filtered   | status (if many values), category, type | WHERE clause performance     |
| Sort keys             | date, timestamp, createdAt  | ORDER BY performance                     |
| Join keys             | foreignId, externalRef      | Cross-reference lookups                  |
| Search targets        | title, label, code          | User-facing search queries               |

### Example Index Recommendations

```cypher
// E-commerce schema
CREATE INDEX ON :Customer(email);      // Login lookups
CREATE INDEX ON :Product(sku);         // Inventory queries
CREATE INDEX ON :Product(name);        // Search by name
CREATE INDEX ON :Order(date);          // Date range queries

// Social network schema
CREATE INDEX ON :Person(name);         // Profile lookups
CREATE INDEX ON :Person(email);        // Login lookups
CREATE INDEX ON :Post(createdAt);      // Timeline queries
```

## When NOT to Index

Do not index properties in these situations:

| Situation                        | Reason                                     | Alternative                        |
|----------------------------------|--------------------------------------------|------------------------------------|
| Very low cardinality (boolean)   | Index scan not faster than label scan       | Label filter is sufficient         |
| Rarely queried properties        | Index maintenance cost with no benefit      | Query without index                |
| Large text properties            | B-tree indexes are poor for full-text       | Use `text_search` MCP tool         |
| Vector embeddings                | Not suitable for B-tree indexes             | Use `vector_search` MCP tool       |
| Computed/derived values          | Better to compute on the fly                | Use Cypher aggregation             |
| Properties on very small labels  | Scanning 50 nodes is already fast           | Skip index for labels under 100    |

## Label Bitmaps (Automatic)

OpenGraphDB uses roaring bitmaps for label membership. Label-based filtering
(`MATCH (n:Person)`) is always fast without any explicit index. You only need to
create indexes for property-based filtering within a label.

```cypher
// This is already fast (label bitmap):
MATCH (n:Person) RETURN count(n)

// This needs an index on :Person(name) to be fast:
MATCH (n:Person) WHERE n.name = 'Alice' RETURN n
```

## Full-Text Search

For substring search, pattern matching, or natural language queries, do not use
property indexes. Use the `text_search` MCP tool instead, which is backed by
tantivy full-text indexing.

```
// Use text_search tool for:
// - "Find articles mentioning machine learning"
// - "Search for products with 'wireless' in description"
// - Fuzzy matching, stemming, relevance ranking
```

## Vector Search

For semantic similarity queries, do not use property indexes. Use the `vector_search`
MCP tool instead, which is backed by usearch ANN indexing.

```
// Use vector_search tool for:
// - "Find similar products to this one"
// - "Find documents related to this concept"
// - Nearest neighbor queries on embeddings
```

## Composite Query Optimization

OpenGraphDB indexes on single properties. For queries filtering on multiple properties,
index the most selective property (the one with the highest cardinality or fewest
matching nodes).

```cypher
// If querying: WHERE n.country = 'Germany' AND n.email = 'alice@example.com'
// Index email (unique) not country (low cardinality)
CREATE INDEX ON :Person(email);
```

The query planner will use the index to narrow results, then apply the remaining
filter in memory.
