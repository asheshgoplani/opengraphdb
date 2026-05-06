# System Architect Audit — OpenGraphDB
**Date:** 2026-05-06
**Branch:** detached @ `origin/main` (commit `23e8327`, version `0.5.1`)
**Lens:** Staff/principal engineer doing a structural review. Story-form, not checklist.

---

## A. Core thesis — and whether the code is shaped around it

The product literature (`SPEC.md` §1, `ARCHITECTURE.md` §1, `README.md`, the skill cards) all plant the same flag: **OpenGraphDB is "the SQLite for graph databases."** Three claims fall out of that:

1. **Embedded-first, single-binary, library-grade engine** — server modes (HTTP, Bolt, MCP, gRPC) are surfaces *over* a self-contained kernel.
2. **Multi-modal in one engine** — graph + vector + full-text + temporal as **first-class operators**, not bolt-ons.
3. **Agent-native** — the MCP tool catalog and CLI JSON are stable contracts AI agents can plan against.

Is the code shaped around that thesis? **Mostly yes — emphatically at the system boundary, dangerously not at the module boundary.**

The boundary thesis holds: there is exactly one binary (`ogdb`), no JVM, no sidecar, no server requirement; the same `Database` type drives the embedded API, the CLI, the HTTP/MCP/Bolt servers, the FFI, the Python wheel and the Node addon. The "single-file embedded graph" claim is real and survives the smell test — `pread`/`pwrite` only, sync std::net I/O (no tokio), in-process MVCC, WAL durability barrier. There is no architectural drift toward a clustered server-first design here.

But the **module thesis is in trouble**. `crates/ogdb-core/src/lib.rs` is **41,297 lines in a single file** (148 type definitions, ~1,084 method-level functions, one 30-field `Database` god-struct at line 11579). `crates/ogdb-cli/src/lib.rs` is another **17,480 lines in a single file** holding the entire CLI subcommand router, the HTTP server, the MCP server, the bolt server frontend and ~40 integration tests. The 18-crate workspace looks tidy from the outside — but `ogdb-vector`, `ogdb-text`, `ogdb-algorithms`, `ogdb-temporal`, `ogdb-import`, `ogdb-export` are **thin facades** (114–409 lines each); the live runtime objects (`VectorIndexRuntime`, `MaterializedFullTextIndex`, `TemporalNodeVersion`, the `tantivy::Index` driver, the `instant-distance::HnswMap` driver) all live inside the `ogdb-core` god-module. The split was a *file move* of plain data types, not a *responsibility split*. `DESIGN.md` §1 admits this (§"Reality check (0.4.0)") in plain prose — but it is admission, not remediation.

Net: the **product thesis is honest**. The **codebase thesis is implicitly "one giant kernel + thin fan-out crates"**, and that should be made explicit and either embraced or refactored. Today it is neither.

---

## B. Layer map

What the codebase *says* it has (per `ARCHITECTURE.md` §3–§9, `DESIGN.md` §1):

```
Storage (WAL, page store, MVCC versions, CSR + delta, props)
  └─ Index (B-tree property, HNSW vector, Tantivy FTS, label bitmaps, temporal)
       └─ Catalog / MetaStore
            └─ Query (winnow lexer → AST → logical plan → physical plan → executor)
                 └─ Surface (CLI subcommand, HTTP/REST, Bolt v1, MCP stdio/HTTP, FFI, PyO3, NAPI-RS)
                      └─ Clients (Python wheel, Node addon, Go cgo, browser SPA)
```

What the codebase *actually* has:

```
ogdb-core/src/lib.rs   (41 k LOC — storage + WAL + MVCC + CSR + indexes + parser + planner + executor + RAG primitives + WASM shim)
   ↑ depends on (but does not delegate to):
ogdb-types, ogdb-vector, ogdb-text, ogdb-temporal, ogdb-algorithms, ogdb-import, ogdb-export
   (plain-data + helpers; no runtime ownership)

ogdb-cli/src/lib.rs    (17 k LOC — CLI + HTTP server + MCP server + bolt frontend + 40 tests)
ogdb-bolt/src/lib.rs   (1.4 k LOC — Bolt v1 wire protocol; the only real "split" surface)
ogdb-ffi, ogdb-python, ogdb-node  (~700–950 LOC each, thin)
```

### Where the layers leak

- **Storage ↔ Index:** the `Database` god-struct holds `materialized_vector_indexes`, `materialized_fulltext_indexes`, `materialized_indexes` (B-tree), `node_label_versions`, `node_temporal_versions`, the `BufferPool`, the `NodePropertyStore`, the `CsrLayoutStore`, the `MetaStore`, **and** the per-version MVCC vectors **and** the WAL buffer **as fields of one struct**. There is no `trait Storage` / `trait Index` boundary; index code reaches directly into storage state and vice versa. Ripping out HNSW for `usearch` means hand-editing dozens of methods on `Database`.
- **Index ↔ Query:** the planner (`plan_match_clause` at line 3149) and executor (`execute_physical_plan_batches` at line 13947) are functions on `Database` itself. There is no `Catalog` trait the planner reads from — the planner reads `self.materialized_indexes`, `self.materialized_vector_indexes` directly. A different storage layer cannot satisfy the same planner without reimplementing the god-struct.
- **Query ↔ Surface:** the CLI's `handle_serve_*` functions know the shape of `QueryResult`, `ExecutionSummary`, `ProfiledQueryResult`. The MCP tool catalog (`execute_mcp_tools_call`, `handle_http_mcp_tools` in `ogdb-cli/src/lib.rs`) hand-crafts JSON payloads from those structures rather than going through a `trait QuerySurface`. Adding gRPC means writing a third hand-rolled JSON-shape pipeline.
- **Surface ↔ Clients:** the Python and Node addons re-export `OpenGraphDBClient` symbols that `ogdb-cli/src/lib.rs` owns; this is why commit `3f99e6b` (in the audited branch's recent history) had to fix the MCP re-exports — the client crates had no contract surface to lean on. Cross-binding work is a coordinated edit across three crates today; a `client-shared` crate would localise it.

### Where features cut horizontally in ugly ways

- **Temporal storage** is a column-set on `Database` (`node_temporal_versions: Vec<Vec<TemporalNodeVersion>>`, `edge_valid_from: Vec<Option<i64>>`, `edge_valid_to: Vec<Option<i64>>`) **and** a logical-plan operator (`AT TIME` / `AT SYSTEM TIME` parsed into `MatchClause`) **and** a CLI-time filter. There is no single "temporal subsystem" — it is a vertical stripe through every layer. Every place that reads node properties has to remember to filter through `temporal_filter_matches`. (`ogdb-temporal` crate is the helper, not the owner.)
- **MVCC visibility** is the same pattern: `Snapshot::can_see_version` is the abstraction the docs promise, but *index scans* skip it (the published "phantom read caveat" — `crates/ogdb-core/tests/index_scan_phantom_read_caveat.rs`). Visibility is a horizontal rule that the architecture wishes were a vertical mixin. The fact that the caveat needed a regression test to *pin* it (rather than a type-system invariant making it impossible) is the tell.
- **Vector index rebuilds** are gated on commit-time touched-keys analysis (`build_hnsw_from_entries`, `vector_index_rebuilds_total`) **inside** `commit_txn` (`ogdb-core/src/lib.rs`). The fix was a series of patches (cycle-1 `is_empty()`, cycle-2 C2-A5 indexed-property gate, eval Finding 2). Each patch was correct; together they are evidence that index consistency is **enforced procedurally inside the storage commit path** rather than declared as a `IndexUpdatePolicy` the storage layer asks of each registered index. A new index type cannot be added without editing `commit_txn`.
- **Compression** (`CompressionConfig`, `CompressionAlgorithm`) is a sidecar JSON file, a setter on `NodePropertyStore`, and per-page bytes on read paths. No `trait CompressedPage`.

The honest summary: **the kernel is one big mutually-recursive procedural file with co-equal subsystems woven together at the field level of one struct.** That is fine for v0.5; it does not survive v1.0.

---

## C. Crucial invariants — tested? proved? or vibes?

| # | Invariant | Status | Evidence |
|---|---|---|---|
| 1 | **Snapshot read isolation across temporal queries** — a reader at `T` never sees writes committed after `T` on row reads. | **Tested for row-level reads; explicitly NOT held for index scans.** `Snapshot::can_see_version` threads through `get_node_properties`, `node_labels`, neighbor traversal. `find_nodes_by_label` (index-backed) does **not** thread `snapshot_txn_id` and is documented as a known caveat. Pinned by `crates/ogdb-core/tests/index_scan_phantom_read_caveat.rs`. | Caveat is pinned, not fixed. SI is "row-level SI, index-level RC." |
| 2 | **WAL replay determinism** — the on-disk state after replay equals the committed state regardless of which sidecars survived. | **Largely tested.** `wal_v2_recovers_labels_and_props_after_sidecar_loss.rs` exercises the case where every sidecar JSON and the props pages are missing. `wal_replay_preserves_committed_labels_across_simulated_power_loss.rs` exercises the v1→v2 upgrade path. `proptest_atomicity.rs` randomises the failure point. | Strong — this is the system's best-defended invariant. The v1→v2 record-format upgrade (`upgrade_wal_buffer_to_v2`) closes the prior labels-and-props gap. |
| 3 | **Vector index consistency with graph state** — after `commit_txn` returns, every vector query sees the post-commit set or returns the same answer brute-force would. | **Tested under specific shapes.** `hnsw_recall_at_10_over_0_95_at_10k.rs`, `hnsw_query_under_5ms_p95_at_10k.rs`, `hnsw_matches_brute_force_on_tiny_fixture.rs`, `hnsw_no_rebuild_on_unrelated_commit.rs`, `c2_a5_hnsw_skip_rebuild_on_unrelated_property.rs`, `concurrent_inserts_do_not_corrupt_index.rs`. The rebuild-on-touched-keys gate is the *mechanism*, not the *contract*. | Tests cover happy paths + the regressions that hurt before. There is no test "after N concurrent commits the HNSW returns the same set as a fresh rebuild" — the property is asserted on the rebuild path, not the steady-state. |
| 4 | **RDF round-trip URI preservation** — `import → query → export` preserves the original IRI verbatim. | **Partially tested.** `crates/ogdb-cli/tests/rdf_import_edge_type_case.rs::rdf_import_preserves_original_iri_for_round_trip` pins edge-IRI verbatim preservation. There is no whole-graph round-trip test (import a TTL, export to TTL, diff against the original ignoring blank-node renaming). The architecture gate "RDF round-trip URI fidelity" (`ARCHITECTURE.md` §11) is asserted at the IRI level, not at the graph-isomorphism level. | Vibes for the whole-graph claim. |
| 5 | **Single-writer mutex** — embedded mode never has two concurrent committers. | **Held by type-system: `WriteConcurrencyMode::SingleWriter` is the default.** Tests in `concurrent_inserts_do_not_corrupt_index.rs` cover the multi-reader / single-writer shape. | Strong. |
| 6 | **Schema upgrade compatibility** — a v0.4.0 file opens cleanly on 0.5.x. | **Tested.** `upgrade_fixture_v0_4_0_opens_on_current.rs`, `upgrade_fixture_v0_5_0_opens_on_current.rs`. | Strong. |
| 7 | **TCK floor 50–55%** — `ARCHITECTURE.md` §11 quality gate. | **Aspirational.** The shipped TCK harness in `crates/ogdb-tck/tests/fixtures/tier1/` contains **9 scenarios** across 9 feature files (MATCH, WHERE, SET, RETURN ×4, DELETE, CREATE). The 400-of-800 number in `SPEC.md` §8.1 is a *target*; the actual public TCK pass rate is "not yet published" (per `skills/opengraphdb/references/cypher-coverage.md` line 46). | Documented gate; not actually a CI gate. |
| 8 | **MVCC version GC** — versions older than `version_gc_floor` are reclaimed at checkpoint. | **Field exists, behavior tested via `temporal_versioning.rs` and `rollback_rebuilds_label_projections.rs`.** No long-running soak test that GC actually bounds version vector growth under realistic workloads. | Tested narrowly. |
| 9 | **Bolt v1 wire conformance** — Neo4j 3.x driver round-trip. | `crates/ogdb-bolt/tests/` (2 files); `documentation/MIGRATION-FROM-NEO4J.md` admits modern drivers default to v4/v5 and **will reject the v1 handshake**. | Honest about the gap. v1-only is a documented limitation, not a hidden one. |

**Verdict on invariants:** the durability invariants (WAL replay, schema upgrade) are *defended like a database should defend them*. The isolation invariants are *partially defended with documented caveats* — which is honest but reads as "we know this is wrong but nobody has time to fix it; here is the regression test that pins the wrongness." The conformance invariants (TCK %, RDF whole-graph round-trip) are *aspirational gates that don't gate*.

---

## D. Evolvability — three forward moves

### 1. Distributed read replicas — **Painful (4–6 weeks of structural work).**
The current `Database` owns `BufferPool`, `MetaStore`, MVCC version vectors, the WAL writer and the index runtimes as private fields. There is no `trait Storage` to swap in for a "follower" mode that consumes WAL records from a primary and replays them. The `ReplicationSource` / `ReplicationSink` types exist (lines 589–688) but are scaffolding — `ReplicationSource::new` returns a stub even on a unix build. To do this properly: (a) extract a `ogdb-storage` crate with `trait Storage` covering read + commit; (b) make `Database::commit_txn` produce a serialisable "commit batch" record (it already produces v2 WAL records, so 70% there); (c) write a follower that owns its own buffer pool but no WAL writer; (d) gate visibility on `last_applied_lsn` rather than `last_committed_txn_id`. Steps (a) and (b) are weeks of work in a 41 k-line file. **Pre-req refactor: split `ogdb-core/src/lib.rs` into ~10 modules.**

### 2. SPARQL as a second query language — **Very painful (2–3 months) under current shape; medium (1 month) if planner is extracted first.**
Today `parse_cypher` (line 6358), `plan_match_clause` (line 3149), `execute_physical_plan` (line 13936), and the AST types (`CypherQuery`, `LogicalPlan`, `PhysicalPlan`) are all in `ogdb-core/src/lib.rs`, all using `CypherKeyword`/`CypherOperator`-flavored types. There is no language-agnostic `LogicalPlan` IR — `LogicalPlan` is openCypher-shaped (`MatchClause`, `WithClause`, etc.). SPARQL would either (a) compile-down to Cypher AST (lossy — `CONSTRUCT`, federated `SERVICE`, RDF reification have no Cypher equivalent — and `SPEC.md` §4.8 explicitly rejects this path), or (b) get its own parser + planner + executor + a shared physical plan. Option (b) requires extracting the physical plan + executor as a `trait QueryEngine` boundary first. **The honest answer aligns with `SPEC.md` §4.8: don't add SPARQL, double down on Cypher → GQL.** Architecturally the cost is so high it makes the spec's "no SPARQL" decision look like a structural escape hatch, not a philosophical one.

### 3. Swap HNSW backend (`instant-distance` → `usearch` or `hnsw_rs`) — **Medium (2–3 weeks).**
This is the cleanest of the three because there is only one consumer: `materialized_vector_indexes: BTreeMap<String, VectorIndexRuntime>` and the `build_hnsw_from_entries` function. But there is **no `trait VectorIndex`** today; `VectorIndexRuntime` directly holds an `instant-distance::HnswMap<HnswPoint, u64>` and the `instant-distance` crate's types appear in `ogdb-core/src/lib.rs` (lines 188–198 imports, then dozens of call sites). Swapping requires: (a) define `trait VectorIndex` with `build`, `query`, `insert`, `remove`, `recall_check` methods; (b) move `VectorIndexRuntime` into `ogdb-vector` (currently empty of runtime code); (c) gate behind a feature flag for the cycle. The `documentation/BENCHMARKS.md` row-6 "mutation p99 includes full-rebuild on `embedding`-touching commits" caveat is the forcing function — true incremental insert needs this trait anyway.

### 4. New MCP tool — **Easy (1 day).**
This is the one thing that is *well-shaped* today. Tools live in `execute_mcp_tools_call` and `handle_http_mcp_tools` in `ogdb-cli/src/lib.rs`. Adding a tool is: (i) write the function on `Database`, (ii) add a JSON dispatch arm, (iii) update the tools/list response. Tests under `crates/ogdb-cli/tests/mcp_*.rs` already model the shape. **MCP is the success story** of the agent-first thesis. Worth keeping that pattern as a model for refactoring the rest of the surface.

---

## E. Three biggest architectural risks

### Risk 1 — `ogdb-core/src/lib.rs` is the entire database in one file.
41,297 lines. 148 types. 1,084 method-level functions. One 30-field god-struct. `cargo check` invalidation cost on any edit is *the whole core*. New contributors cannot reason about subsystem boundaries because there are no boundaries. The "split crates" (`ogdb-vector`, `ogdb-text`, `ogdb-temporal`, `ogdb-algorithms`) are file-moves of pure data types; the runtime is still in `lib.rs`. `DESIGN.md` §1 already admits this in writing — but admission is not a fix. Until this is split into ~10 modules (`storage/`, `wal/`, `mvcc/`, `index/`, `parser/`, `planner/`, `executor/`, `catalog/`, `surface/`, `compression/`), every architectural improvement (replication, alternate indexes, alternate query languages, alternate storage backends) starts with "first, refactor lib.rs." That cost is currently being paid silently in slower iteration speed and in patches like the cycle-1/cycle-2/cycle-3 HNSW-rebuild-gate progression — patches in a single function that should be a method on a `trait VectorIndex`.

### Risk 2 — Snapshot Isolation is row-level only; index scans leak.
The "phantom read caveat" (`crates/ogdb-core/tests/index_scan_phantom_read_caveat.rs`, `SPEC.md` §4.3) is documented and pinned. But the mitigation advice — *"use a full scan + per-row `can_see_version` check"* — defeats the purpose of having indexes. Any user who reads `find_nodes_by_label` and assumes it respects their `ReadSnapshot` will write subtly broken code. This is the kind of defect that hits a production user three months in, generates a CVE-flavored bug report, and requires invasive surgery (read-set tracking + index-aware SSI) to close. The SI claim is the kind of correctness claim a graph DB *cannot* afford to be ambiguous about. Either upgrade to true SI (extract `trait Index` with snapshot-aware reads on all variants), or downgrade the marketing to "row-level SI; index queries see committed data."

### Risk 3 — There is no language-agnostic logical plan IR.
`LogicalPlan` and `PhysicalPlan` enums are openCypher-shaped (`MatchClause`, `WithClause`, `UnwindClause`). The planner reaches into `Database` fields directly (`self.materialized_indexes`), with no `Catalog` trait. The executor is a method on `Database`. This is fine while Cypher is the only language and `Database` is the only storage. But it means: (a) GQL conformance work has to choose between extending `CypherQuery` (the current path) or duplicating the planner; (b) experimentation with alternate planners (Cascades-style, WCOJ-prioritising, vectorized-by-default) is impossible without forking the executor; (c) the published "Cost-based with adaptive WCOJ" claim in `SPEC.md` §4.3 is **harder to verify** — there is no `trait CostModel` to inspect. The risk is not that this is wrong today — it is that the path from "openCypher with extensions" to "ISO GQL 39075 conformant" goes through a planner refactor that is currently invisible in the roadmap.

---

## F. Three biggest wins waiting

### Win 1 — Split `ogdb-core/src/lib.rs` into ~10 modules. Same crate, same exports, same Cargo.toml. Only `mod storage; mod wal; mod mvcc; mod index; mod parser; mod planner; mod executor; mod catalog; mod surface; mod compression;`.
**Why this is disproportionate:** zero behavior change, zero ABI change, zero performance change. But (a) every future PR diff becomes legible; (b) `cargo check` recompiles only the touched module; (c) the implicit boundaries that already exist in the code (sections of `lib.rs` you can already see in `grep -n "fn execute"` clusters) become explicit, which makes Risk 1 retreat. Estimated cost: ~2 weeks for a careful engineer; the file is large but it is also *organised* (the structures are defined in roughly the right blocks). This is the highest-leverage refactor in the repo.

### Win 2 — Define `trait Index` (and `trait VectorIndex`, `trait FullTextIndex`) and route `commit_txn` through registered indexes.
**Why this is disproportionate:** (a) closes the HNSW backend swap (Section D-3) from "structural rewrite" to "implement a trait"; (b) makes the eval Finding 2 + cycle-2 C2-A5 patches retrospectively a *trait method* (`Index::should_rebuild_after_commit(touched: &CommitDelta) -> bool`) rather than a per-fix bandaid; (c) opens the door to user-defined indexes without forking core; (d) gives a clear seam for snapshot-aware index scans (Risk 2). This is the same refactor that the `MaterializedIndex` / `MaterializedVectorIndex` / `MaterializedFullTextIndex` triplet is *secretly asking for* every time they grow a parallel field. Estimated cost: ~3 weeks once Win 1 is done.

### Win 3 — Extract `ogdb-surface` (or `ogdb-server`) crate with `trait QuerySurface` covering `query`, `query_profiled`, `mcp_tool_call`, `subgraph`, `vector_search`, `text_search`.
**Why this is disproportionate:** today CLI/HTTP/MCP/Bolt all hand-craft JSON shapes from `QueryResult`. A surface trait with stable JSON serialization (already 80% there in `ExecutionSummary`/`ProfiledQueryResult`) means: (a) gRPC becomes additive (one impl); (b) Python and Node bindings stop reaching into `ogdb-cli` for client types; (c) the "agent-native" thesis becomes a *contract* the planner/executor layer satisfies, not a *tradition* the surface layer maintains by convention. Estimated cost: ~3 weeks; the work in commit `3f99e6b` (re-export OpenGraphDBClient from `@opengraphdb/mcp` properly) is the in-flight forcing function. **MCP is already the success template — generalise it.**

---

## G. Where docs and code disagree (call-outs)

These are real, not nits. Each is a place a new contributor reading the docs would form an incorrect mental model.

| # | Doc claim | Code reality |
|---|---|---|
| 1 | `DESIGN.md` §2 describes a 14-variant `enum PageType` (FileHeader, Catalog, FreeList, NodeColumn, EdgeCSR, PropertyData, StringHeap, BTreeInner, BTreeLeaf, HashBucket, HNSWLayer, HNSWVectors, FTSegment, Temporal, Overflow). | **None of these PageType variants exist in `ogdb-core/src/lib.rs`.** The actual storage is page-headed but homogeneously typed; the typed-page taxonomy was a 0.1-era sketch that DESIGN.md never updated. |
| 2 | `DESIGN.md` §1 sketches an internal `crates/ogdb-core/src/{storage,buffer,wal,tx,index,catalog,types}/` decomposition. | `ogdb-core/src/` is **`lib.rs` + `platform_io.rs`**. DESIGN.md §1's "Reality check (0.4.0)" admits this, but the rest of DESIGN.md (40 sections!) reads as if the original layout were real. It is not. |
| 3 | `SPEC.md` §4.1 says "Async runtime: Tokio. Industry standard for Rust async I/O." | `ogdb-cli` and `ogdb-bolt` use **`std::net::TcpListener`** synchronously. `ogdb-core/Cargo.toml` carries a comment that tokio "lives in a future ogdb-server crate." Tokio is **not a dependency**. (The sync I/O choice is arguably better for an embedded engine, but the spec is misleading.) |
| 4 | `SPEC.md` §4.2 lists "Compression: LZ4 for data blocks, ZSTD for cold storage." | The dependency tree includes `zstd` only. **There is no LZ4 dep.** `CompressionAlgorithm` in core has Zstd + None variants today. |
| 5 | `ARCHITECTURE.md` §11 + `SPEC.md` §8.1: "openCypher TCK floor at 50–55% with full Tier-1 categories" / "~400 of ~800 scenarios." | The shipped TCK harness has **9 scenarios** in 9 `.feature` files. `skills/opengraphdb/references/cypher-coverage.md` line 46 admits "the full external openCypher TCK pass-rate is *not* yet published." The CI gate is "Tier-1 ≥ 50%" of a *very small* sample, not the published 50–55% number. |
| 6 | `SPEC.md` §11 perf targets: "Single-hop traversal < 1 ms; Multi-hop (3 hops, 1M nodes) < 10 ms; Throughput > 100K QPS." | Documented `BENCHMARKS.md` row 3 (point read p95 = 6.8 μs **at 10 k nodes**) clears 1 ms easily — but no 1 M scale numbers are published, and rows 1+2 (bulk + streaming ingest) lose by 670–1150× to the comparable Memgraph / Kuzu numbers. The 100 K QPS throughput target is **not yet measured**. The SPEC numbers are aspirational targets, the BENCHMARKS file is the truth — this is OK, but `SPEC.md` reads as commitment, not aspiration. |
| 7 | `SPEC.md` §10 lists Bolt as "Shipped (v1-only)". | `documentation/MIGRATION-FROM-NEO4J.md` §"Bolt protocol coverage" admits modern Neo4j 5.x drivers will **reject the v1 handshake**. So in practice Bolt is shipped-but-unused. The two facts are 200 lines apart in two different files. |
| 8 | `SPEC.md` §13.1 "Vector search (HNSW via USearch)". | The actual impl is `instant-distance` (pure-Rust HNSW), per `ARCHITECTURE.md` §12. `SPEC.md` is stale on the dependency choice. |
| 9 | `SPEC.md` §3 "100 K QPS LDBC Interactive". | `BENCHMARKS.md` row 5 is **LDBC mini fixture (100 persons), 25.9 k qps**. The published 100 k claim has no benchmark. |

These are the disagreements a principal engineer reading the repo would catch in 30 minutes. They are also the kind of disagreements that erode the "agent-friendly" thesis — an LLM that reads SPEC and forms a plan from it will confidently generate code that uses tokio, LZ4, and USearch.

---

## G2. The shape of the codebase, one screenful

```
opengraphdb/                                lines  files  notes
├── Cargo.toml                                117          18-crate workspace
├── ARCHITECTURE.md                           191          authoritative on intent
├── DESIGN.md                                2550          partly-stale on layout (§1 admits)
├── SPEC.md                                   680          stale on tokio, LZ4, USearch, 100k QPS
├── README.md, IMPLEMENTATION-READY.md        ...
├── CHANGELOG.md                            ~2000          dense, accurate, the closest thing to source-of-truth
├── crates/
│   ├── ogdb-core/                          41461      2  ⚠️ 41 k LOC in ONE file — the kernel
│   │   └── src/{lib.rs, platform_io.rs}
│   ├── ogdb-cli/                           18787      5  ⚠️ 17 k LOC in ONE file — CLI + HTTP + MCP
│   ├── ogdb-bolt/                           1366      1  ✅ properly extracted (cycle-2 C2-H7)
│   ├── ogdb-eval/                           3927     20  ✅ proper structure
│   ├── ogdb-types/                           372      1  thin (data only)
│   ├── ogdb-vector/                          166      1  thin (helpers only — runtime in core)
│   ├── ogdb-text/                            114      1  thin (helpers only — runtime in core)
│   ├── ogdb-temporal/                        189      1  thin (helpers only — runtime in core)
│   ├── ogdb-algorithms/                      285      1  thin (helpers only — runtime in core)
│   ├── ogdb-import/                          409      1  thin
│   ├── ogdb-export/                          143      1  thin
│   ├── ogdb-tck/                             433      2  9 scenarios shipped (vs 50% of 800 claimed)
│   ├── ogdb-{ffi, python, node}/             ...      1  binding crates, ~700-950 LOC each
│   └── ogdb-{e2e, fuzz, bench}/              ...
└── ...
```

The five-line summary: **two files contain 60 k of the 70 k Rust LOC.** Those two files *are* the architecture — everything else is a wrapper.

---

## H. Verdict

**`NEEDS-PASS`.** Not `NEEDS-REWRITE` — the data model, the storage strategy (CSR + delta + WAL), the choice of `instant-distance` + `tantivy`, the agent-first MCP layer, the dual-personality embedded/CLI surface, the v2 WAL record format, the upgrade-fixture gates, the honesty of `BENCHMARKS.md` and `MIGRATION-FROM-NEO4J.md`: these are all *correct decisions*. The thesis is right. The invariants the system *must* defend (durability, single-writer, schema upgrade, HNSW recall) are defended with real tests.

But shipping this codebase to "v1.0 + 1000 stars + production users" without a structural pass would book a debt that compounds. The **first 1000 stars find Risk 1 (god-module) by trying to contribute**; the **first 10 production users find Risk 2 (index-scan SI hole) by getting wrong answers**; the **first serious enterprise prospect finds Risk 3 (no plan IR) by asking for SPARQL or replication and learning the cost is "a quarter."**

The structural pass is well-defined and well-bounded:

1. Split `ogdb-core/src/lib.rs` into ~10 modules — same crate, same API. (Win 1.)
2. Extract `trait Index` / `trait VectorIndex` / `trait FullTextIndex`; move runtime types into the sibling crates that today only hold helpers. (Win 2.)
3. Extract `ogdb-surface` with `trait QuerySurface`; CLI/HTTP/MCP/Bolt impl it, bindings consume it. (Win 3.)
4. Decide on the SI claim — either upgrade index scans to be snapshot-aware, or change the marketing.
5. Sweep doc-vs-code disagreements (§G) — bring `SPEC.md` into agreement with `BENCHMARKS.md` and the actual Cargo deps; shrink the aspirational claims; promote `CHANGELOG.md`'s dense, accurate writing style upward.

Estimated cost: **~8–12 weeks of one engineer**, parallelisable. The product thesis stands. The codebase is *shaped to do this work*, even though it has not yet done it.

If those five items land before v1.0, OpenGraphDB is shipped on a defensible foundation and the agent-first / embedded / multi-modal thesis becomes a **structural** thesis rather than a **product** one. If those five items don't land, the kernel stays a god-module and every subsequent feature compounds the debt — which is how good projects become hard to contribute to.

---

**Method note:** worktree at `/tmp/wt-audit-arch` from `origin/main` (commit `23e8327`). Read of `ARCHITECTURE.md` (191 lines), `SPEC.md` (680), `DESIGN.md` (selected §1, §2, §3), `CHANGELOG.md` first 30 entries, all 18 crate `Cargo.toml`, `crates/ogdb-core/src/lib.rs` structure (148 type defs surveyed by grep, 1084 fn count, key sections at lines 11579 / 8292 / 6358 / 3149 / 13947 / 21788 / 7884 read in detail), `crates/ogdb-cli/src/lib.rs` HTTP/MCP entry points, `crates/ogdb-bolt/src/lib.rs` v1 handshake, all 39 `ogdb-core/tests/*` filenames, `documentation/BENCHMARKS.md` rows 1–8, and the existing audit format at `documentation/.research/coverage-audit-2026-05-05.md`.
