# OpenGraphDB: Project Context Analysis

**Analyzed:** 2026-02-22
**Sources:** ARCHITECTURE.md, DESIGN.md (first 200 lines), SPEC.md, IMPLEMENTATION-READY.md, README.md, AGENTS.md

---

## 1. What Is OpenGraphDB?

OpenGraphDB is described as "the SQLite of graph databases": a single-binary, embeddable, high-performance graph database written in Rust. The core pitch is that it fills the vacuum left by KuzuDB's abandonment (October 2025) while going further with AI-native design, MCP integration, and a modern developer experience.

**One-line identity:** An embeddable, Cypher-first property graph database with native vector search, full-text search, and built-in MCP server. Apache 2.0 licensed.

**Positioning:** No existing solution combines embeddable + Rust + Cypher + vector + MCP + Apache 2.0. That combination is the market gap this project targets.

**Current project status:** Pre-release. Architecture baseline is finalized and locked. Implementation is described as underway, with the README claiming a substantial set of features are already implemented and test-covered.

---

## 2. Core Features

### Data Model
- Property graph: multi-label nodes, typed directed edges, typed properties
- Property types: `bool`, `i64`, `f64`, `string`, `bytes`, `date`, `datetime`, `duration`, `list<T>`, `map<string,T>`, `vector<f32,N>`
- Indexes: B-tree (property), HNSW (vector), Tantivy (full-text), Roaring bitmaps (label membership)

### Query Language
- Primary: Cypher / openCypher
- GQL (ISO 39075) compatibility as an incremental evolution path
- SPARQL is intentionally NOT supported (import/export bridge instead)
- Cypher extensions for vector distance (`<->` operator), full-text (`CONTAINS TEXT`), temporal (`AT TIME`)

### Storage Engine
- Columnar CSR (Compressed Sparse Row) for nodes and edges
- Double CSR: forward + reverse adjacency lists per edge type
- Delta buffers for writes; background compaction merges into CSR
- Explicit `pread`/`pwrite` I/O (no mmap in core path)
- Authoritative files: `mydb.ogdb` + `mydb.ogdb-wal`
- Derived/rebuildable: `mydb.ogdb.vecindex`, `mydb.ogdb.ftindex/`
- Page compression: LZ4 (hot), ZSTD (cold)

### Transactions
- MVCC with snapshot isolation
- Single-writer mutex in embedded mode
- ARIES-style crash recovery via WAL
- Version GC tied to checkpoint

### AI Integration (First-Class)
- Built-in MCP server (stdio): `query`, `schema`, `upsert_node`, `upsert_edge`, `vector_search`, `text_search`, `subgraph`, `shortest_path`, `temporal_diff`, `import_rdf`, `export_rdf`
- Native support for agent memory patterns (episodic, semantic retrieval)
- GraphRAG primitives: community detection (Louvain, Label Propagation), entity extraction helpers, hybrid vector+graph retrieval

### RDF / Ontology Interoperability
- Import: TTL, N-Triples, RDF/XML, JSON-LD, N-Quads (via `oxrdfio`/Oxigraph)
- Export: same formats
- Automatic conversion: `rdf:type` → label, URI object → edge, literal → property, `owl:Class` → label, `owl:ObjectProperty` → rel type
- URI preservation via `_uri` property for round-trip fidelity
- `rdfs:subClassOf` hierarchy import

### Deployment Modes
| Mode | How |
|------|-----|
| Embedded library | `cargo add opengraphdb` or Python/JS bindings |
| CLI tool | `opengraphdb query "MATCH..."` |
| Standalone server | Bolt protocol, HTTP/REST, gRPC |
| MCP server | `opengraphdb mcp --db mydata.ogdb` |

### Language Bindings
- P0: Rust (native), Python (PyO3), JavaScript/TypeScript (napi-rs)
- P1: Go (CGo), C/C++ (FFI)
- P2: Java/JVM (JNI), WASM (wasm-bindgen)

---

## 3. Architecture Overview

### Crate Structure
```
ogdb-core        ← storage (CSR, WAL, MVCC, buffer pool), indexes, catalog, type system
ogdb-query       ← Cypher lexer/parser (winnow), planner, optimizer, executor
ogdb-import      ← CSV/JSON/RDF import pipelines
ogdb-export      ← JSON/CSV/RDF/Cypher export
ogdb-vector      ← HNSW vector index (usearch primary, pure-Rust fallback)
ogdb-text        ← full-text index (Tantivy)
ogdb-temporal    ← bi-temporal graph features
ogdb-algorithms  ← graph algorithms (Louvain, etc.)
ogdb-server      ← Bolt/HTTP/MCP server adapters
ogdb-cli         ← CLI binary over all runtime crates
ogdb-python      ← PyO3 bindings
ogdb-node        ← napi-rs bindings
```
Lower layers must not depend on upper layers (strict crate dependency direction).

### Key Architecture Decisions (Locked)
| Decision | Choice |
|----------|--------|
| Storage model | Canonical node store + label bitmaps + projections, double CSR + delta buffers |
| I/O path | `pread`/`pwrite` only |
| File authority | `.ogdb` + `.ogdb-wal` authoritative; vector/FTS artifacts rebuildable |
| Parser | `winnow` lexer + parser |
| Concurrency | MVCC snapshot isolation + single-writer embedded mode |
| RDF bridge | `oxrdfio`/Oxigraph with URI-preserving round-trip |
| Observability | Pull metrics + profiled query API + tracing spans (OTel convention) |
| Backup | Checkpoint + copy semantics |
| Compliance floor | openCypher TCK ≥50-55% with all Tier-1 categories covered |

### Storage Write/Read Tradeoff Policy
- Default: CSR + delta
- Keep CSR + delta while: write share ≤10%, compaction stall p95 ≤50ms, traversal p95 regression ≤20% under mixed load
- Pivot to hybrid hot-write + compacted-CSR only when benchmark evidence shows: write share >30%, stall p95 >200ms, or traversal regression >30%
- Architecture evolves via benchmark evidence only, not schedule pressure

### Query Engine Stack
```
Cypher string
  → winnow lexer (token stream)
  → winnow parser (AST)
  → semantic resolver (catalog)
  → logical planner
  → cost-based optimizer (with WCOJ for pattern queries)
  → physical plan (vectorized push-based execution)
  → operators: scan, expand, filter, project, aggregate, sort, limit, create, delete, merge, set, unwind, call
```

### Observability Stack
- `db.metrics()` — pull-based, zero-overhead
- `db.query_profiled(...)` — opt-in per-query profiling
- `tracing` crate instrumented throughout; OTel integration via `tracing-opentelemetry`
- Metric naming follows OTel conventions (`ogdb.query.duration`, etc.)
- Prometheus endpoint in server mode

---

## 4. Full Build Plan (Capability Tiers)

The project uses capability tiers, not date-based phases. Implementation is architecture-stable only when all correctness and performance gates pass.

### Tier 1: Core Required Capabilities
These must be present before any release claim is valid.

**Storage and Durability:**
- Page-based file layout with stable headers and page types
- Free list and allocator
- WAL write protocol and ARIES-style recovery
- Checkpoint implementation
- Forward + reverse CSR traversal path
- Delta compaction path

**Query and Execution:**
- Cypher parsing to AST (winnow)
- Semantic resolution against catalog
- Logical and physical plan generation
- Vectorized execution operators for core traversal/query set
- Deterministic CLI result rendering

**Data Interop:**
- CSV/JSON import/export
- RDF import/export with URI fidelity (`oxrdfio` pipeline)
- Ontology extraction bridge (classes/properties/hierarchy metadata)

**Operability:**
- `db.metrics()` and `db.query_profiled()`
- CLI: `init`, `query`, `shell`, `import`, `export`, `backup`, `checkpoint`, `schema`, `info`, `stats`
- Crash test harness and recovery assertions
- Python bindings (PyO3)

**AI Access:**
- Stable `json`/`jsonl` query output
- MCP server adapter

### Tier 2: Extended Integrated Capabilities
- Vector search (HNSW via usearch)
- Full-text search (Tantivy)
- Hybrid queries with first-class `VectorScan` and `TextSearch` operators
- Bitmap pre-filter propagation and ID intersection operators
- MCP server (full tool suite)
- JavaScript/TypeScript bindings (napi-rs)
- Bolt protocol compatibility
- GQL keyword aliases and incremental compatibility
- File-level import tracking
- Compact backup mode

### Tier 3: Production Hardening Capabilities
- Multi-writer server mode
- Replication
- Online backup API (page-by-page)
- Prometheus metrics endpoint (server mode)
- Full GQL conformance
- WASM builds
- Governance and cloud-service operationalization

### Remaining Architecture Backlog (Per README)
- Auto-indexing heuristics
- WCOJ / factorized query execution
- CLI `migrate` command
- SHACL validation
- Temporal append-only compaction
- Explicit memory/disk budget validation gates

---

## 5. Quality Gates (Mandatory, All Must Pass)

### Correctness Gates
- Crash-recovery preserves atomicity and durability after forced write transaction crash
- Backup copy restores to query-equivalent state
- RDF round-trip preserves `_uri` and prefix mapping semantics
- openCypher TCK ≥50-55% floor with full Tier-1 category coverage (match, create, return, where, set, delete, with, aggregation, literals, comparison, boolean, null)

### Performance Gates
- Single-hop traversal p95 under target (<1ms per SPEC)
- 3-hop neighborhood expansion p95 under target (<10ms on 1M nodes per SPEC)
- Bulk import throughput meets target envelope (>500K edges/sec per SPEC)
- CLI one-shot query path remains low-overhead under repeated invocation
- Benchmark profiles: read-dominant (95/5), mixed (80/20), write-stress (70/30)

### Coverage Gate
- `ogdb-core` + `ogdb-cli`: ≥98% line coverage, ≤600 uncovered lines

### Stability Gates
- No design contradictions between ARCHITECTURE.md, SPEC.md, DESIGN.md, and CLAUDE.md
- No dependency or crate architecture cycles

---

## 6. Current Claimed Status (As of README, 2026-02-22)

**Official status:** "Pre-release — designing and building the foundation"

**Claimed as implemented and test-covered:**
- WAL logging + recovery
- `checkpoint`, `backup` (online + compact modes)
- Machine-readable `--format` output (table, json, jsonl, csv, tsv)
- Full property-graph `import`/`export` (csv, json, jsonl) with batch commits, `--continue-on-error`, export filters
- `schema`, `stats`, `metrics`
- Reverse traversal (`incoming`, `hop-in`)
- Property-aware node/edge writes with typed scalar properties
- Roaring-bitmap label membership indexing
- Property-filter and label-filter query forms
- Read/write transaction APIs, optimistic multi-writer + snapshot coordination (`SharedDatabase`)
- Observability APIs (`db.metrics()`, `db.query_profiled()`)
- MCP JSON-RPC adapter (--request and --stdio)
- Bolt/HTTP/gRPC server modes
- Prometheus metrics endpoint
- RBAC + audit logging + token auth integration
- WAL-based replication APIs
- WASM-oriented builds
- Expanded GQL compatibility (OPTIONAL MATCH, UNION, EXISTS, pattern comprehension, CASE semantics)
- RDF import/export (ttl, nt, xml, jsonld, nq) via `import-rdf`/`export-rdf`
- Ontology mapping (owl:Class, owl:ObjectProperty, owl:DatatypeProperty)
- `rdfs:subClassOf` hierarchy import, URI/prefix round-tripping, blank-node and named-graph handling
- cucumber-backed openCypher TCK harness (`ogdb-tck`)
- Crash/durability acceptance suite
- Benchmark gate harnesses in `ogdb-bench`
- Optional `tracing` instrumentation
- LZ4/ZSTD page compression

**Remaining (per README):**
- Auto-indexing heuristics
- WCOJ / factorized query execution
- CLI `migrate`
- SHACL validation
- Temporal append-only compaction
- Explicit memory/disk budget validation gates

---

## 7. Workflow and Process Contract (AGENTS.md)

Every completed change requires ALL five steps:
1. Write tests first (TDD mandatory)
2. Implement smallest change that makes tests pass
3. Run `./scripts/test.sh` + `./scripts/coverage.sh`
4. Update docs (behavior/architecture + `docs/IMPLEMENTATION-LOG.md`)
5. Update `CHANGELOG.md` under `## [Unreleased]`

**Versioning:** Centralized in `Cargo.toml` `[workspace.package].version`

**Validation scripts:**
- `./scripts/test.sh` — full test suite
- `./scripts/coverage.sh` — coverage gate enforcement
- `./scripts/changelog-check.sh` — changelog structure
- `./scripts/workflow-check.sh` — implementation log vs changelog consistency

---

## 8. Key Dependencies

| Crate | Purpose |
|-------|---------|
| `winnow` | Cypher lexer + parser |
| `tokio` | async runtime |
| `serde`/`serde_json` | serialization |
| `oxrdfio` + Oxigraph family | RDF parsing/conversion |
| `tantivy` | full-text index |
| `usearch` | ANN vector index (HNSW) |
| `roaring` | label membership bitmaps |
| `tracing` + `tracing-subscriber` | logging + tracing |
| `clap` | CLI parsing |
| `rustyline` | REPL |
| `criterion` | benchmarks |
| `cucumber` | TCK execution |
| `pyo3` | Python bindings |
| `napi-rs` | Node bindings |
| `lz4` / `zstd` | page compression |

---

## 9. Notable Design Choices and Tensions

1. **README vs ARCHITECTURE.md status tension:** README says "Pre-release" but lists an enormous set of features as "Implemented and covered by tests." This may reflect aspirational documentation written ahead of implementation, or genuine implementation progress. Verification against actual crate source code is needed.

2. **Cypher-only, no SPARQL:** A deliberate, well-argued decision. AI agents generate Cypher better; SPARQL doubles parser complexity for <5% of users; RDF import/export preserves round-trip fidelity.

3. **No mmap in core path:** Explicit `pread`/`pwrite` is a non-negotiable constraint. Provides predictable paging behavior and avoids OS-level memory management surprises during crash recovery.

4. **Architecture evolution is benchmark-gated:** The CSR + delta vs. hybrid decision is governed by concrete numeric thresholds, not opinion. This is an unusually disciplined approach for a pre-v1 project.

5. **Single writer in embedded mode:** Simplifies MVCC significantly; multi-writer is a Tier 3 concern only needed for the production server mode.
