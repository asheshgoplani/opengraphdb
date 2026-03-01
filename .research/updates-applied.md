# Documentation Updates Applied

**Date:** 2026-02-16
**Based on:** Research findings from 10 parallel agents analyzing all 12 open decision points

---

## Files Updated

1. ✅ **SPEC.md** - Product specification updated with research-backed decisions
2. ✅ **DESIGN.md** - Engineering design updated with detailed implementations
3. ✅ **`.research/open-decisions-recommendations.md`** - Comprehensive synthesis created

---

## SPEC.md Changes

### Core Principles (Section 2)
- **UPDATED:** Query language description from "Cypher and GQL (ISO) support" to "Cypher (openCypher) with planned GQL conformance, following the openCypher-to-GQL evolution path"
- **Rationale:** GQL has zero LLM training data, no Text2GQL tooling exists, Neo4j incomplete after 2 years. Cypher-first is correct.

### Storage Engine (Section 4.2)
- **UPDATED:** "LSM-tree hybrid (LSMGraph approach)" → "Columnar CSR + delta buffer"
- **Rationale:** CSR + delta is proven (KuzuDB), 2x faster to implement (4-5 mo vs 8-12 mo), perfect for AI workloads (bursty write → read-heavy). LSMGraph is impressive academically but untested in production.

### Query Engine (Section 4.3)
- **UPDATED:** Parser from "Custom PEG parser" → "winnow combinator parser"
- **UPDATED:** Query language from "Cypher + GQL" → "Cypher (openCypher)" with note about LLM training data and MCP ecosystem
- **Rationale:** Matches DESIGN.md, winnow is extensible for GQL features in Phase 2/3

### Phase 1 Deliverables (Section 11)
- **ADDED:** Specific TCK coverage target (50-55%, ~400 scenarios)
- **ADDED:** Tier 1 categories detailed (match, create, return, where, set, delete, with, aggregation, etc.)
- **ADDED:** Observability: pull-based metrics API, query profiling, tracing spans
- **ADDED:** Import strategy: all-or-nothing bulk + streaming with batch commits (1000 triples/batch)
- **ADDED:** CLI commands: backup, checkpoint, stats
- **UPDATED:** Core deliverables now explicitly mention batch commit strategy

### Phase 2 Deliverables (Section 11)
- **ADDED:** USearch embedded into page storage (not sidecar)
- **ADDED:** Tantivy as rebuildable sidecar initially
- **ADDED:** VectorScan and TextSearch as first-class operators
- **ADDED:** Bitmap pre-filter propagation
- **ADDED:** IntersectIds operator
- **ADDED:** Basic cost estimation for hybrid queries
- **ADDED:** GQL keyword aliases (INSERT for CREATE, FOR for UNWIND)
- **ADDED:** File-level import tracking (Virtuoso-style)
- **ADDED:** Backup with compaction

### Phase 3 Deliverables (Section 11)
- **ADDED:** Advanced hybrid optimization (adaptive strategy selection, score fusion)
- **ADDED:** Embed Tantivy OR switch to built-in inverted index
- **ADDED:** Full GQL features (quantified patterns, FILTER/LET, WHEN/ELSE)
- **ADDED:** TCK coverage target: 75-80% (~600 scenarios)
- **ADDED:** Temporal support (AT TIME clause, bi-temporal model)

### Phase 4 Deliverables (Section 11)
- **ADDED:** Full GQL conformance (session/transaction mgmt, graph expressions, schema reference)
- **ADDED:** TCK coverage target: 90%+ (~720 scenarios)
- **ADDED:** Technical Steering Committee (TSC) governance
- **ADDED:** Prometheus metrics endpoint (server mode)
- **ADDED:** Online backup API (SQLite-style page-by-page)

### NEW Section 7: Observability & Metrics
- **ADDED:** Pull-based metrics API design (DbMetrics struct)
- **ADDED:** Per-query profiling (query_profiled() method)
- **ADDED:** OpenTelemetry integration via tracing crate
- **ADDED:** Core metrics for Phase 1 (queries, cache, memory, storage, transactions)
- **ADDED:** Phase 2 additions (vector search metrics, text search metrics)
- **ADDED:** Metric naming following OTel conventions

### NEW Section 8: Quality & Conformance Targets
- **ADDED:** openCypher TCK compliance targets by phase
- **ADDED:** Scenario count estimates and category breakdown
- **ADDED:** Priority-ranked feature list (P0/P1/P2/P3)
- **ADDED:** Rationale based on Cypher-for-Gremlin baseline (76%)
- **ADDED:** Backup & recovery strategy
- **ADDED:** Checkpoint + file copy implementation details
- **ADDED:** Logical backup via export

### CLI Commands (Section 6)
- **ADDED:** `opengraphdb backup` command
- **ADDED:** `opengraphdb checkpoint` command
- **ADDED:** `--continue-on-error` flag for import

---

## DESIGN.md Changes

### Node Storage - Multi-Label Architecture (Section 3)
- **REPLACED:** "Duplicate storage" approach
- **NEW:** Hybrid architecture with three layers:
  1. Canonical Property Store (global, one copy of all properties)
  2. Label Membership Indexes (Roaring bitmaps per label)
  3. Per-Label Sorted Projections (_id, _row, _csr_offset)
- **Benefits:** Atomic updates (single write location), no property duplication, fast multi-label queries via bitmap AND, cheap label add/remove
- **Rationale:** Solves critical atomic update problem from duplicate storage, proven by GraphAr (60.5x speedup), Roaring bitmaps battle-tested

### AST Types (Section 10)
- **ADDED:** `#[non_exhaustive]` on Statement and QueryClause enums
- **ADDED:** `temporal: Option<TemporalClause>` field in Match clause (always None in Phase 1)
- **ADDED:** TemporalClause enum definition (documented for Phase 3 planning)
- **ADDED:** Derive traits and visibility modifiers
- **Rationale:** Forward-compatible design, adding temporal in Phase 3 is non-breaking

### Logical Operators (Section 11)
- **ADDED:** VectorSearch logical operator (Phase 2)
- **ADDED:** TextSearch logical operator (Phase 2)
- **ADDED:** Fields: index_name, query_expr, k/limit, score_alias
- **Rationale:** Enables query planner to reason about vector/text as first-class operations

### Physical Operators (Section 11 - NEW)
- **ADDED:** Complete PhysicalOp enum with hybrid query support
- **ADDED:** VectorScan physical operator (implements Volcano iterator)
- **ADDED:** TextSearch physical operator
- **ADDED:** IntersectIds operator (for combining index results)
- **ADDED:** MapScore operator (avoids redundant distance computation, CHASE pattern)
- **ADDED:** Example query plans showing hybrid execution strategies
- **ADDED:** Design decisions: composable operators, scores as columns, pre-filter bitmaps, relaxed monotonicity
- **Rationale:** Based on VBase (Microsoft OSDI 2023), CHASE (Jan 2025), TigerVector (SIGMOD 2025) research

### Optimization Rules (Section 11)
- **ADDED:** Phase 2 rules: hybrid index ordering, bitmap pre-filter propagation, IntersectIds for parallel indexes
- **ADDED:** Phase 3 rules: adaptive strategy selection, score fusion
- **Rationale:** Planner-driven strategy selection essential (per Amanbayev 2025 paper on pgvector failures)

### Cost Model (Section 11)
- **ADDED:** cost_vector_scan() function with SIMD factors and 1% selectivity threshold
- **ADDED:** cost_text_search() function with posting list estimates
- **ADDED:** cost_graph_expand() function with fanout estimation
- **ADDED:** TableStats extensions for vector_index_size, vector_dimensionality, text_doc_count, text_avg_posting_len
- **Rationale:** Vector operations are CPU-bound (not I/O), different cost profile than relational ops

### Logging & Observability (Section 33)
- **REPLACED:** Basic metrics list
- **NEW:** Complete metrics architecture:
  - MetricsCollector with atomic counters
  - DbMetrics snapshot struct
  - QueryProfile for per-query profiling
  - VectorMetrics and TextMetrics (Phase 2)
  - Tracing span instrumentation points
  - OTel metric naming conventions
  - API surface: metrics(), query_profiled(), reset_metrics()
- **Rationale:** SQLite pattern (pull-based) + DuckDB pattern (profiling tree) + RocksDB pattern (extensible)

### CLI Architecture (Section 23)
- **ADDED:** Backup command enum variant
- **ADDED:** Checkpoint command enum variant
- **ADDED:** --continue-on-error flag for Import
- **ADDED:** Backup command implementation (checkpoint + file copy)
- **ADDED:** Checkpoint command implementation
- **ADDED:** User guidance on safe file copying
- **Rationale:** SQLite backup pattern proven for 20+ years, user expectations match

### NEW Section 40: Governance & Contribution Model
- **ADDED:** DCO vs CLA explanation
- **ADDED:** Governance phases (BDFL → TSC → non-profit foundation)
- **ADDED:** Why DCO prevents relicensing (unlike CockroachDB)
- **ADDED:** Foundation model (DuckDB Foundation as reference)
- **Rationale:** Apache 2.0 positioning requires structural commitment, DCO enforces this

### NEW Section 41: Testing & Quality Targets
- **ADDED:** openCypher TCK version (2024.2)
- **ADDED:** Coverage targets by phase (50-55% → 75-80% → 90%+)
- **ADDED:** Scenario count estimates
- **ADDED:** Category breakdown (Tier 1/2/3)
- **ADDED:** Priority-ranked features (P0/P1/P2/P3)
- **ADDED:** Test execution plan (Cucumber runner)
- **Rationale:** Sets realistic, measurable quality bar based on competitor analysis

---

## Key Architectural Decisions Finalized

| Decision | Previous State | New State | Source |
|----------|---------------|-----------|--------|
| **Storage engine** | LSM-tree hybrid | CSR + delta buffer | Agent a1d70c3 |
| **Query language** | Cypher + GQL | Cypher-only Phase 1, GQL incremental | Agent a48a712 |
| **Multi-label storage** | Duplicate per-label | Hybrid (canonical + bitmaps + projections) | Agent a31c448 |
| **Hybrid query planning** | Not specified | VectorScan/TextSearch as first-class operators | Agent a1eede6 |
| **Import resumability** | Not specified | All-or-nothing, file-level tracking Phase 2 | Agent a11f23e |
| **Temporal AST** | Not specified | Optional field + #[non_exhaustive], parse Phase 3 | Agent a05bde9 |
| **Observability** | Basic metrics list | Pull-based API + profiling + tracing | Agent a710f5f |
| **Backup strategy** | Not specified | Checkpoint + file copy Phase 1 | Agent aa95317 |
| **TCK coverage** | Not specified | 50-55% Phase 1 target | Agent aa95317 |
| **Governance** | Not specified | DCO + Apache 2.0 + phased model | Agent a05bde9 |
| **Single-file strategy** | Single-file + WAL | Rebuildable sidecars → embed USearch → embed Tantivy | Agent adef20a |
| **Naming** | OpenGraphDB | Kept per user preference (research flagged SEO risk) | Agent a1e2f99 |

---

## What's Now Documented

### In SPEC.md
✅ Cypher-first strategy with GQL roadmap
✅ CSR + delta buffer storage engine
✅ Phase-specific deliverables with concrete targets
✅ TCK coverage targets by phase
✅ Observability and metrics overview
✅ Backup and recovery strategy
✅ Quality targets and conformance goals

### In DESIGN.md
✅ Multi-label hybrid architecture (canonical store + bitmaps + projections)
✅ AST with #[non_exhaustive] and temporal placeholder
✅ Physical operators for hybrid queries (VectorScan, TextSearch, IntersectIds, MapScore)
✅ Logical operators with VectorSearch and TextSearch
✅ Extended cost model with vector/text cost functions
✅ Optimization rules for hybrid query planning
✅ Complete metrics architecture (pull-based + profiling + tracing)
✅ Backup and checkpoint command implementations
✅ Governance model (DCO + phased evolution)
✅ Testing strategy with TCK coverage targets

### In .research/ Directory
✅ `open-decisions-recommendations.md` - Comprehensive synthesis of all research
✅ 10 full research agent reports with all sources and benchmarks
✅ `updates-applied.md` - This document tracking what changed

---

## Implementation Readiness

**Can create detailed implementation plan:** ✅ YES

All 12 open decision points are now resolved with research-backed recommendations. The project has:

1. **Clear architectural decisions:** Storage engine, query language, multi-label handling, hybrid query planning all specified
2. **Phased roadmap:** What gets built when, with realistic effort estimates
3. **Quality targets:** Measurable TCK coverage goals per phase
4. **Technical depth:** Byte layouts, operator models, cost functions, AST design all documented
5. **Governance clarity:** DCO + Apache 2.0 with evolution path to foundation

**Estimated Phase 1 timeline:** 6-9 months (storage + parser + query engine + import + metrics + backup)

**LOC estimate Phase 1:** ~42,000 lines of Rust

**Risk level:** LOW - All major decisions use proven patterns (KuzuDB's CSR, SQLite's backup, DuckDB's optimizer, VBase's operator model)

---

## Notable Research Findings Incorporated

### From Academic Papers (2024-2025)
- **LSMGraph (SIGMOD 2025):** Impressive but deferred to Phase 3+ evolution target
- **BACH (VLDB 2025):** Adjacency list → CSR elastic merge noted as upgrade path
- **VBase (Microsoft OSDI 2023):** Relaxed monotonicity for vector operators
- **CHASE (Jan 2025):** Semantic analysis + MapScore operator pattern
- **TigerVector (SIGMOD 2025):** Bitmap pre-filters + composable functions
- **ACORN (SIGMOD 2024):** Filterable HNSW with two-hop expansion
- **Amanbayev et al. (2025):** IVFFlat vs HNSW selectivity thresholds, pgvector optimizer failures

### From Production Systems
- **SQLite:** Pull-based metrics (3-tier API), checkpoint + file copy backup, WAL sidecar pattern
- **DuckDB:** Query profiling tree, extensible PEG parsers (CIDR 2025), filter pushdown
- **Neo4j:** Cypher versioning (CYPHER 25 prefix), execution plan operators, GQL conformance roadmap
- **KuzuDB:** Columnar + CSR + delta buffer validation, multi-label gaps, storage format stability critical
- **Virtuoso:** File-level import tracking (load_list table)
- **GraphAr:** Binary columns with RLE encoding for multi-label (60.5x speedup)

### From Community
- **"SQLite of graph databases"** requests confirm embeddable + single-file is essential
- **Text2Cypher vs Text2GQL:** GPT-4o scores 0.8017 on Cypher, zero GQL datasets exist
- **MCP ecosystem:** 100% Cypher-based (Neo4j MCP, FalkorDB, Hypermode, community servers)
- **KuzuDB abandonment:** Storage format instability was critical failure, 70% of complaints

---

## Next Steps

With all decisions finalized and documented:

1. **Create detailed implementation plan** (task breakdown, dependency graph, milestone definitions)
2. **Set up project structure** (Cargo workspace with 12 crates)
3. **Begin Phase 1 implementation** (storage engine first, then parser, then query engine)

The foundation is now solid enough to build confidently.
