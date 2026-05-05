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

**Wins (1 verified, 2 caveated)** — verdict structure mirrors
[`BENCHMARKS.md`](BENCHMARKS.md) § 2.1 post cycle-17 `e585f66` tone-down.

*Verified WIN (apples-to-apples against a published spec threshold):*

- **Row 13** — scaling tier 10 k nodes: read p95 = **0.41 μs**, load =
  **0.30 s**, RSS = **26.3 MB**, file = **39.4 MB** (all three internal
  gates clear with 2–3 orders of margin). Note: this is a 10 k-tier
  internal threshold, not a competitor-published competitive bar.

*Caveated WIN (competitive bar cleared; best-in-class missed or only synthetic):*

- **Row 7** — enrichment round-trip p50 / p95 / p99 =
  **38.8 / 44.2 / 113.2 ms** (3.4× under the 150 ms competitive threshold;
  misses the 40 ms best-in-class bar by 4 ms).
- **Row 10** — graph-feature rerank batch p95 = **1.88 μs** clears the
  50 ms competitive bar by orders of magnitude, but the boost is a
  synthetic `Σ neighbour_id`, not a learned dot-product — so the headline
  91 000× ratio against Cohere Rerank 3.5 is best read as "graph-traversal
  vs. neural forward pass," not an apples-to-apples production-rerank
  comparison.

**Losses (apples-to-apples, clear gap):**

- **Row 1** — bulk ingest **256 nodes/s** vs Memgraph ≈ 295 k nodes/s
  (1 150× behind on the same-scale workload). Root cause: one-tx-per-node
  driver path. Tracked in BENCHMARKS Section 4.1.
- **Row 2** — streaming ingest 300 nodes/s (33× behind Memgraph Benchgraph
  weakest number). Same root cause.
- **Row 9** — concurrent multi-writer is single-writer-kernel-limited; the
  N=4 measurement is mechanical, not real contention. Tracked in
  BENCHMARKS Section 4.6.

**Honesty footer.** Two distinct caveat classes in
[`BENCHMARKS.md`](BENCHMARKS.md) § 2 — do not collapse them:

- **Directional indicator (pending apples-to-apples at SF10).** Rows 3
  (point read at 10 k) and 4 (2-hop at 10 k) — we ran at 10 k nodes;
  competitors publish at 1.6 M-node Pokec / SF10. Lower-bound feasibility
  signal, not a verified WIN. Tracked in BENCHMARKS § 4.2.
- **Scale-mismatched (mini fixtures).** Rows 5 (LDBC SNB IS-1 on 100-person
  mini), 11 (Graphalytics BFS on 100-node mini), and 12 (Graphalytics
  PageRank on 100-node mini) — we ran a tier 0 fixture; the spec grades at
  tier XL on Datagen-9.0. Cannot claim the bar until the SF10 / Datagen-9.0
  re-run lands. Tracked in BENCHMARKS §§ 4.3, 4.7.

Re-run on r7i.4xlarge at SF1 / SF10 / Datagen-9.0 before claiming any
record on either class.

### 5.1 Verified vs Neo4j Community 5.x

This subsection is the **apples-to-apples** counterpart to the directional
table above: every cell is from a run we executed ourselves on the
i9-10920X bench box, against a Neo4j Community 5.x Docker image pinned to
a specific digest, on the same machine, same workload, same iteration
count, same percentile methodology as
[`BENCHMARKS.md`](BENCHMARKS.md) § 1.

**Cells stay `(pending)` until verified by a real run.** We will not
pre-fill them with imported Neo4j blog numbers (those are already cited as
"directional context" in BENCHMARKS § 2 and § 6). The plan that drives
each tier's row-fill lives at
[`documentation/.planning/neo4j-comparison/PLAN.md`](.planning/neo4j-comparison/PLAN.md).

| # | Metric / Workload | OpenGraphDB 0.4.0 | Neo4j 5.x Community | Verdict | Tier | Last verified |
|---|---|---|---|---|---|---|
| 5.1.1 | Bulk ingest 10 k nodes + 10 k edges (nodes/s, single write-tx) | 254 | (pending Tier 1) | (pending) | 1 | — |
| 5.1.2 | Point-read p50 / p95 / p99 (μs), 10 k nodes, cold | 5.8 / 6.8 / 11.8 | (pending Tier 1) | (pending) | 1 | — |
| 5.1.3 | 2-hop p50 / p95 / p99 (μs), 10 k nodes, cold | 22.9 / 25.8 / 36.0 | (pending Tier 1) | (pending) | 1 | — |
| 5.1.4 | LDBC SNB IS-1 p50 / p95 / p99 (μs), SF1, 1 000 queries | (pending Tier 2 — SF1 loader) | (pending Tier 2) | (pending) | 2 | — |
| 5.1.5 | LDBC SNB IS-2..IS-7 p95 (μs), SF1 | (pending Tier 2) | (pending Tier 2) | (pending) | 2 | — |
| 5.1.6 | LDBC SNB IC-1, IC-2, IC-3 p95 (ms), SF1 | (pending Tier 2) | (pending Tier 2) | (pending) | 2 | — |
| 5.1.7 | Pokec point-read p99 (ms), 1.6 M users | (pending Tier 2) | (pending Tier 2) | (pending) | 2 | — |
| 5.1.8 | Pokec 2-hop p95 (ms), 1.6 M users | (pending Tier 2) | (pending Tier 2) | (pending) | 2 | — |
| 5.1.9 | Bulk-load wall-clock @ SF1 (s) | (pending Tier 2) | (pending Tier 2) | (pending) | 2 | — |
| 5.1.10 | Streaming ingest sustained (nodes/s, Bolt) | 301 | (pending Tier 2) | (pending) | 2 | — |

**Methodology rules for every row in this table.**

- N=5 release-build iters, 1 warm-up discarded, lower-median across 5.
- p99.9 dropped from the medianed core (manifest gate).
- Cold cache: drop OS page cache between iters.
- CPU governor `performance` if writeable; warning logged otherwise.
- Neo4j JVM: `-Xmx8G -Xms8G`, `dbms.memory.pagecache.size=4G` for 10 k +
  SF1; raise to `-Xmx16G` / `8G` page-cache for Pokec. Rationale: equal
  total memory budget vs OpenGraphDB's working-set RSS, capped at 16 G.
- Neo4j edition: **Community only** (Enterprise is license-gated and
  cannot be redistributed in CI).
- Verdict legend: ✅ **WIN** (OpenGraphDB faster by ≥ 1.5×) / ❌ **LOSS**
  (Neo4j faster by ≥ 1.5×) / 🤝 **TIE** (within 1.5×). Ratios outside
  these bands are noise on N=5.

**How to read this table while it's still mostly `(pending)`.** The
two-column structure is itself a commitment: the moment a Tier 1 / Tier 2
run lands, the verified verdict drops in *and* the matching directional
row in BENCHMARKS § 2 (rows 3 / 4 / 5) flips from ⚠️ DIRECTIONAL to the
literal verdict. Until then, the conservative read is: take the
directional row above as a *signal*, not a *claim* — and watch this table
for the actual claim.

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
