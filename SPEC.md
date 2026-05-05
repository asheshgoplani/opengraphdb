# OpenGraphDB — Product Specification

> The embeddable, AI-native graph database.

**Version:** 0.5.1
**Date:** 2026-05-05
**Status:** Implemented (core engine, Cypher, import/export, server adapters, MCP, frontend)

**Canonical architecture source:** `ARCHITECTURE.md` (if this document conflicts, `ARCHITECTURE.md` wins)

---

## 1. Vision

OpenGraphDB is the "SQLite for graph databases": a single-binary, embeddable, high-performance graph database written in Rust with native vector search, full-text search, and first-class AI agent support. It fills the vacuum left by KuzuDB's abandonment (Oct 2025) while going further with AI-native design, MCP integration, and modern developer experience.

---

## 2. Core Principles

| Principle | What It Means |
|-----------|---------------|
| **Embeddable first** | Works as a library (in-process) with zero setup. No server required for basic use |
| **Server when needed** | Scales up to standalone server mode for production multi-client workloads |
| **AI-native** | MCP server built-in, agent memory patterns, GraphRAG primitives |
| **CLI-first DX** | Single binary. `ogdb query "MATCH (n) RETURN n"` just works |
| **Permissive license** | Apache 2.0. No AGPL traps, no BSL restrictions. Embed freely |
| **Standards compliant** | Cypher (openCypher) query language with planned GQL (ISO 39075) conformance, following the openCypher-to-GQL evolution path |
| **Multi-modal storage** | Graph + Vector + Full-text in one engine, not three |

---

## 3. Target Users

### Primary
- **AI/ML engineers** building RAG pipelines, knowledge graphs, agent memory systems
- **Backend developers** who need graph queries without running Neo4j infrastructure
- **Startups** that can't afford Neo4j Enterprise or managed cloud graph DBs

### Secondary
- **Data scientists** exploring relationships in datasets
- **DevTool builders** (code intelligence, dependency graphs, AST analysis)
- **Embedded systems** needing local graph storage (edge computing, mobile)

---

## 4. Technical Specification

### 4.1 Language & Runtime

| Property | Choice | Rationale |
|----------|--------|-----------|
| Language | **Rust** | Zero GC pauses, memory safety, ~60K req/s proven by CozoDB/SurrealDB |
| Async runtime | **Tokio** | Industry standard for Rust async I/O |
| Build target | **Single static binary** | No runtime dependencies. Cross-compile for Linux, macOS, Windows |
| WASM support | **Planned (v2)** | Browser and edge deployment |

### 4.2 Storage Engine

| Component | Design | Rationale |
|-----------|--------|-----------|
| Graph storage | **Columnar + CSR** (Compressed Sparse Row) | Fast traversal locality and cache efficiency for CLI/agent neighborhood reads |
| Persistence | **Columnar CSR + delta buffer** | Read-optimized baseline with staged writes; benchmark-gated pivot path to hybrid hot-write + compacted-CSR when write-heavy thresholds are exceeded |
| File format | **Authoritative `.ogdb` + `.ogdb-wal`** (SQLite-style) | Main state stays simple while preserving robust WAL/recovery semantics |
| Index artifacts | **Rebuildable sidecars** (`.vecindex`, `.ftindex`) by default | Keeps correctness domain small; enables clean recovery/rebuild strategy |
| Buffer pool | **Custom** with explicit `pread`/`pwrite` I/O | Predictable paging behavior and robust recovery/error semantics |
| Compression | **LZ4** for data blocks, **ZSTD** for cold storage | Fast decompression for hot data, high ratio for archival |

### 4.3 Query Engine

| Component | Design | Rationale |
|-----------|--------|-----------|
| Query language | **Cypher** (openCypher) | Largest user base, strongest LLM/query tooling ecosystem, and best current AI agent interoperability |
| Parser | **winnow combinator parser** | nom's successor with separate lexer + parser, extensible for future GQL features |
| Optimizer | **Cost-based** with adaptive WCOJ | Worst-Case Optimal Joins for pattern queries (2-3x speedup on complex patterns) |
| Execution | **Vectorized push-based** | Columnar batches through pipeline, CPU cache friendly |
| Factorized processing | **Yes** | Compress intermediate results, avoid Cartesian explosion |

#### Isolation level — Snapshot Isolation (non-serializable)

OpenGraphDB implements **Snapshot Isolation (SI)**, not Serializable isolation.
This matches PostgreSQL pre-SSI and MySQL InnoDB defaults.

- Base row reads (`get_node_properties`, `node_labels`, neighbor traversal)
  go through MVCC visibility via `can_see_version`, so a reader holding a
  snapshot at `T` never sees a writer's uncommitted rows nor rows committed
  after `T`.
- **Known caveat (audit finding 2.3):** index-backed label and property
  scans (`find_nodes_by_label`, property index lookups) are rebuilt at
  commit time from the post-commit `MetaStore` and do not thread a
  reader's `snapshot_txn_id` through the scan. A reader holding an older
  snapshot can therefore observe phantom entries from a concurrently
  committed writer when using an index scan, even though the equivalent
  per-row read would not return that node.
  - **Mitigation for SI-critical workloads:** replace `find_nodes_by_label(X)`
    with a full scan + per-row `can_see_version` check, or use the row-level
    `ReadSnapshot` APIs that filter visibility post-hoc.
  - A regression test (`crates/ogdb-core/tests/index_scan_phantom_read_caveat.rs`)
    pins this behavior so it cannot silently change without an explicit
    contract update.
- **Write-skew** is permitted (SI does not detect it). See `ARCHITECTURE.md`
  MVCC section for the full semantics.

A future `WriteConcurrencyMode::Serializable` could close both gaps via
read-set tracking + index-aware SSI, but is tracked as separate work.

### 4.4 Data Model

```
Property Graph Model (labeled, directed, multi-graph)
├── Nodes (vertices)
│   ├── Labels (multiple per node)
│   ├── Properties (typed key-value pairs)
│   └── Embeddings (native vector attachment)
├── Edges (relationships)
│   ├── Type (single per edge)
│   ├── Properties (typed key-value pairs)
│   └── Temporal metadata (valid_from, valid_to)
└── Indexes
    ├── Property indexes (B-tree)
    ├── Full-text indexes (tantivy)
    ├── Vector indexes (HNSW)
    └── Composite indexes
```

**Supported property types:**
- Primitives: `bool`, `i64`, `f64`, `string`, `bytes`
- Temporal: `date`, `datetime`, `duration`
- Collections: `list<T>`, `map<string, T>`
- Vectors: `vector<f32, N>` (native, not a property hack)

### 4.5 Vector Search (Native)

| Property | Design |
|----------|--------|
| Index type | **HNSW** (Hierarchical Navigable Small World) |
| Dimensions | Up to 4096 |
| Distance metrics | Cosine, Euclidean, Dot Product |
| Hybrid queries | Graph traversal + vector similarity in single query |

**Example query (Cypher extension):**
```cypher
MATCH (doc:Document)-[:MENTIONS]->(entity:Entity)
WHERE doc.embedding <-> $query_vector < 0.3
  AND entity.type = 'Person'
RETURN doc, entity, vector_distance(doc.embedding, $query_vector) AS score
ORDER BY score ASC
LIMIT 10
```

### 4.6 Full-Text Search (Native)

| Property | Design |
|----------|--------|
| Engine | **Tantivy** (Rust-native, Lucene-equivalent) |
| Features | Tokenization, stemming, fuzzy matching, BM25 ranking |
| Integration | Indexed properties automatically searchable |

**Example query:**
```cypher
MATCH (n:Article)
WHERE n.content CONTAINS TEXT 'graph database performance'
RETURN n.title, text_score(n.content) AS relevance
ORDER BY relevance DESC
```

### 4.7 Temporal Graphs (Native)

| Property | Design |
|----------|--------|
| Model | **Bi-temporal** (valid time + transaction time) |
| Time-travel | Query graph state at any past point in time |
| Versioning | Append-only with compaction |

**Example query:**
```cypher
-- What did the graph look like on January 1st?
MATCH (p:Person)-[r:WORKS_AT]->(c:Company)
AT TIME datetime('2025-01-01')
RETURN p.name, c.name

-- What changed in the last 24 hours?
MATCH (n)-[r]->(m)
WHERE r.valid_from > datetime() - duration('P1D')
RETURN n, r, m
```

### 4.8 RDF & Ontology Interoperability

OpenGraphDB is **Cypher-first** but treats RDF/SPARQL as a first-class data interchange format.
This means: you bring your ontologies and TTL files in, query them with Cypher, and export back
to RDF when needed. No SPARQL engine required.

#### Design Philosophy

| Aspect | Approach |
|--------|----------|
| Query language | **Cypher/GQL only** (not SPARQL). One query language, done well |
| RDF as data format | **Full import/export** of TTL, N-Triples, RDF/XML, JSON-LD, N-Quads |
| Ontology support | **OWL/RDFS import**: classes → labels, object properties → relationship types, datatype properties → property keys |
| SHACL validation | **Optional extension**: validate graph against SHACL shapes |
| SPARQL endpoint | **Not planned** unless community demand is overwhelming |
| URI preservation | **Full**: original URIs stored as `_uri` property on every imported node/edge |

#### RDF → Property Graph Conversion Rules

| RDF Pattern | Property Graph Result | Example |
|-------------|----------------------|---------|
| `?s rdf:type ?class` | Node with label = local name of `?class` | `ex:John rdf:type schema:Person` → `(:Person {_uri: "ex:John"})` |
| `?s ?pred ?obj` (obj is URI) | Relationship typed as local name of `?pred` | `ex:John schema:worksAt ex:Acme` → `(john)-[:worksAt]->(acme)` |
| `?s ?pred "literal"` | Property on the subject node | `ex:John schema:name "John"` → `john.name = "John"` |
| `?s ?pred "literal"^^xsd:type` | Typed property (auto-cast) | `"42"^^xsd:integer` → `i64(42)` |
| `@prefix` declarations | Stored in metadata, used for export round-tripping | `@prefix schema: <http://schema.org/>` |
| Blank nodes | Auto-generated node IDs | `_:b1` → `(:_BlankNode {_blank_id: "b1"})` |
| `owl:Class` | Label definition in schema | `schema:Person a owl:Class` → label `Person` registered |
| `owl:ObjectProperty` | Relationship type definition | `schema:worksAt a owl:ObjectProperty` → rel type `worksAt` |
| `owl:DatatypeProperty` | Property key definition | `schema:name a owl:DatatypeProperty` → prop key `name` |
| `rdfs:subClassOf` | Label hierarchy (queryable) | `schema:Student rdfs:subClassOf schema:Person` → `(:Student)` also matches `(:Person)` queries |
| Named graphs | Graph partitions (via `_graph` property) | `GRAPH <ex:g1> { ... }` → nodes get `_graph: "ex:g1"` |

#### Import Examples

```bash
# Import a TTL file (auto-detects format)
ogdb import mydb.ogdb --format ttl ontology.ttl

# Import with explicit base URI
ogdb import mydb.ogdb --format ttl data.ttl --base-uri "http://example.org/"

# Import JSON-LD
ogdb import mydb.ogdb --format jsonld schema.jsonld

# Import N-Triples (streaming, good for large files)
ogdb import mydb.ogdb --format nt dbpedia-dump.nt

# Import multiple RDF files at once
ogdb import mydb.ogdb --format ttl *.ttl

# Import an OWL ontology as schema (no instance data)
ogdb import mydb.ogdb --format ttl --schema-only pizza-ontology.owl.ttl
```

#### Query Imported RDF Data with Cypher

```cypher
-- Original RDF:
--   ex:John a schema:Person ; schema:name "John" ; schema:worksAt ex:Acme .
--   ex:Acme a schema:Organization ; schema:name "Acme Corp" .

-- Query with Cypher (simple, readable):
MATCH (p:Person)-[:worksAt]->(o:Organization)
RETURN p.name, o.name

-- Access original URIs when needed:
MATCH (p:Person)
WHERE p._uri = 'http://example.org/John'
RETURN p

-- Subclass queries (Student is subClassOf Person):
MATCH (p:Person)  -- matches both :Person and :Student nodes
RETURN p.name, labels(p)

-- Prefix-aware URI matching:
MATCH (n)
WHERE n._uri STARTS WITH 'http://schema.org/'
RETURN n
```

#### Export Back to RDF

```bash
# Export entire graph as TTL
ogdb export mydb.ogdb --format ttl > output.ttl

# Export query results as TTL
ogdb query mydb.ogdb "MATCH (p:Person)-[r]->(o) RETURN p, r, o" \
  --format ttl > people.ttl

# Export as JSON-LD (good for APIs)
ogdb export mydb.ogdb --format jsonld > output.jsonld

# Round-trip test: import → query → export preserves URIs and prefixes
```

#### Conversion Data Flow

```
  TTL / N-Triples / RDF-XML / JSON-LD / N-Quads
                    │
                    ▼
        ┌───────────────────────┐
        │   RDF Parser          │
        │   (rio or oxigraph)   │  ◄── Rust-native RDF parsing
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Conversion Engine    │
        │                       │
        │  • rdf:type → Label   │
        │  • URI obj  → Edge    │
        │  • Literal  → Prop    │
        │  • OWL      → Schema  │
        │  • Preserve URIs      │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Property Graph       │
        │  (Columnar + CSR)     │
        │                       │
        │  Query with Cypher    │
        └───────────────────────┘
```

#### Why Not Support SPARQL Queries?

1. **Doubles parser/optimizer complexity** for <5% of target users
2. **SPARQL features that don't map to property graphs**: CONSTRUCT, federated queries (SERVICE), named graph patterns, reification
3. **AI agents generate Cypher better** than SPARQL (more training data, simpler syntax)
4. **One query language done well** beats two done poorly
5. **Import/export preserves full RDF fidelity**, so users can always round-trip to a SPARQL engine if needed

### 4.9 Deployment Modes

| Mode | Use Case | How |
|------|----------|-----|
| **Embedded library** | In-process, zero setup | `cargo add ogdb-core` (Rust); `pip install opengraphdb` (Python); `npm install opengraphdb` (Node). The Rust crate family ships as `ogdb-*`; Python and npm packages ship as `opengraphdb`. |
| **CLI tool** | Ad-hoc queries, scripting, piping | `ogdb query "MATCH..."` |
| **Standalone server** | Multi-client production | `ogdb serve --port 7687` (Bolt protocol compatible) |
| **MCP server** | AI agent integration | `ogdb mcp` (built-in, zero config) |

---

## 5. AI & Agent Integration

### 5.1 Built-in MCP Server

```bash
# Start as MCP server (for Claude, Cursor, etc.)
ogdb mcp --db mydata.ogdb

# Or configure in claude settings:
# { "command": "ogdb", "args": ["mcp", "--db", "mydata.ogdb"] }
```

**MCP tools exposed:**
- `query` — Execute Cypher/GQL queries
- `schema` — Inspect graph schema
- `upsert_node` — Create/update nodes
- `upsert_edge` — Create/update relationships
- `vector_search` — Semantic similarity search
- `text_search` — Full-text search
- `subgraph` — Extract neighborhood around a node
- `shortest_path` — Pathfinding between nodes
- `temporal_diff` — What changed between two timestamps
- `import_rdf` — Import TTL/JSON-LD/N-Triples data into the graph
- `export_rdf` — Export graph or query results as TTL/JSON-LD

### 5.2 Agent Memory Patterns

Built-in support for common AI agent memory patterns:

```cypher
-- Store agent memory (episodic)
CREATE (e:Episode {
  content: 'User asked about graph databases',
  embedding: $embedding,
  timestamp: datetime(),
  agent_id: 'agent-1',
  session_id: 'sess-abc'
})

-- Retrieve relevant memories (semantic + temporal)
MATCH (e:Episode)
WHERE e.embedding <-> $query_embedding < 0.4
  AND e.agent_id = 'agent-1'
RETURN e
ORDER BY e.timestamp DESC
LIMIT 5
```

### 5.3 GraphRAG Primitives

Native support for Retrieval Augmented Generation workflows:

- **Community detection** (Louvain, Label Propagation) as built-in procedures
- **Entity extraction helpers** (merge-on-match patterns)
- **Summarization anchors** (hierarchical graph summarization)
- **Hybrid retrieval** (vector similarity + graph structure in one query)

---

## 6. CLI Design

```bash
# Initialize a new database
ogdb init myproject.ogdb

# Interactive REPL
ogdb shell myproject.ogdb

# One-shot query
ogdb query myproject.ogdb "MATCH (n) RETURN count(n)"

# Import data
ogdb import myproject.ogdb --format csv nodes.csv edges.csv
ogdb import myproject.ogdb --format json data.jsonl
ogdb import myproject.ogdb --format ttl data.ttl
ogdb import myproject.ogdb --format jsonld schema.jsonld
ogdb import myproject.ogdb --format nt dbpedia.nt

# Import with error tolerance (logs bad rows, continues)
ogdb import myproject.ogdb --format ttl data.ttl --continue-on-error

# Export data
ogdb export myproject.ogdb --format json > backup.jsonl
ogdb export myproject.ogdb --format ttl > backup.ttl
ogdb export myproject.ogdb --format jsonld > backup.jsonld

# Backup (checkpoint + file copy)
ogdb backup myproject.ogdb backup.ogdb

# Manual checkpoint (then safe to cp)
ogdb checkpoint myproject.ogdb

# Start server
ogdb serve myproject.ogdb --port 7687

# Start MCP server
ogdb mcp myproject.ogdb

# Database info and metrics
ogdb info myproject.ogdb
ogdb stats myproject.ogdb

# Schema management
ogdb schema myproject.ogdb
ogdb migrate myproject.ogdb --from schema-v1.cypher --to schema-v2.cypher
```

**Piping support (Unix philosophy):**
```bash
# Pipe query results to jq
ogdb query mydb.ogdb "MATCH (n:Person) RETURN n" --format json | jq '.name'

# Pipe CSV into import
cat users.csv | ogdb import mydb.ogdb --format csv --label User

# Chain with AI tools
ogdb query mydb.ogdb "MATCH (n) RETURN n LIMIT 100" --format json | \
  claude --prompt "Analyze these graph patterns"
```

---

## 7. Observability & Metrics

### 7.1 Pull-Based Metrics API (Embedded Mode)

Following SQLite's pattern, OpenGraphDB provides zero-overhead pull-based metrics:

```rust
// Rust API
let metrics = db.metrics();
println!("Cache hit rate: {:.2}%",
    100.0 * metrics.buffer_pool_hits as f64 /
    (metrics.buffer_pool_hits + metrics.buffer_pool_misses) as f64);

// Python binding
metrics = db.metrics()
print(f"Query latency P95: {metrics.query_latency_us.p95}μs")
```

**Core metrics:**
- Query execution: count, latency histogram (P50/P95/P99), success/failure
- Buffer pool: hits, misses, evictions, dirty writes
- Memory usage: total, buffer pool, query execution, WAL buffers
- Storage: node count, edge count, DB file size, WAL size
- Transactions: committed, rolled back, active

**Extended metrics (when vector/text modules are enabled):**
- Vector search: latency, distance computations, vectors indexed, index size
- Full-text search: latency, query count
- Import throughput: nodes/sec, edges/sec

### 7.2 Per-Query Profiling

Opt-in profiling similar to `EXPLAIN ANALYZE`:

```rust
let (result, profile) = db.query_profiled("MATCH (n:Person) RETURN n")?;
println!("Planning: {}μs", profile.planning_duration_us);
println!("Execution: {}μs", profile.execution_duration_us);
for op in profile.operators {
    println!("  {}: {}μs ({} → {} rows)", op.name, op.duration_us, op.rows_in, op.rows_out);
}
```

### 7.3 OpenTelemetry Integration

OpenGraphDB uses the `tracing` crate for structured logging. Users get free OTel support by adding `tracing-opentelemetry` as a subscriber layer in their application. All internal operations are instrumented with spans following OTel semantic conventions for databases.

**Metric naming (follows OTel conventions):**
- `ogdb.query.duration` (histogram, seconds)
- `ogdb.query.count` (counter, tagged with status=success/error)
- `ogdb.buffer_pool.hit_ratio` (gauge, 0.0-1.0)
- `ogdb.storage.size_bytes` (gauge, tagged with component=data/wal)

---

## 8. Quality & Conformance Targets

### 8.1 openCypher TCK Compliance

OpenGraphDB targets the openCypher Technology Compatibility Kit (TCK) version **2024.2** for conformance testing.

**Conformance baseline:**
- **Minimum gate:** 50-55% (~400 of ~800 scenarios)
- **Mandatory category coverage:** Tier 1 categories (match, create, return, where, set, delete, with, aggregation, literals, comparison, boolean, null)

**Stretch objective (non-gating):**
- Expand toward 75%+ as advanced clauses and expression families are implemented.

**Rationale:** Cypher-for-Gremlin (a translation layer) achieved 76% baseline and 92% with extensions. A native Rust implementation with a strong Tier-1 floor is a practical and defensible compatibility baseline.

### 8.2 Backup & Recovery

**Backup strategy (required):**
```bash
# Checkpoint + file copy (SQLite pattern)
ogdb backup mydb.ogdb backup.ogdb
```

Implementation: Force WAL checkpoint, acquire brief read lock, copy .ogdb file, release lock.

**Logical backup:**
```bash
# Export as JSON for cross-version compatibility
ogdb export mydb.ogdb --format json > backup.jsonl
```

**Optional extensions:**
- `--compact` flag (VACUUM INTO equivalent, defragmented backup)
- Online page-by-page backup API for very large databases

---

## 9. Client Libraries / Language Bindings

| Language | Priority | Binding Type |
|----------|----------|-------------|
| **Rust** | P0 (native) | Core library |
| **Python** | P0 | PyO3 bindings (pip install opengraphdb) |
| **JavaScript/TypeScript** | P0 | NAPI-RS bindings (npm install opengraphdb) |
| **Go** | P1 | CGo bindings |
| **C/C++** | P1 | FFI header |
| **Java/JVM** | P2 | JNI bindings |
| **WASM** | P2 | wasm-bindgen |

---

## 10. Protocol Compatibility

| Protocol | Support | Purpose |
|----------|---------|---------|
| **Bolt v1** (Neo4j 3.x wire) | Shipped (v1-only) | Pre-Neo4j-3.5 wire era. Modern Neo4j 5.x drivers default to v4/v5 and will reject the handshake; see `documentation/MIGRATION-FROM-NEO4J.md` § "Bolt protocol coverage". v4/v5 negotiation tracked for v0.5. |
| **HTTP/REST** | Full | Simple integration, curl-friendly |
| **gRPC** | Planned (v2) | High-performance service-to-service |
| **MCP** (stdio) | Full | AI agent integration |

---

## 11. Performance Targets

| Metric | Target | Benchmark |
|--------|--------|-----------|
| Single-hop traversal | < 1 ms | Point query latency |
| Multi-hop (3 hops, 1M nodes) | < 10 ms | Neighborhood expansion |
| Throughput (LDBC Interactive) | > 100K QPS | Single node |
| Vector search (1M vectors, 768d) | < 1 ms | Top-10 nearest neighbors |
| Full-text search | < 5 ms | BM25 ranked results |
| Bulk import | > 500K edges/sec | CSV import pipeline |
| Cold start | < 50 ms | Embedded library init |
| Memory (1M nodes, 5M edges) | < 500 MB | Resident memory |
| Database file (1M nodes, 5M edges) | < 1 GB | On-disk size |

---

## 12. Comparison with Existing Solutions

| Feature | OpenGraphDB | Neo4j CE | Memgraph | KuzuDB (dead) | SurrealDB | CozoDB |
|---------|-------------|----------|----------|---------------|-----------|--------|
| License | Apache 2.0 | AGPL | BSL | MIT | BSL | MPL 2.0 |
| Language | Rust | Java | C++ | C++ | Rust | Rust |
| Embeddable | Yes | No | No | Yes | No | Yes |
| Server mode | Yes | Yes | Yes | No | Yes | Partial |
| Cypher/GQL | Yes | Yes | Yes (openCypher) | Yes (Cypher) | No (SurrealQL) | No (Datalog) |
| Vector search | Native | Plugin | No | No | Planned | No |
| Full-text search | Native (Tantivy) | Lucene | No | No | Partial | No |
| Temporal graphs | Native | No | No | No | No | No |
| MCP server | Built-in | Community | Community | No | Official | No |
| CLI-first | Yes | No | No | No | Yes | Yes |
| Single-file storage | Yes | No | No | Yes | No | Yes |
| GC pauses | None (Rust) | Yes (JVM) | None (C++) | None (C++) | None (Rust) | None (Rust) |
| RDF/TTL import | Native | Plugin (n10s) | No | No | No | No |
| Ontology support | OWL/RDFS import | Plugin (n10s) | No | No | No | No |

---

## 13. Capability Baseline

OpenGraphDB uses capability commitments instead of date-based planning.

### 13.1 Core Required Capabilities
- Core storage engine (columnar CSR + delta buffer, single-file with WAL sidecar)
- Cypher parser and executor with Tier-1 TCK category coverage
- Property indexes (B-tree for exact lookups, auto-created)
- RDF/TTL/JSON-LD import with auto-conversion to property graph
- OWL/RDFS ontology import (classes → labels, properties → relationships/props)
- All-or-nothing bulk import + streaming import with batch commits
- CLI tool (`init`, `query`, `shell`, `import`, `export`, `backup`, `checkpoint`, `stats`)
- Embedded Rust library API with pull-based metrics (`db.metrics()`)
- Python bindings (PyO3)
- Observability: pull-based metrics API, query profiling, tracing spans for OTel integration

### 13.2 Integrated Extended Capabilities
- Vector search (HNSW via USearch)
- Full-text search (Tantivy)
- Hybrid queries with first-class `VectorScan` and `TextSearch`
- Bitmap pre-filter propagation and ID intersection operators
- MCP server
- JavaScript/TypeScript bindings
- Bolt v1 protocol compatibility (v4/v5 negotiation is a v0.6.0 follow-up, slipped from v0.5)
- GQL keyword aliases and incremental compatibility improvements
- File-level import tracking
- Compact backup mode

### 13.3 Production Hardening Capabilities
- Multi-writer server mode
- Replication
- Online backup API (page-by-page)
- Prometheus metrics endpoint (server mode)
- Full GQL conformance features
- WASM builds
- Governance and cloud-service operationalization

---

## 14. Monetization Strategy

| Revenue Stream | Model |
|----------------|-------|
| **Open source core** | Apache 2.0, free forever. Community, adoption, trust |
| **Managed cloud** (primary) | OpenGraphDB Cloud: hosted, autoscaling, pay-per-use. Like Turso for SQLite |
| **Enterprise support** | SLA, priority bugs, consulting |
| **Enterprise features** (optional) | RBAC, audit logs, SSO. Source-available, not open-core-crippled |

**Lesson from failures:** KuzuDB couldn't monetize. Dgraph raised $23.5M and failed. The cloud service model should be designed from the beginning, not bolted on late.

---

## 15. Market Context

- Graph DB market: $2-14B by 2030 (24-28% CAGR)
- KuzuDB abandoned Oct 2025: direct vacuum to fill
- Neo4j fatigue: cost and AGPL pushing developers away
- AI/RAG explosion: massive tailwind for graph + vector databases
- No existing solution combines: embeddable + Rust + Cypher + vector + MCP + Apache 2.0

---

## References

Research documents (detailed analysis with sources):
- `.research/open-source-graph-dbs.md` — 10 open-source graph DBs analyzed
- `.research/commercial-graph-dbs.md` — 11 commercial/cloud graph DBs analyzed
- `.research/graph-db-ai-integration.md` — AI/MCP/agent integration landscape
- `.research/graph-db-architecture.md` — Storage engines, benchmarks, architecture patterns
- `.research/market-gaps.md` — Developer pain points, market gaps, failed projects
