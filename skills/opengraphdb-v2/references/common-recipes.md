# Common recipes

Copy-pasteable patterns for the workloads agents run most often against
OGDB. Procedure namespace is `db.*` (matches Neo4j); the older `ogdb.*`
shape from earlier docs was never shipped.

## 1. "What's in this database?" — first contact

```javascript
// Always start with browse_schema, never assume.
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
# Step 1: import a folder of markdown into Doc nodes via the HTTP endpoint.
# This bypasses the per-row write-tx overhead the CLI bulk path has today.
curl -s -X POST $BASE/rag/ingest -H 'Content-Type: application/json' \
  -d '{"title":"alice-bob","format":"PlainText","content":"Alice works with Bob on the cookbook."}'

# Step 2: extract entities (via your LLM) and link them via MCP
# upsert_node + upsert_edge. Batch in groups of 100 inside one write-tx.
```

```cypher
// Step 3: query with hybrid retrieval
CALL db.index.hybrid.queryNodes(
  'doc_embedding_idx', $q_vec,
  'doc_body_idx',      $user_query,
  10, 0.5, 'rrf'
) YIELD node, score
RETURN node.title, node.body, score LIMIT 10;
```

## 4. Vector kNN with graph context

```cypher
// find the 10 most similar movies to a query, then expand to shared actors.
CALL db.index.vector.queryNodes('movie_embedding_idx', $query_vec, 10)
YIELD node AS m, score
MATCH (m)<-[:ACTED_IN]-(a:Actor)-[:ACTED_IN]->(other:Movie)
WHERE other <> m
RETURN m.title, a.name, collect(DISTINCT other.title)[0..3] AS also_in
ORDER BY score ASC LIMIT 10;
```

## 5. Time-travel audit

```cypher
// what did this person look like a year ago?
// AT TIME takes a millisecond timestamp.
MATCH (p:Person {id: $id}) AT TIME 1704067200000 RETURN p;
```

For diffing two timestamps, use the `temporal_diff` MCP tool (NOT a
Cypher procedure). The tool takes seconds, not milliseconds:

```bash
THIRTY_DAYS_AGO=$(($(date +%s) - 30*86400))
NOW=$(date +%s)
curl -s -X POST $BASE/mcp/invoke -H 'Content-Type: application/json' \
  -d "{\"name\":\"temporal_diff\",\"arguments\":{\"timestamp_a\":$THIRTY_DAYS_AGO,\"timestamp_b\":$NOW}}"
```

## 6. Bulk import CSV

The CLI `ogdb import` supports CSV / JSON / JSONL. For larger files
(>10k rows) prefer the HTTP `/import` endpoint, which streams batched
write-txs and avoids the per-row `begin_write`/`commit` overhead the
default CLI path has today (see `benchmarks-snapshot.md` row 1).

```bash
# small file: CLI is fine
ogdb import ~/.ogdb/demo.ogdb people.csv

# >10k rows: HTTP endpoint is the supported batched path
curl -s -X POST $BASE/import -H 'Content-Type: text/csv' \
  --data-binary @people.csv
```

CSV format: first row is column headers; special columns `:LABEL`,
`:ID`, `:START_ID`, `:END_ID`, `:TYPE` follow Neo4j conventions. See
`scripts/ogdb-import-rdf.sh` for the RDF round-trip variant.

For the absolute fastest write path inside Cypher, use `UNWIND` over a
parameterized list inside a single write-tx:

```cypher
UNWIND $rows AS row
MERGE (p:Person {id: row.id})
SET   p.name = row.name, p.age = row.age
```

## 7. SHACL validation

```bash
ogdb validate-shacl ~/.ogdb/demo.ogdb shapes.ttl
# exits 0 if valid; otherwise prints a violation report
```

## 8. Live-mutate via MCP (write path)

```javascript
// Confirm count before AND after mutating; report delta to the user.
const before = await mcp.opengraphdb.stats();
await mcp.opengraphdb.upsert_node({
  labels: ["Person"],
  properties: { name: "Charlie", age: 28 }
});
const after = await mcp.opengraphdb.stats();
console.log(`Δ nodes: ${after.node_count - before.node_count}`);
```

## 9. HTTP server for shared agents / debugging

```bash
ogdb serve --http --port 8080 ~/.ogdb/demo.ogdb &
curl -s http://127.0.0.1:8080/health           # {"status":"ok"}
curl -s http://127.0.0.1:8080/mcp/tools -X POST -H 'Content-Type: application/json' -d '{}'
```

The HTTP server exposes `/query`, `/import`, `/rag/search`, `/rag/ingest`,
`/mcp/tools`, `/mcp/invoke`, and `/transaction`. There is no built-in
SPA at this endpoint (the binary is headless); use a separate frontend
or `ogdb shell` for interactive exploration.

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
