# OpenGraphDB

## What This Is

OpenGraphDB is an embeddable, AI-native graph database written in Rust. It combines property graph storage with native vector search, full-text search, and first-class AI agent support (MCP) in a single binary. It targets the vacuum left by KuzuDB's abandonment while going further with Cypher/openCypher query language, multi-modal storage, and modern developer experience.

## Core Value

Extremely fast interactive graph traversal from CLI and embedded API with zero operational overhead: single binary, embeddable by default, AI-agent-ready out of the box.

## Requirements

### Validated

- ✓ Page-based storage engine with WAL, crash recovery, checkpoints, backups — existing
- ✓ Double CSR (forward + reverse) per edge type with async background compaction — existing
- ✓ Canonical node property store with Roaring bitmap label index — existing
- ✓ Buffer pool with LRU eviction over pread/pwrite — existing
- ✓ Free list and page allocator — existing
- ✓ LZ4/ZSTD transparent page compression — existing
- ✓ MVCC snapshot isolation with single-writer + optimistic multi-writer — existing
- ✓ Per-transaction undo ownership and version GC — existing
- ✓ Transaction timeout controls — existing
- ✓ Winnow-based Cypher lexer/parser/AST — existing
- ✓ Semantic analysis, logical/physical plan generation — existing
- ✓ Vectorized push-based query execution — existing
- ✓ B-tree property indexes and composite indexes — existing
- ✓ HNSW vector index with pure-Rust backend (cosine, euclidean, dot product) — existing
- ✓ Tantivy full-text index with BM25 ranking — existing
- ✓ Hybrid retrieval with bitmap pre-filter propagation — existing
- ✓ CSV/JSON/JSONL import/export with full property-graph support — existing
- ✓ RDF import/export via oxrdfio with URI round-trip fidelity — existing
- ✓ OWL/RDFS ontology import — existing
- ✓ CLI with clap parsing, rustyline REPL, machine-readable output formats — existing
- ✓ MCP server with full AI tool surface — existing
- ✓ Bolt protocol, HTTP/REST, gRPC server modes — existing
- ✓ Python bindings (PyO3), Node.js (napi-rs), Go (CGo), C/C++ FFI — existing
- ✓ Bi-temporal graph model with AT TIME queries — existing
- ✓ Graph algorithms (shortest path, Louvain, label propagation, subgraph extraction) — existing
- ✓ Agent memory patterns and GraphRAG primitives — existing
- ✓ RBAC, audit logs, SSO token validation — existing
- ✓ Replication and online backup — existing
- ✓ WASM builds — existing
- ✓ openCypher TCK harness with Tier-1 coverage — existing
- ✓ Crash/durability acceptance suite — existing
- ✓ Traversal latency and import throughput benchmark gates — existing
- ✓ tracing instrumentation with OTel-convention naming — existing
- ✓ Prometheus metrics endpoint — existing

### Active

- [ ] Temporal property types (date, datetime, duration) for property values
- [ ] Collection property types (list<T>, map<string, T>) for property values
- [ ] Auto-created indexes on frequently queried properties
- [ ] Worst-case optimal joins (WCOJ) for pattern queries
- [ ] Factorized intermediate result processing
- [ ] Schema migration command (`migrate`)
- [ ] All-or-nothing bulk import mode
- [ ] SHACL shape validation (optional extension)
- [ ] Append-only temporal versioning with compaction
- [ ] Memory and disk size budget validation (1M nodes + 5M edges < 500MB RAM, < 1GB disk)
- [ ] Rust embedded library Cypher query surface completion
- [ ] Recent CHANGELOG bugfixes (inline property filters, projection disambiguation, CREATE INDEX, ORDER BY numeric sort, REMOVE, CALL procedure routing)

### Out of Scope

- SPARQL query engine — One query language (Cypher) done well beats two done poorly. RDF import/export handles interop.
- Real-time streaming/CDC — Adds significant complexity; replication covers multi-node needs.
- Distributed sharding — Embedded-first architecture; not a distributed database.

## Context

This is a Rust workspace with 9 active crates totaling ~50K lines of code. Phases 1-15 of the implementation checklist (docs/FULL-IMPLEMENTATION-CHECKLIST.md) are essentially complete with production-quality test coverage (>=98% lines on core crates). The CHANGELOG shows recent unreleased bugfixes that need to be included in the gap-closing work.

Key files:
- `ARCHITECTURE.md` — Canonical architecture decisions (wins all conflicts)
- `DESIGN.md` — Byte-level engineering design (40 sections)
- `SPEC.md` — Product specification
- `IMPLEMENTATION-READY.md` — Execution baseline checklist
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` — Granular status tracking
- `CHANGELOG.md` — All changes with unreleased section

The codebase builds and all tests pass. Coverage gates are enforced in CI.

## Constraints

- **Architecture**: All decisions locked in ARCHITECTURE.md unless benchmark evidence proves otherwise
- **I/O model**: pread/pwrite only in core execution path (no mmap)
- **File model**: .ogdb + .ogdb-wal are authoritative; vector/FTS artifacts are rebuildable
- **Quality**: Production quality bar: each feature fully tested, documented, benchmarked (>=98% line coverage on active crates)
- **Compatibility**: Must not regress existing Cypher, CLI, or API contracts
- **Dependencies**: Locked choices (winnow, oxrdfio, tantivy, usearch, tracing, clap, rustyline)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cypher-first, no SPARQL | One query language done well; AI agents generate Cypher better | ✓ Good |
| CSR + delta storage | Benchmark-gated; current workloads don't cross hybrid thresholds | ✓ Good |
| pread/pwrite only | Predictable I/O behavior; robust recovery semantics | ✓ Good |
| Pure-Rust vector backend | Platform portability over usearch C++ dependency | — Pending |
| All PENDING items in scope | Close every gap from the implementation checklist | — Pending |

---
*Last updated: 2026-02-27 after initialization*
