---
name: opengraphdb
description: Use when user wants to query, traverse, or build a graph database; embedded or HTTP-served; supports Cypher syntax, vector similarity, RAG, RDF round-trip, and MCP tool catalog. Trigger keywords - graph database, knowledge graph, Cypher query, MCP graph, GraphRAG, vector + graph, property graph, RDF, SHACL, time-travel queries, Neo4j alternative, embedded graph, single-file graph.
when_to_use: |
  Trigger this skill whenever the task involves:
    - Building or evolving a property graph / knowledge graph that an AI agent owns end-to-end.
    - Cypher generation, exploration, schema design, or import against OpenGraphDB.
    - Hybrid retrieval: vector kNN + 1-hop graph context + full-text in one round-trip.
    - GraphRAG: ingesting documents into a graph and querying back with Cypher.
    - Time-travel / bitemporal queries (`AT TIME ...`, `temporal_diff`).
    - Wiring an MCP-aware client (Claude Code, Cursor, Goose, Codex) to a single-file embedded graph.
    - Migrating from Neo4j / Memgraph / Kuzu where AGPL licensing, JVM dependency, or sidecar overhead is the friction.
  Skip this skill when the workload is a Neo4j cluster, a time-series DB, a simple key-value store, or
  a managed vector DB (Pinecone, Weaviate) where graph traversal is not part of the access pattern.
license: Apache-2.0
compatibility:
  ogdb_min: "0.4.0"
  ogdb_max: null
  agents: [claude-code, cursor, continue.dev, aider, goose, codex]
allowed_tools: [mcp__opengraphdb__*, Bash, Read]
metadata:
  version: "1.0.0"
  author: OpenGraphDB
  homepage: https://github.com/asheshgoplani/opengraphdb
  category: database
  tags: [graph, cypher, vector, rdf, mcp, embedded, knowledge-graph, graphrag]
---

# OpenGraphDB — master skill for AI-agent workloads

OpenGraphDB is a single-file embedded graph database with first-class openCypher, vector
search, full-text search, RDF round-trip, and an MCP server in the core CLI binary.
This skill is the entry point: it covers the cross-cutting workflow an AI agent uses
to drive the database end-to-end. Four narrow sub-skills (`data-import`, `graph-explore`,
`ogdb-cypher`, `schema-advisor`) cover deeper task-specific guidance.

## When to use this skill

- A user describes a knowledge graph, property graph, or "graph + vector + text" workload.
- The agent needs to ingest, explore, query, evolve, and serve a graph from one process.
- A document → entities → graph → Cypher pipeline is on the table (canonical GraphRAG).
- An MCP client needs to call a graph database directly; no Python sidecar wanted.
- A Neo4j migration is being scoped (Apache 2.0, single-file, AI-native primitives).
- Bitemporal / audit-trail queries (`AT TIME`, `temporal_diff`) are required.

## When NOT to use this skill

- The user explicitly wants Neo4j Enterprise / Aura cluster features (causal cluster, Fabric, Browser).
- Workload is time-series-first (use TimescaleDB / Prometheus).
- Workload is plain KV with no graph access pattern (use sled / RocksDB / Redis).
- Strict cross-region replication or > N=4 concurrent writers required *today* (multi-writer
  kernel is a known gap — see "When you hit limits" below).
- Pinecone / Weaviate is the right fit because there is no graph traversal in the read path.

## Quickstart in 30 seconds

Pick one transport. The same database file works in all three.

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

A working end-to-end script lives at `scripts/quickstart.sh` next to this skill.

## How to operate — cheatsheet

### Most-used CLI commands

| Command | Use |
|---|---|
| `ogdb init <db>` | Create a new database file |
| `ogdb info <db>` | File metadata (format version, page size) |
| `ogdb schema <db> --json` | Dump labels, edge types, property keys |
| `ogdb stats <db>` | Degree distribution, node/edge counts |
| `ogdb query <db> "<cypher>"` | One-shot Cypher (use `--json` for parseable output) |
| `ogdb shell <db>` | Interactive Cypher shell |
| `ogdb import <db> <file>` | CSV / JSON / JSONL bulk import |
| `ogdb import-rdf <db> <file>` | RDF (Turtle / N-Triples / RDF/XML) import; preserves `_uri` |
| `ogdb export <db> <file>` / `export-rdf` | Round-trip out |
| `ogdb migrate <db> <script>` | Apply a schema-evolution migration |
| `ogdb backup <db> <out>` / `checkpoint <db>` | Operations |
| `ogdb serve --http \| --bolt \| --grpc \| --mcp <db>` | Network-accessible server |
| `ogdb mcp --stdio <db>` | Run MCP over stdio for Claude Code / Cursor / Goose |

### MCP tool catalog (HTTP `POST /mcp/tools` returns this list)

| Tool | Purpose |
|---|---|
| `browse_schema` | **Always call first.** Discover labels, edge types, property keys. |
| `execute_cypher` | Run any Cypher (read or write). |
| `query` | Read-only Cypher convenience wrapper. |
| `schema` | Equivalent to `ogdb schema --json` over MCP. |
| `upsert_node` / `upsert_edge` | Direct mutation without writing Cypher. |
| `get_node_neighborhood` | Node + immediate edges; faster than hand-rolled neighborhood query. |
| `search_nodes` | Keyword search across all string properties. |
| `subgraph` | Extract a subgraph around a starting node (depth configurable). |
| `shortest_path` | Pre-built shortest-path; faster than Cypher pattern. |
| `vector_search` | Semantic similarity via the HNSW index. |
| `text_search` | Full-text query via the tantivy index. |
| `temporal_diff` | Compare graph state across two timestamps. |
| `import_rdf` / `export_rdf` | Round-trip RDF preserving `_uri` per node. |
| `agent_store_episode` / `agent_recall` | Agent-memory primitives. |
| `rag_build_summaries` / `rag_retrieve` | GraphRAG community summaries + retrieval. |
| `list_datasets` | Show available datasets in the database. |

`POST /mcp/invoke` accepts the unwrapped shape `{ "name": "<tool>", "arguments": { ... } }`.
`ogdb mcp --stdio` accepts the full JSON-RPC envelope for `tools/list` + `tools/call`.

## Cypher essentials

OpenGraphDB implements an openCypher subset. The TCK harness in `crates/ogdb-tck`
enforces a **50% Tier-1 floor** across `MATCH / RETURN / WHERE / CREATE / DELETE / SET`
as a regression gate. Beyond Tier-1 the engine ships `OPTIONAL MATCH`, `MERGE`
(with `ON CREATE SET` / `ON MATCH SET`), `WITH`, `UNWIND`, `UNION`, `EXISTS`,
pattern comprehension, `CASE`, aggregations, ordering, `CREATE INDEX`, and the
OpenGraphDB-specific `AT TIME` extension.

### Minimal cheatsheet

```cypher
-- Read
MATCH (n:Person)-[:KNOWS]->(m:Person) RETURN n.name, m.name

-- Write (idempotent — prefer MERGE for any data import)
MERGE (a:Person {name: 'Alice'}) ON CREATE SET a.created_at = timestamp()
MERGE (b:Person {name: 'Bob'})
MERGE (a)-[:KNOWS]->(b)

-- Bulk write with parameter list
UNWIND $rows AS row
MERGE (p:Person {id: row.id})
SET   p.name = row.name, p.age = row.age

-- Aggregation + ordering
MATCH (p:Person)-[:WROTE]->(b:Book)
RETURN p.name, count(b) AS books ORDER BY books DESC LIMIT 10

-- Vector kNN (function form, not custom operator)
MATCH (r:Review)
WHERE vector_distance(r.embedding, $q) < 0.3
RETURN r.text ORDER BY vector_distance(r.embedding, $q) ASC LIMIT 10

-- Full-text
MATCH (a:Article) WHERE text_search(a.body, 'graph database')
RETURN a.title, text_score(a.body, 'graph database') AS rel ORDER BY rel DESC

-- Time-travel (timestamps in milliseconds)
MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b
```

### What is **not** supported (today)

- `LOAD CSV` (use `ogdb import` or the `/import` API instead).
- `shortestPath()` Cypher function (use the `shortest_path` MCP tool).
- Arbitrary stored-procedure `CALL ... YIELD ...` (engine ships only built-in calls).
- Most APOC procedures (rewrite as plain Cypher or a small MCP tool).

For the full feature × status grid see [`references/cypher-coverage.md`](references/cypher-coverage.md).

## AI-agent recipes (condensed from `documentation/COOKBOOK.md`)

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

If `embedding` is omitted the server falls back to text-only. `dim` must match the
index. Optional `community_id` scopes to a single GraphRAG community summary.

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

```bash
curl -s -X POST $BASE/mcp/invoke -d '{"name":"agent_store_episode","arguments":{
  "agent_id":"planner-1","summary":"learned user prefers terse responses",
  "embedding":[/* ... */]}}' -H 'Content-Type: application/json'
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
# NOTE: kernel is single-writer in 0.5.1 — concurrent writers serialize at
# the storage layer. Plan for write-batching, or shard per-agent today and
# revisit when the multi-writer kernel ships (see "When you hit limits").
```

## Performance you can expect

Frozen snapshot of OpenGraphDB 0.5.1 baseline (i9-10920X, Linux, N=5 release-build
median, cold cache, 1 warmup pass discarded). Source of truth: [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md).
The table below carries forward the 0.4.0 N=5 medianed numbers — zero perf-relevant
code in the 0.4.0 → 0.5.1 window. Re-baseline tracked as a v0.6.0 follow-up.

| Metric | OpenGraphDB 0.5.1 | Spec target | Verdict |
|---|---|---|---|
| Point read `neighbors()` p50 / p95 / p99 @ 10k nodes | **7.1 / 11.2 / 13.4 μs** (119k qps) | p95 < 5 ms | ⚠️ directional WIN (80× under Memgraph Pokec p99) |
| LDBC SNB IS-1 p50 / p95 (1k queries, mini fixture) | **22.2 / 232 μs** (18.9k qps) | p95 < 5 ms @ SF10 | 🟡 novel — scale mismatch |
| Enrichment round-trip `t_persist` p95 (100 docs × 10ent + 15edge) | **45.4 ms** | p95 < 40 ms best-in-class | ✅ WIN on competitive |
| Hybrid retrieval (vector kNN + 1-hop) p95 (100q × 1k × dim=16) | **223 μs** | p95 < 80 ms best-in-class | 🟡 200× under threshold; NDCG deferred |
| Graph-feature rerank batch p95 (100 candidates × 1-hop) | **1.35 μs** (153 μs/batch) | p95 < 50 ms | ✅ caveated WIN — clears competitive bar by orders of magnitude; boost is synthetic Σ neighbour_id, not learned dot-product |

For the full 14-row scorecard (including known losses on bulk ingest and concurrent writes)
see [`references/benchmarks-snapshot.md`](references/benchmarks-snapshot.md).

## When you hit limits

Honest list of what 0.5.1 does **not** do well, and how to escalate:

- **Bulk ingest path is naïve.** 254 nodes/s @ 10k+10k single write-tx — 670× behind
  Kuzu, 1 150× behind Memgraph at the same scale. Workaround: batch via UNWIND inside
  one write-tx, or use `POST /import` for >10k rows. Tracked: BENCHMARKS §4.1.
- **Single-writer kernel.** Concurrent writers serialize. The published
  `concurrent_rate` figure is per-DB-per-thread, mechanical. Workaround today:
  shard per agent, or queue writes through a single coordinator. Multi-writer
  MVCC tracked: BENCHMARKS §4.6.
- **Mutation p99.9 = 720 ms tail.** 56× ratio between p99 (16 ms) and p99.9 hints
  at a flush / page-cache pause. Don't put per-token writes on the hot path of a
  user-facing latency-SLA flow until profiled.
- **Cypher coverage is a subset.** No `LOAD CSV`, no `shortestPath()` function,
  limited `CALL/YIELD`. Most APOC code does not port. See
  [`references/cypher-coverage.md`](references/cypher-coverage.md) for the
  authoritative grid.
- **No external openCypher TCK pass-rate is published.** Only the in-tree 50%
  Tier-1 floor is enforced today. Run `cargo run --release -p ogdb-tck -- /path/to/openCypher/tck`
  yourself if you need a number.
- **Bolt is v1 only.** Modern Neo4j drivers may negotiate v4/v5 first. Use the
  HTTP `/query` endpoint for clean compatibility.
- **No causal cluster / cross-region replication** — by design. If that's a hard
  requirement, this engine is not the right fit.

## Common pitfalls

- **`RETURN` of a bare node returns its id, not its properties.** Use `RETURN n.name`
  or `RETURN properties(n)` when you need the body.
- **Schema migration: don't rename labels behind a live agent.** Use `ogdb migrate`
  with an explicit migration script; don't hot-edit the catalog.
- **Vector dimensionality is fixed at index creation.** Mixing dim=16 query vectors
  against a dim=1536 index silently returns nothing — *always* check the index first.
- **MCP HTTP endpoint and stdio endpoint accept different envelopes.** HTTP
  `/mcp/invoke` takes `{name, arguments}`; stdio takes the full JSON-RPC
  `tools/call` envelope.
- **Bearer auth is single-tier** (`Authorization: Bearer <token>`). Don't assume
  Neo4j role-based access ports — it doesn't yet.
- **`AT TIME` uses milliseconds in the Cypher parser**, but the `temporal_diff`
  MCP tool takes seconds. Mismatch = empty snapshot.
- **`CREATE` is not idempotent. Always prefer `MERGE` for any import or
  re-runnable workflow.** Re-running `CREATE` produces duplicates.

## Sub-skills — when to descend

| Sub-skill | Descend when |
|---|---|
| [`skills/data-import`](../data-import/SKILL.md) | User has a CSV / JSON / RDF source to load — covers format detection, two-pass ingest, batch sizing, MERGE-based idempotency, validation. |
| [`skills/graph-explore`](../graph-explore/SKILL.md) | User points at an unknown graph and asks "what's in here?" — covers five exploration strategies, schema navigation, entry-point selection. |
| [`skills/ogdb-cypher`](../ogdb-cypher/SKILL.md) | Pure Cypher generation against a known schema — covers all supported clauses, OpenGraphDB extensions, optimization rules, 12 common error patterns. |
| [`skills/schema-advisor`](../schema-advisor/SKILL.md) | User describes a domain and wants a graph schema — covers eight modeling best practices, six anti-patterns, index selection, RDF mapping with `_uri` preservation. |

This master skill is enough for the cross-cutting workflow. Descend into a sub-skill
only when the task is dominated by one of the four narrow concerns.

## See also

- [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md) — every cited number with reproducibility notes.
- [`documentation/COOKBOOK.md`](../../documentation/COOKBOOK.md) — seven full recipes (the inline mini-recipes above are condensed from this).
- [`documentation/MIGRATION-FROM-NEO4J.md`](../../documentation/MIGRATION-FROM-NEO4J.md) — five-minute migration brief.
- [`documentation/COOKBOOK.md`](../../documentation/COOKBOOK.md) (Recipe 1+2) plus [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md) HNSW thresholds — runnable AI-native surface (vector / agent-memory / GraphRAG); roadmap design notes live in [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
- [`documentation/ai-integration/llm-to-cypher.md`](../../documentation/ai-integration/llm-to-cypher.md) — LLM → Cypher patterns.
- [`documentation/ai-integration/embeddings-hybrid-rrf.md`](../../documentation/ai-integration/embeddings-hybrid-rrf.md) — RRF math for hybrid retrieval.
- Multi-agent shared-KG patterns: today's engine is single-writer-kernel-limited (see [`documentation/BENCHMARKS.md`](../../documentation/BENCHMARKS.md) row 9 / § 4.6). Real multi-writer support is a v0.5 roadmap item; an earlier draft of this entry pointed at `documentation/ai-integration/multi-agent-shared-kg.md`, which was removed because it claimed `Database::open("shared.ogdb")` "Just Works across processes" — it does not.
- [`documentation/ai-integration/cosmos-mcp-tool.md`](../../documentation/ai-integration/cosmos-mcp-tool.md) — MCP tool wiring.
- [`scripts/quickstart.sh`](scripts/quickstart.sh) — runnable end-to-end demo.
- [`references/cypher-coverage.md`](references/cypher-coverage.md) — authoritative feature × status grid.
- [`references/benchmarks-snapshot.md`](references/benchmarks-snapshot.md) — frozen 0.5.1 numbers.
- [`eval/cases.yaml`](eval/cases.yaml) — eval suite for this skill.
