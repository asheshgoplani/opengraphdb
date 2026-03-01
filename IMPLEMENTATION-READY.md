# OpenGraphDB: Architecture Execution Baseline

**Status as of:** 2026-02-18
**Implementation status:** Ready to execute
**Canonical source:** `ARCHITECTURE.md`

This document intentionally avoids schedule planning. It defines what must be true before implementation is considered architecture-stable.

## 1. Decision Stability

The following decisions are locked unless benchmark evidence or correctness evidence proves otherwise:

| # | Area | Locked Decision |
|---|------|------------------|
| 1 | Storage model | Canonical node store + label bitmaps + projections, double CSR + delta buffers |
| 2 | I/O path | `pread`/`pwrite` only in the core engine |
| 3 | File authority | `.ogdb` + `.ogdb-wal` authoritative; vector/FTS artifacts rebuildable |
| 4 | Query language | Cypher/openCypher as primary interface |
| 5 | Parser | `winnow` lexer + parser |
| 6 | Concurrency | MVCC snapshot isolation + single-writer embedded mode |
| 7 | RDF bridge | `oxrdfio`/Oxigraph pipeline with URI-preserving round-trip |
| 8 | Observability | Pull metrics + profiled query API + tracing spans |
| 9 | Backup | Checkpoint + copy semantics |
| 10 | Compliance floor | openCypher TCK floor 50-55% with Tier-1 categories covered |

## 2. Required Capability Baseline

Implementation is not architecture-complete until all capabilities below are present and tested.

### Storage and Durability
- Page-based file layout with stable headers and page types
- Free list and allocator
- WAL write protocol and recovery protocol
- Checkpoint implementation
- Forward + reverse CSR traversal path
- Delta compaction path

### Query and Execution
- Cypher parsing to AST
- Semantic resolution against catalog
- Logical and physical plan generation
- Vectorized execution operators for core traversal/query set
- Deterministic CLI result rendering for script usage

### Data Interop
- CSV/JSON import/export
- RDF import/export with URI fidelity
- Ontology extraction bridge (classes/properties/hierarchy metadata)

### Operability
- `db.metrics()` and `query_profiled()`
- CLI `info`, `stats`, `checkpoint`, `backup`
- Crash test harness and recovery assertions

### AI Access
- Stable machine-readable query output (`json`/`jsonl`)
- MCP server adapter over the same query/runtime contracts

## 3. Performance and Correctness Gates

All gates are mandatory.

### Correctness Gates
- Recovery after forced crash during write transaction preserves atomicity and durability
- Backup copy restores to query-equivalent state
- RDF round-trip preserves `_uri` and prefix mapping semantics
- TCK gate meets floor with full Tier-1 category coverage

### Performance Gates
- Single-hop traversal p95 under target
- Three-hop neighborhood expansion p95 under target
- Bulk import throughput under representative dataset meets target envelope
- CLI one-shot query path remains low-overhead under repeated invocation
- Benchmark profiles must include:
  - Read-dominant profile (95/5 read/write)
  - Mixed profile (80/20 read/write)
  - Write-stress profile (70/30 read/write)

Reference benchmark command (synthetic pre-implementation harness):

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-bench
```

Latest benchmark outcome (2026-02-18):
- Synthetic harness does not cross hybrid pivot thresholds.
- Decision remains: CSR + delta default, hybrid path stays benchmark-triggered.

### Stability Gates
- No known design contradictions between `ARCHITECTURE.md`, `SPEC.md`, `DESIGN.md`, and `CLAUDE.md`
- No dependency or crate architecture cycles

## 4. Benchmark-Based Evolution Policy

The architecture can evolve, but only through measured triggers.

- Keep CSR + delta as default.
- Keep CSR + delta when:
  - write share is <= 10% of operations
  - compaction stall p95 is <= 50 ms
  - traversal p95 under mixed load remains within 20% of read-only baseline
- Revisit hybrid hot-write layouts when repeated benchmark runs show:
  - write share > 30% of operations, or
  - compaction stall p95 > 200 ms, or
  - traversal p95 regression > 30% under mixed load
- Treat these thresholds as default guardrails; change only with benchmark evidence and recorded architecture decision.
- Keep vector/FTS as rebuildable artifacts until embedded variants meet crash-consistency and rebuild-time acceptance criteria.

## 5. Repository Hygiene Requirements

- Remove local-only references (e.g., `/private/tmp/...`) from project docs
- Keep one canonical architecture source (`ARCHITECTURE.md`)
- Keep implementation docs decision-focused, not schedule-focused

## 6. Immediate Execution Checklist

- [x] Architecture decisions documented and locked
- [x] Contradictions identified
- [x] Canonical architecture source created
- [x] `SPEC.md` aligned with canonical decisions
- [x] `DESIGN.md` aligned for known contradictions (I/O, RDF parser path, sidecar authority)
- [x] Workspace scaffolding created
- [x] Core test and benchmark harness scaffolding created (`crates/ogdb-bench`)
- [x] Initial storage decision benchmark run captured (`BENCHMARKS.md`)
- [x] TDD method and implementation log established (`docs/TDD-METHODOLOGY.md`, `docs/IMPLEMENTATION-LOG.md`)
- [x] Versioning policy established (`docs/VERSIONING.md`, workspace package version source)
- [x] Canonical changelog established and wired into test workflow (`CHANGELOG.md`, `scripts/changelog-check.sh`)
