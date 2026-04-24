# ogdb-core-split-vector — extract vector primitives into new `ogdb-vector` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-vector/` (stub `Cargo.toml`, empty `src/lib.rs`, and two
> failing existence tests — one in the new crate, one shim-compat test
> in `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-core-split-vector`.
>
> Phases 3–5 (GREEN) move the pure-primitive items from
> `crates/ogdb-core/src/lib.rs` into `crates/ogdb-vector/src/lib.rs`,
> replace the in-core definitions with a `pub use ogdb_vector::*`
> shim, and wire `ogdb-core` to depend on `ogdb-vector`. Phases 6–8
> cover CHANGELOG + docs/IMPLEMENTATION-LOG + per-crate tests.

**Goal:** land the **first, smallest, zero-downstream-impact** facet of
the 7-crate split from `ARCHITECTURE.md` §13 by extracting the pure
vector-math and vector-literal-parsing primitives out of the 41 922-line
`crates/ogdb-core/src/lib.rs` monolith into a brand-new
`crates/ogdb-vector/` crate, with a `pub use` backward-compat shim in
`ogdb-core`.

**Architecture:** `ogdb-vector` owns `VectorDistanceMetric`,
`VectorIndexDefinition`, `vector_distance`, `parse_vector_literal_text`,
and `compare_f32_vectors` — all currently pure-Rust items with zero
dependencies on `Database`, `DbError`, the Cypher runtime, or the HNSW
engine. `ogdb-core` keeps every other vector concern (HNSW runtime,
catalog persistence, planner integration, procedure arguments) in place;
a `pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`
line plus a private `use ogdb_vector::{vector_distance,
parse_vector_literal_text, compare_f32_vectors};` import keep every
existing call site (in `ogdb-core` and in every downstream crate)
compiling byte-for-byte identically.

**Tech stack:** Rust 2021, workspace-inherited version metadata, `serde`
(inherited from core), no new runtime deps. `ogdb-vector` pulls only
`serde` through workspace inheritance; the HNSW runtime that depends on
`instant-distance` stays in `ogdb-core` (behind the existing
`vector-search` feature flag). Per-crate `cargo test -p <crate>` only —
**never** `--workspace` (AGENTS contract + user directive).

---

## 1. Problem summary — `ogdb-core` is a 41 922-line single-file monolith and must be split incrementally

The authoritative target architecture in `ARCHITECTURE.md` §13 defines
three capability tiers (core / extended / production), and the
`DESIGN.md` references seven planned sub-crates to decompose the
current `ogdb-core`:

| Planned crate      | Current location in `ogdb-core/src/lib.rs`                                 |
|--------------------|----------------------------------------------------------------------------|
| `ogdb-query`       | Cypher parser + planner + executor (~25 000 LOC, lines 1608–8115, 22303–22777) |
| `ogdb-import`      | RDF / CSV / JSON import paths                                              |
| `ogdb-export`      | Schema / dataset export paths                                              |
| `ogdb-vector`      | `VectorDistanceMetric`, HNSW runtime, vector-scan planner hooks            |
| `ogdb-text`        | `tantivy` full-text index runtime                                          |
| `ogdb-temporal`    | `TemporalFilter`, `TemporalScope`, episode / validity windowing            |
| `ogdb-algorithms`  | `ShortestPathOptions`, pathfinding, community detection, subgraph utilities |

The problem is not "is the architecture right" (it is). The problem is
**how to get from a single 41 922-line `lib.rs` to seven crates
without destabilising the 286 downstream callers across 10 crates.**

Concretely, `crates/ogdb-core/src/lib.rs` has:

- **41 922 lines** (`wc -l crates/ogdb-core/src/lib.rs`)
- **exactly one `mod` declaration**: `mod tests { … }` at line 22 778. Every
  other type, function, and constant is in the flat
  `ogdb_core::` root namespace.
- **~150 top-level `pub` items** consumed by downstream crates via
  `use ogdb_core::{Database, Header, PropertyMap, PropertyValue,
  VectorDistanceMetric, …};` patterns. There is no sub-module surface
  to preserve — every rename is a breaking change unless shimmed.
- **no in-file section headers or region banners** — grep for
  `// ======`, `// SECTION`, `// Module` returns zero region comments,
  so "which lines belong together" has to be inferred by reading
  type definitions and impl blocks.

A big-bang "move everything" split across seven crates in one commit
would:

- touch an estimated **~40 000 LOC** in one PR,
- require coordinated edits to every downstream crate
  (`ogdb-cli`, `ogdb-eval`, `ogdb-bench`, `ogdb-bolt`, `ogdb-e2e`,
  `ogdb-ffi`, `ogdb-node`, `ogdb-python`, `ogdb-tck`, `ogdb-fuzz`),
- make every `git log --follow` impossibly noisy,
- and carry a high risk of introducing subtle duplicated-type /
  orphan-impl compile errors that are very painful to triage in a
  41k-line diff.

**Net:** the right play is an **incremental, facet-at-a-time split**.
This plan is the first instalment. It extracts the smallest
self-contained vector-primitive seed into `ogdb-vector`, leaving every
other concern in `ogdb-core` and guaranteeing **zero downstream-crate
edits** via a `pub use` shim.

## 2. Exact reproducer — what "monolith today, seed tomorrow" looks like

### 2.1 Before this plan (main as of `bcbdbec`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e  ogdb-eval
ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck
$ ls crates/ogdb-core/src/
lib.rs
$ wc -l crates/ogdb-core/src/lib.rs
41922 crates/ogdb-core/src/lib.rs
$ grep -cE '^(pub )?mod ' crates/ogdb-core/src/lib.rs
1            # the test module only
$ grep -rn 'ogdb_core::VectorDistanceMetric' crates/ | wc -l
26           # downstream callers that must not break
```

### 2.2 After this plan (end of GREEN — `Phase 5` of the 8-phase workflow)

```bash
$ ls crates/
ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e  ogdb-eval
ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-vector
$ cat crates/ogdb-vector/Cargo.toml    # new
$ wc -l crates/ogdb-vector/src/lib.rs
~120
$ wc -l crates/ogdb-core/src/lib.rs
~41 820     # ~100 LOC lighter
$ grep -n 'pub use ogdb_vector' crates/ogdb-core/src/lib.rs
2 hits       # VectorDistanceMetric + VectorIndexDefinition
$ cargo test -p ogdb-vector --tests                   # PASS (new smoke test)
$ cargo test -p ogdb-core --test ogdb_vector_reexport_shim  # PASS (shim test)
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/  # empty — zero downstream changes
```

## 3. Module map + LOC estimate — what is currently inside `ogdb-core`

No `mod` declarations exist, so "modules" below are **logical groupings**
derived from reading type defs, impl blocks, and call graphs. Line
ranges are approximate; the numbers are from direct `grep -n` surveys.

| Facet (logical)       | Approx. lines        | Approx. LOC   | Notes                                                                                 |
|-----------------------|----------------------|---------------|---------------------------------------------------------------------------------------|
| Storage + header + compression | 1 – 540              | ~540         | `HEADER_SIZE`, `CompressionAlgorithm`, `Header`, page layout                         |
| Property value + collation     | 529 – 830            | ~300         | `PropertyValue` enum + `compare_f32_vectors` (line 816)                              |
| Errors + metrics + replication | 230 – 520            | ~290         | `DbError`, `DbMetrics`, `ReplicationSource/Sink`, `TraceCollector`                   |
| Cypher lexer + tokens          | 1 566 – 1 716        | ~150         | `ParseError`, `Token`, `CypherKeyword`, `CypherOperator`, `CypherPunctuation`        |
| Cypher AST                     | 1 717 – 2 010        | ~300         | `CypherQuery`, `MatchClause`, `Pattern*`, `NodePattern`, `RelationshipPattern`, …    |
| Cypher analyser + planner      | 2 013 – 6 170        | ~4 150       | `AnalysisError`, `PlanError`, `QueryError`, logical + physical plans                 |
| Runtime helpers                | 5 930 – 6 900        | ~970         | `parse_string_argument`, `parse_vector_literal_text`, `parse_distance_metric_argument`, `runtime_to_vector`, `vector_distance` |
| **Vector primitives (this plan)** | **scattered (4 call-sites)** | **~100**     | **`VectorDistanceMetric` @1316, `VectorIndexDefinition` @1323, `compare_f32_vectors` @816, `parse_vector_literal_text` @5947, `vector_distance` @5968** |
| HNSW runtime + persistence     | 8 050 – 8 300        | ~250         | `PersistedVectorIndexStore/Entry`, `VectorIndexRuntime`, `HnswVectorPoint`, `BuiltHnsw`, `build_hnsw_from_entries` |
| FTS (`tantivy`) runtime        | ~9 000 – ~10 500     | ~1 500       | `FullTextIndexDefinition`, FTS rebuild, BM25 query paths                             |
| Database + transactions + WAL  | ~10 500 – ~22 300    | ~11 800      | `Database`, `Snapshot`, `Transaction`, WAL v2 writer + replayer                      |
| Test module                    | 22 778 – 41 922      | ~19 100      | `#[cfg(test)] mod tests` (the other half of the file)                                |
| Algorithms + subgraph          | ~12 800 – ~13 400    | ~600         | `ShortestPathOptions`, `GraphPath`, `Subgraph`, `SubgraphEdge`, BFS/Dijkstra helpers |
| Temporal + episodes            | 1 267 – 1 440        | ~170         | `TemporalScope`, `TemporalFilter`, `Episode`, `CommunitySummary`, hierarchy types    |
| Document ingest + RAG          | 1 442 – 1 570        | ~130         | `IngestConfig`, `IngestResult`, `RagResult`, `RetrievalSignal`, `DrillResult`        |
| WASM bindings                  | 964 – 1 238          | ~270         | `WasmInMemoryDatabase`, `WasmDatabase` (wasm32 only)                                 |
| Schema + export types          | 1 239 – 1 266        | ~30          | `SchemaCatalog`, `ExportNode`, `ExportEdge`                                          |

Total non-test production LOC ≈ **22 780**; total test LOC ≈ **19 140**.

**Facets ranked by self-containment** (= easy to extract first → hard):

1. **Vector primitives (this plan)** — pure f32 math + literal parser; no
   `DbError`, `Database`, or Cypher-runtime references.
2. Temporal primitive types (`TemporalScope`, `TemporalFilter`) — plain
   data, but bleed into `Episode` which bleeds into
   `CommunityHierarchy` which touches Database.
3. Algorithms (`ShortestPathOptions`, `GraphPath`, `Subgraph*`) — touch
   `PropertyValue`, `NodeId`, and `DbError`; ~600 LOC.
4. FTS runtime — depends on `tantivy`, `Database`, catalog; ~1 500 LOC.
5. HNSW runtime (the rest of vector beyond primitives) — depends on
   `instant-distance`, `Database`, `VectorIndexRuntime` state; ~250 LOC
   but heavy entanglement with `Database` methods.
6. Cypher query engine — **~25 000 LOC**, the largest facet; needs
   multiple preparatory extractions first.
7. Import / export — need `Database`, file I/O, format parsers.

## 4. Internal dependency graph for the 5 items being moved

```
┌──────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs                                             │
│                                                                  │
│   VectorDistanceMetric (pub enum @1316)                          │
│       ↑                                                           │
│       ├── VectorIndexDefinition (pub struct @1323)               │
│       ├── vector_distance(metric, l, r) (fn @5968)               │
│       ├── parse_distance_metric_argument (fn @6175)  ← STAYS     │
│       ├── Database::list_vector_indexes (public API)             │
│       ├── VectorIndexRuntime (private @8128)         ← STAYS     │
│       └── BuiltHnsw, HnswVectorPoint (private)       ← STAYS     │
│                                                                   │
│   parse_vector_literal_text (fn @5947)                            │
│       ↑                                                           │
│       ├── parse_vector_argument (fn @6171)           ← STAYS     │
│       └── runtime_to_vector (fn @5931)               ← STAYS     │
│                                                                   │
│   compare_f32_vectors (fn @816)                                   │
│       ↑                                                           │
│       ├── PropertyValue::Ord (impl @766)             ← STAYS     │
│       ├── property_value_ordering (fn @5150)         ← STAYS     │
│       └── 3 test invocations (lines 35065-35073)                  │
│                                                                   │
│   vector_distance (fn @5968)                                      │
│       ↑                                                           │
│       ├── extract_vector_distance_filter (fn @3809)  ← STAYS     │
│       ├── vector_query_nodes (fn @13366)             ← STAYS     │
│       └── physical VectorScan operator               ← STAYS     │
└──────────────────────────────────────────────────────────────────┘
```

**Key property:** every arrow into a "STAYS" box is a call from `ogdb-core`
code into a moved item. After the split, those call sites continue
to resolve against the moved items via either:

- **`pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`**
  at the top of `crates/ogdb-core/src/lib.rs` (so anything already
  written as `VectorDistanceMetric::Cosine` keeps resolving — the
  re-export hoists the enum and its variants into `ogdb_core::` root), **and**
- **`use ogdb_vector::{vector_distance, parse_vector_literal_text,
  compare_f32_vectors};`** (private crate-local import so the existing
  unqualified call sites `vector_distance(metric, l, r)` inside
  `ogdb-core` resolve to the new crate's `pub fn`).

No outbound `ogdb-vector → ogdb-core` edge exists. No cycle.

## 5. Downstream inventory — who imports `ogdb_core::Vector*` today

Exhaustive survey via
`grep -rnE 'ogdb_core::[^;]*Vector' crates/`:

| Downstream crate / file                                                                     | What it imports from `ogdb_core`                                         | After shim? |
|----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|------|
| `ogdb-cli/src/lib.rs:5`                                                                      | `SharedDatabase, ShortestPathOptions, VectorDistanceMetric, WriteConcurrencyMode` | ✅ no change |
| `ogdb-cli/src/lib.rs:8209`                                                                   | `use ogdb_core::{DbRole, VectorDistanceMetric};` (test-only)              | ✅ no change |
| `ogdb-cli/src/lib.rs:2560–2568` — `parse_vector_metric` matches `VectorDistanceMetric::{Cosine, Euclidean, DotProduct}` | variant resolution                                                       | ✅ no change |
| `ogdb-ffi/src/lib.rs:300–304`                                                                | `ogdb_core::VectorDistanceMetric::{Cosine, Euclidean, DotProduct}`        | ✅ no change |
| `ogdb-python/src/lib.rs:3`                                                                   | `DbError, Header, PropertyMap, PropertyValue, SharedDatabase, VectorDistanceMetric` | ✅ no change |
| `ogdb-eval/src/drivers/ai_agent.rs:22`                                                       | `Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric`     | ✅ no change |
| `ogdb-e2e/tests/comprehensive_e2e.rs:7`                                                      | `PropertyMap, PropertyValue, SharedDatabase, ShortestPathOptions, VectorDistanceMetric` | ✅ no change |
| `ogdb-core/tests/hnsw_matches_brute_force_on_tiny_fixture.rs:19`                             | `Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric`     | ✅ no change |
| `ogdb-core/tests/hnsw_survives_drop_and_reopen.rs:21`                                        | same                                                                       | ✅ no change |
| `ogdb-core/tests/hnsw_recall_at_10_over_0_95_at_10k.rs:28`                                   | same                                                                       | ✅ no change |
| `ogdb-core/tests/concurrent_inserts_do_not_corrupt_index.rs:30`                              | same                                                                       | ✅ no change |
| `ogdb-core/tests/hnsw_query_under_5ms_p95_at_10k.rs:23`                                      | same                                                                       | ✅ no change |

**Count:** 26 `VectorDistanceMetric` references across 8 downstream
files + 5 `ogdb-core` integration tests.

**`VectorIndexDefinition`:** grep returns **zero** downstream imports —
no crate outside `ogdb-core` imports this type today. Moving it into
`ogdb-vector` with a `pub use` re-export is belt-and-braces: it covers
any future caller without cost.

**Private helpers (`vector_distance`, `parse_vector_literal_text`,
`compare_f32_vectors`):** zero downstream references (they are
private `fn` in `ogdb-core`). Moving them to `ogdb-vector` as `pub fn`
strictly widens the accessible surface, which is a superset change
(safe).

**Downstream-crate edits required by this plan: 0.**

## 6. Facet choice — why `ogdb-vector` primitives first

The two candidate facets the user flagged are `ogdb-vector` and
`ogdb-algorithms`. Both are plausible seeds. Here is the scoring:

| Criterion                                   | `ogdb-vector` primitives               | `ogdb-algorithms` (pathfinding)          |
|---------------------------------------------|----------------------------------------|------------------------------------------|
| Uses `Database` / `DbError`?                | No (pure f32 + string)                 | Yes (`ShortestPathOptions` returns `DbError`) |
| Uses `PropertyValue` / `NodeId`?            | No                                     | Yes (`GraphPath` contains node rows)     |
| Uses `VectorIndexRuntime` or HNSW state?    | No                                     | No                                       |
| LOC of pure core to extract                 | ~100                                   | ~600                                     |
| Downstream references to extracted types    | 26 (all `VectorDistanceMetric`)         | 4 (`ShortestPathOptions` in `ogdb-cli` + `ogdb-e2e`) |
| Risk of accidentally needing `Database` in the new crate | **zero**                               | medium (path returns may need to borrow node row data) |
| Sets up future HNSW extraction              | Yes (creates the `ogdb-vector` beachhead) | No (orthogonal facet)                    |

`ogdb-vector` primitives win on every axis: fewer LOC, zero
`Database`/`DbError` coupling, and they establish the `ogdb-vector`
crate as a landing pad for the much bigger Phase-2 HNSW extraction
(which will be the next plan after this one).

### What moves (and only these)

| Item                          | Kind     | Current location in `ogdb-core/src/lib.rs` | Approx. LOC |
|-------------------------------|----------|--------------------------------------------|-------------|
| `VectorDistanceMetric`        | `pub enum` | lines 1316–1322                           | 7          |
| `VectorIndexDefinition`       | `pub struct` + derives | lines 1323–1331              | 9          |
| `compare_f32_vectors`         | `fn` → `pub fn` | lines 816–829                        | 14         |
| `parse_vector_literal_text`   | `fn` → `pub fn` | lines 5947–5966                       | 20         |
| `vector_distance`             | `fn` → `pub fn` | lines 5968–6008                       | 41         |
| `#[cfg(test)]` unit tests for each of the above (new, in `ogdb-vector/src/lib.rs`) | `#[test]` | new | ~40 |

Total moved source: **~91 LOC**. New unit tests in `ogdb-vector`: **~40
LOC**. Net `ogdb-core` shrinkage: **~91 LOC** (plus 2 `pub use` lines
and 1 `use` line added, so strictly ~88 LOC).

### What stays in `ogdb-core` (explicit non-scope)

Every item below **must remain** in `ogdb-core`; a follow-up plan will
extract the HNSW engine into `ogdb-vector` once the primitives
beachhead is settled.

- `HNSW_MIN_N`, `HNSW_EF_CONSTRUCTION`, `HNSW_EF_SEARCH`,
  `HNSW_BUILDER_SEED`, `HNSW_OVERSAMPLE_FANOUT`,
  `HNSW_BITMAP_BRUTE_THRESHOLD`, `VECTOR_MAX_DIMENSIONS` — feature-gated
  constants; they cohabit with WAL constants at the top of the file and
  should move with the HNSW runtime, not ahead of it.
- `PersistedVectorIndexStore`, `PersistedVectorIndexEntry`,
  `VectorIndexRuntime`, `HnswVectorPoint`, `BuiltHnsw` — runtime state
  held by `Database`; entangled with transaction commit/rebuild paths.
- `build_hnsw_from_entries` — depends on `instant-distance` (currently
  an optional dep of `ogdb-core`).
- `Database::collect_vector_index_entries`,
  `Database::try_load_vector_indexes_from_sidecar`,
  `Database::sync_vector_index_sidecar`,
  `Database::rebuild_vector_indexes_from_catalog*`,
  `Database::sync_vector_index_sidecar_no_fsync`,
  `Database::list_vector_indexes`, `Database::vector_query_nodes` —
  methods on `Database`; cannot move without splitting `Database` too.
- `expression_to_vector_literal`, `extract_vector_distance_filter`,
  `normalize_vector_index_definition`, `runtime_to_vector`,
  `parse_vector_argument`, `parse_distance_metric_argument` — these
  touch `CypherExpression`, `RuntimeValue`, and the planner's internal
  helper `parse_string_argument`. Extracting them requires extracting
  (or duplicating) their helper dependencies first.
- `PropertyValue::Vector` variant and the ordering / collation impl
  (line 782) — lives on `PropertyValue`, which is a core-wide type
  shared with import/export/runtime. Do not touch.
- `VECTOR_MAX_DIMENSIONS` — part of property-store schema validation,
  not a vector-primitive. Stays with the property writer.

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level imports

At the top of `crates/ogdb-core/src/lib.rs` (right after the existing
`use` block, before the first `const`), add exactly two lines:

```rust
// Re-export the public vector primitive types so every existing
// `use ogdb_core::VectorDistanceMetric` caller in the workspace
// (and every embedder pinning the 0.3 surface) keeps compiling.
pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};

// Crate-private import so the ~20 unqualified call sites in this
// file (e.g. `vector_distance(metric, l, r)`) resolve to the new
// crate without needing fully-qualified paths.
use ogdb_vector::{compare_f32_vectors, parse_vector_literal_text, vector_distance};
```

### 7.2 Why `pub use` is byte-for-byte compatible for enums

`pub use ogdb_vector::VectorDistanceMetric;` re-exports the enum **and
all its variants**. Every downstream occurrence of
`VectorDistanceMetric::Cosine` resolves via
`ogdb_core::VectorDistanceMetric::Cosine` → pointer to
`ogdb_vector::VectorDistanceMetric::Cosine`. Pattern matching,
`Debug`/`Clone`/`PartialEq`/`Serialize`/`Deserialize` derives, and
`std::mem::size_of` are all preserved because it is literally the same
type.

`VectorIndexDefinition` gets the same treatment — derives
(`Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize`)
are attached to the single definition in `ogdb-vector`, and every
downstream usage stays valid.

### 7.3 `Cargo.toml` edits

- **New** `crates/ogdb-vector/Cargo.toml`:
  ```toml
  [package]
  name = "ogdb-vector"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [dependencies]
  serde = { version = "1", features = ["derive"] }
  ```
  No `serde_json`, no `instant-distance`, no optional features in
  Phase 1 — keep the dep tree of the beachhead crate as thin as
  possible.

- **Modified** `crates/ogdb-core/Cargo.toml` adds one line to
  `[dependencies]`:
  ```toml
  ogdb-vector = { path = "../ogdb-vector" }
  ```

- **Modified** root `Cargo.toml` adds one entry to `[workspace] members`:
  ```toml
  "crates/ogdb-vector",
  ```

No other crate's `Cargo.toml` changes.

## 8. RED-phase failing tests (exact file contents)

Two new tests are introduced. Both must fail on this commit (because
the source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-vector/tests/api_smoke.rs`

This asserts that the new crate exposes the expected public API once it
is populated in GREEN. It compiles (because `ogdb-vector` is already a
workspace member with an empty `lib.rs` after this RED commit), but
every test **fails to compile** or **fails at runtime** because no
symbol exists yet. The crate's `lib.rs` is literally empty (`//! RED`)
so the `use ogdb_vector::*` line fails with
`error[E0432]: unresolved imports`, which is the expected RED signal.

```rust
//! RED-phase API smoke test for the extracted ogdb-vector crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition,
//! vector_distance, parse_vector_literal_text, compare_f32_vectors}`
//! are not yet defined (src/lib.rs is intentionally empty).
//!
//! GREEN state (Phase 5 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been moved out of
//! crates/ogdb-core/src/lib.rs into crates/ogdb-vector/src/lib.rs.

use ogdb_vector::{
    compare_f32_vectors, parse_vector_literal_text, vector_distance,
    VectorDistanceMetric, VectorIndexDefinition,
};

#[test]
fn distance_metric_has_three_variants() {
    // The enum's three variants are the public contract downstream
    // crates (ogdb-cli, ogdb-ffi, ogdb-python) already pattern-match
    // on. Adding or removing a variant is a breaking change.
    let variants = [
        VectorDistanceMetric::Cosine,
        VectorDistanceMetric::Euclidean,
        VectorDistanceMetric::DotProduct,
    ];
    assert_eq!(variants.len(), 3);
    // Derives from the original type must survive the move.
    let cloned = variants[0].clone();
    assert_eq!(format!("{cloned:?}"), "Cosine");
}

#[test]
fn vector_index_definition_is_plain_data() {
    // Sanity-check that the struct survives the move with its derives
    // intact (PartialOrd + Ord + Serialize + Deserialize). These are
    // load-bearing for the BTreeSet<VectorIndexDefinition> catalog
    // in ogdb-core (lib.rs:8080).
    let a = VectorIndexDefinition {
        name: "idx_a".to_string(),
        label: Some("Doc".to_string()),
        property_key: "embedding".to_string(),
        dimensions: 3,
        metric: VectorDistanceMetric::Cosine,
    };
    let b = a.clone();
    assert_eq!(a, b);
    assert!(a <= b); // Ord preserved
}

#[test]
fn cosine_distance_of_identical_vectors_is_zero() {
    // Cosine: 1 - dot/(|l|*|r|). Identical non-zero vectors → 1 - 1 = 0.
    let v = [1.0_f32, 2.0, 3.0];
    let d = vector_distance(VectorDistanceMetric::Cosine, &v, &v)
        .expect("identical-length non-empty vectors should return Some");
    assert!(d.abs() < 1e-5, "cosine(v,v) ≈ 0, got {d}");
}

#[test]
fn euclidean_distance_is_l2_norm_of_diff() {
    let l = [0.0_f32, 0.0];
    let r = [3.0_f32, 4.0];
    let d = vector_distance(VectorDistanceMetric::Euclidean, &l, &r)
        .expect("same-length vectors");
    assert!((d - 5.0).abs() < 1e-5, "sqrt(9+16)=5, got {d}");
}

#[test]
fn dot_product_distance_is_negative_dot() {
    // Planner convention: distance = -dot so smaller = closer, matching
    // cosine/euclidean. Regressing this flips query ordering silently.
    let l = [1.0_f32, 2.0, 3.0];
    let r = [1.0_f32, 1.0, 1.0];
    let d = vector_distance(VectorDistanceMetric::DotProduct, &l, &r)
        .expect("same-length vectors");
    assert!((d + 6.0).abs() < 1e-5, "-(1+2+3) = -6, got {d}");
}

#[test]
fn vector_distance_on_mismatched_or_empty_returns_none() {
    // Regression pin: the HNSW layer + Cypher planner both rely on
    // None meaning "invalid pair, fall back to NULL in Cypher / skip
    // in HNSW". A panic or Some(NaN) here is a bug.
    let l = [1.0_f32, 2.0];
    let r = [1.0_f32, 2.0, 3.0];
    assert!(vector_distance(VectorDistanceMetric::Cosine, &l, &r).is_none());

    let empty: [f32; 0] = [];
    assert!(vector_distance(VectorDistanceMetric::Cosine, &empty, &empty).is_none());
}

#[test]
fn parse_vector_literal_text_accepts_bracketed_csv() {
    assert_eq!(
        parse_vector_literal_text("[1.0, 2.5, -3.0]"),
        Some(vec![1.0_f32, 2.5, -3.0]),
    );
    // Empty vector literal `[]` is a legitimate sentinel — `Some(vec![])`
    // NOT `None`.
    assert_eq!(parse_vector_literal_text("[]"), Some(Vec::<f32>::new()));
    // Type-prefix tolerance for `i64:` / `f64:` that the Cypher
    // runtime emits is load-bearing — see lib.rs:5958.
    assert_eq!(
        parse_vector_literal_text("[f64:1.0, i64:2]"),
        Some(vec![1.0_f32, 2.0]),
    );
}

#[test]
fn parse_vector_literal_text_rejects_unbracketed_or_garbage() {
    assert!(parse_vector_literal_text("1.0, 2.0").is_none());
    assert!(parse_vector_literal_text("[1.0, not-a-number]").is_none());
    assert!(parse_vector_literal_text("").is_none());
}

#[test]
fn compare_f32_vectors_orders_by_length_then_lex() {
    use std::cmp::Ordering;
    // Length mismatch: shorter is Less.
    assert_eq!(
        compare_f32_vectors(&[1.0], &[1.0, 0.0]),
        Ordering::Less,
    );
    // Equal length: lex compare via total_cmp (NaN-safe).
    assert_eq!(
        compare_f32_vectors(&[1.0, 2.0], &[1.0, 3.0]),
        Ordering::Less,
    );
    assert_eq!(
        compare_f32_vectors(&[1.0, 2.0], &[1.0, 2.0]),
        Ordering::Equal,
    );
}
```

Running today (RED):
```
$ cargo test -p ogdb-vector --tests
error[E0432]: unresolved import `ogdb_vector::VectorDistanceMetric`
  --> crates/ogdb-vector/tests/api_smoke.rs:11:5
```

Running after Phase 5 (GREEN): all 9 tests PASS.

### 8.2 `crates/ogdb-core/tests/ogdb_vector_reexport_shim.rs`

This is the **backward-compat guarantee** that no downstream crate
breaks. It asserts `ogdb_core::VectorDistanceMetric` and
`ogdb_core::VectorIndexDefinition` are still nameable from the
`ogdb_core::` root, that their variants pattern-match, and that their
sizes match the `ogdb_vector` originals.

```rust
//! Shim regression: `ogdb_core::VectorDistanceMetric` and
//! `ogdb_core::VectorIndexDefinition` must remain nameable from the
//! `ogdb_core::` root after the Phase-1 vector primitive split. The
//! 7 downstream crates (ogdb-cli, ogdb-eval, ogdb-ffi, ogdb-python,
//! ogdb-e2e, ogdb-node, ogdb-bolt) + 5 ogdb-core integration tests
//! all spell these types via `use ogdb_core::VectorDistanceMetric;`
//! — if this file stops compiling, the shim in lib.rs is broken.
//!
//! RED state (this commit): fails because ogdb-core does not yet
//! depend on ogdb-vector, so the types are still defined in-crate
//! — the test *passes* trivially. To force RED we assert the
//! re-export is in place by checking that the type comes *from*
//! ogdb-vector (via a std::any::TypeId equality below). That
//! assertion fails until Phase 5.
//!
//! GREEN state: ogdb-core re-exports via
//! `pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`
//! and the TypeId equality holds.

use std::any::TypeId;

#[test]
fn vector_distance_metric_is_reexported_from_ogdb_vector() {
    // If this line fails to compile, a downstream caller using
    // `use ogdb_core::VectorDistanceMetric;` will also break.
    let _cosine = ogdb_core::VectorDistanceMetric::Cosine;
    let _euclidean = ogdb_core::VectorDistanceMetric::Euclidean;
    let _dot = ogdb_core::VectorDistanceMetric::DotProduct;

    // Identity check: the type the downstream sees as
    // `ogdb_core::VectorDistanceMetric` must BE the type defined in
    // ogdb-vector (not a parallel copy). If a future refactor
    // accidentally reintroduces a duplicate definition in ogdb-core,
    // TypeId equality catches it — and the Serde/BTreeSet catalogue
    // would silently break on cross-crate boundaries otherwise.
    assert_eq!(
        TypeId::of::<ogdb_core::VectorDistanceMetric>(),
        TypeId::of::<ogdb_vector::VectorDistanceMetric>(),
        "ogdb_core::VectorDistanceMetric must be a `pub use` re-export \
         of ogdb_vector::VectorDistanceMetric, not a duplicate type. \
         See .planning/ogdb-core-split-vector/PLAN.md §7.",
    );
}

#[test]
fn vector_index_definition_is_reexported_from_ogdb_vector() {
    assert_eq!(
        TypeId::of::<ogdb_core::VectorIndexDefinition>(),
        TypeId::of::<ogdb_vector::VectorIndexDefinition>(),
        "ogdb_core::VectorIndexDefinition must be a `pub use` \
         re-export of ogdb_vector::VectorIndexDefinition.",
    );

    // Constructor round-trip across the shim — proves field layout
    // survives the re-export.
    let def = ogdb_core::VectorIndexDefinition {
        name: "idx".into(),
        label: None,
        property_key: "emb".into(),
        dimensions: 4,
        metric: ogdb_core::VectorDistanceMetric::Euclidean,
    };
    assert_eq!(def.dimensions, 4);
}

#[test]
fn catalog_btreeset_ordering_is_stable_across_shim() {
    // ogdb-core stores `vector_index_catalog: BTreeSet<VectorIndexDefinition>`
    // (lib.rs:8080). BTreeSet requires `Ord`, which is derived lexicographically
    // across (name, label, property_key, dimensions, metric). Any
    // re-derivation divergence between the old in-core type and the
    // new ogdb-vector type would silently corrupt catalog iteration
    // order. Pin it here.
    use std::collections::BTreeSet;
    let a = ogdb_core::VectorIndexDefinition {
        name: "a".into(),
        label: None,
        property_key: "e".into(),
        dimensions: 2,
        metric: ogdb_core::VectorDistanceMetric::Cosine,
    };
    let b = ogdb_core::VectorIndexDefinition {
        name: "b".into(),
        label: None,
        property_key: "e".into(),
        dimensions: 2,
        metric: ogdb_core::VectorDistanceMetric::Cosine,
    };
    let mut set = BTreeSet::new();
    set.insert(b.clone());
    set.insert(a.clone());
    let ordered: Vec<_> = set.iter().collect();
    assert_eq!(ordered[0].name, "a");
    assert_eq!(ordered[1].name, "b");
}
```

To make these tests usable, `ogdb-core`'s `[dev-dependencies]` gains
one line in Phase 5:

```toml
ogdb-vector = { path = "../ogdb-vector" }   # already a regular dep in GREEN; dev-dep not needed
```

In RED the test file lives in `crates/ogdb-core/tests/` but will **not
compile** because `use ogdb_vector` is unresolved — `ogdb-core` does
not yet depend on `ogdb-vector`. That is the expected RED signal:

```
$ cargo test -p ogdb-core --test ogdb_vector_reexport_shim
error[E0432]: unresolved import `ogdb_vector`
error[E0433]: failed to resolve: could not find `VectorDistanceMetric`
               in `ogdb_core`
```

Running after Phase 5 (GREEN): all 3 tests PASS.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit.

### Phase 3 — create the new crate

1. `crates/ogdb-vector/Cargo.toml` — the 8-line stub in §7.3.
2. `crates/ogdb-vector/src/lib.rs`:
   - Paste the 5 items (as `pub`) verbatim from the line ranges in §6.
   - Keep the item order stable with `ogdb-core`'s ordering so the
     `git log --follow` chain is short.
   - Add 3 doc-tests at the top of the file calling each `pub fn` once,
     so `cargo doc --no-deps -p ogdb-vector` renders examples.
   - Add `#[cfg(test)] mod tests` covering the same contract as
     `tests/api_smoke.rs`, but exercising private-helper paths if any
     arise during the move (none expected in Phase 1).
3. Add `"crates/ogdb-vector",` to root `Cargo.toml` members list.

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`, add
   `ogdb-vector = { path = "../ogdb-vector" }` under `[dependencies]`.
2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** the 5 items' definitions at their original line ranges.
   - **Add** the 2-line import block from §7.1 right after the last
     `use std::…` statement (around line 40).
   - Verify no in-file reference uses `crate::VectorDistanceMetric`
     (grep confirms current callers use the unqualified name only —
     both the `pub use` and the `use` cover them).
3. **Do not** touch any downstream crate.

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test
cargo test -p ogdb-vector --tests

# Core — the shim regression test + every existing ogdb-core test
cargo test -p ogdb-core --test ogdb_vector_reexport_shim
cargo test -p ogdb-core --tests     # the big integration test suite
cargo test -p ogdb-core --lib       # unit tests inside lib.rs mod tests

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-cli ogdb-ffi ogdb-python ogdb-bolt ogdb-eval \
             ogdb-bench ogdb-node ogdb-e2e ogdb-tck ogdb-fuzz; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

No edits to any downstream `Cargo.toml` or `src/` file are expected.
If any `cargo build -p <crate>` fails, the shim is wrong — revert the
`pub use` line and investigate; do **not** paper over with downstream
edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append a `[ogdb-core-split-vector]`
  section describing the primitive extraction, the shim strategy, and a
  reference to this PLAN.md.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-vector` crate exposes
    `VectorDistanceMetric`, `VectorIndexDefinition`, `vector_distance`,
    `parse_vector_literal_text`, `compare_f32_vectors`."
  - `### Changed` — "`ogdb-core` re-exports the vector primitives from
    `ogdb-vector` via `pub use`; public surface unchanged."
- `ARCHITECTURE.md` §13: no change — the tiers hold.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-vector-primitive-split` referencing this plan (matches the
  pattern of every recent plan, e.g. `fuzzing-harness-targets-compile`).

## 10. Out-of-scope (explicitly deferred to later plans)

- Moving the HNSW runtime state and `Database` vector methods
  (~250 LOC + ~10 method bodies). Requires exposing an
  `ogdb_vector::HnswIndex` trait that `Database` implements against.
- Moving `VectorIndexRuntime`, `PersistedVectorIndexStore`, and the
  `instant-distance` dep. Must come after primitives beachhead is in.
- Moving `parse_vector_argument`, `parse_distance_metric_argument`,
  `runtime_to_vector`, `expression_to_vector_literal`,
  `extract_vector_distance_filter`, `normalize_vector_index_definition`.
  Requires first extracting `parse_string_argument` into a shared
  argument-parser module (likely destined for `ogdb-query`).
- Any change to `PropertyValue::Vector` or its collation. That
  variant lives on the core property-value type and stays in
  `ogdb-core` until every consumer is split.
- The other 6 planned crates (`ogdb-query`, `ogdb-import`,
  `ogdb-export`, `ogdb-text`, `ogdb-temporal`, `ogdb-algorithms`).
  Each gets its own `.planning/` plan and its own `plan/ogdb-core-split-<facet>`
  branch, in the order laid out in §3.
- **Any** `cargo build --workspace` or `cargo test --workspace` invocation.
  AGENTS contract + user directive: per-crate only.

## 11. Commit plan

| Phase | Commit subject                                                                    | Scope                                                                           |
|------:|------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| 2     | `plan(ogdb-core-split-vector): PLAN.md + RED-phase failing tests`                   | this commit                                                                    |
| 3     | `chore(ogdb-core-split-vector): add ogdb-vector crate skeleton`                     | empty `lib.rs` → populated with primitive items + pub API                      |
| 4     | `refactor(ogdb-core-split-vector): replace in-core primitives with pub-use shim`    | delete 5 items from `ogdb-core/src/lib.rs`, add `pub use` shim, wire dep       |
| 5     | `test(ogdb-core-split-vector): per-crate green under shim`                          | runs the per-crate matrix from §9 Phase 5 and records results                  |
| 6     | `docs(ogdb-core-split-vector): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`          | docs only                                                                      |
| 7     | `chore(release-tests): append ogdb-vector-primitive-split manifest entry`           | release-tests yaml only                                                        |

A follow-up plan `plan/ogdb-core-split-vector-hnsw` will pick up where
this leaves off.
