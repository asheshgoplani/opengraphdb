---
name: opengraphdb
description: >-
  Use when the user wants to query, traverse, build, or evolve a graph
  database; embedded or HTTP-served; Cypher syntax, vector similarity,
  full-text, RDF round-trip, time-travel, GraphRAG, or an MCP tool catalog.
  Trigger on phrases like "graph database", "knowledge graph", "Cypher
  query", "MCP graph", "GraphRAG", "vector + graph", "property graph",
  "RDF", "time-travel queries", "Neo4j alternative", "embedded graph",
  "single-file graph", "Memgraph alternative", "Kuzu alternative", "graph +
  vector + text", or any task framed as "agent owns the graph end-to-end".
  Use even when the user does not name OpenGraphDB, if the workload pattern
  matches load entities + relationships, then query by traversal,
  similarity, or time. Skip when the workload is a Neo4j cluster (causal
  cluster, Fabric), a time-series DB, plain key-value, or a managed vector
  DB where graph traversal is not part of the access pattern.
license: Apache-2.0
compatibility: "Requires OpenGraphDB >= 0.4.0. Tested with Claude Code, Cursor, Continue.dev, Aider, Goose, Codex via MCP (stdio + HTTP). Engine binary ships ogdb mcp --stdio for local clients and ogdb serve --http for shared agents."
allowed-tools: [mcp__opengraphdb__*, Bash, Read]
metadata:
  version: "0.5.1"
  author: OpenGraphDB
  homepage: https://github.com/asheshgoplani/opengraphdb
  category: database
  tags: [graph, cypher, vector, rdf, mcp, embedded, knowledge-graph, graphrag]
  ogdb_min: "0.4.0"
  ogdb_max: null
  agents: [claude, cursor, continue, aider, goose, codex]
---

# OpenGraphDB

Single-file embedded graph database. First-class openCypher, vector kNN,
full-text, RDF round-trip, MCP server in the core CLI. Apache 2.0, no JVM,
no sidecar.

This skill covers the cross-cutting workflow an agent uses to drive the
database end-to-end. Four narrow sub-skills (`data-import`, `graph-explore`,
`ogdb-cypher`, `schema-advisor`) handle deeper task-specific work.

## When to use

- Building or evolving a property graph the agent owns end-to-end.
- Cypher generation, exploration, or schema design against OpenGraphDB.
- Hybrid retrieval in one round-trip: vector kNN + 1-hop graph + full-text.
- GraphRAG: ingest documents, query back with Cypher.
- Bitemporal / time-travel queries (`AT TIME`, `temporal_diff`).
- Wiring an MCP-aware client (Claude Code, Cursor, Goose, Codex) to a
  single-file graph.
- Migrating from Neo4j / Memgraph / Kuzu where AGPL licensing, JVM weight,
  or sidecar overhead is the friction.

## When NOT to use

- The user wants Neo4j Enterprise / Aura cluster features (causal cluster,
  Fabric, Browser).
- Workload is time-series-first (TimescaleDB / Prometheus).
- Workload is plain KV with no traversal in the read path (sled / RocksDB).
- Strict cross-region replication or > N=4 concurrent writers needed today
  (multi-writer kernel is a known gap; see "Limits" below).

## Quickstart in 30 seconds

Same database file works in all three transports. Pick one.

### CLI (zero-config embedded)

```bash
cargo build --release -p ogdb-cli                                  # ~2 min, one-time
./target/release/ogdb init /tmp/demo.ogdb
./target/release/ogdb create-node /tmp/demo.ogdb \
  --labels Person --props 'name=string:Alice;age=i64:30'
./target/release/ogdb create-node /tmp/demo.ogdb \
  --labels Person --props 'name=string:Bob;age=i64:25'
./target/release/ogdb add-edge /tmp/demo.ogdb 0 1 --type KNOWS
./target/release/ogdb query /tmp/demo.ogdb "MATCH (n:Person) RETURN n.name"
# columns=name | string:Alice | string:Bob
```

### HTTP (single-process server, MCP-ready)

```bash
./target/release/ogdb serve --http --port 8080 /tmp/demo.ogdb &
export BASE=http://127.0.0.1:8080
curl -s $BASE/health                                               # {"status":"ok"}
curl -s -X POST $BASE/query -H 'Content-Type: application/json' \
  -d '{"query": "MATCH (n) RETURN count(n) AS c"}'
curl -s -X POST $BASE/mcp/tools -H 'Content-Type: application/json' -d '{}'
```

### Embedded Rust

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

A runnable end-to-end demo lives at [`scripts/quickstart.sh`](scripts/quickstart.sh).

## Cheatsheet

### Most-used CLI commands

| Command | Use |
|---|---|
| `ogdb init <db>` | Create a new database file |
| `ogdb info <db>` | File metadata (format version, page size) |
| `ogdb schema <db> --json` | Dump labels, edge types, property keys |
| `ogdb stats <db>` | Degree distribution, node/edge counts |
| `ogdb query <db> "<cypher>"` | One-shot Cypher (`--json` for parseable output) |
| `ogdb shell <db>` | Interactive Cypher shell |
| `ogdb import <db> <file>` | CSV / JSON / JSONL bulk import |
| `ogdb import-rdf <db> <file>` | RDF (Turtle / N-Triples / RDF-XML); preserves `_uri` |
| `ogdb export <db> <file>` / `export-rdf` | Round-trip out |
| `ogdb migrate <db> <script>` | Apply a schema-evolution migration |
| `ogdb backup <db> <out>` / `checkpoint <db>` | Operations |
| `ogdb serve --http \| --bolt \| --grpc <db>` | Network server (one transport per invocation; HTTP also exposes `/mcp/tools` + `/mcp/invoke`) |
| `ogdb mcp --stdio <db>` | MCP over stdio for Claude Code / Cursor / Goose (separate subcommand — there is no `serve --mcp` flag) |

### MCP tool catalog (HTTP `POST /mcp/tools` returns this list)

| Tool | Purpose |
|---|---|
| `browse_schema` | **Always call first.** Discover labels, edge types, property keys. |
| `execute_cypher` | Run any Cypher (read or write). |
| `query` | Read-only Cypher convenience wrapper. |
| `schema` | Equivalent to `ogdb schema --json` over MCP. |
| `upsert_node` / `upsert_edge` | Direct mutation without writing Cypher. |
| `get_node_neighborhood` | Node + immediate edges; faster than hand-rolled. |
| `search_nodes` | Keyword search across all string properties. |
| `subgraph` | Extract subgraph around a starting node (depth configurable). |
| `shortest_path` | Pre-built shortest-path; faster than Cypher pattern. |
| `vector_search` | Semantic similarity via the HNSW index. |
| `text_search` | Full-text via the tantivy index. |
| `temporal_diff` | Compare graph state across two timestamps. |
| `import_rdf` / `export_rdf` | Round-trip RDF preserving `_uri` per node. |
| `agent_store_episode` / `agent_recall` | Agent-memory primitives. |
| `rag_build_summaries` / `rag_retrieve` | GraphRAG community summaries + retrieval. |
| `list_datasets` | Show available datasets in the database. |

`POST /mcp/invoke` accepts the unwrapped shape `{ "name": "<tool>", "arguments": { ... } }`.
`ogdb mcp --stdio` accepts the full JSON-RPC envelope for `tools/list` + `tools/call`.

## Cypher essentials

OpenGraphDB implements an openCypher subset. The TCK harness in
`crates/ogdb-tck` enforces a 50% Tier-1 floor across
`MATCH / RETURN / WHERE / CREATE / DELETE / SET` as a regression gate.
Beyond Tier-1: `OPTIONAL MATCH`, `MERGE` (with `ON CREATE SET` / `ON MATCH SET`),
`WITH`, `UNWIND`, pattern comprehension, `CASE`, aggregations, ordering,
`CREATE INDEX`, and the OpenGraphDB-specific `AT TIME` extension.

### Minimal cheatsheet

```cypher
// Read
MATCH (n:Person)-[:KNOWS]->(m:Person) RETURN n.name, m.name

// Write (idempotent; prefer MERGE for any data import)
MERGE (a:Person {name: 'Alice'}) ON CREATE SET a.created_at = timestamp()
MERGE (b:Person {name: 'Bob'})
MERGE (a)-[:KNOWS]->(b)

// Bulk write with parameter list
UNWIND $rows AS row
MERGE (p:Person {id: row.id})
SET   p.name = row.name, p.age = row.age

// Aggregation + ordering — RETURN aliases are not visible to ORDER BY
// in this engine; project through WITH first.
MATCH (p:Person)-[:WROTE]->(b:Book)
WITH p.name AS author, count(b) AS books
RETURN author, books ORDER BY books DESC LIMIT 10

// Vector kNN (function form, not a custom operator)
MATCH (r:Review)
WHERE vector_distance(r.embedding, $q) < 0.3
RETURN r.text ORDER BY vector_distance(r.embedding, $q) ASC LIMIT 10

// Full-text — same alias rule: project through WITH before ORDER BY
MATCH (a:Article) WHERE text_search(a.body, 'graph database')
WITH a.title AS title, text_score(a.body, 'graph database') AS rel
RETURN title, rel ORDER BY rel DESC

// Time-travel (timestamps in milliseconds)
MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b
```

### What is **not** supported (today)

- `LOAD CSV` (use `ogdb import` or the `/import` API).
- `shortestPath()` Cypher function (use the `shortest_path` MCP tool).
- Variable-length patterns (`-[:REL*1..N]->`) and named paths (`MATCH p = (...)...`) — use a fixed-depth chain or the `shortest_path` MCP tool.
- `UNION` between query parts — split into two queries and merge client-side.
- `EXISTS { ... }` subquery and the `exists((a)-[:R]->(b))` predicate function — rewrite with `OPTIONAL MATCH` + `WHERE x IS NOT NULL`.
- Arbitrary stored-procedure `CALL ... YIELD ...` (engine ships only built-ins).
- Most APOC procedures (rewrite as plain Cypher or a small MCP tool).
- RETURN aliases are not visible to a trailing `ORDER BY` in the same clause — project the alias through `WITH` first (see the cheatsheet above).

For the full feature × status grid, see [`references/cypher-coverage.md`](references/cypher-coverage.md).

## AI-agent recipes

Condensed from [`documentation/COOKBOOK.md`](../../documentation/COOKBOOK.md).

### 1. AI-agent over MCP

```bash
ogdb serve --http --port 8080 mydb.ogdb &
curl -s -X POST localhost:8080/mcp/invoke -H 'Content-Type: application/json' \
  -d '{"name":"browse_schema","arguments":{}}'
# Or stdio for a local MCP client (Claude Code, Cursor, Goose):
ogdb mcp --stdio mydb.ogdb
```

### 2. Hybrid retrieval (vector + 1-hop graph + BM25, RRF-fused)

```bash
curl -s -X POST $BASE/rag/search -H 'Content-Type: application/json' -d '{
  "query": "alice and bob writing the cookbook",
  "embedding": [0.12,-0.04,0.31,0.05,0.22,-0.18,0.09,0.41,
                0.15,-0.02,0.27,0.36,-0.11,0.08,0.19,0.04],
  "k": 10
}'
```

If `embedding` is omitted, server falls back to text-only. `dim` must match
the index. Optional `community_id` scopes to a single GraphRAG community.

### 3. Doc ingest + Cypher query (canonical GraphRAG)

```bash
curl -s -X POST $BASE/rag/ingest -H 'Content-Type: application/json' -d '{
  "title": "alice-bob-collab", "format": "PlainText",
  "content": "Alice works with Bob on the OpenGraphDB cookbook."
}'
curl -s -X POST $BASE/query -H 'Content-Type: application/json' \
  -d '{"query":"MATCH (p:Person)-[:WORKS_WITH]->(q:Person) RETURN p.name, q.name"}'
```

### 4. Time-travel diff

```bash
NOW=$(date +%s)
curl -s -X POST $BASE/mcp/invoke -H 'Content-Type: application/json' -d "{
  \"name\":\"temporal_diff\",
  \"arguments\":{\"timestamp_a\":0,\"timestamp_b\":$NOW}
}"
# Returns snapshot_a, snapshot_b, and the diff (node_count / edge_count delta).
```

### 5. Agent memory (`agent_store_episode` + `agent_recall`)

`agent_store_episode` requires `agent_id`, `session_id`, `content`, `embedding`,
and `timestamp` (ms-since-epoch); `metadata` is optional. The schema is enforced
in `crates/ogdb-cli/src/lib.rs::execute_mcp_agent_store_episode_tool`.

```bash
curl -s -X POST $BASE/mcp/invoke -d '{"name":"agent_store_episode","arguments":{
  "agent_id":"planner-1",
  "session_id":"sess-2026-05-06",
  "content":"learned user prefers terse responses",
  "embedding":[/* dim must match the index */],
  "timestamp":1746489600000
}}' -H 'Content-Type: application/json'
curl -s -X POST $BASE/mcp/invoke -d '{"name":"agent_recall","arguments":{
  "agent_id":"planner-1","query_embedding":[/* ... */],"k":5}}' \
  -H 'Content-Type: application/json'
```

### 6. RDF round-trip (preserves `_uri`)

```bash
ogdb import-rdf mydb.ogdb ontology.ttl       # any of: ttl, nt, rdf, owl
ogdb export-rdf mydb.ogdb out.ttl --format turtle
# _uri is restored on export so URIs survive the round-trip.
```

### 7. Multi-agent shared KG (over MCP, single-process today)

```bash
ogdb serve --http --port 8080 shared.ogdb &
# Each agent calls /mcp/invoke against the same endpoint.
# NOTE: kernel is single-writer in 0.5.1; concurrent writers serialize at
# the storage layer. Plan for write-batching or shard per-agent today and
# revisit when the multi-writer kernel ships (see "Limits").
```

## Performance, with honest framing

OpenGraphDB 0.5.1 baseline (i9-10920X, Linux, N=5 release-build median, cold
cache, 1 warmup discarded). Live source of truth: [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md).

The **strict** scorecard (post cycle-17 verdict tone-down): **1 verified
WIN, 2 caveated WIN, 2 losses, 6 novel-or-directional**. The verified row
clears a published spec threshold apples-to-apples; caveated rows clear a
competitive bar but carry a documented asterisk. Use the verified row as a
trust anchor, the caveated rows as directional, and the novel rows as
"feasibility, not benchmark".

| Metric | OpenGraphDB 0.5.1 | Spec target | Verdict |
|---|---|---|---|
| Scaling Tier 7.1 @ 10k nodes (read p95 / load / RSS) | **0.38 μs / 0.32 s / 28.0 MB** | p95 < 1 ms, load < 1 s, RSS < 100 MB | ✅ verified WIN, all three gates |
| Enrichment round-trip `t_persist` p95 (100 docs × 10ent + 15edge) | **46.7 ms** | p95 < 40 ms best-in-class, < 150 ms competitive | ✅ caveated; clears 150 ms competitive by 3.2×, misses 40 ms best-in-class by 7 ms |
| Graph-feature rerank batch p95 (100 candidates × 1-hop) | **1.34 μs** (153 μs/batch) | p95 < 50 ms | ✅ caveated; clears competitive bar by orders of magnitude — boost is a synthetic Σ neighbour_id, not a learned dot-product |

Read the full 14-row scorecard with apples-to-apples notes, losses, and
deferred apples-to-apples runs at [`references/benchmarks-snapshot.md`](references/benchmarks-snapshot.md).

For the **trust-anchor view** (verified-only and caveated-only rows with the
exact published-comparison framing), see [`references/benchmarks-verified.md`](references/benchmarks-verified.md).

## Limits

What 0.5.1 does **not** do well, and how to escalate:

- **Bulk ingest path is naïve.** 254 nodes/s @ 10k+10k single write-tx;
  670× behind Kuzu, 1 150× behind Memgraph at the same scale. Workaround:
  batch via UNWIND inside one write-tx, or use `POST /import` for >10k rows.
  Tracked in BENCHMARKS §4.1.
- **Single-writer kernel.** Concurrent writers serialize. The published
  `concurrent_rate` is per-DB-per-thread, mechanical. Workaround: shard
  per-agent or queue writes through a coordinator. Multi-writer MVCC
  tracked in BENCHMARKS §4.6.
- **Mutation p99.9 = 720 ms tail.** 56× ratio between p99 (16 ms) and p99.9
  hints at a flush / page-cache pause. Don't put per-token writes on a
  user-facing latency-SLA flow until profiled.
- **Cypher coverage is a subset.** No `LOAD CSV`, no `shortestPath()`,
  limited `CALL/YIELD`. Most APOC code does not port. See
  [`references/cypher-coverage.md`](references/cypher-coverage.md) for the
  authoritative grid.
- **No external openCypher TCK pass-rate published.** Only the in-tree 50%
  Tier-1 floor is enforced today. Run
  `cargo run --release -p ogdb-tck -- /path/to/openCypher/tck` yourself if
  you need a number.
- **Bolt is v1 only.** Modern Neo4j drivers may negotiate v4/v5 first. Use
  HTTP `/query` for clean compatibility.
- **No causal cluster / cross-region replication.** By design. If that's a
  hard requirement, this engine is not the right fit.

## Common pitfalls

- **`RETURN` of a bare node returns its id, not its properties.** Use
  `RETURN n.name` or `RETURN properties(n)` when you need the body.
- **Don't rename labels behind a live agent.** Use `ogdb migrate` with an
  explicit migration script; don't hot-edit the catalog.
- **Vector dimensionality is fixed at index creation.** Mixing dim=16 query
  vectors against a dim=1536 index silently returns nothing. Always check
  the index first.
- **MCP HTTP and stdio accept different envelopes.** HTTP `/mcp/invoke`
  takes `{name, arguments}`; stdio takes the full JSON-RPC `tools/call`
  envelope.
- **Bearer auth is single-tier** (`Authorization: Bearer <token>`). Don't
  assume Neo4j role-based access ports across.
- **`AT TIME` uses milliseconds in the Cypher parser**, but the
  `temporal_diff` MCP tool takes seconds. Mismatch silently returns an
  empty snapshot.
- **`CREATE` is not idempotent.** Always prefer `MERGE` for any import or
  re-runnable workflow.

## Sub-skills, when to descend

| Sub-skill | Descend when |
|---|---|
| [`skills/data-import`](../data-import/SKILL.md) | User has a CSV / JSON / RDF source to load. Covers format detection, two-pass ingest, batch sizing, MERGE-based idempotency, validation. |
| [`skills/graph-explore`](../graph-explore/SKILL.md) | User points at an unknown graph and asks "what's in here?" Covers exploration strategies, schema navigation, entry-point selection. |
| [`skills/ogdb-cypher`](../ogdb-cypher/SKILL.md) | Pure Cypher generation against a known schema. Covers all supported clauses, OpenGraphDB extensions, optimization rules, common error patterns. |
| [`skills/schema-advisor`](../schema-advisor/SKILL.md) | User describes a domain and wants a graph schema. Covers eight modeling best practices, six anti-patterns, index selection, RDF mapping with `_uri` preservation. |

This master skill covers the cross-cutting workflow. Descend into a
sub-skill only when the task is dominated by one of the four narrow
concerns.

## Reference index

- [`references/benchmarks-verified.md`](references/benchmarks-verified.md) — verified + caveated rows only, with strict provenance.
- [`references/benchmarks-snapshot.md`](references/benchmarks-snapshot.md) — full 14-row frozen scorecard.
- [`references/cypher-coverage.md`](references/cypher-coverage.md) — authoritative feature × status grid.
- [`references/cypher-cheatsheet.md`](references/cypher-cheatsheet.md) — copy-pasteable Cypher patterns.
- [`references/common-recipes.md`](references/common-recipes.md) — extended recipes.
- [`references/migration-from-neo4j.md`](references/migration-from-neo4j.md) — five-minute migration brief.
- [`references/debugging.md`](references/debugging.md) — what to check when queries return wrong / empty results.
- [`scripts/quickstart.sh`](scripts/quickstart.sh) — runnable end-to-end demo.
- [`scripts/ogdb-mcp-stdio.sh`](scripts/ogdb-mcp-stdio.sh) — start MCP over stdio.
- [`scripts/ogdb-serve-http.sh`](scripts/ogdb-serve-http.sh) — start HTTP server.
- [`scripts/ogdb-import-rdf.sh`](scripts/ogdb-import-rdf.sh) — RDF round-trip helper.
- [`eval/cases.yaml`](eval/cases.yaml) — eval suite for this skill.

## See also (live docs in repo root)

- [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md) — every cited number with reproducibility notes.
- [`documentation/COOKBOOK.md`](../../documentation/COOKBOOK.md) — full recipes (the inline mini-recipes above are condensed from this).
- [`documentation/MIGRATION-FROM-NEO4J.md`](../../documentation/MIGRATION-FROM-NEO4J.md) — full migration brief.
- [`documentation/ai-integration/llm-to-cypher.md`](../../documentation/ai-integration/llm-to-cypher.md) — LLM → Cypher patterns.
- [`documentation/ai-integration/embeddings-hybrid-rrf.md`](../../documentation/ai-integration/embeddings-hybrid-rrf.md) — RRF math for hybrid retrieval.
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — engine-internal design notes.
