# OpenGraphDB — Engineering Design Document

> Every detail a database kernel engineer needs to implement this, from byte layout to crash recovery.

**Version:** 0.1 (Draft)
**Date:** 2026-02-05
**Companion:** See `SPEC.md` for product-level specification
**Canonical architecture source:** `ARCHITECTURE.md` (if conflicts exist, `ARCHITECTURE.md` wins)
**Planning note:** Legacy stage labels in this file are historical capability groupings, not schedule commitments.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [File Format & On-Disk Layout](#2-file-format--on-disk-layout)
3. [Node & Edge Storage](#3-node--edge-storage)
4. [ID Generation & Addressing](#4-id-generation--addressing)
5. [Transaction Model & Concurrency](#5-transaction-model--concurrency)
6. [Write-Ahead Log (WAL)](#6-write-ahead-log-wal)
7. [Crash Recovery](#7-crash-recovery)
8. [Buffer Pool & Memory Management](#8-buffer-pool--memory-management)
9. [Index Structures](#9-index-structures)
10. [Cypher Parser & AST](#10-cypher-parser--ast)
11. [Query Planner & Optimizer](#11-query-planner--optimizer)
12. [Query Execution Engine](#12-query-execution-engine)
13. [Schema & Catalog](#13-schema--catalog)
14. [Type System & Serialization](#14-type-system--serialization)
15. [Locking & Isolation Levels](#15-locking--isolation-levels)
16. [Compaction & Garbage Collection](#16-compaction--garbage-collection)
17. [Vector Index Internals](#17-vector-index-internals)
18. [Full-Text Index Internals](#18-full-text-index-internals)
19. [Temporal Storage Internals](#19-temporal-storage-internals)
20. [RDF Import Pipeline](#20-rdf-import-pipeline)
21. [CSV/JSON Import Pipeline](#21-csvjson-import-pipeline)
22. [Export Pipeline](#22-export-pipeline)
23. [CLI Architecture](#23-cli-architecture)
24. [Embedded Library API](#24-embedded-library-api)
25. [Server Mode & Bolt Protocol](#25-server-mode--bolt-protocol)
26. [MCP Server Architecture](#26-mcp-server-architecture)
27. [Python Bindings (PyO3)](#27-python-bindings-pyo3)
28. [JavaScript Bindings (NAPI-RS)](#28-javascript-bindings-napi-rs)
29. [Error Handling Strategy](#29-error-handling-strategy)
30. [Testing Strategy](#30-testing-strategy)
31. [Benchmarking Framework](#31-benchmarking-framework)
32. [CI/CD Pipeline](#32-cicd-pipeline)
33. [Logging & Observability](#33-logging--observability)
34. [Configuration System](#34-configuration-system)
35. [Security Model](#35-security-model)
36. [Crate Dependency Decisions](#36-crate-dependency-decisions)
37. [Build System & Cross-Compilation](#37-build-system--cross-compilation)
38. [Migration & Upgrade Path](#38-migration--upgrade-path)
39. [Graph Algorithms Library](#39-graph-algorithms-library)
40. [Limits & Constraints](#40-limits--constraints)

---

## 1. Project Structure

```
opengraphdb/
├── Cargo.toml                    # Workspace root
├── LICENSE                       # Apache 2.0
├── SPEC.md                       # Product specification
├── DESIGN.md                     # This file
│
├── crates/
│   ├── ogdb-core/                # Storage engine, transactions, buffer pool
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── storage/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── file_format.rs    # Single-file layout, page management
│   │   │   │   ├── page.rs           # Page types (node, edge, overflow, free)
│   │   │   │   ├── node_store.rs     # Columnar node storage + CSR
│   │   │   │   ├── edge_store.rs     # CSR adjacency lists
│   │   │   │   ├── property_store.rs # Variable-length property storage
│   │   │   │   ├── string_store.rs   # String/bytes heap
│   │   │   │   └── free_list.rs      # Free page tracking
│   │   │   ├── buffer/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── pool.rs           # Buffer pool with clock-sweep eviction
│   │   │   │   └── frame.rs          # Page frames with pin counting
│   │   │   ├── wal/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── log.rs            # WAL file format & writes
│   │   │   │   ├── record.rs         # Log record types
│   │   │   │   └── recovery.rs       # Crash recovery (ARIES-style)
│   │   │   ├── tx/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── transaction.rs    # Transaction lifecycle
│   │   │   │   ├── mvcc.rs           # Multi-version concurrency control
│   │   │   │   └── lock_manager.rs   # Lock table
│   │   │   ├── index/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── btree.rs          # B+ tree for property indexes
│   │   │   │   ├── hash.rs           # Hash index for exact lookups
│   │   │   │   └── composite.rs      # Multi-property composite indexes
│   │   │   ├── catalog/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── schema.rs         # Label, type, property definitions
│   │   │   │   └── stats.rs          # Cardinality estimates for optimizer
│   │   │   └── types/
│   │   │       ├── mod.rs
│   │   │       ├── value.rs          # Runtime value representation
│   │   │       ├── datum.rs          # On-disk serialized format
│   │   │       └── cast.rs           # Type coercion rules
│   │   └── Cargo.toml
│   │
│   ├── ogdb-query/               # Parser, planner, executor
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── parser/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── lexer.rs          # Tokenizer (winnow combinators on raw input)
│   │   │   │   ├── token.rs          # Token enum (Keyword, Ident, Literal, Punct, etc.)
│   │   │   │   ├── parser.rs         # Parser (winnow combinators on token stream)
│   │   │   │   └── ast.rs            # Abstract syntax tree types
│   │   │   ├── planner/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── logical.rs        # Logical plan (pattern → algebra)
│   │   │   │   ├── optimizer.rs      # Cost-based optimization
│   │   │   │   ├── physical.rs       # Physical plan (operators)
│   │   │   │   ├── cost_model.rs     # Cardinality estimation, cost functions
│   │   │   │   └── rules/
│   │   │   │       ├── filter_push_down.rs
│   │   │   │       ├── join_reorder.rs
│   │   │   │       └── index_selection.rs
│   │   │   ├── executor/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── engine.rs         # Vectorized execution engine
│   │   │   │   ├── operators/
│   │   │   │   │   ├── scan.rs       # Node/edge label scans
│   │   │   │   │   ├── expand.rs     # Relationship traversal
│   │   │   │   │   ├── filter.rs     # Property predicates
│   │   │   │   │   ├── project.rs    # Column projection
│   │   │   │   │   ├── aggregate.rs  # GROUP BY, count, sum, etc.
│   │   │   │   │   ├── sort.rs       # ORDER BY
│   │   │   │   │   ├── limit.rs      # LIMIT, SKIP
│   │   │   │   │   ├── create.rs     # CREATE nodes/edges
│   │   │   │   │   ├── delete.rs     # DELETE/DETACH DELETE
│   │   │   │   │   ├── merge.rs      # MERGE (upsert)
│   │   │   │   │   ├── set.rs        # SET properties
│   │   │   │   │   ├── unwind.rs     # UNWIND lists
│   │   │   │   │   └── call.rs       # CALL procedures
│   │   │   │   └── batch.rs          # Columnar batch (Arrow-compatible)
│   │   │   └── functions/
│   │   │       ├── mod.rs
│   │   │       ├── scalar.rs         # String, math, type functions
│   │   │       ├── aggregate.rs      # count, sum, avg, collect
│   │   │       ├── list.rs           # List functions
│   │   │       ├── path.rs           # shortestPath, allShortestPaths
│   │   │       └── graph.rs          # degree, labels, type, properties
│   │   └── Cargo.toml
│   │
│   ├── ogdb-vector/              # HNSW vector index
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── hnsw.rs              # HNSW graph construction & search
│   │   │   ├── distance.rs          # Cosine, Euclidean, Dot Product (SIMD)
│   │   │   ├── quantization.rs      # Product quantization for memory savings
│   │   │   └── storage.rs           # On-disk HNSW persistence
│   │   └── Cargo.toml
│   │
│   ├── ogdb-text/                # Full-text search (Tantivy wrapper)
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── indexer.rs           # Index creation and updates
│   │   │   ├── searcher.rs          # BM25 search, fuzzy matching
│   │   │   └── analyzer.rs          # Tokenizers, stemmers, filters
│   │   └── Cargo.toml
│   │
│   ├── ogdb-temporal/            # Temporal graph layer
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── bitemporal.rs        # Valid time + transaction time
│   │   │   ├── versioning.rs        # Append-only version chains
│   │   │   └── compaction.rs        # Old version cleanup
│   │   └── Cargo.toml
│   │
│   ├── ogdb-import/              # Import pipelines (CSV, JSON, RDF)
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── csv.rs               # CSV import with header mapping
│   │   │   ├── json.rs              # JSON/JSONL import
│   │   │   ├── rdf/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── parser.rs        # RDF parsing (oxrdfio/Oxigraph crates)
│   │   │   │   ├── converter.rs     # Triple → property graph conversion
│   │   │   │   ├── ontology.rs      # OWL/RDFS schema extraction
│   │   │   │   └── uri.rs           # URI handling, prefix management
│   │   │   └── batch_writer.rs      # Bulk write with sorted merge
│   │   └── Cargo.toml
│   │
│   ├── ogdb-export/              # Export pipelines
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── csv.rs
│   │   │   ├── json.rs
│   │   │   ├── rdf.rs               # Property graph → RDF/TTL/JSON-LD
│   │   │   └── cypher.rs            # Export as Cypher CREATE statements
│   │   └── Cargo.toml
│   │
│   ├── ogdb-server/              # Bolt protocol server, HTTP, MCP
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── bolt/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── protocol.rs      # Bolt v1 message parsing (v4/v5 negotiation is a v0.5 follow-up)
│   │   │   │   ├── codec.rs         # PackStream encoding/decoding
│   │   │   │   └── session.rs       # Connection session state
│   │   │   ├── http/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── routes.rs        # REST API endpoints
│   │   │   │   └── middleware.rs    # Auth, rate limiting
│   │   │   └── mcp/
│   │   │       ├── mod.rs
│   │   │       ├── server.rs        # MCP stdio server
│   │   │       ├── tools.rs         # Tool definitions
│   │   │       └── resources.rs     # MCP resources (schema, stats)
│   │   └── Cargo.toml
│   │
│   ├── ogdb-cli/                 # CLI binary
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── commands/
│   │   │   │   ├── init.rs
│   │   │   │   ├── query.rs
│   │   │   │   ├── shell.rs         # Interactive REPL (rustyline)
│   │   │   │   ├── import.rs
│   │   │   │   ├── export.rs
│   │   │   │   ├── serve.rs
│   │   │   │   ├── mcp.rs
│   │   │   │   ├── info.rs
│   │   │   │   └── schema.rs
│   │   │   └── output.rs            # Table, JSON, CSV formatters
│   │   └── Cargo.toml
│   │
│   ├── ogdb-python/              # Python bindings (PyO3)
│   │   ├── src/lib.rs
│   │   ├── pyproject.toml           # maturin build config
│   │   └── Cargo.toml
│   │
│   ├── ogdb-node/                # Node.js bindings (NAPI-RS)
│   │   ├── src/lib.rs
│   │   ├── package.json
│   │   └── Cargo.toml
│   │
│   └── ogdb-algorithms/          # Graph algorithms library
│       ├── src/
│       │   ├── lib.rs
│       │   ├── bfs.rs               # Breadth-first search
│       │   ├── dijkstra.rs          # Shortest path (weighted)
│       │   ├── pagerank.rs          # PageRank
│       │   ├── louvain.rs           # Community detection
│       │   ├── label_prop.rs        # Label propagation
│       │   ├── connected.rs         # Connected components
│       │   └── centrality.rs        # Betweenness, closeness, degree
│       └── Cargo.toml
│
├── tests/
│   ├── integration/              # Cross-crate integration tests
│   ├── tck/                      # openCypher Technology Compatibility Kit
│   ├── ldbc/                     # LDBC benchmark harness
│   └── fixtures/                 # Test data (TTL, CSV, JSON)
│
├── benches/                      # Criterion benchmarks
│   ├── storage_bench.rs
│   ├── query_bench.rs
│   ├── import_bench.rs
│   └── traversal_bench.rs
│
└── docs/
    ├── plans/                    # Design decisions and ADRs
    └── adr/                      # Architecture Decision Records
```

---

## 2. File Format & On-Disk Layout

### Single-File Structure

The `.ogdb` file is a single file divided into fixed-size **pages** (default 8 KiB, configurable at creation: 4K, 8K, 16K, 32K).

```
┌──────────────────────────────────────────────────────────┐
│ Page 0: File Header (magic, version, page size, etc.)    │
├──────────────────────────────────────────────────────────┤
│ Page 1: Catalog Root (schema, label→page mappings)       │
├──────────────────────────────────────────────────────────┤
│ Page 2: Free List Root                                   │
├──────────────────────────────────────────────────────────┤
│ Page 3: WAL Checkpoint Pointer                           │
├──────────────────────────────────────────────────────────┤
│ Pages 4-N: Data Pages (node columns, edge CSR, props,    │
│            indexes, overflow, string heap, temporal data) │
│            + optional embedded index pages (when enabled) │
└──────────────────────────────────────────────────────────┘
```

### File Header (Page 0, 8 KiB)

```rust
#[repr(C)]
struct FileHeader {
    magic: [u8; 8],          // b"OGDB\x00\x01\x00\x00"
    version_major: u16,       // File format major version
    version_minor: u16,       // File format minor version
    page_size: u32,           // Page size in bytes (4096, 8192, 16384, 32768)
    page_count: u64,          // Total pages in file
    free_list_root: u64,      // Page ID of free list root
    catalog_root: u64,        // Page ID of catalog root
    wal_checkpoint_lsn: u64,  // Last checkpointed WAL LSN
    created_at: i64,          // Unix timestamp (microseconds)
    modified_at: i64,         // Last modification timestamp
    node_count: u64,          // Total node count (cached)
    edge_count: u64,          // Total edge count (cached)
    next_node_id: u64,        // Next available internal node ID
    next_edge_id: u64,        // Next available internal edge ID
    checksum: u32,            // CRC32 of this header
    flags: u32,               // Feature flags (compression, encryption, etc.)
    reserved: [u8; 7928],     // Pad to page_size
}
```

### Page Types

```rust
#[repr(u8)]
enum PageType {
    FileHeader   = 0x01,
    Catalog      = 0x02,
    FreeList     = 0x03,
    NodeColumn   = 0x10,   // Columnar node data for a single label
    EdgeCSR      = 0x11,   // CSR adjacency list for edge type
    PropertyData = 0x12,   // Variable-length property values
    StringHeap   = 0x13,   // String/bytes storage
    BTreeInner   = 0x20,   // B+ tree internal node
    BTreeLeaf    = 0x21,   // B+ tree leaf node
    HashBucket   = 0x22,   // Hash index bucket
    HNSWLayer    = 0x30,   // HNSW vector index layer
    HNSWVectors  = 0x31,   // Raw vector data
    FTSegment    = 0x40,   // Full-text index segment (Tantivy)
    Temporal     = 0x50,   // Temporal version chain
    Overflow     = 0xFF,   // Overflow for large values
}
```

Each page has a common 16-byte header:

```rust
#[repr(C)]
struct PageHeader {
    page_type: u8,
    flags: u8,             // Dirty, pinned, compressed
    item_count: u16,       // Number of items in this page
    free_space_offset: u16,// Offset to start of free space
    page_lsn: u64,         // WAL LSN of last modification (for recovery)
    checksum: u16,         // CRC16 of page contents
}
```

---

## 3. Node & Edge Storage

### Node Storage (Columnar per Label)

Nodes are stored **per-label in columnar format**. Each label gets its own set of column pages.

```
Label "Person" storage:
┌─────────────────────────────────────────┐
│ Column: _id (u64)                       │  ← internal node ID
│ [1001, 1002, 1003, 1004, ...]           │
├─────────────────────────────────────────┤
│ Column: name (string offset)            │  ← offset into string heap
│ [0x00A0, 0x00C2, 0x00E4, ...]           │
├─────────────────────────────────────────┤
│ Column: age (i64, nullable)             │  ← fixed-width with null bitmap
│ [25, NULL, 30, 42, ...]                 │
│ Null bitmap: [1, 0, 1, 1, ...]          │
├─────────────────────────────────────────┤
│ Column: _csr_offset (u64)               │  ← pointer into edge CSR
│ [0, 3, 3, 7, ...]                       │
└─────────────────────────────────────────┘
```

**Why columnar per label?**
- Scans over a single property (e.g., `WHERE n.age > 30`) read only that column, not full nodes
- Cache-line friendly: sequential reads, SIMD-compatible
- Compression per column (run-length for labels, dictionary for low-cardinality strings)

**Multi-label nodes (Hybrid Architecture):**

A node with labels `[:Person, :Employee]` is handled through a three-layer design that balances performance, consistency, and storage efficiency:

**Layer 1: Canonical Property Store (Source of Truth)**
- All node properties stored exactly once in a global columnar store
- Partitioned into Node Groups (2048 rows each), type-heterogeneous
- Each row has `_id` (u64) and `_labels` (u64 inline bitmap for up to 64 labels)
- Property updates touch ONE location only (atomic, single WAL entry)

**Layer 2: Label Membership Indexes (Roaring Bitmaps)**
- One Roaring bitmap per label tracks which row positions in canonical store belong to that label
- Multi-label queries use bitmap AND/OR: `MATCH (n:Person:Employee)` = Person_bitmap AND Employee_bitmap
- Label add/remove is O(1) bitmap flip operation
- Memory-efficient: ~64KB per 1M nodes at 50% selectivity

**Layer 3: Per-Label Sorted Projections (Materialized Views)**
- Lightweight projection per label containing: `_id`, `_row` (back-pointer to canonical store), `_csr_offset`
- Sorted by `_id` for fast lookups and sequential CSR access
- CSR adjacency lists index into projections, not canonical store (preserves CSR contiguity)
- Optional: materialize hot property columns based on query profiling
- Maintained via delta buffer + background compaction (same pattern as CSR)

**Query execution:**
- `MATCH (n:Person)` → Use Person projection for contiguous row positions, gather properties from canonical store
- `SET n.name = "Bob"` → Single write to canonical store (atomic)
- `SET n:Manager` → Flip bit in Manager bitmap, append to Manager projection
- `MATCH (n:Person)-[:KNOWS]->()` → Person projection's _csr_offset enables direct CSR traversal

**Benefits:**
- Properties stored once (no duplication) → atomic updates, simple crash recovery
- Fast per-label scans via sorted projections → good columnar performance
- Fast multi-label queries via Roaring bitmap operations → excellent for RDF imports
- Label add/remove is cheap → dynamic schema evolution

**Implementation:** Baseline uses canonical store + bitmaps + lightweight projections. Extended configurations can add materialized property columns for hot paths.

### Edge Storage (CSR per Type)

Edges are stored in **Compressed Sparse Row** format, grouped by relationship type.

```
Edge type "WORKS_AT" CSR:
┌────────────────────────────────────────────────────┐
│ Offset array (per source node):                     │
│ [0, 1, 1, 3, 5, ...]                               │
│ (node 0 has 1 edge, node 1 has 0, node 2 has 2...) │
├────────────────────────────────────────────────────┤
│ Target array (destination node IDs):                │
│ [500, 501, 502, 500, 503, ...]                      │
├────────────────────────────────────────────────────┤
│ Edge ID array (for property lookups):               │
│ [E1, E2, E3, E4, E5, ...]                           │
├────────────────────────────────────────────────────┤
│ Edge properties (columnar, same as nodes):          │
│ Column: since (i64) → [2020, 2021, 2019, ...]      │
└────────────────────────────────────────────────────┘
```

**Reverse CSR:** For efficient incoming edge traversal (`(m)<-[:WORKS_AT]-(n)`), we maintain a **reverse CSR** with target→source mapping. This doubles edge storage but makes bidirectional traversal O(1) per hop.

### Handling Updates (The Hard Part)

CSR is great for reads but bad for inserts (shifting arrays). Solution:

1. **Delta buffer**: New edges go into an unsorted append-only buffer
2. **Merge on read**: Queries merge CSR + delta buffer at scan time
3. **Background compaction**: Periodically rebuild CSR from CSR + deltas
4. **Threshold**: Compact when delta buffer reaches 10% of CSR size

For node updates:
- Column updates are in-place for fixed-width columns (i64, f64, bool)
- String/variable-length updates go to string heap, old space is freed
- New nodes append to the end of each column

---

## 4. ID Generation & Addressing

### Internal IDs

```rust
/// Internal node/edge ID. 64-bit, monotonically increasing.
/// NOT stable across compaction — users should use properties for identity.
#[derive(Copy, Clone, Hash, Eq, PartialEq)]
struct InternalId(u64);

/// How to find a node given its InternalId:
/// 1. Look up label group from catalog (label → page range)
/// 2. Binary search offset array for the row position
/// 3. Read column values at that row position
```

### User-Facing IDs

Users never see `InternalId`. Instead:
- `elementId()` returns a stable string: `"n:{label_hash}:{internal_id}"` or `"e:{type_hash}:{internal_id}"`
- After compaction, `elementId()` remaps (using a tombstone table during transition)
- For RDF imports, `_uri` property serves as the stable external identifier

---

## 5. Transaction Model & Concurrency

### MVCC (Multi-Version Concurrency Control)

```
Each write creates a new version. Readers see a consistent snapshot.

Transaction T1 (writing):          Transaction T2 (reading):
┌─────────────────────┐            ┌──────────────────────┐
│ BEGIN (txn_id=100)   │            │ BEGIN (txn_id=99)     │
│ SET n.name = "Bob"   │            │ MATCH (n) RETURN n    │
│  → creates version   │            │  → sees snapshot at   │
│    {txn_id=100,      │            │    txn_id=99          │
│     value="Bob"}     │            │  → reads old "Alice"  │
│ COMMIT               │            │ COMMIT                │
└─────────────────────┘            └──────────────────────┘
```

### Version Chain

```rust
struct VersionedValue {
    txn_id: u64,         // Transaction that created this version
    prev_version: Option<PageOffset>,  // Pointer to previous version (or None)
    value: Datum,        // The actual value
    is_deleted: bool,    // Tombstone marker
}
```

### Isolation Level: Snapshot Isolation (default)

- Readers never block writers, writers never block readers
- Write-write conflicts detected at commit time (first-writer-wins)
- No phantom reads within a transaction
- Optional: serializable mode via predicate locking (advanced profile)

### Transaction Lifecycle

```rust
enum TxnState {
    Active,
    Committed,
    Aborted,
    Preparing,  // For future distributed 2PC
}

struct Transaction {
    txn_id: u64,
    state: TxnState,
    start_timestamp: u64,    // Snapshot point
    commit_timestamp: Option<u64>,
    write_set: Vec<WriteEntry>,  // All modifications
    read_set: Vec<ReadEntry>,    // For conflict detection
    undo_log: Vec<UndoEntry>,    // For rollback
}
```

### Concurrency in Embedded Mode

- **Single-writer, multiple-reader** (like SQLite's WAL mode)
- One write transaction at a time, held via a Rust `Mutex<WriteGuard>`
- Multiple concurrent read transactions via MVCC snapshots
- Write transactions queue if another write is in progress (configurable timeout)

### Concurrency in Server Mode

- **Multiple writers** via fine-grained row-level locking
- Lock manager with deadlock detection (wait-for graph, ironic for a graph DB)
- Upgrade path: read lock → write lock with conflict check

---

## 6. Write-Ahead Log (WAL)

### WAL File

Separate file alongside the main `.ogdb` file: `mydb.ogdb-wal`

```
WAL file layout:
┌────────────────────────────────┐
│ WAL Header (32 bytes)          │
│  magic: b"OGDBWAL\x00"        │
│  version: u16                  │
│  page_size: u32                │
│  checkpoint_lsn: u64           │
├────────────────────────────────┤
│ Log Record 1 (variable size)   │
│  lsn: u64                      │
│  txn_id: u64                   │
│  record_type: u8               │
│  page_id: u64                  │
│  offset: u16                   │
│  before_image: [u8]            │
│  after_image: [u8]             │
│  checksum: u32                 │
├────────────────────────────────┤
│ Log Record 2 ...               │
├────────────────────────────────┤
│ ...                            │
└────────────────────────────────┘
```

### Log Record Types

```rust
enum LogRecordType {
    BeginTxn,
    CommitTxn,
    AbortTxn,
    InsertNode,
    DeleteNode,
    UpdateProperty,
    InsertEdge,
    DeleteEdge,
    PageWrite,       // Full page image (for first modification)
    Checkpoint,
    CompensationLogRecord,  // For undo during recovery
}
```

### Write Protocol

1. Before modifying any page, write the before-image to WAL
2. Modify the page in buffer pool (dirty flag)
3. On COMMIT: write commit record to WAL, `fsync` WAL file
4. Pages can be flushed to main file lazily (no-force policy)
5. WAL must be flushed before dirty page is written to main file (write-ahead guarantee)

### Checkpoint Protocol

1. Freeze current WAL position
2. Flush all dirty pages from buffer pool to main file
3. `fsync` main file
4. Write checkpoint record to WAL with current LSN
5. Truncate WAL records before checkpoint LSN
6. Update file header `wal_checkpoint_lsn`

**Checkpoint trigger:** Every 1000 transactions OR when WAL exceeds 64 MiB (configurable)

---

## 7. Crash Recovery

### ARIES-Style Recovery (3 steps)

**Step 1: Analysis**
- Scan WAL from last checkpoint forward
- Build dirty page table (which pages might be inconsistent)
- Build active transaction table (which transactions were in-flight)

**Step 2: Redo**
- Replay all WAL records from checkpoint forward
- For each record, if page LSN < record LSN, apply the after-image
- This brings all pages to their most recent committed state

**Step 3: Undo**
- For each transaction in the active table that was NOT committed:
  - Walk its WAL records backward
  - Apply before-images to undo partial writes
  - Write compensation log records (CLR) to prevent re-undo on repeated crash

### Recovery Guarantees

- **Atomicity:** Uncommitted transactions are fully rolled back
- **Durability:** Committed transactions survive any single crash
- **Startup time:** Proportional to WAL size since last checkpoint (typically < 1 second)

---

## 8. Buffer Pool & Memory Management

### Design

```rust
struct BufferPool {
    frames: Vec<PageFrame>,    // Fixed array of page-sized buffers
    page_table: HashMap<PageId, FrameId>,  // Maps page ID → frame
    clock_hand: AtomicUsize,   // Clock-sweep eviction pointer
    free_list: Vec<FrameId>,   // Available frames
}

struct PageFrame {
    data: AlignedBuffer<PAGE_SIZE>,  // Page-aligned buffer
    page_id: Option<PageId>,
    pin_count: AtomicU32,            // Number of active references
    dirty: AtomicBool,
    ref_bit: AtomicBool,            // For clock-sweep
    latch: RwLock<()>,              // Page-level latch (not DB lock)
}
```

### Sizing

- Default: 25% of available RAM, minimum 64 MiB
- Configurable via `--buffer-pool-size` flag or library config
- Each frame = page_size (8 KiB default), so 64 MiB = ~8000 pages

### Eviction Policy: Clock-Sweep

1. Scan frames starting from `clock_hand`
2. If `ref_bit = true`, clear it, advance
3. If `ref_bit = false` and `pin_count = 0`, evict this frame
4. If dirty, flush to disk before evicting
5. Load requested page into the freed frame

### Memory Budget Breakdown (Embedded Mode)

```
Total memory budget: configured max (e.g., 256 MiB)
├── Buffer pool:       60%  (153 MiB) — page cache
├── Write buffers:     10%  (25 MiB)  — WAL, delta buffers
├── Vector index:      15%  (38 MiB)  — HNSW in-memory layers
├── Query execution:   10%  (25 MiB)  — intermediate results
└── Overhead:           5%  (12 MiB)  — catalog, metadata, stack
```

---

## 9. Index Structures

### B+ Tree (Property Indexes)

```
                    ┌─────────────┐
                    │  [30, 60]   │  ← Internal node (keys only)
                    └─┬────┬────┬┘
                   /   │    │    \
        ┌─────────┐ ┌──┴───┐ ┌──┴───┐ ┌─────────┐
        │10,20,25 │ │35,42 │ │55,58 │ │65,70,80 │  ← Leaf nodes
        │→next    │→│→next │→│→next │→│  NULL   │     (key + node_id)
        └─────────┘ └──────┘ └──────┘ └─────────┘
```

- Keys: property values (single or composite)
- Values: `InternalId` of the node/edge
- Leaf nodes linked for range scans
- Page-sized nodes (8 KiB) with ~200 keys per leaf (for i64)
- Supports: equality, range, prefix (for strings), IS NULL

### Hash Index (Exact Lookups)

- Linear hashing with split-based growth
- For `_uri` lookups (RDF imports) and unique constraints
- O(1) average lookup, no range support

### When to Auto-Create Indexes

- **Always indexed:** `_id` (internal), `_uri` (if present)
- **Auto-index on first query:** If a property filter is used in a query more than N times, suggest index creation (like PostgreSQL's auto-explain)
- **Manual:** `CREATE INDEX ON :Person(name)` via Cypher DDL

---

## 10. Cypher Parser & AST

### Supported Cypher Subset (Baseline)

```
Clauses:
  MATCH, OPTIONAL MATCH, WHERE, RETURN, WITH,
  CREATE, MERGE, DELETE, DETACH DELETE, SET, REMOVE,
  ORDER BY, SKIP, LIMIT, UNWIND, UNION

Patterns:
  (n)                          — anonymous node
  (n:Label)                    — labeled node
  (n:Label {prop: value})      — property filter in pattern
  (n)-[r]->(m)                 — directed edge
  (n)-[r:TYPE]->(m)            — typed edge
  (n)-[r:TYPE*1..3]->(m)       — variable-length path
  (n)-[r]-(m)                  — undirected

Expressions:
  Literals: integers, floats, strings, booleans, NULL, lists, maps
  Properties: n.name, r.since
  Comparison: =, <>, <, >, <=, >=
  Logical: AND, OR, NOT, XOR
  String: STARTS WITH, ENDS WITH, CONTAINS
  List: IN, [index], [start..end]
  NULL: IS NULL, IS NOT NULL
  Functions: count(), sum(), avg(), collect(), size(), type(), labels(),
             id(), keys(), properties(), head(), tail(), last(),
             toString(), toInteger(), toFloat(), coalesce(),
             shortestPath(), length(), nodes(), relationships()
  CASE WHEN ... THEN ... ELSE ... END
  EXISTS { subquery }

Parameters:
  $paramName — bound at execution time
```

### AST Types

**Future-proof design:** Top-level enums use `#[non_exhaustive]` to allow adding variants in later extensions without breaking downstream crates (Python/JS bindings, ogdb-cli).

```rust
/// Top-level statement
/// #[non_exhaustive] allows adding new statement types (e.g., SchemaCommand variants) in later extensions
#[non_exhaustive]
#[derive(Debug, Clone, PartialEq)]
pub enum Statement {
    Query(Vec<QueryClause>),
    SchemaCommand(SchemaCommand),
}

/// Query clauses
/// #[non_exhaustive] allows adding temporal, vector, text search clauses in later extensions
#[non_exhaustive]
#[derive(Debug, Clone, PartialEq)]
pub enum QueryClause {
    Match {
        patterns: Vec<Pattern>,
        where_clause: Option<Expr>,
        optional: bool,
        // Temporal support placeholder. Parser currently produces None.
        temporal: Option<TemporalClause>,
    },
    Return { items: Vec<ReturnItem>, order_by: Option<Vec<SortItem>>,
             skip: Option<Expr>, limit: Option<Expr>, distinct: bool },
    With { items: Vec<ReturnItem>, where_clause: Option<Expr> },
    Create { patterns: Vec<Pattern> },
    Merge { pattern: Pattern, on_create: Option<Vec<SetItem>>,
            on_match: Option<Vec<SetItem>> },
    Delete { exprs: Vec<Expr>, detach: bool },
    Set { items: Vec<SetItem> },
    Remove { items: Vec<RemoveItem> },
    Unwind { expr: Expr, alias: String },
    Call { procedure: String, args: Vec<Expr>, yields: Option<Vec<String>> },
    Union { all: bool, queries: Vec<Vec<QueryClause>> },
}

/// Temporal clause modifier.
/// Defined now for documentation and forward planning. Parser may leave it unset.
#[non_exhaustive]
#[derive(Debug, Clone, PartialEq)]
pub enum TemporalClause {
    /// AT TIME datetime('2025-01-01')
    AtTime(Expr),
    /// BETWEEN datetime('...') AND datetime('...')
    Between { start: Expr, end: Expr },
}

struct Pattern {
    elements: Vec<PatternElement>,  // Alternating nodes and edges
}

enum PatternElement {
    Node {
        variable: Option<String>,
        labels: Vec<String>,
        properties: Option<MapExpr>,
    },
    Edge {
        variable: Option<String>,
        edge_type: Option<String>,
        direction: Direction,
        properties: Option<MapExpr>,
        min_hops: Option<u32>,
        max_hops: Option<u32>,
    },
}

enum Direction { Outgoing, Incoming, Both }
```

---

## 11. Query Planner & Optimizer

### Planning Pipeline

```
Cypher string
    │
    ▼
┌──────────┐
│  Parse   │  → AST (syntax tree)
└────┬─────┘
     ▼
┌──────────────┐
│  Semantic    │  → Resolve labels, types, validate
│  Analysis    │     (catch errors before planning)
└────┬─────────┘
     ▼
┌──────────────┐
│  Logical     │  → Relational algebra + graph operators
│  Plan        │     (Scan, Expand, Filter, Project, Join)
└────┬─────────┘
     ▼
┌──────────────┐
│  Optimize    │  → Apply transformation rules
│  (rules)     │     (predicate pushdown, join reorder, index selection)
└────┬─────────┘
     ▼
┌──────────────┐
│  Physical    │  → Choose implementations
│  Plan        │     (IndexScan vs LabelScan, HashJoin vs MergeJoin)
└────┬─────────┘
     ▼
┌──────────────┐
│  Execute     │  → Vectorized push-based execution
└──────────────┘
```

### Logical Operators

```rust
enum LogicalOp {
    // Core graph operators
    NodeScan { label: String, alias: String },
    EdgeScan { edge_type: String, alias: String },
    Expand { from: String, edge_type: String, direction: Direction,
             to: String, edge_alias: String,
             min_hops: u32, max_hops: u32 },

    // Extended: vector and full-text search operators
    VectorSearch {
        index_name: String,
        query_expr: Expr,                    // Vector to search for
        k: usize,                            // Top-K results
        distance_threshold: Option<f64>,     // Optional max distance
        alias: String,
        score_alias: String,                 // Distance column name
    },
    TextSearch {
        index_name: String,
        query_expr: Expr,                    // Text query string
        limit: usize,
        alias: String,
        score_alias: String,                 // BM25 score column name
    },

    // Relational operators
    Filter { predicate: Expr },
    Project { expressions: Vec<(Expr, String)> },
    Aggregate { keys: Vec<Expr>, aggregates: Vec<AggExpr> },
    Sort { keys: Vec<SortKey> },
    Limit { count: Expr },
    Skip { count: Expr },
    Join { left: Box<LogicalOp>, right: Box<LogicalOp>, on: Vec<JoinKey> },
    SemiJoin { ... },
    AntiJoin { ... },
    Union { all: bool, branches: Vec<LogicalOp> },

    // Write operators
    Create { patterns: Vec<Pattern> },
    Delete { nodes: Vec<String>, detach: bool },
    SetProperty { target: String, prop: String, value: Expr },
}
```

### Physical Operators (Hybrid Queries)

Following VBase's relaxed monotonicity pattern, vector and text searches are first-class leaf operators that yield (InternalId, score) tuples:

```rust
enum PhysicalOp {
    // Leaf operators (scan data sources)
    NodeLabelScan { label: LabelId, alias: String },
    NodeIndexSeek { index: IndexId, key: Expr, alias: String },

    // Extended: vector search as composable operator
    VectorScan {
        index: VectorIndexId,
        query_vector: Expr,               // Evaluated at runtime
        k: usize,
        ef_search: usize,                 // HNSW search width (tunable quality)
        pre_filter: Option<Bitmap>,       // Optional: bitmap from graph/text results
        alias: String,
        score_alias: String,              // Exposes distance as column
    },

    // Extended: full-text search as composable operator
    TextSearch {
        index: FTSIndexId,
        query: String,
        limit: usize,
        alias: String,
        score_alias: String,              // Exposes BM25 score as column
    },

    // Graph traversal
    Expand { from: String, edge_type: EdgeTypeId, direction: Direction,
             to: String, edge_alias: String },

    // Joins
    HashJoin { build_side: Box<PhysicalOp>, probe_side: Box<PhysicalOp>,
               join_keys: Vec<JoinKey> },
    MergeJoin { left: Box<PhysicalOp>, right: Box<PhysicalOp>,
                join_keys: Vec<JoinKey> },

    // Extended: hybrid query-specific operators
    IntersectIds {
        inputs: Vec<Box<PhysicalOp>>,     // Each produces (InternalId, ...) tuples
        // Outputs only IDs present in ALL inputs (efficient sorted merge or hash intersection)
    },
    MapScore {
        input: Box<PhysicalOp>,
        score_column: String,             // Avoids redundant distance recomputation (CHASE pattern)
    },

    // Standard relational operators
    Filter { predicate: Expr, input: Box<PhysicalOp> },
    Project { expressions: Vec<(Expr, String)>, input: Box<PhysicalOp> },
    Sort { keys: Vec<SortKey>, input: Box<PhysicalOp> },
    TopN { k: usize, sort_keys: Vec<SortKey>, input: Box<PhysicalOp> },
    Aggregate { keys: Vec<Expr>, aggregates: Vec<AggExpr>, input: Box<PhysicalOp> },
    Limit { count: usize, input: Box<PhysicalOp> },
    // ... other operators
}
```

**Key design decisions:**

1. **VectorScan implements the Volcano iterator protocol** (Open/Next/Close), yielding one (InternalId, distance) tuple at a time from HNSW graph traversal. This makes it composable with Filter, HashJoin, and TopN operators.

2. **Scores are first-class columns.** Both VectorScan and TextSearch expose their scores (distance, BM25) as named columns that flow through the execution pipeline. Downstream Sort operators use these columns directly (MapScore pattern from CHASE paper).

3. **Pre-filter bitmaps** enable strategy selection: when graph traversal produces a small candidate set (<1% selectivity), pass as bitmap to VectorScan, which switches from HNSW to brute-force linear scan (faster on small filtered sets per MyScaleDB/Qdrant research).

4. **IntersectIds** is essential for the pattern where VectorScan and TextSearch run independently (no data dependency), then intersect results. Implemented as sorted merge on InternalId or hash-based intersection.

**Example query plan:**
```cypher
MATCH (doc:Document)-[:MENTIONS]->(e:Entity)
WHERE doc.embedding <-> $vec < 0.3
  AND doc.content CONTAINS TEXT 'graph database'
  AND e.type = 'Person'
RETURN doc, e
```

**Physical plan (vector-first strategy):**
```
Project [doc, e]
  Filter [e.type = 'Person']
    Expand [doc -[:MENTIONS]-> e]
      IntersectIds
        ├── VectorScan [doc.embedding, query=$vec, k=100, score<0.3, alias=doc]
        └── TextSearch [doc.content, query='graph database', limit=500, alias=doc]
```

### Optimization Rules

**Baseline rules:**
1. **Predicate pushdown**: Move WHERE filters as close to scans as possible
2. **Index selection**: If filter matches an index, use IndexScan instead of LabelScan + Filter
3. **Label scan elimination**: If pattern specifies both label and properties with index, skip full scan

**Extended rules:**
4. **Join reorder**: Use cardinality estimates to pick cheapest join order
5. **WCOJ**: For cyclic patterns (triangles, cliques), use worst-case optimal joins
6. **Expand-into**: When both endpoints known, check edge existence instead of scanning
7. **Hybrid index ordering**: For queries with graph + vector + text, estimate selectivity of each index type and execute most selective first
8. **Bitmap pre-filter propagation**: When graph/text produces small candidate set, pass as bitmap to vector search
9. **IntersectIds for parallel indexes**: When vector and text are independent, run concurrently and intersect results

**Advanced rules:**
10. **Factorized execution**: For path queries with branching
11. **Adaptive re-optimization**: If cardinality estimates are off by >10x at runtime, re-plan
12. **Adaptive strategy selection**: Switch between pre-filter, post-filter, in-algorithm based on runtime selectivity
13. **Score fusion**: Combine vector distance + BM25 score + graph proximity into unified ranking

### Cost Model

```rust
struct CostEstimate {
    rows: f64,           // Estimated cardinality
    cpu_cost: f64,       // Estimated CPU operations
    io_cost: f64,        // Estimated page reads
    memory_cost: f64,    // Estimated memory usage
}

// Additional cost functions for optional vector/text operators:

fn cost_vector_scan(n: u64, k: usize, dim: usize, ef_search: usize,
                    pre_filter_ratio: f64) -> CostEstimate {
    // HNSW: O(ef_search * log(n) * dim) with SIMD factor (~dim/16)
    // Switch to brute-force if pre_filter_ratio < 0.01 (1% selectivity threshold)
    let distance_ops = (ef_search as f64) * (n as f64).ln() * (dim as f64);
    let cpu_cost = if pre_filter_ratio < 0.01 {
        (n as f64) * pre_filter_ratio * (dim as f64) / 16.0  // Brute-force over filtered set
    } else {
        distance_ops / (16.0 * pre_filter_ratio.sqrt())  // Filtered HNSW
    };
    CostEstimate {
        rows: k.min((n as f64 * pre_filter_ratio) as usize) as f64,
        cpu_cost,
        io_cost: (ef_search as f64) * 2.0,  // HNSW layer reads
        memory_cost: (ef_search * dim * 4) as f64,
    }
}

fn cost_text_search(total_docs: u64, avg_posting_list_len: f64,
                    num_query_terms: usize, limit: usize) -> CostEstimate {
    // BM25: O(sum of posting list lengths * num_terms)
    let cpu_cost = avg_posting_list_len * (num_query_terms as f64) * 2.0;
    let io_cost = avg_posting_list_len * (num_query_terms as f64) / 1000.0;
    CostEstimate {
        rows: limit.min(avg_posting_list_len as usize) as f64,
        cpu_cost,
        io_cost,
        memory_cost: (limit * 64) as f64,  // Top-k heap
    }
}

fn cost_graph_expand(input_rows: f64, avg_degree: f64, hops: u32) -> CostEstimate {
    // CSR traversal: O(input_rows * avg_degree^hops)
    let output_rows = input_rows * avg_degree.powi(hops as i32);
    CostEstimate {
        rows: output_rows,
        cpu_cost: output_rows * 2.0,  // Pointer chase + boundary check
        io_cost: output_rows / 500.0,  // ~500 edges per 8KB page
        memory_cost: output_rows * 16.0,  // InternalId pairs
    }
}

// Key statistics maintained per label/type:
struct TableStats {
    row_count: u64,
    distinct_values: HashMap<String, u64>,  // Per-property NDV
    min_value: HashMap<String, Datum>,
    max_value: HashMap<String, Datum>,
    null_fraction: HashMap<String, f64>,
    histogram: HashMap<String, Histogram>,  // Equi-depth histograms
    avg_edge_degree: f64,                   // For expand cost estimation

    // Optional vector and text index stats
    vector_index_size: Option<u64>,         // Total vectors indexed
    vector_dimensionality: Option<usize>,   // Embedding dimension
    text_doc_count: Option<u64>,            // Documents in FTS index
    text_avg_posting_len: Option<f64>,      // Average posting list length
}
```

### Statistics Collection

- **On import:** Full statistics computed
- **On writes:** Incremental updates (counter-based)
- **Background:** Periodic re-sampling when stats drift > 20%
- **Manual:** `CALL db.stats.refresh()` procedure

---

## 12. Query Execution Engine

### Vectorized Push-Based Model

```
                  Consumer (RETURN)
                       ▲
                       │ push batch
                  ┌────┴─────┐
                  │  Project  │
                  └────┬─────┘
                       ▲
                       │ push batch
                  ┌────┴─────┐
                  │  Filter   │  WHERE n.age > 30
                  └────┬─────┘
                       ▲
                       │ push batch
                  ┌────┴─────┐
                  │  Expand   │  -[:WORKS_AT]->
                  └────┬─────┘
                       ▲
                       │ push batch
                  ┌────┴─────┐
                  │ NodeScan  │  :Person
                  └──────────┘
```

### Columnar Batch

```rust
/// A batch of rows in columnar format (inspired by Apache Arrow)
struct Batch {
    columns: Vec<Column>,
    row_count: usize,
    selection_vector: Option<Vec<u16>>,  // For filter pushdown
}

enum Column {
    Bool(Vec<bool>, BitVec),          // values, null bitmap
    Int64(Vec<i64>, BitVec),
    Float64(Vec<f64>, BitVec),
    String(Vec<StringRef>, BitVec),   // Offset into string buffer
    NodeId(Vec<InternalId>),
    EdgeId(Vec<InternalId>),
    Vector(Vec<VectorRef>),           // Offset into vector storage
    List(Box<Column>, Vec<u32>),      // Nested list with offsets
    Map(Box<Column>, Box<Column>),
}
```

### Batch Size

- Default: 1024 rows per batch
- Tunable: smaller for low-latency point queries, larger for analytics
- All operators process full batches (not row-at-a-time)

---

## 13. Schema & Catalog

### Catalog Tables (stored in catalog pages)

```
Labels:
  label_id (u16) | name (string) | property_schema | node_count | page_range

Edge Types:
  type_id (u16) | name (string) | property_schema | edge_count | csr_page_range

Properties:
  prop_id (u16) | name (string) | data_type | nullable | default

Indexes:
  index_id (u32) | label_or_type (u16) | properties (vec<u16>) |
  index_type (btree/hash/vector/text) | root_page

Constraints:
  constraint_id (u32) | type (unique/exists/node_key) | label | properties

Prefix Map (for RDF):
  prefix (string) | uri (string)

Label Hierarchy (for rdfs:subClassOf):
  child_label_id (u16) | parent_label_id (u16)
```

### Schema Enforcement

- **Schema-optional** by default (like Neo4j): any property, any type
- **Schema-enforced** mode (opt-in per label): `CREATE CONSTRAINT ON (p:Person) ASSERT p.name IS NOT NULL`
- **Strict mode** (opt-in globally): all labels must be declared before use

---

## 14. Type System & Serialization

### On-Disk Format (Datum)

```rust
/// Discriminated union for serialized values
/// First byte is type tag, followed by value bytes
enum DatumTag {
    Null     = 0x00,   // 1 byte (tag only)
    Bool     = 0x01,   // 2 bytes (tag + 0x00/0x01)
    Int64    = 0x02,   // 9 bytes (tag + 8 bytes big-endian for sortable comparison)
    Float64  = 0x03,   // 9 bytes (tag + IEEE 754 with sign flip for sortable)
    String   = 0x04,   // tag + u32 length + UTF-8 bytes
    Bytes    = 0x05,   // tag + u32 length + raw bytes
    Date     = 0x06,   // tag + i32 (days since epoch)
    DateTime = 0x07,   // tag + i64 (microseconds since epoch) + i16 (tz offset minutes)
    Duration = 0x08,   // tag + i64 months + i64 days + i64 nanos
    List     = 0x09,   // tag + u32 count + Datum elements
    Map      = 0x0A,   // tag + u32 count + (String key, Datum value) pairs
    Vector   = 0x0B,   // tag + u16 dimensions + f32 values
}
```

### Inline vs Overflow

- Values < 256 bytes: stored inline in the property column
- Values 256 bytes to 8 KiB: stored in property overflow pages
- Values > 8 KiB: stored in string heap (multi-page, linked)
- Vectors: always in dedicated vector pages (for SIMD alignment)

---

## 15. Locking & Isolation Levels

### Lock Granularity

```
Global lock (embedded write mutex)
  └── Label/Type lock (DDL operations)
       └── Row lock (node/edge level, server mode only)
            └── Property lock (future: column-level, for high-concurrency updates)
```

### Deadlock Detection

- Wait-for graph (yes, using our own graph DB to detect deadlocks in our graph DB)
- Check on every lock wait, abort the younger transaction
- Timeout fallback: 5 seconds (configurable)

---

## 16. Compaction & Garbage Collection

### What Needs Compacting

1. **CSR delta buffers** → merge into main CSR arrays
2. **Old MVCC versions** → remove versions invisible to all active transactions
3. **Deleted nodes/edges** → reclaim space, update free list
4. **String heap fragmentation** → relocate live strings, free gaps
5. **WAL** → truncate after checkpoint

### Compaction Strategy

- **Lazy:** Triggered when thresholds exceeded (delta > 10% of CSR, free space > 30%)
- **Background thread:** Runs during low activity
- **Non-blocking:** Uses copy-on-write; readers see old data until compaction commits
- **Incremental:** Compact one label/type at a time, not the entire database

### Vacuum Command

```cypher
-- Manual compaction
CALL db.vacuum()

-- Compact specific label
CALL db.vacuum.label('Person')

-- Show compaction stats
CALL db.vacuum.stats()
```

---

## 17. Vector Index Internals

### HNSW Parameters

```rust
struct HNSWConfig {
    m: usize,                    // Max connections per layer (default: 16)
    ef_construction: usize,      // Build-time search width (default: 200)
    ef_search: usize,            // Query-time search width (default: 50)
    max_layers: usize,           // Max hierarchy depth (default: 6)
    distance_metric: DistanceMetric,  // Cosine | Euclidean | DotProduct
    dimensions: usize,           // Vector dimensionality
}
```

### On-Disk Structure

```
HNSW storage:
├── Layer 0 (all vectors): neighbors stored in dedicated pages
│   Vector 0: [neighbor_ids: u64[], distances: f32[]]
│   Vector 1: [neighbor_ids: u64[], distances: f32[]]
│   ...
├── Layer 1 (subset): sparser connections
├── Layer 2 (sparser subset)
├── ...
├── Entry point: top-layer node ID
└── Raw vectors: page-aligned f32 arrays (for SIMD distance computation)
```

### Implementation: USearch (Primary)

```rust
/// Vector index uses USearch (C++ FFI) for HNSW with on-disk mmap serving.
/// Abstracted behind VectorIndex trait; pure-Rust hnsw_rs available as fallback.
trait VectorIndex: Send + Sync {
    fn add(&self, id: InternalId, vector: &[f32]) -> Result<()>;
    fn remove(&self, id: InternalId) -> Result<()>;
    fn search(&self, query: &[f32], k: usize) -> Result<Vec<(InternalId, f32)>>;
    fn filtered_search(&self, query: &[f32], k: usize,
                       filter: &dyn Fn(InternalId) -> bool) -> Result<Vec<(InternalId, f32)>>;
    fn save(&self) -> Result<()>;
    fn len(&self) -> usize;
}

struct USearchVectorIndex {
    index: usearch::Index,
    index_path: PathBuf,  // e.g., "mydb.ogdb.vecindex"
    config: HNSWConfig,
}

impl USearchVectorIndex {
    fn open(db_path: &Path, config: HNSWConfig) -> Result<Self> {
        let index_path = db_path.with_extension("ogdb.vecindex");
        let options = IndexOptions {
            dimensions: config.dimensions,
            metric: MetricKind::Cos,
            quantization: ScalarKind::F16,  // 2x memory savings vs f32
            connectivity: config.m,
            expansion_add: config.ef_construction,
            expansion_search: config.ef_search,
            multi: false,
        };
        let index = Index::new(&options)?;
        if index_path.exists() {
            index.view(&index_path)?;  // mmap: no RAM load
        }
        Ok(Self { index, index_path, config })
    }
}
```

### SIMD Distance Computation

USearch delegates to SimSIMD for hardware-optimized distance computation:
- **x86_64:** AVX-512, AVX2, SSE4.2 (auto-detected at runtime)
- **ARM:** NEON, SVE (Apple Silicon, AWS Graviton)
- **Fallback:** Scalar for other architectures

### Incremental Updates

- Insert: `index.add(id, &vector)` — standard HNSW insert with layer promotion
- Delete: `index.remove(id)` — true removal with graph repair (not just tombstone)
- Update: `index.remove(id)` + `index.add(id, &new_vector)`
- Persistence: `index.save(&path)` after batch of writes; WAL logs vector ops for crash recovery

### Pure-Rust Fallback (hnsw_rs)

Enabled via `--features pure-rust-vector` for environments where C++ FFI is unacceptable:
- Same `VectorIndex` trait, different implementation
- Uses `hnsw_rs` crate with `anndists` for SIMD (x86 AVX2 via simdeez)
- Custom persistence layer needed (bincode serialization + page-aligned writes)
- No incremental delete (tombstone-based, skip during search, rebuild periodically)

---

## 18. Full-Text Index Internals

### Tantivy Integration

```rust
/// Full-text index uses Tantivy's native MmapDirectory in a subdirectory.
/// Abstracted behind FTSIndex trait for future migration to embedded storage.
trait FTSIndex: Send + Sync {
    fn index_document(&self, node_id: InternalId, fields: &[(String, String)]) -> Result<()>;
    fn search(&self, query: &str, limit: usize) -> Result<Vec<(InternalId, f32)>>;
    fn delete_document(&self, node_id: InternalId) -> Result<()>;
    fn commit(&self) -> Result<()>;
}

struct TantivyFTSIndex {
    // Tantivy index stored in subdirectory: mydb.ogdb.ftindex/
    index: tantivy::Index,
    schema: tantivy::Schema,  // Maps OpenGraphDB properties to Tantivy fields
    writer: IndexWriter,
    reader: IndexReader,
    index_path: PathBuf,      // e.g., "mydb.ogdb.ftindex/"
}

impl TantivyFTSIndex {
    fn open(db_path: &Path) -> Result<Self> {
        let index_path = db_path.with_extension("ogdb.ftindex");
        std::fs::create_dir_all(&index_path)?;
        let dir = tantivy::directory::MmapDirectory::open(&index_path)?;
        let index = tantivy::Index::open_or_create(dir, schema)?;
        // ...
    }
}
```

### Crash Consistency

Tantivy and the main database have separate crash domains. Recovery approach:
1. WAL records FTS operations alongside graph mutations
2. On recovery, compare WAL FTS entries against Tantivy's committed segments
3. Replay any FTS operations that committed in WAL but not in Tantivy
4. Fallback: `ogdb reindex mydb.ogdb` to rebuild FTS from scratch

### Indexed Properties

```cypher
-- Create full-text index
CREATE FULLTEXT INDEX article_content FOR (n:Article) ON (n.title, n.content)

-- Automatically indexes on write:
CREATE (a:Article {title: "GraphDB Design", content: "..."})
-- → Tantivy tokenizes and indexes both fields
```

---

## 19. Temporal Storage Internals

### Version Chain per Entity

```
Node "John" version chain:

  Current (v3, txn=150):          v2 (txn=120):           v1 (txn=100):
  ┌──────────────────┐           ┌──────────────────┐    ┌──────────────────┐
  │ name: "John D."  │──prev──▶  │ name: "John Doe" │──▶ │ name: "John"     │
  │ valid_from: T3   │           │ valid_from: T2   │    │ valid_from: T1   │
  │ valid_to: ∞      │           │ valid_to: T3     │    │ valid_to: T2     │
  │ txn_created: 150 │           │ txn_created: 120 │    │ txn_created: 100 │
  └──────────────────┘           └──────────────────┘    └──────────────────┘
```

### Temporal Queries (Implementation)

```
AT TIME T2:
1. Start from current version
2. Walk version chain backward until valid_from <= T2 < valid_to
3. Return that version

BETWEEN T1 AND T3:
1. Walk full chain
2. Return all versions where [valid_from, valid_to) overlaps [T1, T3)
```

### Temporal Index

- B+ tree on `(entity_id, valid_from)` for efficient time-point lookups
- Maintained alongside regular indexes

---

## 20. RDF Import Pipeline

### Streaming Pipeline

```
File (TTL/NT/JSONLD)
    │
    ▼
┌──────────────┐
│  RDF Parser  │  oxttl::TurtleParser (streaming, no full file in memory)
│  (oxrdfio)   │  Emits one quad at a time via for_reader() iterator
└──────┬───────┘
       │  Triple { subject, predicate, object }
       ▼
┌──────────────┐
│  Step 1:     │  Collect all rdf:type triples
│  Schema Pass │  Collect owl:Class, owl:*Property, rdfs:subClassOf
│              │  Build label registry + type hierarchy
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Step 2:     │  For each triple:
│  Data Pass   │    subject → node lookup/create (by URI)
│              │    predicate + URI object → edge create
│              │    predicate + literal object → property set
│              │  Batch writes (1000 triples per batch)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Step 3:     │  Build indexes
│  Index Build │  Update statistics
│              │  Compact if needed
└──────────────┘
```

### Performance Target

- 100K triples/second for TTL import
- Streaming: constant memory regardless of file size
- Bulk loader: bypass WAL, sort-merge into CSR directly (for initial import only)

---

## 21. CSV/JSON Import Pipeline

### CSV Import

```bash
ogdb import mydb.ogdb --format csv --label Person people.csv
# Header: name,age,email
# Rows become: (:Person {name: "...", age: 42, email: "..."})

ogdb import mydb.ogdb --format csv --edge KNOWS \
  --from-label Person --from-key email \
  --to-label Person --to-key email \
  relationships.csv
# Header: from_email,to_email,since
# Rows become edges between matched nodes
```

### JSON Import

```bash
ogdb import mydb.ogdb --format json --label Person people.jsonl
# Each line: {"name": "John", "age": 30, "friends": ["Jane"]}
# Auto-detect types from JSON values
```

### Bulk Loader (Bypass WAL)

For initial import of large datasets:
1. Sort nodes by label
2. Sort edges by source node
3. Build columnar pages directly (no WAL, no buffer pool)
4. Build indexes in bulk (sort-merge)
5. Write file header last (atomic: file isn't valid until header written)

---

## 22. Export Pipeline

### Formats

| Format | Streaming | Use Case |
|--------|-----------|----------|
| JSON/JSONL | Yes | API integration, jq piping |
| CSV | Yes | Spreadsheets, data tools |
| TTL (Turtle) | Yes | RDF round-trip |
| JSON-LD | Yes (with framing) | Linked Data APIs |
| Cypher | Yes | Migration to Neo4j |
| Arrow/Parquet | Planned | Analytics pipelines |

### RDF Export Round-Trip Fidelity

When exporting nodes/edges that were imported from RDF:
1. Use stored `_uri` property as subject/object URIs
2. Use stored prefix map for compact TTL output
3. Convert labels back to `rdf:type` triples
4. Convert properties back to datatype literals with correct `xsd:` types
5. Reconstruct blank nodes from `_blank_id`

---

## 23. CLI Architecture

### Command Structure (clap v4)

```rust
#[derive(Parser)]
#[command(name = "opengraphdb", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

enum Commands {
    Init { path: PathBuf },
    Query { db: PathBuf, query: String,
            #[arg(long, default_value = "table")] format: OutputFormat },
    Shell { db: PathBuf },
    Import { db: PathBuf, #[arg(long)] format: ImportFormat,
             files: Vec<PathBuf>,
             #[arg(long)] continue_on_error: bool },  // Log bad rows, don't abort
    Export { db: PathBuf, #[arg(long)] format: ExportFormat },
    Backup { source: PathBuf, dest: PathBuf,
             #[arg(long)] compact: bool },  // default checkpoint+copy, optional compact mode
    Checkpoint { db: PathBuf },  // Force WAL checkpoint (then safe to cp)
    Serve { db: PathBuf, #[arg(long, default_value = "7687")] port: u16 },
    Mcp { db: PathBuf },
    Info { db: PathBuf },
    Stats { db: PathBuf },
    Schema { db: PathBuf },
}

enum OutputFormat { Table, Json, Csv, Tsv }
enum ImportFormat { Csv, Json, Jsonl, Ttl, Nt, Jsonld, RdfXml }
enum ExportFormat { Json, Jsonl, Csv, Ttl, Jsonld, Cypher }
```

### REPL (Shell Mode)

- Based on `rustyline` crate
- Cypher syntax highlighting
- Tab completion for labels, types, properties, functions
- Multi-line input (detect unclosed parentheses/brackets)
- History stored in `~/.opengraphdb_history`
- Special commands: `:schema`, `:stats`, `:help`, `:quit`

### Backup Command Implementation

```rust
// ogdb backup source.ogdb dest.ogdb
fn backup_command(source: &Path, dest: &Path, compact: bool) -> Result<()> {
    let db = Database::open(source)?;

    // Default: checkpoint + file copy
    if !compact {
        // 1. Force WAL checkpoint (flush all WAL entries to main file)
        db.checkpoint()?;

        // 2. Acquire brief read lock (prevents writes during copy)
        let _guard = db.read_lock()?;

        // 3. Copy .ogdb file
        std::fs::copy(source, dest)?;

        // WAL file not copied (all data is in main file after checkpoint)
        // Vector/FTS artifacts may be copied or rebuilt separately

        info!("Backup complete: {} → {}", source.display(), dest.display());
        return Ok(());
    }

    // Optional compact backup (VACUUM INTO equivalent)
    // Creates defragmented copy, reclaims freed space
    db.backup_compact(dest)?;
    Ok(())
}

// ogdb checkpoint mydb.ogdb
fn checkpoint_command(db_path: &Path) -> Result<()> {
    let db = Database::open(db_path)?;
    db.checkpoint()?;
    info!("Checkpoint complete. Database file is now safe to copy with cp/rsync.");
    Ok(())
}
```

**Why this is safe:**
- After checkpoint, all committed data is in the main .ogdb file
- WAL file can be discarded (or ignored during copy)
- Read lock prevents writes during the copy operation
- If vector/FTS indexes exist, they are rebuildable derived artifacts by default; optional embedded variants may be enabled later.

**User guidance:**
- Prefer `ogdb backup` over raw `cp` (handles checkpoint automatically)
- If using `cp`, run `ogdb checkpoint` first
- Never `cp` an open database without checkpoint

---

## 24. Embedded Library API

### Rust API

```rust
use opengraphdb::{Database, Config, Value};

// Open/create database
let db = Database::open("mydata.ogdb", Config::default())?;

// Transaction-based API
let tx = db.begin()?;
let results = tx.query("MATCH (n:Person) WHERE n.age > $age RETURN n.name",
                        params! { "age" => 30 })?;
for row in results {
    let name: String = row.get("n.name")?;
}
tx.commit()?;

// Convenience API (auto-commit single queries)
let count: i64 = db.query_scalar("MATCH (n) RETURN count(n)", params!{})?;

// Batch import
let mut importer = db.importer()?;
importer.add_node(&["Person"], props! { "name" => "John", "age" => 30 })?;
importer.add_edge("WORKS_AT", node_a, node_b, props! { "since" => 2020 })?;
importer.commit()?;
```

### Thread Safety

- `Database` is `Send + Sync` (safe to share across threads)
- Read transactions can be opened from any thread
- Write transactions serialize via internal mutex
- No `unsafe` in public API

---

## 25. Server Mode & Bolt Protocol

### Bolt Protocol v1 (0.4.0)

`ogdb-bolt` ships **Bolt v1** today
(`crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1`). The handshake declines
anything else; Neo4j 4.x / 5.x drivers that negotiate v4/v5 by default
will reject the handshake on connect — see
`documentation/MIGRATION-FROM-NEO4J.md` § "Bolt protocol coverage" for
the user-facing impact. v4/v5 negotiation is a v0.5 follow-up tracked
in `documentation/COMPATIBILITY.md` § 4.

The HELLO/RUN/PULL/GOODBYE message flow below is broadly the same in
v1; only the version and capability set differ:

```
Client                          Server
  │                               │
  │──── HELLO {agent, auth} ────▶│
  │◀─── SUCCESS {server, ...} ───│
  │                               │
  │──── RUN "MATCH..." {} ──────▶│
  │◀─── SUCCESS {fields} ────────│
  │                               │
  │──── PULL {n: 1000} ─────────▶│
  │◀─── RECORD [values...] ──────│  ×N
  │◀─── SUCCESS {has_more} ──────│
  │                               │
  │──── GOODBYE ─────────────────▶│
  │◀─── (connection closed) ──────│
```

### PackStream Encoding

Neo4j's binary format for Bolt protocol. We implement:
- Tiny/8/16/32 integers
- Float64
- String (tiny/8/16/32)
- List (tiny/8/16/32)
- Map (tiny/8/16/32)
- Structure (Node, Relationship, Path, Point, DateTime, etc.)

### Connection Pool (Server)

- Tokio-based async TCP listener
- Per-connection state machine (authentication → ready → streaming → ready)
- Max connections configurable (default: 100)
- Idle timeout: 30 minutes

---

## 26. MCP Server Architecture

### Protocol

MCP uses JSON-RPC over stdio. Our implementation:

```rust
// MCP server reads JSON-RPC from stdin, writes to stdout
async fn mcp_server(db: Database) {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    loop {
        let request: JsonRpcRequest = read_request(&stdin).await?;
        let response = match request.method.as_str() {
            "initialize" => handle_initialize(),
            "tools/list" => list_tools(),
            "tools/call" => handle_tool_call(&db, request.params).await,
            "resources/list" => list_resources(&db),
            "resources/read" => read_resource(&db, request.params),
            _ => error_response("method not found"),
        };
        write_response(&stdout, response).await?;
    }
}
```

### MCP Resources (Auto-Exposed)

```json
{
    "resources": [
        { "uri": "ogdb://schema", "name": "Graph Schema", "mimeType": "application/json" },
        { "uri": "ogdb://stats", "name": "Database Statistics", "mimeType": "application/json" },
        { "uri": "ogdb://labels", "name": "All Labels", "mimeType": "application/json" },
        { "uri": "ogdb://types", "name": "All Edge Types", "mimeType": "application/json" }
    ]
}
```

---

## 27. Python Bindings (PyO3)

```python
import opengraphdb

# Open database
db = opengraphdb.Database("mydata.ogdb")

# Query
results = db.query("MATCH (n:Person) RETURN n.name, n.age")
for row in results:
    print(row["n.name"], row["n.age"])

# Pandas integration
df = db.query_df("MATCH (n:Person) RETURN n.name, n.age")
# Returns pandas DataFrame directly

# Context manager for transactions
with db.transaction() as tx:
    tx.query("CREATE (n:Person {name: $name})", {"name": "Alice"})
    # Auto-commits on exit, rollbacks on exception

# Import
db.import_csv("people.csv", label="Person")
db.import_ttl("ontology.ttl")
```

Build with `maturin`:
```toml
# pyproject.toml
[build-system]
requires = ["maturin>=1.0"]
build-backend = "maturin"

[project]
name = "opengraphdb"
requires-python = ">=3.8"
```

---

## 28. JavaScript Bindings (NAPI-RS)

```typescript
import { Database } from 'opengraphdb';

const db = new Database('mydata.ogdb');

// Async query
const results = await db.query('MATCH (n:Person) RETURN n');
for (const row of results) {
  console.log(row['n.name']);
}

// Transaction
await db.transaction(async (tx) => {
  await tx.query('CREATE (n:Person {name: $name})', { name: 'Alice' });
});

// Streaming results
for await (const row of db.stream('MATCH (n) RETURN n')) {
  process.stdout.write(JSON.stringify(row) + '\n');
}
```

---

## 29. Error Handling Strategy

### Error Types

```rust
#[derive(thiserror::Error, Debug)]
pub enum OgdbError {
    // Storage errors
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Corrupted page {page_id}: {reason}")]
    CorruptedPage { page_id: u64, reason: String },
    #[error("Database file version {found} not compatible (expected {expected})")]
    IncompatibleVersion { found: u16, expected: u16 },

    // Transaction errors
    #[error("Write conflict: transaction {txn_id} was aborted due to conflict")]
    WriteConflict { txn_id: u64 },
    #[error("Deadlock detected, transaction {txn_id} aborted")]
    Deadlock { txn_id: u64 },
    #[error("Transaction timeout after {ms}ms")]
    TransactionTimeout { ms: u64 },

    // Query errors
    #[error("Syntax error at line {line}, column {col}: {message}")]
    SyntaxError { line: usize, col: usize, message: String },
    #[error("Semantic error: {0}")]
    SemanticError(String),
    #[error("Type error: cannot compare {left} with {right}")]
    TypeError { left: String, right: String },
    #[error("Unknown label: {0}")]
    UnknownLabel(String),
    #[error("Unknown relationship type: {0}")]
    UnknownRelType(String),
    #[error("Constraint violation: {0}")]
    ConstraintViolation(String),

    // Import errors
    #[error("RDF parse error at line {line}: {message}")]
    RdfParseError { line: usize, message: String },
    #[error("CSV parse error at row {row}: {message}")]
    CsvParseError { row: usize, message: String },

    // Resource errors
    #[error("Out of memory: buffer pool full ({size_mb} MiB)")]
    OutOfMemory { size_mb: usize },
    #[error("Database file exceeds maximum size ({size_gb} GiB)")]
    FileSizeExceeded { size_gb: usize },
}
```

### Error Recovery

- **IO errors:** Retry up to 3 times with exponential backoff
- **Corruption:** Attempt WAL recovery. If recovery fails, report page-level corruption with repair hints
- **Write conflicts:** Automatic retry (configurable, default: 3 attempts with random backoff)
- **OOM:** Evict unpinned pages aggressively, downsize batch sizes, fail gracefully

---

## 30. Testing Strategy

### Test Pyramid

```
┌──────────────┐
│  E2E Tests   │  CLI binary tests (assert-cmd), MCP protocol tests
│   (small)    │  Python/JS binding tests
├──────────────┤
│ Integration  │  Cross-crate: query → storage → WAL → recovery
│  (medium)    │  Import pipelines, export round-trips
├──────────────┤
│  Unit Tests  │  Per-module: parser, planner, each operator,
│   (large)    │  buffer pool, WAL, B-tree, HNSW, etc.
└──────────────┘
```

### Key Test Suites

1. **openCypher TCK** (Technology Compatibility Kit): ~500 standardized Cypher tests
2. **Crash recovery tests**: Kill process at random points, verify recovery
3. **Concurrency tests**: Multi-thread stress (loom crate for exhaustive testing)
4. **Fuzz testing**: cargo-fuzz on parser, import pipelines, PackStream codec
5. **Property-based tests**: proptest for storage invariants
6. **RDF round-trip tests**: Import TTL → export TTL → diff (must be semantically identical)
7. **Benchmark regression**: CI blocks on > 10% performance regression

---

## 31. Benchmarking Framework

### Benchmarks (Criterion)

```rust
// benches/traversal_bench.rs
fn bench_single_hop(c: &mut Criterion) {
    let db = setup_ldbc_sf1();  // LDBC Scale Factor 1 (1M nodes, 5M edges)
    c.bench_function("single_hop_expand", |b| {
        b.iter(|| {
            db.query("MATCH (n:Person)-[:KNOWS]->(m) WHERE n.id = $id RETURN m",
                     params! { "id" => 42 })
        })
    });
}
```

### LDBC Benchmark Integration

- Load LDBC Social Network Benchmark dataset (SF1, SF10, SF100)
- Run Interactive workload (14 query types)
- Compare against published results from Neo4j, Memgraph, TigerGraph
- Track results in CI over time

---

## 32. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
      rust: [stable, nightly]
    steps:
      - cargo fmt --check
      - cargo clippy -- -D warnings
      - cargo test --all-crates
      - cargo test --test integration

  fuzz:
    runs-on: ubuntu-latest
    steps:
      - cargo fuzz run parser -- -max_total_time=300

  bench:
    runs-on: ubuntu-latest  # Dedicated runner for consistent numbers
    steps:
      - cargo bench --bench traversal_bench -- --save-baseline current
      - Compare against main branch baseline
      - Fail if > 10% regression

  bindings:
    steps:
      - maturin build --release (Python)
      - npm run build (Node.js)
      - Run binding-specific tests

  release:
    if: tag pushed
    matrix:
      target: [x86_64-linux, aarch64-linux, x86_64-macos, aarch64-macos, x86_64-windows]
    steps:
      - cross build --release --target $target
      - Upload binary to GitHub Release
      - Publish to crates.io, PyPI, npm
```

---

## 33. Logging & Observability

### Logging (tracing crate)

```rust
use tracing::{info, warn, debug, instrument};

#[instrument(skip(db))]
fn execute_query(db: &Database, query: &str) -> Result<QueryResult> {
    info!(query = %query, "Executing query");
    let plan = planner::plan(query)?;
    debug!(?plan, "Query plan generated");
    let result = executor::execute(plan)?;
    info!(rows = result.row_count(), elapsed_ms = ?elapsed, "Query completed");
    Ok(result)
}
```

### Metrics (Pull-Based API, Always Available)

Following SQLite's pattern, OpenGraphDB maintains atomic counters with zero overhead when not accessed:

```rust
/// Metrics collector (owned by Database struct)
pub struct MetricsCollector {
    // Query metrics (AtomicU64)
    queries_executed: AtomicU64,
    queries_failed: AtomicU64,
    query_latency_histogram: RwLock<Histogram>,  // Fixed-bucket histogram

    // Cache metrics
    buffer_pool_hits: AtomicU64,
    buffer_pool_misses: AtomicU64,
    buffer_pool_evictions: AtomicU64,
    buffer_pool_dirty_writes: AtomicU64,

    // Storage metrics
    wal_size_bytes: AtomicU64,

    // Transaction metrics
    transactions_committed: AtomicU64,
    transactions_rolled_back: AtomicU64,
    transactions_active: AtomicU64,

    // Write metrics
    nodes_created: AtomicU64,
    edges_created: AtomicU64,
    properties_set: AtomicU64,
}

/// Snapshot for reading (zero-allocation)
pub struct DbMetrics {
    pub queries_executed: u64,
    pub queries_failed: u64,
    pub query_latency_us: HistogramSnapshot,  // P50, P95, P99

    pub buffer_pool_hits: u64,
    pub buffer_pool_misses: u64,
    pub buffer_pool_evictions: u64,

    pub memory_total: u64,                // From OS via jemalloc stats
    pub memory_buffer_pool: u64,
    pub memory_wal_buffers: u64,

    pub node_count: u64,                  // From catalog
    pub edge_count: u64,
    pub wal_size_bytes: u64,
    pub db_file_size_bytes: u64,

    pub transactions_committed: u64,
    pub transactions_rolled_back: u64,
    pub transactions_active: u64,
}

/// Per-query profiling (opt-in, like EXPLAIN ANALYZE)
pub struct QueryProfile {
    pub total_duration_us: u64,
    pub planning_duration_us: u64,
    pub execution_duration_us: u64,
    pub rows_scanned: u64,
    pub rows_returned: u64,
    pub operators: Vec<OperatorProfile>,  // Tree mirroring physical plan
}

pub struct OperatorProfile {
    pub name: String,           // "NodeScan", "Expand", "VectorScan", etc.
    pub duration_us: u64,
    pub rows_in: u64,
    pub rows_out: u64,
    pub children: Vec<OperatorProfile>,
}

// API surface
impl Database {
    pub fn metrics(&self) -> DbMetrics;
    pub fn query_profiled(&self, query: &str, params: Params) -> Result<(QueryResult, QueryProfile)>;
    pub fn reset_metrics(&self);  // For interval-based monitoring
}
```

**Additional metrics when vector/text are enabled:**
- Vector search latency, distance computations, vectors indexed, index size
- Full-text search latency, query count

### Tracing Integration (OpenTelemetry)

OpenGraphDB uses `tracing` crate for structured logging. Users get free OTel integration by adding `tracing-opentelemetry` as a subscriber layer.

**Instrumented spans:**
- Query parsing, semantic analysis, planning, optimization, execution
- Buffer pool page fetch (hit vs miss)
- WAL write, checkpoint
- Transaction begin/commit/abort
- Per-operator execution (when profiling enabled)

**Metric naming (OTel conventions):**
- `ogdb.query.duration` (histogram, seconds)
- `ogdb.query.count` (counter, status=success|error)
- `ogdb.buffer_pool.hit_ratio` (gauge, 0.0-1.0)
- `ogdb.buffer_pool.pages.used` (gauge)
- `ogdb.storage.size_bytes` (gauge, component=data|wal)
- `ogdb.transactions.count` (counter, status=committed|rolled_back)

### Expose via

- **Rust API**: `db.metrics()` returns `DbMetrics` struct
- **Python API**: `db.metrics()` returns dict
- **CLI**: `ogdb stats mydb.ogdb` (formatted table)
- **Cypher procedure**: `CALL db.metrics()` returns table
- **HTTP endpoint**: `/metrics` (Prometheus format, server mode)
- **OTel export**: Via `tracing-opentelemetry` subscriber (user-installed, zero db dependency)

### Optimization Rules

**Baseline:**

---

## 34. Configuration System

### Hierarchy (lowest to highest priority)

```
1. Compiled defaults
2. Config file: ~/.opengraphdb/config.toml
3. Environment variables: OGDB_BUFFER_POOL_SIZE=256m
4. CLI flags: --buffer-pool-size 256m
5. Per-database settings (stored in catalog)
```

### Config File

```toml
# ~/.opengraphdb/config.toml

[storage]
page_size = 8192              # 4096 | 8192 | 16384 | 32768
buffer_pool_size = "256m"     # Memory for page cache
wal_sync_mode = "fsync"       # "fsync" | "fdatasync" | "none" (dangerous)
checkpoint_interval = 1000    # Transactions between checkpoints
checkpoint_wal_size = "64m"   # Max WAL size before forced checkpoint

[query]
default_limit = 1000          # RETURN without LIMIT caps here
query_timeout = "30s"         # Max query execution time
batch_size = 1024             # Vectorized batch size

[vector]
hnsw_m = 16                   # HNSW connections per layer
hnsw_ef_construction = 200    # Build-time search width
hnsw_ef_search = 50           # Query-time search width

[server]
host = "127.0.0.1"
port = 7687
max_connections = 100
idle_timeout = "30m"

[logging]
level = "info"                # trace | debug | info | warn | error
format = "compact"            # "compact" | "json" | "pretty"
```

---

## 35. Security Model

### Embedded Profile: Minimal

- File permissions are the security boundary (like SQLite)
- No authentication in embedded mode
- No encryption at rest (planned)

### Server Profile: Basic

- Username/password authentication (bcrypt hashed)
- TLS for Bolt and HTTP connections
- Rate limiting on server endpoints

### Enterprise Profile: Advanced

- Role-Based Access Control (RBAC)
- Label-level security (users can only see certain labels)
- Audit logging
- Encryption at rest (AES-256)
- LDAP/SSO integration

---

## 36. Crate Dependency Decisions

| Purpose | Crate | Why |
|---------|-------|-----|
| CLI parsing | `clap` v4 | Industry standard, derive macros |
| Async runtime | `tokio` | Standard for Rust async |
| Serialization | `serde` + `serde_json` | Universal Rust serialization |
| Error handling | `thiserror` (library), `anyhow` (binary) | Idiomatic Rust errors |
| Logging | `tracing` + `tracing-subscriber` | Structured, async-aware logging |
| Cypher parsing | `winnow` | nom's successor: faster, better errors, `cut_err()` for parse commitment |
| REPL | `rustyline` | Readline-compatible, cross-platform |
| RDF parsing | `oxrdfio` (`oxttl`, `oxrdfxml`, `oxjsonld`) | Streaming, lightweight, rio's successor by same author |
| Vector search | `usearch` (C++ FFI) or `hnsw_rs` (pure Rust) | USearch: only lib with mmap + incremental delete + SIMD. Used by ClickHouse/DuckDB |
| Full-text | `tantivy` | Rust-native Lucene equivalent |
| Python bindings | `pyo3` + `maturin` | Standard PyO3 workflow |
| Node.js bindings | `napi-rs` | Standard NAPI workflow |
| Benchmarks | `criterion` | Statistical benchmarking |
| Testing | `proptest`, `loom` | Property-based and concurrency testing |
| Compression | `lz4_flex`, `zstd` | Pure Rust LZ4, ZSTD bindings |
| HTTP server | `axum` | Tokio-native, ergonomic |
| CRC/checksums | `crc32fast` | Hardware-accelerated CRC |
| UUID | `uuid` v1 | For external IDs if needed |
| Crossbeam | `crossbeam` | Lock-free data structures for buffer pool |

---

## 37. Build System & Cross-Compilation

### Workspace Cargo.toml

```toml
[workspace]
members = [
    "crates/ogdb-core",
    "crates/ogdb-query",
    "crates/ogdb-vector",
    "crates/ogdb-text",
    "crates/ogdb-temporal",
    "crates/ogdb-import",
    "crates/ogdb-export",
    "crates/ogdb-server",
    "crates/ogdb-cli",
    "crates/ogdb-python",
    "crates/ogdb-node",
    "crates/ogdb-algorithms",
]
resolver = "2"

[workspace.dependencies]
# Shared versions across all crates
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
thiserror = "2"
tracing = "0.1"
```

### Cross-Compilation Targets

```bash
# Native (development)
cargo build --release

# Linux x86_64 (from macOS)
cross build --release --target x86_64-unknown-linux-gnu

# Linux ARM64 (for Raspberry Pi, AWS Graviton)
cross build --release --target aarch64-unknown-linux-gnu

# Windows
cross build --release --target x86_64-pc-windows-msvc

# Static Linux binary (fully self-contained)
cross build --release --target x86_64-unknown-linux-musl
```

---

## 38. Migration & Upgrade Path

### File Format Versioning

- Major version bump: breaking changes (must migrate)
- Minor version bump: backward-compatible additions
- Migration tool: `ogdb migrate mydb.ogdb --to-version 2`
- Always read old formats, write new format

### From Neo4j

```bash
# Export from Neo4j
neo4j-admin database dump neo4j --to-path=dump/

# Or use Cypher export
CALL apoc.export.csv.all("export.csv", {})

# Import into OpenGraphDB
ogdb import mydb.ogdb --format csv --neo4j-export export.csv
# Or connect directly (future extension):
ogdb migrate --from neo4j://localhost:7687 --to mydb.ogdb
```

---

## 39. Graph Algorithms Library

### Built-in Procedures

```cypher
-- Shortest path (Dijkstra)
CALL algo.shortestPath('Person', 'KNOWS', {source: $from, target: $to, weight: 'cost'})
YIELD path, totalCost

-- PageRank
CALL algo.pageRank('Person', 'KNOWS', {iterations: 20, dampingFactor: 0.85})
YIELD nodeId, score

-- Community detection (Louvain)
CALL algo.louvain('Person', 'KNOWS', {resolution: 1.0})
YIELD nodeId, communityId

-- Connected components
CALL algo.connectedComponents('Person', 'KNOWS')
YIELD nodeId, componentId

-- BFS/DFS traversal
CALL algo.bfs({startNode: $node, maxDepth: 5, labels: ['Person']})
YIELD nodeId, depth

-- Centrality
CALL algo.betweennessCentrality('Person', 'KNOWS')
YIELD nodeId, score
```

---

## 40. Governance & Contribution Model

### Contribution Agreement

**OpenGraphDB uses DCO (Developer Certificate of Origin)**, not a CLA (Contributor License Agreement).

All contributions require a `Signed-off-by:` line in the commit message:
```bash
git commit -s -m "Add feature X

Signed-off-by: Your Name <your@email.com>"
```

**Why DCO over CLA:**
- DCO is low-friction (just a git flag, no separate legal agreement)
- Prevents relicensing (unlike CLAs which grant broad license grants)
- Consistent with Apache 2.0 Section 5 (designed to work with DCO)
- Builds community trust (no power asymmetry between contributors and project)
- Used by Linux kernel, Docker, GitLab, Chef, OpenStack

**What DCO means:**
Contributors certify they have the right to submit the code under the project's license (Apache 2.0). This provides legal protection without granting relicensing rights to any entity.

### Governance Stages

**Current (Maintainer-Led):**
- License: Apache 2.0 (permanent)
- Governance: BDFL (Benevolent Dictator For Life) model with project creator as technical lead
- Contribution: DCO via signed-off commits
- Decision-making: Technical decisions documented in GitHub issues/discussions

**Growth (10+ regular contributors):**
- Add CONTRIBUTING.md with clear guidelines
- Add CODE_OF_CONDUCT.md (Contributor Covenant)
- Technical Steering Committee (TSC) with 3-5 members for architectural decisions
- Good-first-issue labeling for new contributors
- Release cadence formalized (time-based vs feature-based)

**Commercialization (if applicable):**
- Establish non-profit foundation to hold intellectual property (modeled after DuckDB Foundation)
- Foundation statutes must guarantee Apache 2.0 license in perpetuity
- Separate commercial entity for managed cloud service and enterprise support
- Clear separation: non-profit owns the code, commercial entity provides services

**Preventing relicensing (like CockroachDB/Elastic):**
The combination of DCO (not CLA) + Apache 2.0 + eventual non-profit foundation makes relicensing legally impossible. Contributors do not grant broad licenses; they only certify the code is theirs to contribute under Apache 2.0.

---

## 41. Testing & Quality Targets

### openCypher TCK Compliance

OpenGraphDB targets the **openCypher Technology Compatibility Kit (TCK) version 2024.2** for conformance testing.

**Coverage commitments:**

| Commitment | TCK Coverage | Scenarios | Key Categories |
|-----------|-------------|-----------|----------------|
| **Compatibility floor** | **50-55%** | ~400 of ~800 | Tier 1: match, match-where, create, return, return-orderby, return-skip-limit, set, delete, with, with-where, literals, comparison, boolean, null, aggregation |
| **Extended target** | **75-80%** | ~600 | Add Tier 2: merge, unwind, union, string (STARTS WITH, CONTAINS), list ops, map ops, mathematical, typeConversion, conditional (CASE), graph functions |
| **Long-range objective** | **90%+** | ~720+ | Add Tier 3: temporal types, existentialSubqueries (EXISTS), call procedures, path expressions, pattern comprehension. Deferred: quantifier (GQL), precedence edge cases |

**Rationale:** Cypher-for-Gremlin (a translation layer, not native implementation) achieved 76% baseline and 92% with extensions. A native Rust implementation with a 50-55% floor delivers genuine utility while remaining realistic.

**Priority-ranked baseline features:**
- P0: MATCH, CREATE, RETURN, WHERE, literals, SET, DELETE (nothing works without these)
- P1: WITH, ORDER BY, SKIP, LIMIT, aggregation, MERGE, UNWIND, OPTIONAL MATCH, three-valued NULL logic
- Extended set: variable-length paths `[*1..N]`, string predicates, list/map ops, type conversion, CASE, UNION
- Advanced set: shortestPath, pattern comprehension, EXISTS, temporal types, CALL procedures

**Test execution:**
The TCK uses Cucumber `.feature` files. A Rust Cucumber runner will execute these against the OpenGraphDB query engine, comparing actual vs expected results.

---

## 42. Limits & Constraints

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Max file size | 16 TiB | u64 page addressing with 8K pages |
| Max nodes | 2^63 | InternalId is u64 |
| Max edges | 2^63 | InternalId is u64 |
| Max labels per node | 255 | u8 label count per node |
| Max properties per entity | 65535 | u16 property count |
| Max property value size | 256 MiB | Overflow chain limit |
| Max string length | 256 MiB | Same as property value |
| Max vector dimensions | 4096 | HNSW practical limit |
| Max query depth (hops) | 100 | Stack overflow prevention |
| Max concurrent readers | Unlimited | MVCC, no read locks |
| Max concurrent writers | 1 (embedded) / 1000 (server) | Mutex / row locking |
| Max label name length | 255 bytes | UTF-8, u8 length prefix |
| Max relationship type length | 255 bytes | UTF-8, u8 length prefix |
| Max property key length | 255 bytes | UTF-8, u8 length prefix |

---

## Appendix A: Resolved Technical Decisions

All open questions resolved via dedicated research (2026-02-05). Full research reports
saved in `.research/decisions/`.

### Decision 1: Parser Library → **winnow**

**Chosen:** winnow (nom's successor/fork by epage)
**Rejected:** pest (performance ceiling, no error recovery), nom (SurrealDB abandoned it for
stack overflows and poor errors), chumsky (compile-time explosion), LALRPOP (LR(1) conflicts
with Cypher grammar), tree-sitter (wrong tool for DB engine)

**Architecture:** Separate lexer (tokenizer) + parser on token stream. This gives better error
messages and avoids nom's raw-byte parsing pitfalls.

**Key evidence:**
- SurrealDB v1 used nom, abandoned it in v2 for a hand-written parser due to stack overflow
  vulnerabilities, poor error messages, and performance degradation on complex queries
- winnow provides `cut_err()` for committing parse branches (critical for good Cypher error
  messages: "expected pattern after MATCH")
- winnow has unstable `recover` feature for error recovery (reporting multiple errors per parse)
- Matches or exceeds nom performance benchmarks
- Fallback path: if winnow becomes a bottleneck, migrate to hand-written recursive descent
  (winnow combinator structure maps cleanly to recursive descent functions)

### Decision 2: Page I/O → **pread/pwrite** (no mmap)

**Chosen:** Explicit `pread`/`pwrite` with userspace buffer pool
**Rejected:** mmap (including hybrid mmap-read + pwrite-WAL)

**Key evidence:**
- CMU CIDR 2022 paper ("Are You Sure You Want to Use MMAP?"): page table contention,
  single-threaded kernel eviction, TLB shootdowns
- SQLite: uses pread/pwrite by default, mmap is opt-in and capped at 2GB
- DuckDB: custom buffer manager, explicit I/O
- RocksDB: forked from LevelDB specifically to avoid mmap bottlenecks
- Rust's redb: removed mmap backend entirely for soundness (mmap violates Rust's aliasing rules)
- WAL recovery needs `Result<>` error codes, not SIGBUS
- Windows: cannot truncate memory-mapped files (breaks VACUUM/compaction)
- Future optimization: io_uring on Linux for batched async I/O without mmap's problems

### Decision 3: Internal Batch Format → **Own vector format** (DuckDB-style)

**Chosen:** Custom `Vector` type with Flat, Constant, and Dictionary variants
**Rejected:** arrow-rs as internal format (too heavy, prevents compressed execution)

**Architecture:**
- Internal: own vector format with batch size 1024-2048, supporting compressed execution
  (Dictionary, Constant variants avoid decompression during query processing)
- Boundary: Arrow C Data Interface for zero-copy export to Python/Polars/DuckDB
- Optional: `arrow-rs` behind cargo feature flag for direct RecordBatch conversion
- DataFusion: consider as optional analytical query module later (not core engine)

**Key evidence:**
- DuckDB chose own format over Arrow for same reasons: compressed execution, cache optimization,
  multiple physical representations (Flat, Constant, Dictionary, Sequence)
- Arrow is designed for interchange, not query execution with multiple representation modes
- Arrow C Data Interface is a small, stable ABI (~200 lines) that provides interop without
  compile-time dependency on arrow-rs

### Decision 4: RDF Parsing → **oxrdfio** (Oxigraph crates)

**Chosen:** oxrdfio (unified), or individual oxttl + oxrdfxml + oxjsonld
**Rejected:** rio (deprecated Sept 2024 by same author), sophia_rs (heavy deps, CeCILL-B license)

**Architecture:**
- Primary: oxrdfio for TTL, N-Triples, N-Quads, RDF/XML, JSON-LD 1.0
- Fallback: standalone `json-ld` crate (or sophia_jsonld) for JSON-LD 1.1 if needed
- Conversion layer from oxrdf types to OpenGraphDB internal types

**Key evidence:**
- rio carries explicit deprecation notice directing users to oxttl/oxrdfxml
- oxrdfio: streaming, lightweight (~6K SLOC), MIT/Apache-2.0, daily commits
- Same author (Thomas Tanon/Tpt) who wrote rio, so oxrdfio is the official successor
- JSON-LD 1.0 covers most use cases; oxjsonld gaining 1.1 support actively

### Decision 5: WAL File → **Separate file** (`.ogdb-wal`)

**Chosen:** Separate WAL file alongside main database file
**Rationale:** Matches SQLite's proven pattern, simplifies concurrent read/write access,
cleaner checkpoint logic

**File layout:**
```
mydb.ogdb          — Main database file (pages)
mydb.ogdb-wal      — Write-ahead log (sequential)
mydb.ogdb.ftindex/ — Tantivy full-text index (rebuildable artifact by default)
mydb.ogdb.vecindex — USearch vector index file (rebuildable artifact by default)
```

### Decision 6: HNSW Vector Index → **USearch** (primary) / **hnsw_rs** (pure-Rust fallback)

**Chosen:** USearch with C++ FFI (primary), hnsw_rs as pure-Rust alternative
**Rejected:** instant-distance (no incremental inserts), hora (abandoned at v0.1.1),
Qdrant extraction (too tightly coupled), building from scratch (high effort)

**Key evidence:**
- USearch: only library with mmap disk serving + incremental delete + SIMD (AVX2+NEON) +
  filtered search. Used by ClickHouse and DuckDB in production
- `view_from_buffer` enables memory-mapping our own page files into USearch
- C++ core is single header file (3K SLOC), manageable FFI boundary
- hnsw_rs fallback: pure Rust, good SIMD support, would need custom persistence layer (non-trivial extra effort)
- instant-distance: batch-build only, no incremental inserts (dealbreaker for a database)
- hora: abandoned, uses deprecated `packed_simd_2` crate

**Integration:**
- USearch manages its own index file (`mydb.ogdb.vecindex`)
- On startup: `index.view("path")` for mmap without RAM load
- WAL of vector operations for crash recovery
- Feature flag: `--features pure-rust-vector` to use hnsw_rs instead of USearch

### Decision 7: Tantivy Storage → **Subdirectory** (`mydb.ogdb.ftindex/`)

**Chosen:** Tantivy's MmapDirectory in a subdirectory alongside the database file
**Rejected:** Custom Tantivy Directory in page-based store (2-4K lines, high complexity)

**Architecture:**
- Abstract behind an `FTSIndex` trait for future migration
- Use Tantivy's native MmapDirectory for optimal performance
- Crash consistency: WAL journal of FTS operations, replay on recovery if Tantivy and
  main DB are out of sync
- Future path: custom Directory implementation OR Meilisearch approach (own inverted index
  in storage engine) if single-file UX becomes critical

**Key evidence:**
- Custom Tantivy Directory: ~2-4K lines of non-trivial code with subtle atomicity requirements
- LanceDB's tantivy-object-store proves the trait works for non-filesystem backends
- Meilisearch: originally used Tantivy, eventually rewrote their own search engine (milli)
  stored in LMDB. This is the "ultimate" approach but massive effort
- Subdirectory pattern is well-precedented (SQLite WAL uses sidecar files)

---

## Appendix B: Research Sources

All detailed research reports with benchmarks, code examples, and full source lists:

| Topic | Research File |
|-------|--------------|
| Open-source graph DBs | `.research/open-source-graph-dbs.md` |
| Commercial graph DBs | `.research/commercial-graph-dbs.md` |
| AI/Agent integration | `.research/graph-db-ai-integration.md` |
| Architecture & performance | `.research/graph-db-architecture.md` |
| Market gaps | `.research/market-gaps.md` |
