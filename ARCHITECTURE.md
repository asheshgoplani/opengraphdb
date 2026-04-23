# OpenGraphDB Architecture Baseline

This document is the canonical source of architecture decisions for this repository.

If any other document conflicts with this file, this file wins.

## 1. Product Objective

OpenGraphDB is designed for:

- Extremely fast interactive traversal from CLI and embedded API
- Low operational overhead (single binary, embeddable by default)
- Stable, recoverable storage
- AI-friendly usage (Cypher + MCP + structured exports)

## 2. Non-Negotiable Engineering Constraints

- No JVM/GC dependency in the core engine
- Graph-native storage, not graph-over-relational
- Explicit I/O via `pread`/`pwrite` (no mmap fallback in the core path)
- Snapshot-isolated transactions with durable WAL
- Traversal-first performance profile: optimize for short-hop and multi-hop neighborhood reads
- CLI must be first-class, scriptable, and low-latency

## 3. Core Data Model

- Property graph:
  - Multi-label nodes
  - Typed directed edges with properties
  - Typed scalar/collection/temporal/vector values
- RDF/OWL/RDFS are supported as import/export and schema-interoperability mechanisms, not as the primary query runtime.
- Primary query language is Cypher/openCypher.

## 4. Storage Architecture (Authoritative)

### 4.1 Node Layout

- Canonical node property store is the single source of truth.
- Label membership index uses Roaring bitmaps.
- Per-label projections keep:
  - `_id`
  - `_row` back-pointer into canonical store
  - `_csr_offset` for fast edge expansion joins

This avoids multi-location property updates and keeps label filtering fast.

### 4.2 Edge Layout

- Double CSR (forward and reverse) per edge type.
- Delta buffers absorb updates.
- Background compaction merges delta into CSR.
- Compaction is threshold-triggered (`DELTA_COMPACTION_EDGE_THRESHOLD`) and runs asynchronously to avoid foreground read stalls.

### 4.3 Write/Read Tradeoff Policy

- Baseline design is CSR + delta.
- Current decision (2026-02-18): keep CSR + delta as the active default.
- Architecture evolution is benchmark-gated, not schedule-gated.
- Keep CSR + delta when all of the following stay true on representative workloads:
  - Write share is <= 10% of operations.
  - Compaction stall p95 is <= 50 ms.
  - Traversal p95 under mixed load stays within 20% of read-only baseline.
- Reconsider hybrid hot-write + compacted-CSR when one or more conditions are sustained across repeated benchmark runs:
  - Write share is > 30% of operations.
  - Compaction stall p95 is > 200 ms.
  - Traversal p95 regression exceeds 30% under mixed load.
- These thresholds are default guardrails and can be tightened or relaxed only through a benchmark-backed architecture decision record.
- Any hybrid evolution must preserve query/runtime contracts and keep CSR as the compacted read format.

## 5. File and Durability Model

Authoritative state:

- `mydb.ogdb-wal` (WAL sidecar) — fsynced at commit; sole durability barrier for committed transactions
- `mydb.ogdb` (main data file, header + edge records) — written at commit, fsynced opportunistically; recoverable from WAL
- `mydb.ogdb-props` (node property data pages) — written at commit, fsynced opportunistically; recoverable from WAL

Commit-time persistence matrix (post-`fix-write-perf`, 2026-04-19):

| File                                  | Persistence                                                                 | Recovery source on crash            |
|---------------------------------------|-----------------------------------------------------------------------------|-------------------------------------|
| `mydb.ogdb-wal`                       | `fdatasync` at commit (write-ahead)                                         | N/A — durability barrier itself     |
| `mydb.ogdb` (header + edge pages)     | Write-only at commit (no fsync); fsync at `Database::checkpoint`            | WAL replay rebuilds header/edge state |
| `mydb.ogdb-props` (row pages)         | Write-only at commit (no fsync); fsync at `Database::checkpoint`            | WAL replay re-allocates rows        |
| `mydb.ogdb-meta.json`                 | Write-only at commit boundary (no fsync); was per-op pre-fix                | Rebuildable from WAL replay (node ids only; labels/props best-effort) |
| `mydb.ogdb-props-meta.json`           | Write-only at commit boundary (no fsync); was per-op pre-fix                | Rebuildable from WAL replay         |
| `mydb.ogdb-props-free-list.json`      | Write-only at commit boundary (no fsync) when dirty                         | Rebuildable from props file scan    |
| `mydb.ogdb-csr.json`                  | Written at checkpoint                                                       | Rebuildable from edge pages         |

Derived/rebuildable state (no on-disk durability requirement):

- `mydb.ogdb.vecindex` (vector index) — refreshed opportunistically at commit, rebuildable from node data
- `mydb.ogdb.ftindex/` (full-text index) — rebuildable from node data

Rules:

- `mydb.ogdb-wal` is the **only** commit-time durability barrier. All other on-disk state reflects post-commit kernel-page-cache writes whose bytes are reconstructible from the WAL on next open.
- A graceful close (`drop Database`) followed by `Database::open` in the same OS session observes committed labels, properties, edge metadata, and row mappings because the Linux page cache is coherent across processes on the same filesystem.
- A **hard power failure** that wipes the kernel page cache before writeback is recoverable from the WAL alone. The v2 create-node record (`WAL_RECORD_CREATE_NODE_V2 = 3`, shipped in commit `5afc9e5`) carries the committing transaction's labels and properties inline alongside the node identifier. On commit, `upgrade_wal_buffer_to_v2` rewrites any staged v1 create-node records into v2 form before the single `fdatasync`, so the durable WAL segment is self-describing. On next open, `replay_wal_create_node_v2` reconstructs labels and properties directly from the WAL — even if every sidecar JSON (`ogdb-meta.json`, `ogdb-props-meta.json`, `ogdb-props-free-list.json`) and the props-row pages are missing or stale. This closes the prior gap where hard power loss between commits could drop labels/properties committed since the last `Database::checkpoint`; node/edge existence, counts, labels, and properties are now all recoverable via WAL replay. The regression is pinned by `crates/ogdb-core/tests/wal_v2_recovers_labels_and_props_after_sidecar_loss.rs`. `Database::checkpoint` remains a useful hint for truncating the WAL and shrinking replay time, but is no longer required for full committed-state durability after hard power loss.
- Vector and FTS artifacts are rebuildable from graph state.
- Backup semantics are checkpoint + copy of main DB (plus optional sidecar copy/rebuild).

## 6. Concurrency and Transactions

- MVCC with snapshot isolation.
- Single-writer mutex in embedded mode.
- Multi-reader concurrency with snapshot visibility.
- Required abstraction hooks are part of the design now:
  - `Snapshot::can_see_version(...)`
  - lock manager interface boundary
  - per-transaction undo ownership
  - version GC tied to checkpoint
  - transaction timeout controls

## 7. Query Engine

- Parser: winnow lexer + parser.
- Planner: logical + physical plans with cost model.
- Execution: vectorized, push-based batches.
- Hybrid graph/vector/text queries are modeled as first-class operators, not procedural side calls.

## 8. CLI and API Contract

The CLI is a primary interface, not an afterthought.

Required commands:

- `init`, `query`, `shell`
- `import`, `export`
- `backup`, `checkpoint`
- `schema`, `info`, `stats`
- `mcp`, `serve`

Required properties:

- Stream-friendly output formats (`table`, `json`, `jsonl`, `csv`, `tsv`)
- Deterministic exit codes
- Low startup and query overhead for repeated automation loops

## 9. AI Integration Contract

- MCP support is a first-class interface.
- Query tooling must expose:
  - schema introspection
  - query execution
  - neighborhood/subgraph extraction
  - vector/text retrieval hooks where configured
- CLI JSON output and MCP payloads must be stable enough for agent automation.

## 10. Observability Contract

- Pull-based metrics via `db.metrics()`.
- Opt-in query profiling via `db.query_profiled(...)`.
- `tracing` instrumentation on parser/planner/executor/storage/WAL paths.
- Metrics naming follows OTel conventions.

## 11. Quality Gates

Architecture is considered stable only if all gates pass:

- Cypher compatibility gate: openCypher TCK floor at 50-55% with full Tier-1 categories
- Durability gate: crash-recovery and checkpoint-copy correctness tests
- Traversal latency gate:
  - single-hop p95 under target
  - 3-hop expansion p95 under target
- Storage-evolution gate:
  - if write-heavy trigger thresholds are crossed, log an architecture decision record to keep CSR + delta or pivot to hybrid
- Import correctness gate: RDF round-trip URI fidelity
- CLI automation gate: deterministic output and non-interactive scriptability

## 12. Dependency Choices (Locked)

- Cypher parsing: `winnow`
- RDF parsing: `oxrdfio`/Oxigraph family
- Full-text: `tantivy`
- Vector ANN: `usearch` primary, pure-Rust fallback supported
- Telemetry: `tracing`
- CLI: `clap`, `rustyline`

## 13. Scope Without Schedule Buckets

This architecture uses capability tiers, not date-based promises:

- Core required capabilities:
  - storage, WAL, MVCC, Cypher traversal/query, CLI, import/export, metrics
- Extended integrated capabilities:
  - vector search, full-text search, MCP/serve interfaces, temporal features, protocol compatibility
- Production hardening capabilities:
  - replication, online backup APIs, advanced security/governance controls

All capabilities can evolve, but core contracts above must not regress.
