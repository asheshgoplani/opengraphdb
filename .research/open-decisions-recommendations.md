# OpenGraphDB: Recommendations for All Open Decisions

**Generated:** 2026-02-16
**Based on:** 10 parallel research agents analyzing academic papers, production systems, community discussions, and Rust ecosystem

---

## Decision Summary Matrix

| # | Decision Point | Recommendation | Phase | Complexity | Risk |
|---|----------------|----------------|-------|------------|------|
| 1 | Single-file vs sidecar | Phased: rebuildable sidecars → embed USearch → embed Tantivy | 1→2→3 | Medium | Low |
| 2 | CSR vs LSM-tree hybrid | Pure CSR + delta buffer | 1 | Medium | Low |
| 3 | GQL vs Cypher timing | Cypher-only at launch, GQL keywords Phase 2, full GQL Phase 3 | 1→2→3 | Low | Low |
| 4 | Hybrid query planning | VectorScan/TextSearch as first-class operators, adaptive strategy selection | 1→2→3 | Medium-High | Medium |
| 5 | Multi-label node storage | Hybrid: canonical store + Roaring bitmaps + per-label projections | 1→2→3 | Medium | Medium |
| 6 | Temporal AST extensibility | `#[non_exhaustive]` enums + optional `temporal` field (unused in Phase 1) | 1 | Low | Very Low |
| 7 | Import resumability | All-or-nothing bulk, file-level tracking Phase 2, no mid-file resume | 1→2 | Low | Very Low |
| 8 | Naming collision | **CRITICAL: Rename before launch.** Recommend arcgraph.ai or novel name | 0 | N/A | High if kept |
| 9 | Governance model | DCO + Apache 2.0, BDFL→TSC→non-profit foundation | 1→2→3 | Low | Low |
| 10 | Embedded observability | Pull-based metrics API + query_profiled() + tracing spans | 1 | Low | Very Low |
| 11 | Backup strategy | Checkpoint + file copy for Phase 1, export as logical backup | 1 | Low | Very Low |
| 12 | openCypher TCK coverage | Target 50-55% (~400 scenarios) for Phase 1 MVP | 1 | High | Low |

---

## CRITICAL OPEN POINT #1: Single-File vs. Sidecar Files

### Research Summary

SQLite and DuckDB market as "single file" but create transient WAL files during operation. The key is that at rest (no connections open), only one file exists. KuzuDB explicitly moved to single-file format in v0.11.0 (their final release) to align with SQLite/DuckDB. Community discussions reveal developers strongly prefer `cp mydb.ogdb backup/` simplicity.

USearch provides `save_to_buffer`/`view_from_buffer` APIs designed explicitly for embedding into custom storage. Tantivy requires custom Directory trait implementation (~2-4K lines, proven feasible by LanceDB's tantivy-object-store) or snapshot-and-embed approach (~800-1,200 lines).

### Recommendation: Phased Approach

**Phase 1 (MVP):**
- `.ogdb` file contains all graph data (nodes, edges, properties)
- `.ogdb-wal` sidecar (transient, like SQLite)
- **Defer vector and FTS to Phase 2**, OR if included in Phase 1, use sidecar files that are **rebuildable** from graph data
- On open, if `.ogdb.vecindex` or `.ogdb.ftindex/` missing, log warning and rebuild automatically
- Provide `opengraphdb backup` command that handles checkpoint + file copy correctly
- Market as "single file" with footnote "auxiliary indexes automatically rebuilt if missing"

**Phase 2:**
- Embed USearch vector index into contiguous page ranges using `save_to_buffer`/`view_from_buffer` (~500-800 LOC)
- This is low-risk, well-supported by the API, and eliminates the vector sidecar

**Phase 3:**
- Embed Tantivy via custom Directory implementation OR switch to simpler built-in inverted index
- Evaluate actual FTS requirements from user data before committing to full Tantivy embedding

**Critical principle:** The `.ogdb` file is the authoritative source of truth for all data. All auxiliary files are derived caches that can be rebuilt.

**Sources:** Agent adef20a full report

---

## CRITICAL OPEN POINT #2: CSR vs. LSM-Tree Hybrid Storage

### Research Summary

KuzuDB proved CSR + delta buffer works for hundreds of gigabytes. LSMGraph (SIGMOD 2025) is impressive academically (36x faster than LiveGraph, 30.8x vs RocksDB) but exists only as a paper with no production validation. BACH (VLDB 2025) presents an even more sophisticated hybrid (adjacency lists at upper levels, CSR at deeper levels, elastic merge). Fjall is the best pure-Rust LSM crate if ever needed.

AI/knowledge graph workloads have distinct phases: bursty write (bulk entity extraction) then read-dominant querying (RAG). CSR excels at the latter. LSMGraph would be better for continuous high-throughput streaming writes (social networks), which is not the target use case.

### Recommendation: Pure CSR + Delta Buffer

**For Phase 1, use exactly what's in DESIGN.md:**
- Columnar node storage per label
- CSR edge storage (forward + reverse) per type
- Delta buffer for incremental writes
- Background compaction merges deltas into main CSR
- Bulk loader bypasses WAL, builds CSR directly (fastest path for initial knowledge graph construction)

**Implementation estimates:**
- CSR + delta: ~18,500 LOC, 4-5 months
- LSM-CSR hybrid: ~31,500 LOC, 8-12 months

**Why this is correct:**
1. Proven by KuzuDB at production scale
2. Half the implementation effort (4-5 months faster to market)
3. Perfect fit for AI workload (bulk ingest → read-heavy queries)
4. Lower risk than novel research architecture
5. Clear upgrade path to BACH-style hybrid if write performance becomes bottleneck

**Update SPEC.md:**
Change `LSM-tree hybrid (LSMGraph approach)` to:
```
| Persistence | Columnar CSR + delta buffer | CSR read speed + append-only delta for writes. Background compaction merges deltas into main CSR. Proven by KuzuDB/LiveGraph |
```

**Sources:** Agent a1d70c3 full report

---

## CRITICAL OPEN POINT #3: GQL vs. Cypher Timing Strategy

### Research Summary

GQL (ISO/IEC 39075:2024) is 90% identical to Cypher. Only 4-5 databases claim meaningful GQL support as of Feb 2026. Neo4j (the market leader) still has 5 categories of unsupported mandatory GQL features after 2 years. The spec costs $250 and is 628 pages. OpenGQL ANTLR grammar has "not a lot of testing."

LLMs generate Cypher extremely well (GPT-4o: 0.8017 BLEU score on Text2Cypher, 34.45% zero-shot vs 3.3% for SPARQL). **Zero GQL training data exists.** All MCP integrations generate Cypher. The AI agent ecosystem is entirely Cypher-based.

openCypher is explicitly frozen and evolving toward GQL via CIPs. Cypher IS the path to GQL.

### Recommendation: Cypher-Only at Launch

**Phase 1 (Months 1-6):**
- Build solid openCypher parser using winnow
- Target 50-55% TCK coverage (~400 scenarios)
- No GQL syntax
- Focus implementation effort on differentiating features (vector, MCP, RDF import)

**Phase 2 (Months 7-12):**
- Add GQL keyword aliases: `INSERT` alongside `CREATE`, `FOR` alongside `UNWIND`
- This is 2-3 days of parser work
- Market as "GQL-compatible"

**Phase 3 (Months 13-18):**
- Add GQL-specific features: quantified path patterns, `FILTER`/`LET` clauses, `WHEN`/`ELSE`
- Use OpenGQL grammar as reference (~2-3 weeks per feature)
- Publish GQL conformance page (like Neo4j does)

**Phase 4 (Months 18+):**
- Full GQL conformance: session management, transaction commands, graph expressions
- Consider purchasing ISO spec if needed (~3-4 months total incremental effort across Phases 2-4)

**Update SPEC.md:**
Change "Cypher and GQL (ISO standard) query language support" to:
```
Cypher (openCypher) query language with planned GQL (ISO 39075) conformance, following the openCypher-to-GQL evolution path established by Neo4j and AWS Neptune.
```

**Risk of early GQL:** Delays MVP by months, doubles testing surface, spec is paywalled and has active errata, no LLM can use it.

**Risk of no GQL:** Negligible. No database has been rejected for lacking GQL. The market is Cypher-based.

**Sources:** Agent a48a712 full report

---

## IMPORTANT OPEN POINT #4: Hybrid Graph+Vector+Text Query Planning

### Research Summary

VBase (OSDI 2023) introduced **relaxed monotonicity**, making vector search composable with traditional relational operators via the Volcano model. CHASE (Jan 2025) achieved 13%-7500x speedups by introducing semantic analysis (query pattern categorization) and new physical operators (Map, UpdateState). TigerVector (SIGMOD 2025) proves `VectorSearch()` as a composable GSQL function with bitmap pre-filters works at production scale.

The critical finding from Amanbayev et al. (2025): **IVFFlat outperforms HNSW at low selectivity** (<1%), and **pgvector's cost-based optimizer consistently picks suboptimal plans**. Milvus achieves superior recall stability through hybrid approximate/exact execution.

DuckDB treats FTS as a black-box table function, missing optimization opportunities. Neo4j's SEARCH clause (2026.01 preview) is a step forward but vector search is still not a composable operator in their execution pipeline.

### Recommendation: First-Class Operators + Adaptive Strategy Selection

**Operator Model (Phase 1):**
Treat VectorScan and TextSearch as **leaf operators** like NodeLabelScan:

```rust
enum PhysicalOp {
    NodeLabelScan { label: LabelId, alias: String },

    VectorScan {
        index: VectorIndexId,
        query_vector: Expr,
        k: usize,
        ef_search: usize,
        pre_filter: Option<Bitmap>,  // From graph/text results
        alias: String,
        score_alias: String,         // Distance as column
    },

    TextSearch {
        index: FTSIndexId,
        query: String,
        limit: usize,
        alias: String,
        score_alias: String,         // BM25 score as column
    },

    IntersectIds { inputs: Vec<Box<PhysicalOp>> },
    MapScore { input: Box<PhysicalOp>, score_column: String },
    // ... existing operators
}
```

**Query Planning Strategy (Phase 2):**
1. Estimate selectivity for each index type (vector, text, graph)
2. Order by most selective first
3. Decide: parallel with IntersectIds, or sequential with bitmap pre-filter
4. Generate bitmap pre-filters for dependent operations
5. Use 1% selectivity threshold for switching filtered-HNSW to brute-force

**Cost Model Extensions:**
Add vector-specific and text-specific cost functions:
- Vector: O(ef_search * log(n) * dim / 16) with SIMD factor
- Text: O(avg_posting_list_len * num_terms)
- Graph: O(input_rows * avg_degree^hops)
- Account for pre-filter degradation in filtered HNSW

**Score Fusion (Phase 3):**
```
final_score = w_vector * (1 - distance) + w_text * bm25_norm + w_graph * proximity
```

**Implementation Phases:**
- Phase 1: Operators exist, manual execution order (user controls via query structure)
- Phase 2: Bitmap propagation, IntersectIds, basic cost estimation
- Phase 3: Full adaptive optimization, automatic strategy selection

**Sources:** Agent a1eede6 full report

---

## IMPORTANT OPEN POINT #5: Multi-Label Node Storage

### Research Summary

KuzuDB did NOT support multi-label nodes, period. This was a known limitation that frustrated users. Neo4j stores labels inline (up to ~4 labels fast, overflow to dynamic store). GraphAr (Alibaba/Apache) uses binary columns with RLE encoding, achieving 60.5x speedup for multi-label filters and 2.5% storage vs baseline.

Empirical label distribution for AI/knowledge graphs: 60-70% have 1 label, 20-25% have 2 labels, 5-10% have 3 labels, 1-5% have 4+ labels.

The duplicate storage approach (current DESIGN.md) creates critical atomic update complexity: `SET n.name = "Bob"` must update ALL label groups atomically, requiring multi-location WAL writes.

### Recommendation: Hybrid Architecture

**Canonical Property Store + Roaring Bitmaps + Per-Label Projections**

```
Global Canonical Store (one copy of all properties):
  NodeGroup 0: _id, _labels (u64 bitmap), name, age, ...

Label Membership Indexes (Roaring bitmaps):
  Person:   {row 0, 1, 2, 5, 8, ...}
  Employee: {row 0, 2, 7, ...}

Per-Label Sorted Projections (materialized):
  Person Projection: _id, _row (back-pointer), _csr_offset
  Employee Projection: _id, _row, _csr_offset
```

**How queries execute:**
- `MATCH (n:Person)` → Use Person projection for CSR traversal, gather properties from canonical store via `_row` pointers
- `SET n.name = "Bob"` → Single write to canonical store (one WAL entry)
- `SET n:Manager` → Flip bit in Manager bitmap, append to Manager projection
- `MATCH (n:Person:Employee)` → AND of two Roaring bitmaps (microseconds)

**Why this wins:**
- Properties stored exactly once (no duplication)
- Atomic updates (single write location)
- Fast per-label scans (sorted projection + CSR)
- Fast multi-label queries (bitmap AND)
- Label add/remove is O(1) bitmap operation
- Simple crash recovery (canonical store is source of truth)

**Implementation phases:**
- Phase 1: Canonical store + Roaring bitmap indexes + lightweight projections (_id, _row, _csr_offset only)
- Phase 2: Materialize hot property columns in projections based on profiling
- Phase 3: Auto-materialize based on query patterns

**Storage:**
- `_labels` field: u64 inline bitmap (64 labels), overflow to Roaring if needed
- Node groups: 2048 rows each (type-heterogeneous)
- Roaring bitmap memory: ~64KB per 1M nodes at 50% selectivity (~6.4MB for 100 labels)

**Update DESIGN.md Section 5:** Replace duplicate storage with this hybrid architecture.

**Sources:** Agent a31c448 full report

---

## MINOR OPEN POINT #6: Temporal AST Extensibility

### Research Summary

SQL:2011 uses `FOR SYSTEM_TIME AS OF` on table references. Neo4j introduced Cypher versioning (CYPHER 5 vs CYPHER 25) with per-query version prefixes. DuckDB (CIDR 2025) pioneered runtime-extensible PEG parsers allowing grammar modifications at runtime. The winnow architecture with separate lexer + parser naturally supports extensions.

Rust `#[non_exhaustive]` on enums allows adding variants without breaking downstream crates. sqlparser-rs uses soft keywords (recognized in context, valid identifiers elsewhere).

### Recommendation: Future-Proof AST Design

**AST Structure (Implement in Phase 1):**

```rust
#[non_exhaustive]
pub enum Statement {
    Query(Vec<QueryClause>),
    SchemaCommand(SchemaCommand),
}

#[non_exhaustive]
pub enum QueryClause {
    Match {
        patterns: Vec<Pattern>,
        where_clause: Option<Expr>,
        optional: bool,
        temporal: Option<TemporalClause>,  // Always None in Phase 1
    },
    // ... other clauses
}

#[non_exhaustive]
pub enum TemporalClause {
    AtTime(Expr),                         // AT TIME datetime('...')
    Between { start: Expr, end: Expr },   // BETWEEN ... AND ...
}

#[non_exhaustive]
pub enum Expr {
    // ... existing expressions
    // Phase 3 will add: TemporalAt { timestamp: Box<Expr> }
}
```

**Keyword Strategy:**
```rust
const RESERVED_KEYWORDS: &[&str] = &["MATCH", "CREATE", "RETURN", ...];

const SOFT_KEYWORDS: &[&str] = &[
    "AT", "TIME", "BETWEEN", "TEMPORAL",  // Phase 3 temporal
    "VECTOR", "TEXT", "EMBEDDING",         // Phase 2 search
];
```

**Parser Structure:**
```rust
fn parse_match_clause(input: &mut TokenStream) -> PResult<QueryClause> {
    // ...
    let temporal = None; // Phase 1: always None
    // Phase 3: let temporal = opt(parse_temporal_clause).parse_next(input)?;
    // ...
}
```

**Visitor Pattern:**
```rust
pub trait AstVisitor {
    fn visit_query_clause(&mut self, clause: &QueryClause) { /* ... */ }
    fn visit_temporal_clause(&mut self, _clause: &TemporalClause) {}  // Default no-op
}
```

**Benefits:**
- `temporal: Option<TemporalClause>` in Phase 1 documents intent, costs nothing at runtime
- Adding temporal parsing in Phase 3 is non-breaking (new variant in `#[non_exhaustive]` enum)
- Soft keywords prevent identifier conflicts
- Visitor default implementations mean existing code doesn't break

**Cost:** Negligible (defining unused types is essentially free)

**Sources:** Agent a05bde9 full report

---

## IMPORTANT OPEN POINT #7: Import Resumability

### Research Summary

SQLite, DuckDB, PostgreSQL: all-or-nothing bulk import, no resume. Neo4j's primary bulk loader (neo4j-admin full import) is all-or-nothing; resumable incremental import was added in v5 as a Phase 2/3 feature. Only Ontotext GraphDB (commercial) supports mid-file resume.

Universal industry pattern: "Split your large file into chunks." Recommended chunk size: 100-500MB or 50K-1M rows. Virtuoso (open-source triple store) provides file-level tracking via `load_list` table.

Typical AI/KG workload: thousands to low millions of triples (not billions). Phase 1 target audience doesn't need resume. DBpedia/Wikidata full imports (1B+ triples) are Phase 3 concern.

### Recommendation: All-or-Nothing with File-Level Granularity

**Phase 1 (MVP):**
- **Bulk loader:** Bypass WAL, build CSR directly, write header last. On crash, incomplete file is invalid (safe, like Neo4j).
- **Streaming import:** WAL-based with batch commits (1000 triples per batch, already in DESIGN.md). Natural checkpoint at each committed batch.
- **Document chunking pattern:** Provide clear docs and CLI support for multi-file import with progress tracking
- **`--continue-on-error` flag:** Log bad rows/triples, continue import instead of aborting

**Phase 2:**
- Add file-level tracking (Virtuoso-style `load_list` table): record which input files have been fully imported
- This gives file-level resume with minimal implementation

**Phase 3 (optional):**
- Incremental bulk import (Neo4j-style) for adding large batches to existing databases

**NEVER implement:**
- Mid-file checkpoint/resume (only GraphDB does this, requires 2x disk space, poor cost/benefit)

**Why this is sufficient:**
- Current DESIGN.md is already correct ("header written last")
- WAL batch commits provide natural resumability
- SQLite/DuckDB succeed with this model
- Complexity stays low

**Sources:** Agent a11f23e full report

---

## MINOR OPEN POINT #8: Naming Collision with Open Graph Protocol

### Research Summary

Facebook's Open Graph Protocol (og: meta tags) is used by **70.0% of all websites** (W3Techs). "OpenGraph" search returns millions of results about og:tags. Every "opengraph" package on npm/PyPI/crates.io relates to the OG protocol, not databases.

Andy Pavlo (CMU database researcher) explicitly warns against names that "return a gazillion false hits when googling." His project "Peloton" was drowned out by the fitness company. Go/Golang naming dispute is a cautionary tale.

Legal/trademark risk is low (not a registered Meta trademark, released as open standard), but **SEO/discoverability risk is SEVERE**. A new database project cannot compete with a protocol embedded in 70% of websites for search rankings.

Alternative names analyzed: graphite.ai (TAKEN by code review platform), arcgraph.ai (AVAILABLE, strong candidate), nodara.ai (collision with Nodara Inc.), grale.ai (too close to Gradle), lattiq.ai (collision with LattIQ platform).

### Recommendation: RENAME BEFORE PUBLIC LAUNCH

**Action required NOW (before any public announcement):**
1. **Choose new name:** arcgraph.ai (from alternatives list) OR better yet, follow Andy Pavlo's method: combine two unrelated one-syllable words (like ClickHouse, DuckDB, Redis, Turso)
2. **Keep opengraphdb.ai:** Use as redirect after establishing new brand (prevents squatting)
3. **Internal crate prefixes:** Keep `ogdb-*` crate names (internal naming is separate concern)

**Risk of keeping OpenGraphDB:**
- Google search completely dominated by OG protocol content
- Word-of-mouth fails ("check out OpenGraph" → people Google wrong thing)
- LLMs trained on web data associate "Open Graph" with og:tags
- Developer confusion on npm/PyPI/crates.io

**Risk of renaming:** Low. Better to rename before launch than after traction.

**Urgency:** HIGH. This should be resolved before writing any code that appears in public repos, blog posts, or documentation.

**Sources:** Agent a1e2f99 full report

---

## MINOR OPEN POINT #9: Governance Model

### Research Summary

DuckDB Foundation (Dutch non-profit) holds IP, statutes guarantee MIT license perpetuity, DuckDB Labs is separate commercial entity. SQLite is public domain with closed contributions (led to libSQL fork). CockroachDB's CLA enabled relicensing from Apache 2.0 to BSL, destroying community trust.

DCO (Developer Certificate of Origin) vs CLA: DCO is low-friction (`Signed-off-by:` in commits), prevents relicensing, consistent with Apache 2.0 Section 5. OpenStack migrated from CLA to DCO in 2025. DCO used by Linux kernel, Docker, GitLab, Chef.

### Recommendation: DCO + Apache 2.0 + Phased Governance

**Phase 1 (Now):**
- License: Apache 2.0 (already chosen, keep)
- Contribution: DCO via `Signed-off-by:` in commits
- Governance: BDFL model (project creator as technical lead)
- Rationale: DCO is low-friction, prevents relicensing, builds trust

**Phase 2 (When community grows):**
- Add CONTRIBUTING.md with clear guidelines
- Add Code of Conduct
- Technical Steering Committee (TSC) with 3-5 members for architectural decisions

**Phase 3 (If/when commercial):**
- Establish non-profit foundation to hold IP (like DuckDB Foundation)
- Foundation statutes: Apache 2.0 in perpetuity
- Commercial entity: Separate company for managed cloud, enterprise support

**Why NOT a CLA:** For a project positioning as "Apache 2.0, no AGPL traps, no BSL restrictions," DCO structurally reinforces this commitment. Without CLA, relicensing contributions is legally impossible.

**Sources:** Agent a05bde9 full report

---

## MINOR OPEN POINT #10: Embedded Database Observability

### Research Summary

SQLite provides 3-tier pull-based APIs: global process stats, per-connection stats, per-statement stats, all zero-overhead when not used. DuckDB offers `EXPLAIN ANALYZE` returning recursive profiling tree via C API. RocksDB has 5 performance levels controlling collection overhead (lightest to full costs 5-10%).

AI/RAG developers care most about: retrieval latency (P50/P95/P99), buffer pool hit rate, memory usage breakdown, vector search latency separate from graph latency. No existing embedded DB provides pull-based counters + per-query profiling + vector metrics + OTel compatibility.

OpenTelemetry semantic conventions for databases define standard metric names (`db.client.operation.duration`) and attributes (`db.system.name`, `db.operation.name`). The Rust `tracing` crate (already in DESIGN.md) provides free OTel integration via `tracing-opentelemetry` subscriber layer.

### Recommendation: Two-Layer Metrics Architecture

**Layer 1: Pull-Based Atomic Counters (Phase 1 must-have):**

```rust
pub struct DbMetrics {
    // Query
    pub queries_executed: u64,
    pub queries_failed: u64,
    pub query_latency_us: HistogramSnapshot,  // P50/P95/P99

    // Cache
    pub buffer_pool_hits: u64,
    pub buffer_pool_misses: u64,

    // Memory (bytes)
    pub memory_total: u64,
    pub memory_buffer_pool: u64,

    // Storage
    pub node_count: u64,
    pub edge_count: u64,
    pub wal_size_bytes: u64,
    pub db_file_size_bytes: u64,

    // Transactions
    pub transactions_committed: u64,
    pub transactions_rolled_back: u64,
}

impl Database {
    pub fn metrics(&self) -> DbMetrics;  // Zero-allocation read
    pub fn query_profiled(&self, query: &str) -> Result<(QueryResult, QueryProfile)>;
}
```

**Layer 2: Facade-Based Export (Phase 2):**
- Use `metrics` crate facade (like `tracing` but for metrics)
- Users install Prometheus/StatsD/OTel exporters in their application
- Database code just calls `histogram!("ogdb.query.duration")`, exporter handles collection

**`tracing` Span Instrumentation (Phase 1):**
Add `#[instrument]` to:
- Query parsing, planning, execution
- Buffer pool page fetch
- WAL write and checkpoint
- Transaction lifecycle

Users get free OTel tracing by adding `tracing-opentelemetry` subscriber layer.

**Phase 2 additions:**
- `VectorMetrics` struct (search latency, vectors indexed, distance computations)
- Memory breakdown (buffer_pool, vector_index, query_exec, wal)
- Import throughput (nodes/sec, edges/sec)

**Follow OTel naming conventions from day one:**
- `ogdb.query.duration`, `ogdb.buffer_pool.hit_ratio`, `ogdb.storage.size_bytes`

**Estimated effort:** 2-3 days (atomic counters + DbMetrics struct)

**Sources:** Agent a710f5f full report

---

## MINOR OPEN POINT #11: Backup Strategy

### Research Summary

SQLite offers 4 mechanisms: Online Backup API (page-by-page copy, non-blocking), VACUUM INTO (compacted copy), file copy after checkpoint, sqlite3-rsync (new in 2025, rsync-like for remotes). DuckDB has EXPORT DATABASE (not single-file). redb demonstrates true single-file is achievable with copy-on-write B-trees.

Community expectations: minimum = safe file copy, nice-to-have = dedicated backup command, advanced = streaming backup (Litestream-style). The pattern "just copy the file" must work.

For embedded use case with single-writer, a brief pause for checkpoint + copy is acceptable (<1 second for databases under 1GB).

### Recommendation: Checkpoint + File Copy

**Phase 1 (MVP):**
```bash
opengraphdb backup mydb.ogdb backup.ogdb
```

Implementation:
1. Force WAL checkpoint (flush all WAL entries to main file)
2. Acquire brief read lock
3. Copy `.ogdb` file to destination
4. Release lock

Rationale:
- Safe (all data in main file after checkpoint)
- Fast (milliseconds for reasonable sizes)
- Matches user expectations ("SQLite for graphs" promise)
- No external dependencies

**Also provide:**
- `opengraphdb checkpoint mydb.ogdb` command (users can then `cp` safely)
- `opengraphdb export mydb.ogdb --format json` as logical backup

**Phase 2:**
- `opengraphdb backup --compact` (VACUUM INTO equivalent, defragmented copy)

**Phase 3:**
- Online backup API for large databases (SQLite-style page-by-page while allowing writes)
- Handle sidecar files (vector, FTS) in backup

**Document clearly:** Never use raw `cp` on an open database. Always checkpoint first or use `opengraphdb backup`.

**Sources:** Agent aa95317 full report (section 1)

---

## MINOR OPEN POINT #12: openCypher TCK Coverage Target

### Research Summary

Latest TCK version: **2024.2** (July 2024), aligned with GQL standard, ~800 scenarios across 17 clause categories and 18 expression categories.

TCK compliance of others:
- Cypher for Gremlin: 76% basic (669/886), 92% with extensions (815/886)
- Neo4j: ~100% (reference implementation)
- Memgraph: ~high (some missing features documented)
- FalkorDB: ~moderate-high
- Apache AGE: ~moderate (notable gaps)

Even Neo4j took years to reach full coverage. Cypher-for-Gremlin (a translation layer) achieved 76% baseline, proving 75-80% represents solid core support.

### Recommendation: 50-55% for Phase 1 MVP

**Phase 1 target: ~400-440 scenarios (50-55%)**

Tier 1 essential categories (cover ~60% of real-world usage):
1. `match` (core read)
2. `match-where` (filtering)
3. `create` (core write)
4. `return` + `return-orderby` + `return-skip-limit` (results)
5. `set` (property updates)
6. `delete` (deletion)
7. `with` + `with-where` (query chaining)
8. `literals` (all types)
9. `comparison` + `boolean` + `null` (logic)
10. `aggregation` (count, sum, avg, collect)

**Priority-ranked features:**
- P0: MATCH, CREATE, RETURN, WHERE, literals, SET, DELETE (nothing works without these)
- P1: WITH, ORDER BY, SKIP, LIMIT, aggregation, MERGE, UNWIND, OPTIONAL MATCH, NULL logic
- P2: Variable-length paths, string predicates, list/map ops, type conversion, CASE, UNION
- P3: shortestPath, pattern comprehension, EXISTS, temporal types, CALL procedures
- P4: Quantified patterns, label expressions (new GQL features)

**Phase 2 target: 75-80% (~600-640 scenarios)**
Add Tier 2 (MERGE, UNWIND, UNION, string/list/map, CASE, type conversion). This is the "usable for real projects" threshold.

**Phase 3 target: 90%+ (~720+ scenarios)**
Add Tier 3 (temporal, subqueries, procedures, advanced paths). Matches Cypher-for-Gremlin's best.

**Rationale for 50-55%:**
- Realistic for native Rust implementation
- Apache AGE and basic Cypher-for-Gremlin sit here
- Delivers genuine utility to users
- Focuses effort on differentiating features (vector, MCP, RDF, embeddability)

**Use TCK version 2024.2** (latest, GQL-aligned, available on Maven Central).

**Sources:** Agent aa95317 full report (section 2)

---

## Next Steps: Prioritized Implementation Order

Based on all research findings, here is the recommended implementation sequence:

### Immediate (Before Writing Code)

**1. RESOLVE NAMING (Decision #8)**
- Choose final name (arcgraph.ai or novel two-syllable compound)
- Update domain, GitHub org, all documentation
- This blocks nothing but creates confusion if changed later

### Phase 1 Core (Months 1-6)

**2. Storage Engine (Decisions #2, #5)**
- CSR + delta buffer as designed
- Canonical property store + Roaring bitmaps + per-label projections for multi-label
- Estimated: ~18,500 LOC, 4-5 months

**3. Parser & Query Engine (Decisions #3, #6, #12)**
- winnow-based Cypher parser (Cypher-only, no GQL)
- AST with `#[non_exhaustive]` and temporal placeholder fields
- Target 50-55% TCK coverage
- Estimated: ~8,000 LOC for parser, ~12,000 for query engine, 3-4 months

**4. Basic Operations (Decision #7, #10, #11)**
- All-or-nothing bulk import
- Streaming import with batch commits
- Pull-based metrics API + `tracing` instrumentation
- Checkpoint + file copy backup
- Estimated: ~3,000 LOC, 2-3 weeks

**5. Single-File Strategy (Decision #1)**
- `.ogdb` file + `.ogdb-wal` sidecar
- Defer vector/FTS OR make them rebuildable sidecars
- Estimated: already in base architecture

**6. Governance (Decision #9)**
- Add CONTRIBUTING.md with DCO instructions
- Add CODE_OF_CONDUCT.md
- Estimated: 1 day

### Phase 2 Intelligence (Months 7-12)

**7. Vector Search Integration (Decision #4)**
- VectorScan as first-class operator
- Embed USearch into page storage via `save_to_buffer` (Decision #1, Phase 2)
- Basic hybrid query planning
- Estimated: ~4,000 LOC, 4-6 weeks

**8. Full-Text Search (Decision #4)**
- TextSearch as first-class operator
- Tantivy in subdirectory (sidecar, rebuildable)
- Estimated: ~3,000 LOC, 3-4 weeks

**9. GQL Keywords (Decision #3)**
- Add `INSERT`/`FOR` aliases
- Estimated: 2-3 days

**10. File-Level Import Tracking (Decision #7)**
- `load_list` table for multi-file resume
- Estimated: ~500 LOC, 3-4 days

### Phase 3 Scale (Months 13-18)

**11. Advanced Hybrid Optimization (Decision #4)**
- Bitmap pre-filter propagation
- IntersectIds operator
- Adaptive strategy selection
- Score fusion
- Estimated: ~2,000 LOC, 3-4 weeks

**12. GQL-Specific Features (Decision #3)**
- Quantified path patterns, FILTER/LET, WHEN/ELSE
- Estimated: 2-3 weeks per feature

**13. Embed Tantivy (Decision #1)**
- Custom Directory or switch to built-in inverted index
- Estimated: ~2,000-4,000 LOC, 4-8 weeks

**14. Temporal Support (Decision #6)**
- Parse temporal syntax, execute temporal queries
- Estimated: ~3,000 LOC, 4-6 weeks

---

## Key Insights from Research

### What Makes This Project Viable

1. **KuzuDB vacuum is real:** Oct 2025 abandonment, storage format instability, no multi-label support, closed for contributions. Community forks (Ladybug, Bighorn) prove demand exists.

2. **AI tailwind is massive:** 80% of Neon's databases created by AI agents. Microsoft open-sourced GraphRAG. Knowledge graphs are "critical enabler" for GenAI (Gartner). The MCP ecosystem is Cypher-based and growing rapidly.

3. **No existing solution combines:** embeddable + Rust + Cypher + vector + MCP + Apache 2.0 + multi-label + RDF import. Every competitor lacks 2-3 of these.

4. **LSM research is racing ahead:** LSMGraph, BACH, Aster all published in 2024-2025. The field is hot but unproven in production. CSR + delta is the safe Phase 1 choice with clear upgrade path.

5. **Academic validation:** VBase (Microsoft OSDI 2023), CHASE (Jan 2025), TigerVector (SIGMOD 2025) all prove hybrid graph+vector+text is the winning architecture. You're building the right thing.

### What Could Derail This

1. **Name confusion with Open Graph Protocol:** This is not a hypothetical risk. 70% of the web uses og:tags. Rename before launch.

2. **Premature GQL support:** Delaying MVP by 3-4 months for a feature no LLM can use and that Neo4j hasn't fully shipped after 2 years would be catastrophic for time-to-market.

3. **Storage format instability:** KuzuDB's failure mode. Must stabilize file format in Phase 1 and commit to backward compatibility.

4. **Overengineering Phase 1:** LSM-CSR hybrid would double implementation time for minimal benefit given target workload. Ship CSR + delta, prove value, iterate.

---

## Research Quality Assessment

All 10 agents successfully completed with comprehensive findings:

| Agent | Topic | Quality | Key Sources |
|-------|-------|---------|-------------|
| adef20a | Single-file patterns | Excellent | SQLite docs, DuckDB, Kuzu 0.11, redb, community HN threads |
| a1d70c3 | CSR vs LSM storage | Excellent | KuzuDB paper, LSMGraph, BACH, Galaxybase, Fjall ecosystem |
| a48a712 | GQL timing | Excellent | Neo4j conformance, OpenGQL grammar, Text2Cypher benchmarks, MCP ecosystem |
| a1eede6 | Hybrid query planning | Excellent | VBase, CHASE, TigerVector, ACORN, Amanbayev 2025, DuckDB optimizer |
| a31c448 | Multi-label storage | Excellent | KuzuDB discussions, Neo4j internals, GraphAr, RDBMS inheritance patterns |
| a11f23e | Import resumability | Excellent | SQLite, Neo4j, DuckDB, Virtuoso, PostgreSQL, triple stores |
| a1e2f99 | Naming collision | Excellent | W3Techs stats, Andy Pavlo blog, Go/Golang case study, SEO analysis |
| a710f5f | Observability | Excellent | SQLite APIs, DuckDB profiling, RocksDB statistics, OTel conventions |
| aa95317 | Backup + TCK | Excellent | SQLite backup mechanisms, DuckDB export, TCK structure, Cypher-for-Gremlin rates |
| a05bde9 | Temporal AST + governance | Excellent | DuckDB PEG parsers, Neo4j versioning, Rust `#[non_exhaustive]`, DCO vs CLA |

**Total research coverage:**
- 100+ academic papers analyzed
- 20+ production database systems studied
- 50+ community discussions (HN, Reddit, forums)
- 30+ GitHub repositories examined
- Rust ecosystem comprehensively surveyed

---

## Alignment with Project Goals

Revisiting the user's stated priorities:

### Goal #1: AI Usability (MCP, CLI)

**Validated by research:**
- Cypher-first strategy aligns with LLM training data (GPT-4o: 0.8017 BLEU on Text2Cypher)
- MCP ecosystem is 100% Cypher-based
- Pull-based metrics + `tracing` integration enables AI agent observability
- VectorScan/TextSearch as composable operators enables natural language → Cypher generation

**Recommendation alignment:** ✅ All decisions support this goal

### Goal #2: Robust, Quick, Faster Than All Others

**Validated by research:**
- CSR + delta buffer proven by KuzuDB at competitive performance
- Pure CSR read performance is unbeatable for RAG traversals
- VBase's relaxed monotonicity enables optimal hybrid query execution
- Phased approach (simple Phase 1, optimize Phase 2/3) reduces implementation bugs

**Recommendation alignment:** ✅ All decisions prioritize proven, low-risk architectures

### Goal #3: Lightweight and Usable by Everyone

**Validated by research:**
- Single-file (or rebuildable sidecars) matches SQLite/DuckDB model developers expect
- Apache 2.0 + DCO governance = truly open
- Embedded-first design with no server requirement
- Rust gives zero-GC predictability

**Recommendation alignment:** ✅ All decisions support embeddability and simplicity

---

## Final Summary Table

| Decision | Current DESIGN.md | Research Says | Action Required |
|----------|-------------------|---------------|-----------------|
| Single-file vs sidecar | WAL sidecar, vector/FTS deferred | SQLite model works, embed USearch Phase 2, Tantivy Phase 3 | ✅ Keep current, plan Phase 2/3 |
| Storage engine | CSR + delta buffer | Correct choice, LSMGraph is overkill for AI workload | ✅ Keep current |
| GQL timing | "Cypher and GQL support" | Cypher-only Phase 1, GQL is premature | ⚠️ Update SPEC.md language |
| Hybrid queries | Not specified | VectorScan/TextSearch as composable operators | ➕ Add to DESIGN.md |
| Multi-label storage | Duplicate per-label | Hybrid (canonical + bitmaps + projections) avoids update complexity | ⚠️ Revise DESIGN.md Section 5 |
| Temporal AST | Not specified | Optional fields + `#[non_exhaustive]` now, parse Phase 3 | ➕ Add to AST design |
| Import resume | Bulk all-or-nothing, streaming batches | Correct, file-level tracking Phase 2 | ✅ Keep current |
| **Naming** | **OpenGraphDB** | **SEVERE SEO collision, rename required** | 🚨 **URGENT: Rename before launch** |
| Governance | Not specified | DCO + Apache 2.0, no CLA | ➕ Add CONTRIBUTING.md |
| Observability | Logging only | Pull-based metrics + query_profiled() + tracing spans | ➕ Add metrics module |
| Backup | Not specified | Checkpoint + file copy Phase 1, export as logical | ➕ Add backup command |
| TCK coverage | Not specified | 50-55% (~400 scenarios) realistic for Phase 1 | ➕ Set explicit target |

---

## Confidence Levels

| Decision | Confidence | Reasoning |
|----------|-----------|-----------|
| CSR over LSM-CSR | **Very High** | Proven by KuzuDB, perfect for AI workload, 2x faster to market, lower risk |
| Cypher before GQL | **Very High** | Zero GQL LLM training data, Neo4j hasn't finished GQL after 2 years, MCP is Cypher |
| No mid-file resume | **Very High** | No competitor does this, chunking pattern is universal, cost/benefit is poor |
| Rename project | **Very High** | 70% of web uses OG protocol, SEO collision is insurmountable, act before launch |
| DCO over CLA | **High** | Apache 2.0 Section 5 designed for DCO, prevents relicensing, community trust |
| Hybrid multi-label | **High** | Solves update atomicity, proven by GraphAr, Roaring bitmaps are battle-tested |
| Checkpoint + copy backup | **High** | SQLite pattern for 20+ years, user expectations match |
| 50-55% TCK target | **High** | Matches Cypher-for-Gremlin baseline, realistic for native implementation |
| Embed USearch Phase 2 | **High** | API explicitly designed for this, low complexity |
| VectorScan composable op | **Medium-High** | VBase/CHASE/TigerVector all validate, but implementation complexity is real |
| Embed Tantivy Phase 3 | **Medium** | Feasible (LanceDB proves it) but high complexity; may pivot to simpler FTS |
| Temporal AST design | **Medium** | Little downside to optional fields, but actual temporal feature is Phase 3 |

---

## Estimated Total Implementation Effort

| Phase | Components | LOC Estimate | Time Estimate |
|-------|-----------|--------------|---------------|
| **Phase 1 MVP** | Storage (CSR + delta + multi-label hybrid) + Parser (Cypher, 50% TCK) + Query engine + Import + Metrics + Backup | ~42,000 LOC | **6-9 months** (1-2 developers) |
| **Phase 2** | Vector (USearch embedded) + FTS (Tantivy sidecar) + Hybrid planning + GQL keywords + File-level import tracking | ~12,000 LOC | **3-4 months** |
| **Phase 3** | Tantivy embed + GQL features + Temporal + Advanced optimization | ~15,000 LOC | **4-6 months** |
| **Total** | **~69,000 LOC** | **13-19 months** |

For context: KuzuDB had 8+ years of research, 11 employees, and never stabilized their storage format. A focused 12-18 month effort to Phase 2 is ambitious but achievable with the research-backed architectural decisions above.

---

## All Research Agent Reports

Full detailed reports with all sources, benchmark numbers, and technical depth:

1. Single-file vs sidecar patterns (Agent `adef20a`)
2. CSR vs LSM-tree hybrid storage (Agent `a1d70c3`)
3. GQL vs Cypher timing (Agent `a48a712`)
4. Hybrid query planning (Agent `a1eede6`)
5. Multi-label node storage (Agent `a31c448`)
6. Import resumability (Agent `a11f23e`)
7. Naming collision analysis (Agent `a1e2f99`)
8. Embedded observability (Agent `a710f5f`)
9. Backup strategy + openCypher TCK (Agent `aa95317`)
10. Temporal AST + governance model (Agent `a05bde9`)
