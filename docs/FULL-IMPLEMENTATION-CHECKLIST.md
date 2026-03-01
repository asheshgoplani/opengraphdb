# OpenGraphDB Full Implementation Checklist

This checklist is the concrete definition of "fully implemented" for this repository.
It is derived from `ARCHITECTURE.md` and `SPEC.md` and should be updated as capabilities land.

If there is a conflict, `ARCHITECTURE.md` wins, then `SPEC.md`, then this file.

Status values:
- `DONE`: implemented with tests and docs
- `IN_PROGRESS`: partially implemented or scaffolded
- `PENDING`: not implemented yet

Capability tiers (from `ARCHITECTURE.md` Section 13):
- **Core**: required for architecture-complete baseline
- **Extended**: integrated capabilities beyond core
- **Production**: hardening for production deployments

---

## 1. Data Model and Property Storage (Core)

- `DONE` node creation with sequential u64 IDs
- `DONE` edge creation with `(src, dst)` pairs
- `DONE` node properties: typed key-value storage (bool, i64, f64, string, bytes)
- `PENDING` temporal property types (date, datetime, duration)
- `DONE` collection property types (list and map)
- `DONE` vector property type (`vector<f32, N>`)
- `DONE` multi-label nodes
- `DONE` typed directed edges (single type per edge)
- `DONE` edge properties: typed key-value storage
- `DONE` schema catalog: label registry, edge type registry, property key registry

## 2. Storage Engine (Core)

- `DONE` page-based file format with validated header and fixed-size page I/O
- `DONE` WAL (`.ogdb-wal`) append protocol
- `DONE` crash recovery and replay with torn-tail tolerance
- `DONE` checkpoints and backup correctness flow
- `DONE` forward + reverse CSR layout (on-disk CSR page layout with startup load/rebuild now implemented)
- `DONE` delta buffer + background compaction (threshold-triggered async background compactor now merges delta into in-memory CSR and flushes per-edge-type CSR layouts to disk)
- `DONE` canonical node property store (single source of truth for node properties; page-backed `-props.ogdb` store with stable row slots and overflow payload pages)
- `DONE` Roaring bitmap label membership index
- `DONE` per-label projections (`_id`, `_row`, `_csr_offset` for fast edge expansion)
- `DONE` double CSR per edge type
- `DONE` buffer pool with LRU/clock-sweep eviction over `pread`/`pwrite`
- `DONE` free list and page allocator
- `DONE` compression: LZ4 for hot/warm data blocks, ZSTD for cold storage (buffer-pool-backed transparent page encode/decode; uncompressed legacy pages remain readable)

## 3. Transactions and Concurrency (Core)

- `DONE` transaction API surface (read/write transactions with undo-backed writes, commit, rollback, and drop-discard behavior)
- `DONE` MVCC version visibility model (`Snapshot::can_see_version(...)`)
- `DONE` single-writer + optimistic multi-writer snapshot concurrency (`SharedDatabase` with `RwLock`-coordinated `read_snapshot`, `with_write`, and `with_write_transaction`)
- `DONE` per-transaction undo ownership
- `DONE` version GC tied to checkpoint and active transaction floor
- `DONE` transaction timeout controls (`SharedDatabase::{read_snapshot_with_timeout,with_write_timeout,with_write_transaction_timeout}`)

## 4. Indexes (Core + Extended)

- `DONE` B-tree property indexes for exact lookups (Core)
- `DONE` composite indexes (Core)
- `PENDING` auto-created indexes on frequently queried properties (Core)
- `DONE` vector index: HNSW-style sidecar index with pure-Rust backend (up to 4096 dimensions; cosine, euclidean, dot product) (Extended)
- `DONE` full-text index: `tantivy` with tokenization, stemming, fuzzy matching, BM25 ranking (Extended)

## 5. Query Engine: Cypher (Core)

- `DONE` `winnow` lexer with token stream
- `DONE` `winnow` parser producing Cypher AST
- `DONE` semantic analysis and catalog resolution
- `DONE` logical plan generation
- `DONE` physical plan generation with cost model
- `DONE` vectorized push-based execution operators (columnar batches through pipeline)
- `DONE` query result materialization and stable output schemas
- `PENDING` worst-case optimal joins (WCOJ) for pattern queries
- `PENDING` factorized intermediate result processing

## 6. Query Engine: Hybrid Operators (Extended)

- `DONE` `VectorScan` as first-class query operator (not a procedure call)
- `DONE` `TextSearch` as first-class query operator
- `DONE` bitmap pre-filter propagation and ID intersection operators
- `DONE` hybrid graph traversal + vector similarity in single query

## 7. CLI (Core)

- `DONE` `init`, `info`
- `DONE` traversal commands (`create-node`, `add-edge`, `neighbors`, `incoming`, `hop`, `hop-in`)
- `DONE` `query`, `shell` (batch/script mode)
- `DONE` `import`, `export` (full property-graph `csv`/`json`/`jsonl`, streaming batches, filtered export)
- `DONE` `backup`, `checkpoint`
- `DONE` `schema`, `stats`, `metrics` (baseline command surface; rich typed schema metadata pending)
- `DONE` `mcp` baseline JSON-RPC adapter (`initialize`, `tools/list`, `tools/call` via `--request` and `--stdio`)
- `DONE` `serve` baseline TCP request loop (`--bind`, `--max-requests`)
- `DONE` stable machine-readable output (`--format table|json|jsonl|csv|tsv`) across all read paths
- `DONE` `clap`-based argument parsing
- `DONE` `rustyline` interactive REPL for `shell` command
- `PENDING` `migrate` command for schema evolution
- `DONE` property-aware CLI commands (create node with labels/properties, typed edges, and property filters)

## 8. Import and Export (Core)

- `DONE` CSV/JSON/JSONL import-export with full property-graph payload support
- `DONE` full property-graph CSV import (nodes with labels + properties, edges with types + properties)
- `DONE` full property-graph JSON/JSONL import
- `DONE` full property-graph export (CSV, JSON, JSONL)
- `DONE` streaming import with batch commits
- `DONE` `--continue-on-error` tolerance mode for imports
- `PENDING` all-or-nothing bulk import mode

## 9. RDF and Ontology Interoperability (Core)

- `DONE` RDF parser integration via `oxrdfio` (TTL, N-Triples, RDF/XML, JSON-LD, N-Quads)
- `DONE` RDF-to-property-graph conversion engine (`rdf:type` to labels, URI objects to edges, literals to properties)
- `DONE` URI preservation (`_uri` property on every imported node/edge)
- `DONE` prefix/namespace storage for export round-tripping
- `DONE` blank node handling (auto-generated IDs with `_blank_id`)
- `DONE` named graph support (via `_graph` property)
- `DONE` OWL/RDFS ontology import (`owl:Class` to labels, `owl:ObjectProperty` to edge types, `owl:DatatypeProperty` to property keys)
- `DONE` `rdfs:subClassOf` label hierarchy (queryable)
- `DONE` `--schema-only` import mode (ontology structure without instance data)
- `DONE` `--base-uri` option for imports
- `DONE` RDF export with full URI and prefix fidelity
- `DONE` SHACL shape validation (Core subset: `sh:targetClass` + `sh:minCount`)

## 10. Server and Protocol Compatibility (Core + Extended)

- `DONE` MCP stdio session and single-request JSON-RPC adapter (Core)
- `DONE` baseline TCP serve loop (Core)
- `DONE` expanded MCP graph tool suite: `schema`, `upsert_node`, `upsert_edge`, `subgraph`, `shortest_path` (Extended)
- `DONE` additional MCP tools: `vector_search`, `text_search`, `temporal_diff`, `import_rdf`, `export_rdf`, `agent_store_episode`, `agent_recall`, `rag_build_summaries`, `rag_retrieve` (Extended)
- `DONE` Bolt protocol (Neo4j wire protocol compatibility, existing drivers work) (Extended)
- `DONE` HTTP/REST server (Extended)

## 11. Language Bindings (Core + Extended)

- `IN_PROGRESS` Rust embedded library API (core graph + property metadata APIs exposed; Cypher query surface still pending)
- `DONE` Python bindings via `PyO3` (`pip install opengraphdb`) (Core)
- `DONE` Node.js/TypeScript bindings via `napi-rs` (`npm install opengraphdb`) (Extended)
- `DONE` Go bindings via CGo (Extended)
- `DONE` C/C++ FFI header (Extended)

## 12. Vector Search (Extended)

- `DONE` HNSW-style vector index with pure-Rust backend
- `DONE` native `vector<f32, N>` attachment on nodes
- `DONE` distance metrics: cosine, euclidean, dot product
- `DONE` up to 4096 dimensions
- `DONE` `.ogdb.vecindex` rebuildable sidecar file
- `DONE` hybrid Cypher queries with vector similarity (`<->` operator)

## 13. Full-Text Search (Extended)

- `DONE` `tantivy` index integration
- `DONE` tokenization, stemming, fuzzy matching, BM25 ranking
- `DONE` indexed properties automatically searchable
- `DONE` `.ogdb.ftindex/` rebuildable sidecar directory
- `DONE` Cypher `CONTAINS TEXT` syntax integration

## 14. Temporal Graphs (Extended)

- `DONE` bi-temporal model (valid time + transaction time)
- `DONE` `valid_from` / `valid_to` metadata on edges
- `DONE` time-travel queries (`AT TIME` syntax)
- `DONE` append-only node temporal versioning with compaction (`TemporalNodeVersion` chain + persisted metadata + background compactor integration)

## 15. Graph Algorithms (Extended)

- `DONE` shortest path
- `DONE` community detection: Louvain
- `DONE` community detection: Label Propagation
- `DONE` subgraph extraction (neighborhood around a node)
- `DONE` entity extraction helpers (merge-on-match patterns)

## 16. AI and Agent Integration (Extended)

- `DONE` agent memory patterns: episodic storage with embeddings, timestamps, agent/session IDs
- `DONE` GraphRAG primitives: hierarchical graph summarization, hybrid retrieval
- `DONE` full MCP tool surface for AI agent workflows (see Section 10)

## 17. Observability and Quality Gates (Core)

- `DONE` strict test + coverage gates for active crates (>=98% lines with <=600 uncovered lines on ogdb-core + ogdb-cli)
- `DONE` metrics API (`db.metrics()`)
- `DONE` profiled query API (`db.query_profiled(...)`)
- `DONE` `tracing` instrumentation across parser/planner/executor/storage/WAL (feature-gated `tracing` spans with `query > plan > execute > storage_op` hierarchy)
- `DONE` OTel-convention metric naming (`ogdb.query.duration`, `ogdb.buffer_pool.hit_ratio`, etc.)
- `DONE` crash/durability acceptance suite (simulated process crash during WAL append, atomicity recovery checks, checkpoint+crash cycle, post-crash backup consistency)
- `DONE` openCypher TCK compatibility gate (new cucumber-based harness with Tier-1 category tracking, pass/fail/skip reporting, and floor checks)
- `DONE` traversal latency gates (custom benchmark harness in `ogdb-bench` with p95 single-hop and 3-hop gate assertions)
- `DONE` import throughput gate (> 500K edges/sec CSV gate assertion in dedicated benchmark test)
- `PENDING` memory and disk size budget validation (1M nodes + 5M edges < 500MB RAM, < 1GB disk)

## 18. Production Hardening (Production)

- `DONE` multi-writer server mode
- `DONE` replication
- `DONE` online backup API (page-by-page for large databases)
- `DONE` `--compact` backup mode (VACUUM INTO equivalent)
- `DONE` Prometheus metrics endpoint (server mode)
- `DONE` RBAC, audit logs, SSO
- `DONE` gRPC server
- `DONE` WASM builds (browser and edge deployment)
- `DONE` full GQL (ISO 39075) conformance

---

## 19. Execution Order (No Time Buckets)

Ordered by dependency. Lower items depend on higher items being done first.

### Phase 1: Core Data Model

1. Implement node properties: typed key-value storage with on-disk format
2. Implement multi-label nodes with Roaring bitmap label index (DONE)
3. Implement typed directed edges with edge type registry
4. Implement edge properties
5. Implement schema catalog (label, edge type, property key registries)

### Phase 2: Core Storage Evolution

6. Implement buffer pool with LRU/clock-sweep over `pread`/`pwrite` (DONE)
7. Implement free list and page allocator (DONE)
8. Complete on-disk CSR compaction layout per edge type (DONE)
9. Implement async background delta compactor (DONE)
10. Implement canonical node property store with per-label projections (DONE)

### Phase 3: Transactions

11. Implement MVCC version visibility (`Snapshot::can_see_version(...)`) (DONE)
12. Implement single-writer mutex + multi-reader snapshots (DONE)
13. Implement per-transaction undo ownership (DONE)
14. Implement version GC tied to checkpoint (DONE)

### Phase 4: Query Engine

15. Implement `winnow` Cypher lexer and token stream (DONE)
16. Implement `winnow` Cypher parser producing AST (DONE)
17. Implement semantic analysis and catalog resolution (DONE)
18. Implement logical plan generation (DONE)
19. Implement physical plan generation with cost model (DONE)
20. Implement vectorized push-based execution operators (DONE)
21. Implement query result materialization (DONE)
22. Wire Cypher execution through CLI `query`/`shell` paths (replacing command-style grammar) (DONE)

### Phase 5: CLI Tooling

23. Migrate CLI argument parsing to `clap` (DONE)
24. Implement `rustyline` interactive REPL for `shell` (DONE)
25. Add property-aware CLI commands (create node with labels/properties, filters) (DONE)

### Phase 6: Indexes

26. Implement B-tree property indexes (DONE)
27. Implement composite indexes (DONE)

### Phase 7: Import/Export Completion

28. Extend CSV/JSON/JSONL import to full property-graph payloads (labels, properties, edge types) (DONE)
29. Extend export to full property-graph payloads (DONE)
30. Implement streaming import with batch commits and `--continue-on-error` (DONE)

### Phase 8: RDF and Ontology

31. Integrate `oxrdfio` RDF parser (TTL, N-Triples, RDF/XML, JSON-LD, N-Quads) (DONE)
32. Implement RDF-to-property-graph conversion engine with URI preservation (DONE)
33. Implement OWL/RDFS ontology import (classes to labels, properties to types) (DONE)
34. Implement RDF export with URI and prefix round-trip fidelity (DONE)

### Phase 9: Conformance and Quality

35. Implement openCypher TCK harness via `cucumber` (DONE)
36. Achieve Tier-1 TCK category coverage (50-55% floor) (DONE)
37. Implement crash/durability acceptance suite (DONE)
38. Implement traversal latency and import throughput benchmark gates (DONE)
39. Add `tracing` instrumentation across all subsystems (DONE)
40. Implement LZ4/ZSTD compression for data blocks (DONE)

### Phase 10: Server Protocols

41. Implement Bolt protocol (Neo4j wire protocol compatibility) (DONE)
42. Implement HTTP/REST server (DONE)
43. Expand MCP tool suite (schema, upsert_node, upsert_edge, subgraph, shortest_path) (DONE)

### Phase 11: Vector and Full-Text Search

44. Integrate `usearch` HNSW vector index with `.ogdb.vecindex` sidecar (DONE)
45. Implement native `vector<f32, N>` property type and `<->` similarity operator (DONE)
46. Implement `VectorScan` as first-class query operator (DONE)
47. Integrate `tantivy` full-text index with `.ogdb.ftindex/` sidecar (DONE)
48. Implement `TextSearch` as first-class query operator (DONE)
49. Implement bitmap pre-filter propagation and hybrid retrieval (DONE)

### Phase 12: Temporal and Algorithms

50. Implement bi-temporal graph model (valid time + transaction time) (DONE)
51. Implement time-travel queries (`AT TIME`) (DONE)
52. Implement shortest path algorithm (DONE)
53. Implement community detection (Louvain, Label Propagation) (DONE)
54. Implement subgraph extraction and merge-on-match helpers (DONE)

### Phase 13: Language Bindings

55. Implement Python bindings via `PyO3` (DONE)
56. Implement Node.js/TypeScript bindings via `napi-rs` (DONE)
57. Implement Go bindings via CGo (DONE)
58. Implement C/C++ FFI header (DONE)

### Phase 14: AI Agent Features

59. Implement agent memory patterns (episodic storage with embeddings) (DONE)
60. Implement GraphRAG primitives (community summaries, hybrid retrieval) (DONE)
61. Complete full MCP tool surface (vector_search, text_search, temporal_diff, import_rdf, export_rdf) (DONE)

### Phase 15: Production Hardening

62. Implement multi-writer server mode (DONE)
63. Implement replication (DONE)
64. Implement online backup API (DONE)
65. Implement Prometheus metrics endpoint (DONE)
66. Implement RBAC, audit logs, SSO (DONE)
67. Implement gRPC server (DONE)
68. Implement WASM builds (DONE)
69. Full GQL (ISO 39075) conformance (DONE)
