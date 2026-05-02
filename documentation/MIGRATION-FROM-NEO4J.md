# OpenGraphDB for Neo4j developers — a 5-minute migration guide

> Companion to [`documentation/COOKBOOK.md`](COOKBOOK.md). Every code snippet on this
> page is exercised by `frontend/e2e/migration-guide-snippets.spec.ts` on
> every PR.

You already run Neo4j (Community, Enterprise, or Aura) and you're sizing
OpenGraphDB for one of three new-build pressures: an embedded commercial
product where Apache 2.0 beats AGPL legal review, an edge / on-device /
AI-agent target where a single-file binary beats a JVM and a Python sidecar,
or an AI-native build where vector + text + graph share one query plan
instead of being glued from Pinecone + Lucene + APOC. In five minutes this
page answers seven questions: license fit, Cypher coverage, Bolt-driver
compatibility, AI-native primitives, performance wins-and-losses, schema
rewrites, and what runs unchanged.

## 1. License and deployment

OpenGraphDB ships under **Apache 2.0** (see [`LICENSE`](../LICENSE)) as a
**single-file** native binary — no JVM, no separate Lucene, no
Cypher-shell-server-driver chain. `ogdb` is one ELF/Mach-O artifact you
embed in Rust, link from Python or Node, or run as `ogdb serve` (HTTP
`:8080`, Bolt `:7687`).

Neo4j Community is **GPLv3**, Enterprise is commercial, and several Neo4j
plugins (vector, GenAI) are **AGPL**-licensed in their open-source
incarnation. For an embedded shipping product or a closed-source AI agent
that runs on customer hardware, AGPL surface area is the friction
Apache 2.0 removes.

Three deployment modes that benefit:

- **Embed in a commercial product** — link `ogdb-core` directly; no
  copyleft viral exposure for your binary.
- **Edge / on-device** — single binary, ~26 MB RSS at the 10 k-node tier
  (BENCHMARKS row 13).
- **AI agent** — `ogdb mcp --stdio` exposes 20 tools to Claude / Cursor /
  Goose with no Python sidecar.

If JVM-free deploy and Apache 2.0 are the deal-breakers, OpenGraphDB clears
them. If you need every modern Neo4j Enterprise feature (causal-cluster,
fabric, Browser), it does not — and isn't trying to.

## 2. Cypher coverage delta

The in-tree openCypher TCK harness (`crates/ogdb-tck/src/lib.rs::TIER1_CATEGORIES`)
defines six **Tier-1** categories — `MATCH`, `RETURN`, `WHERE`, `CREATE`,
`DELETE`, `SET` — and the harness enforces a **50 % Tier-1 floor** as a
regression gate (`crates/ogdb-tck/src/lib.rs::tier1_floor_is_reported_for_fixture_suite`,
which calls `meets_tier1_floor(0.50)`). Beyond Tier-1 the engine ships
`OPTIONAL MATCH`, `UNION`, `EXISTS`, pattern comprehension, and `CASE`
(README "expanded GQL compatibility").

Partial: aggregation and ordering work. Most APOC procedures do not port —
rewrite as plain Cypher or a small MCP tool (COOKBOOK Recipe 6).

Missing: `LOAD CSV`, the `shortestPath()` function, and `CALL/YIELD` against
arbitrary stored procedures. These are exactly the scenarios the TCK harness
skips today (`crates/ogdb-tck/src/lib.rs::should_skip_scenario`).

**TCK number — honest framing.** The full external-openCypher-TCK pass rate
is **not yet published** in this repo. Run it yourself against an upstream
checkout:

```bash
cargo run --release -p ogdb-tck -- /path/to/openCypher/tck
```

The 50 % Tier-1 floor in `ogdb-tck` is the only number we stand behind
today. A measured external pass rate ships when the upstream TCK fixture is
wired into CI; see [`crates/ogdb-tck/README.md`](../crates/ogdb-tck/README.md).

## 3. Bolt protocol compatibility

`ogdb-bolt` implements **Bolt v1 only** (`crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1`):

```rust
pub const BOLT_MAGIC: u32 = 0x6060_B017;
pub const BOLT_VERSION_1: u32 = 1;
```

Implemented messages: `INIT`, `RUN`, `PULL_ALL`, `ACK_FAILURE`, `RESET`,
`GOODBYE`, `AUTH`. Default bind: `0.0.0.0:7687`.

Bolt v1 is the Neo4j 3.0–3.4 wire era. Modern drivers (`neo4j-java-driver`
5.x, `neo4j-python-driver` 5.x, `neo4j-javascript-driver` 5.x) negotiate
Bolt v4/v5 by default and will not silently fall back to v1. Connect by
pinning the driver's protocol version to v1 if it allows it, or use the
HTTP `POST /query` endpoint (same transport COOKBOOK Recipe 1 uses for MCP).

Caveat: **Bolt v3+** features — transactional `BEGIN`/`COMMIT` over Bolt,
`RUN` with metadata, multi-database routing — are **not implemented**. Bolt
is wired, but not drop-in for modern drivers yet. If your stack
hard-requires v4/v5, treat HTTP `POST /query` as the supported transport.

## 4. AI-native primitives

Vector + text + graph in one query plan, not bolt-on plugins. Neo4j ships
vector, Lucene full-text, and GenAI as separate plugins under separate
licenses. OpenGraphDB ships these as first-class tools in the core CLI
binary — the canonical catalog is the `"tools/list"` arm of
`crates/ogdb-cli/src/lib.rs::execute_mcp_request` (named anchor; line
numbers churn with every release):

- `vector_search` — HNSW kNN over node embeddings.
- `text_search` — tantivy BM25 over indexed properties.
- `rag_retrieve` — fused vector + 1-hop graph + BM25 with RRF.
- `agent_store_episode`, `agent_recall` — agent-memory primitives.
- `rag_build_summaries` — incremental hierarchical summarization.
- HTTP transport: `POST /mcp/tools`, `POST /mcp/invoke`.

There's no Neo4j vector-plugin call to translate because there's no plugin
call — see [`documentation/COOKBOOK.md`](COOKBOOK.md) Recipe 2 for a runnable
`POST /rag/search` snippet that fuses HNSW kNN + 1-hop graph + BM25 in one
round-trip.

For agent integration, `ogdb mcp --stdio` exposes the full MCP tool catalog
to Claude / Cursor / Goose with no Python sidecar. Full catalog: COOKBOOK
Recipe 1.

## 5. Performance characteristics — wins and losses

Numbers below are verbatim from [`documentation/BENCHMARKS.md`](BENCHMARKS.md)
Section 2 (i9-10920X, cold-first-run, no warmup).

**Wins (apples-to-apples or clears spec threshold):**

- **Row 7** — enrichment round-trip p50 / p95 / p99 =
  **38.8 / 44.2 / 113.2 ms** (3.4× under the 150 ms competitive threshold;
  misses the 40 ms best-in-class bar by 4 ms).
- **Row 10** — graph-feature rerank batch p95 = **1.88 μs** (91 000× faster
  than Cohere Rerank 3.5 baseline; structurally different but legitimate
  as graph-native vs neural-forward-pass).
- **Row 13** — scaling tier 10 k nodes: read p95 = **0.41 μs**, load =
  **0.30 s**, RSS = **26.3 MB**, file = **39.4 MB** (all three gates clear
  with 2–3 orders of margin).

**Losses (apples-to-apples, clear gap):**

- **Row 1** — bulk ingest **256 nodes/s** vs Memgraph ≈ 295 k nodes/s
  (1 150× behind on the same-scale workload). Root cause: one-tx-per-node
  driver path. Tracked in BENCHMARKS Section 4.1.
- **Row 2** — streaming ingest 300 nodes/s (33× behind Memgraph Benchgraph
  weakest number). Same root cause.
- **Row 9** — concurrent multi-writer is single-writer-kernel-limited; the
  N=4 measurement is mechanical, not real contention. Tracked in
  BENCHMARKS Section 4.6.

**Honesty footer.** BENCHMARKS rows 3, 4, 5, 11, and 12 are
**scale-mismatched** (10 k nodes / mini fixtures, not Pokec / SF10 /
Datagen-9.0). Directional only — re-run on r7i.4xlarge at SF1/SF10 before
claiming any record.

## 6. What to know before migrating

- **Schema model: LABEL → labels.** OpenGraphDB nodes carry a `Vec<String>`
  of multi-`labels`. Neo4j 4.x+ also supports multi-label so most schema
  ports cleanly. Migrate `MERGE (n:Label {key:val})` patterns by ensuring
  the property index exists (next bullet).
- **Index DDL: new-style → pre-4.x form.** Neo4j 4.x+ uses
  `CREATE INDEX person_email FOR (n:Person) ON (n.email)`. OpenGraphDB uses
  the pre-4.x form `CREATE INDEX ON :Person(email)` (confirmed by the unit
  test
  `crates/ogdb-cli/src/lib.rs::query_command_routes_call_procedures_and_create_index_on`).
  Vector indexes use `CALL vector.create_index(...)`; full-text uses
  `CALL text.create_index(...)`.
  See [`skills/schema-advisor/SKILL.md`](../skills/schema-advisor/SKILL.md).
- **Identity: `id(n)` is not implemented.** Node identity comes back inside
  the row payload — `MATCH (n) RETURN n` returns
  `{"id": <u64>, "labels": [...], "properties": {...}}`. Translation rule:
  replace `RETURN id(n) AS nid` with `RETURN n` and read `n.id` from the
  JSON row.
- **APOC.** Not portable. Rewrite as plain Cypher or a small MCP tool
  (COOKBOOK Recipe 6).

## 7. Working examples

**Identical (runs as-is on both Neo4j and OpenGraphDB):**

```cypher
MATCH (n) RETURN count(n) AS c
```

```cypher
CREATE (a:Person {name: 'Alice'})-[:KNOWS]->(b:Person {name: 'Bob'})
```

**Needs translation (Neo4j 4.x+ → OpenGraphDB):**

| Neo4j 4.x+                                              | OpenGraphDB                                   |
|---------------------------------------------------------|-----------------------------------------------|
| `CREATE INDEX person_email FOR (n:Person) ON (n.email)` | `CREATE INDEX ON :Person(email)`              |
| `MATCH (n:Person) RETURN id(n) AS nid`                  | `MATCH (n:Person) RETURN n` (read `n.id`)     |
| `CALL db.index.vector.queryNodes('emb', 10, $vec)`      | `POST /rag/search` (COOKBOOK Recipe 2)        |
| `CALL apoc.path.expandConfig(...)`                      | rewrite as plain Cypher or MCP tool           |

Each Cypher snippet above is exercised against a live `ogdb serve --http`
by `frontend/e2e/migration-guide-snippets.spec.ts`.

## See also

- [`documentation/COOKBOOK.md`](COOKBOOK.md) — recipe-level how-to (Recipe 1: MCP;
  Recipe 2: hybrid retrieval; Recipe 6: migration mechanics).
- [`documentation/BENCHMARKS.md`](BENCHMARKS.md) — every cited latency / throughput
  number, with reproducibility notes.
- [`crates/ogdb-tck/README.md`](../crates/ogdb-tck/README.md) — how to
  compute your own openCypher TCK pass rate.
- [`README.md`](../README.md) — project status, install, full CLI surface.
- [`skills/schema-advisor/SKILL.md`](../skills/schema-advisor/SKILL.md) —
  vector / text / B-tree index DDL.
