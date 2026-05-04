# Common recipes

Copy-pasteable patterns for the workloads agents run most often against OGDB.

## 1. "What's in this database?" — first contact

```javascript
// Always start with browse_schema, never assume
const schema = await mcp.opengraphdb.browse_schema();
console.log("Labels:", schema.labels);
console.log("Edge types:", schema.rel_types);
console.log("Property keys:", schema.property_keys);

const stats = await mcp.opengraphdb.stats();
console.log("Node count:", stats.node_count);
```

## 2. Targeted entity lookup

```javascript
const result = await mcp.opengraphdb.execute_cypher({
  query: "MATCH (p:Person {email: $email}) RETURN p",
  params: { email: "alice@example.com" }
});
```

## 3. GraphRAG: ingest documents → entities → query

```bash
# step 1: import a folder of markdown into Doc nodes
ogdb import ~/.opengraphdb/demo.ogdb ./docs/ --format markdown-folder \
  --label Doc --prop-id path

# step 2: extract entities (via your LLM) and link them
# (use create_node + create_edge MCP tools, batch in groups of 100)
```

```cypher
# step 3: query with hybrid retrieval
CALL ogdb.hybrid_retrieve({
  vector: { embedding: $q_vec, label: 'Doc', prop: 'embedding', k: 30 },
  graph:  { hops: 1, weight: 0.3 }
}) YIELD node, score
RETURN node.title, node.body, score LIMIT 10;
```

## 4. Vector kNN with graph context

```cypher
// find the 10 most similar movies to a query, then expand to their shared actors
CALL ogdb.vector.knn('Movie', 'embedding', $query_vec, 10) YIELD node AS m, score
MATCH (m)<-[:ACTED_IN]-(a:Actor)-[:ACTED_IN]->(other:Movie)
WHERE other <> m
RETURN m.title, a.name, collect(DISTINCT other.title)[0..3] AS also_in
ORDER BY score ASC LIMIT 10;
```

## 5. Time-travel audit

```cypher
// what did this person look like a year ago?
MATCH (p:Person {id: $id}) AT TIME datetime() - duration('P1Y')
RETURN p;

// diff: what changed in the last 30 days?
CALL ogdb.temporal.diff('Person', datetime() - duration('P30D'), datetime())
YIELD node_id, prop, before, after
RETURN node_id, prop, before, after LIMIT 100;
```

## 6. Bulk import CSV

```bash
ogdb import ~/.opengraphdb/demo.ogdb people.csv \
  --batch-size 10000 \
  --continue-on-error
```

CSV format: first row = column headers, special columns `:LABEL`, `:ID`,
`:START_ID`, `:END_ID`, `:TYPE` (Neo4j-compatible). See
`scripts/ogdb-import-rdf.sh` for RDF.

## 7. SHACL validation

```bash
ogdb validate-shacl ~/.opengraphdb/demo.ogdb shapes.ttl
# exits 0 if valid; otherwise prints a violation report
```

## 8. Live-mutate via MCP (write path)

```javascript
// Confirm count before AND after mutating; report delta to the user.
const before = await mcp.opengraphdb.stats();
await mcp.opengraphdb.create_node({
  labels: ["Person"],
  properties: { name: "Charlie", age: 28 }
});
const after = await mcp.opengraphdb.stats();
console.log(`Δ nodes: ${after.node_count - before.node_count}`);
```

## 9. Open the playground for interactive exploration

```bash
# the HTTP server bundled with `ogdb init --agent` already serves the SPA
open http://127.0.0.1:8765/
# OR start it manually
ogdb serve --http --port 8080 ~/.opengraphdb/demo.ogdb
```

## 10. Embed in a Rust app (no MCP, no HTTP)

```rust
use ogdb_core::Database;
let db = Database::open("./mydb.ogdb")?;
db.write(|tx| {
  let alice = tx.create_node(&["Person"], &[("name", "Alice".into())])?;
  let bob   = tx.create_node(&["Person"], &[("name", "Bob".into())])?;
  tx.create_edge(alice, bob, "KNOWS", &[])?;
  Ok(())
})?;
let rows = db.query("MATCH (n:Person) RETURN n.name")?;
```
