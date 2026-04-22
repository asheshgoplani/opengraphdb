# CLAUDE.md

This file provides implementation guidance for contributors working in this repository.

## Project Status

OpenGraphDB is implemented and test-gated at v0.2: core engine, Cypher, import/export, RDF, vector/FTS, server adapters (Bolt/HTTP/gRPC), MCP, and language bindings are all in place. The architecture baseline remains canonical and is documented in `ARCHITECTURE.md`.

Authoritative document order:
1. `ARCHITECTURE.md` (canonical decisions)
2. `DESIGN.md` (byte-level and subsystem design)
3. `SPEC.md` (product and interface specification)
4. `IMPLEMENTATION-READY.md` (execution checklist)

If there is a conflict, `ARCHITECTURE.md` wins.

## Workspace Setup

```bash
# Build
cargo build

# Test
cargo test

# TCK
cargo test -p ogdb-tck

# Benchmarks
cargo run --release -p ogdb-bench

# Static checks
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo fmt --all
```

## Crate Layout

Current workspace has 10 crates. `ogdb-core` is intentionally a single ~41k-line library that contains storage, WAL, MVCC, indexes, catalog, Cypher parser/planner/executor, import/export, RDF, vector, full-text, temporal, and algorithms. Splitting `ogdb-core` into focused subcrates (`ogdb-query`, `ogdb-import`, `ogdb-export`, `ogdb-vector`, `ogdb-text`, `ogdb-temporal`, `ogdb-algorithms`) is on the roadmap but has not happened yet — until it does, the layered dependency direction below is an in-code convention within `ogdb-core`, not a crate boundary.

```
ogdb-core        ← storage, WAL, MVCC, indexes, catalog, Cypher, import/export,
                   RDF, vector, full-text, temporal, algorithms (monolith)
ogdb-bolt        ← Bolt protocol server adapter over ogdb-core
ogdb-cli         ← CLI binary (also exposes `ogdb serve` + MCP adapter)
ogdb-ffi         ← C FFI shim over ogdb-core + ogdb-cli
ogdb-python      ← PyO3 bindings
ogdb-node        ← napi-rs bindings
ogdb-tck         ← cucumber-backed openCypher TCK harness
ogdb-bench       ← traversal/import benchmark harness + budget gates
ogdb-eval        ← evaluator harness (closed-loop benchmark + scaling + UI measurement)
ogdb-e2e         ← end-to-end integration test crate
```

Lower layers must not depend on upper layers. When splitting `ogdb-core` eventually happens, the split targets are: `ogdb-query` (Cypher lexer/parser/planner/optimizer/executor), `ogdb-import` (CSV/JSON/RDF import), `ogdb-export` (JSON/CSV/RDF/Cypher export), `ogdb-vector`, `ogdb-text`, `ogdb-temporal`, `ogdb-algorithms`, and an `ogdb-server` housing Bolt/HTTP/MCP adapters (currently split across `ogdb-bolt` and code inside `ogdb-cli`).

## Locked Architecture Decisions

| Decision | Choice |
|----------|--------|
| Storage layout | Canonical node store + label bitmaps + projections, double CSR edges + delta buffers |
| I/O model | `pread`/`pwrite` only in core execution path |
| File model | `mydb.ogdb` + `mydb.ogdb-wal` are authoritative; vector/FTS artifacts are rebuildable |
| Parser | `winnow` lexer + parser |
| Query language | Cypher/openCypher primary; GQL compatibility evolves without breaking Cypher |
| Concurrency | MVCC snapshot isolation + single-writer mutex in embedded mode |
| RDF | `oxrdfio`/Oxigraph-based import/export bridge |
| Observability | Pull metrics + profiled query API + `tracing` instrumentation |
| Backup | Checkpoint + file copy semantics |
| TCK floor | 50-55% with full Tier-1 coverage categories |

## Implementation Priorities

1. Storage correctness and recovery correctness
2. Traversal latency for CLI and embedded query loops
3. Cypher parser/planner/executor correctness
4. Import/export fidelity (especially RDF URI round-trip)
5. Operational visibility (`metrics`, profiling, tracing)
6. AI access surfaces (MCP + stable machine-readable outputs)

## Required Engineering Patterns

### Storage
- Always maintain forward and reverse CSR.
- Keep node properties single-write-path via canonical store.
- Treat delta compaction as mandatory, not optional.

### Transactions
- Keep visibility checks behind `Snapshot::can_see_version(...)` abstraction.
- Keep lock manager behind a trait boundary.
- Use per-transaction undo ownership.
- Tie version GC to checkpoint and active transaction floor.

### Query
- Keep vector/text operations as composable operators in planning/execution.
- Avoid procedure-style vector/text query paths in core planner.

### RDF
- Preserve source URIs (`_uri`) for round-trip fidelity.
- Keep ontology conversion deterministic and schema-visible.

## Dependencies

| Crate | Purpose |
|-------|---------|
| `winnow` | Cypher lexer + parser |
| `tokio` | async runtime |
| `serde`/`serde_json` | serialization |
| `oxrdfio` (+ Oxigraph family) | RDF parsing/conversion |
| `tantivy` | full-text index |
| `usearch` | ANN vector index |
| `roaring` | label membership bitmaps |
| `tracing` + `tracing-subscriber` | logging + tracing |
| `clap` | CLI parsing |
| `rustyline` | REPL |
| `criterion` | benchmarks |
| `cucumber` | TCK execution |
| `pyo3` | Python bindings |
| `napi-rs` | Node bindings |

## Testing Expectations

- Unit tests per module
- Integration tests across storage/query/import boundaries
- openCypher TCK harness checks
- Crash/recovery fault-path tests
- Traversal and import benchmark regression checks
