# ogdb-core-split-export — extract `ExportNode` + `ExportEdge` plain-data types into new `ogdb-export` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-export/` (stub `Cargo.toml`, doc-only `src/lib.rs`, and two
> failing tests — one in the new crate, one shim-compat test in
> `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-core-split-export`.
>
> Phases 3–5 (GREEN) move the two plain-data export-record types
> (`ExportNode` @1005, `ExportEdge` @1013) out of
> `crates/ogdb-core/src/lib.rs` into `crates/ogdb-export/src/lib.rs`,
> replace the in-core definitions with a
> `pub use ogdb_export::{ExportEdge, ExportNode};` shim line, and add a
> single-line workspace path dep on `ogdb-types`. The four
> Database-coupled export-orchestrator methods —
> `Database::export_nodes` (@11816), `Database::export_edges` (@11820),
> `Database::export_nodes_at` (@17794), `Database::export_edges_at`
> (@17809) — **stay in `ogdb-core`** because every body call resolves
> against `Snapshot`-coupled internals (`current_snapshot_txn_id()`,
> `is_node_visible_at`, `node_labels_at`, `node_properties_at`,
> `edge_records`, `edge_valid_window_at`, `edge_type_at`,
> `edge_properties_at`, `edge_transaction_time_millis_at`,
> `is_edge_visible_at`). Phases 6–8 cover CHANGELOG +
> `docs/IMPLEMENTATION-LOG.md` + per-crate tests +
> `.github/workflows/release-tests.yaml` manifest entry.

**Goal:** land the **sixth** facet of the 7-crate split from
`ARCHITECTURE.md` §13 / `DESIGN.md` `ogdb-export/` by extracting the
**two `PropertyMap`-embedding plain-data export-record types** out of
the 40 933-line `crates/ogdb-core/src/lib.rs` monolith into a brand-new
`crates/ogdb-export/` crate, with a `pub use` backward-compat shim in
`ogdb-core`. Mirrors the beachhead-plus-shim strategy shipped in
`plan/ogdb-core-split-vector` (commit `472ad2e`),
`plan/ogdb-core-split-algorithms` (commit `df41dbb`),
`plan/ogdb-core-split-text` (commit `4c25af6`),
`plan/ogdb-core-split-temporal` (commit `63b9dfa`),
`plan/ogdb-core-split-import` (commit `01acb72`), and the foundational
`plan/ogdb-types-extraction` (commit `39f9e7c` — which lifted
`PropertyMap`/`PropertyValue` into `ogdb-types` and unblocked this
extraction).

**Architecture:** `ogdb-export` owns two plain-data record structs.
Every moved item depends only on stdlib types (`u64`, `i64`,
`Option<String>`, `Vec<String>`) and the **one** workspace path dep on
`ogdb-types` for the shared `PropertyMap` field — **no `Database`, no
`Snapshot`, no `DbError`, no WAL, no storage layer references.**
The Database-coupled orchestrator layer — `Database::export_nodes` /
`Database::export_edges` / `Database::export_nodes_at` /
`Database::export_edges_at` — **stays in `ogdb-core`** for this seed.
The only Database-side edit is:

1. The four export methods keep their current bodies byte-for-byte.
   `Database::export_nodes_at` body still constructs `ExportNode {
   id, labels, properties }` (@17800-17804); `Database::export_edges_at`
   still constructs `ExportEdge { id, src, dst, edge_type, properties,
   valid_from, valid_to, transaction_time_millis }` (@17822-17832).
   Both unqualified constructions resolve via the `pub use` re-export.
   **No line of any export method body changes.**

A `pub use ogdb_export::{ExportEdge, ExportNode};` line at the top
of `crates/ogdb-core/src/lib.rs` (right after the existing
`pub use ogdb_types::{PropertyMap, PropertyValue};` at @81) keeps every
existing call site (the 4 Database method signatures + the 2 in-core
`#[cfg(test)] #[test]` integration tests at @25952 and @26012 that
read `nodes[0].id` / `edges[0].edge_type` / etc. through the public
fields) compiling byte-for-byte identically. **One downstream-crate
user** (`ogdb-cli/src/lib.rs` line 3 — the only crate in the workspace
that imports `ExportEdge`/`ExportNode`) keeps its `use ogdb_core::{
... ExportEdge, ExportNode, ...};` line unchanged — covered by the
`pub use` shim. **Zero downstream-crate edits required.**

**Tech stack:** Rust 2021, workspace-inherited version metadata. The
new crate adds **one** workspace path dep on `ogdb-types` (already a
zero-Database leaf) for the `PropertyMap` field type. **No `serde`
dep is needed for the moved types** — neither `ExportNode` nor
`ExportEdge` derives `Serialize`/`Deserialize` in the current code
(verified: derives are `#[derive(Debug, Clone, PartialEq, Eq)]` on
both at @1004 and @1013). Per-crate `cargo test -p <crate>` only —
**never** `--workspace` (AGENTS contract + user directive).

**Coupling verdict (Option A vs Option B):** **Option B** — move only
the two plain-data record types; leave the four `Database` methods
that build them in core. See §6 for the full A-vs-B tradeoff; the
tl;dr is that a true Option A would require:

1. Moving `Database::export_nodes_at` (@17794-17806, 13 LOC) and
   `Database::export_edges_at` (@17809-17835, 27 LOC) into
   `ogdb-export` requires abstracting **9 distinct `Database`-reading
   methods** (`current_snapshot_txn_id`, `node_count`,
   `is_node_visible_at`, `node_labels_at`, `node_properties_at`,
   `edge_records` field access, `is_edge_visible_at`,
   `edge_valid_window_at`, `edge_type_at`, `edge_properties_at`,
   `edge_transaction_time_millis_at`) behind a new
   `ExportableDatabase` trait. That trait would become public API on
   day 1 and would overlap heavily with the `NodeRead` / `EdgeRead`
   trait the algorithms-traversal follow-up will design.
2. Forcing `DbError` to leak into `ogdb-export` (every reader returns
   `Result<_, DbError>`).
3. Moving the 2 in-core `#[cfg(test)] #[test]` integration tests at
   @25952 and @26012 (both call `db.export_nodes()`/`db.export_edges()`
   and `db.export_nodes_at(...)`/`db.export_edges_at(...)`) into a
   shared test harness re-exporting the trait. That doubles the
   surface to maintain.

Option B lets us land a tight, verifiable seed that moves exactly the
pure plain-data surface (the two property-bag-embedding records) and
leaves the storage-coupled orchestrator for a follow-up plan
(`plan/ogdb-core-split-export-runtime`) that can reuse the
`ExportableDatabase` trait designed alongside the `NodeRead` /
`EdgeRead` contracts from `plan/ogdb-core-split-algorithms-traversal`.

**Why this seed is now feasible (and was BLOCKED before).** The prior
import-extraction PLAN (`plan/ogdb-core-split-import` §1, see the
"deferred" row in the candidate-facet table) recorded:

> `ogdb-export` — Blocked: both [`ExportNode` and `ExportEdge`] embed
> `PropertyMap` (the `BTreeMap<String, PropertyValue>` core type
> @877). Same circular-dependency blocker that defers
> `TemporalNodeVersion` from the temporal seed. Moving requires
> either a `<P>` generic on each struct + serde-on-generic for
> round-trips, or splitting out a foundational `ogdb-types` crate
> first.

The foundational `ogdb-types` extraction shipped on `2026-04-26`
(commit `39f9e7c`) and now owns `PropertyMap` (line 338 of
`crates/ogdb-types/src/lib.rs`) and `PropertyValue` (line 35).
`ogdb-core` re-exports them via `pub use ogdb_types::{PropertyMap,
PropertyValue};` at `crates/ogdb-core/src/lib.rs:81`. The
property-bag cycle is therefore broken: `ogdb-export → ogdb-types`
becomes the new acyclic edge that `ExportNode`/`ExportEdge` need to
embed `PropertyMap` outside `ogdb-core`. **No BLOCKED state.**

---

## 1. Problem summary — `ogdb-export` is the smallest plain-data seed

The five prior splits + the foundational `ogdb-types` extraction
established a stable beachhead pattern:

1. New crate with empty/doc-only `lib.rs` + Cargo stub.
2. Extract only **pure items** with zero (or one re-exportable)
   coupling to `Database`, `DbError`, the Cypher runtime, or storage.
3. `pub use` re-export in `ogdb-core` → zero downstream crate edits.
4. Per-crate `cargo test` matrix, never `--workspace`.

After those six events, the remaining 7-crate plan items break down:

| Planned crate   | Status                                                                                                                                                                                                                                              | Blocker (if any)                                                                                                                                                                                          |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ogdb-vector`   | **Shipped** (commit `472ad2e`)                                                                                                                                                                                                                       | —                                                                                                                                                                                                          |
| `ogdb-algorithms` | **Shipped** (commit `df41dbb`)                                                                                                                                                                                                                      | —                                                                                                                                                                                                          |
| `ogdb-text`     | **Shipped** (commit `4c25af6`)                                                                                                                                                                                                                       | —                                                                                                                                                                                                          |
| `ogdb-temporal` | **Plain-data shipped** (commit `63b9dfa`); runtime tail still deferred (`TemporalNodeVersion`).                                                                                                                                                      | Now also unblocked by `ogdb-types`; orthogonal to this plan.                                                                                                                                               |
| `ogdb-import`   | **Plain-data + parsers shipped** (commit `01acb72`); orchestrator deferred.                                                                                                                                                                          | Orthogonal.                                                                                                                                                                                                |
| **`ogdb-types`**  | **Shipped** (commit `39f9e7c`) — `PropertyMap`/`PropertyValue` now leaf-owned                                                                                                                                                                       | —                                                                                                                                                                                                          |
| **`ogdb-export` (this plan)** | **Now feasible** — `PropertyMap` cycle resolved by `ogdb-types`                                                                                                                                                                          | None.                                                                                                                                                                                                       |
| `ogdb-query`    | **~25 000 LOC Cypher engine** — terminal refactor, not a seed.                                                                                                                                                                                       | Defer until all small seeds land.                                                                                                                                                                          |

The export facet wins as the next seed because **the plain-data
subset is even purer and more self-contained than the import seed
was**: `ExportNode` is a 3-field struct (`id: u64`, `labels:
Vec<String>`, `properties: PropertyMap`) and `ExportEdge` is an
8-field struct (`id`, `src`, `dst: u64`, `edge_type:
Option<String>`, `properties: PropertyMap`, `valid_from`,
`valid_to: Option<i64>`, `transaction_time_millis: i64`). Both are
**`#[derive(Debug, Clone, PartialEq, Eq)]`** with **no custom impls,
no methods, no `Default`**, and only **one downstream consumer**
(`ogdb-cli`).

Net moved LOC is ~21 — smaller than every prior seed (vector ~91,
algorithms ~207, text ~70, temporal ~10 + ~16 new, import ~270,
types ~299). One workspace dep migrates cleanly because
`ogdb-types` is already in `ogdb-core`'s tree. Zero new third-party
deps.

The Database-coupled cohort (`Database::export_nodes` /
`export_edges` / `export_nodes_at` / `export_edges_at` and the 2
in-core integration tests) is **not in this seed** — every method
body iterates `self.edge_records` / calls `self.is_node_visible_at`
/ `self.node_labels_at` / `self.node_properties_at` /
`self.edge_valid_window_at`. Lifting them requires the Option-A
trait set; follow-up plan.

## 2. Exact reproducer — what "after the 6 prior splits, before the export split" looks like

### 2.1 Before this plan (main as of `39f9e7c`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-import  ogdb-node ogdb-python
ogdb-tck  ogdb-temporal  ogdb-text  ogdb-types  ogdb-vector
$ wc -l crates/ogdb-core/src/lib.rs
40933 crates/ogdb-core/src/lib.rs
$ grep -nE '^(pub )?(struct) (ExportNode|ExportEdge)\b' crates/ogdb-core/src/lib.rs
1005:pub struct ExportNode {
1013:pub struct ExportEdge {
$ grep -nE '^[[:space:]]+(pub )?fn export_(nodes|edges)' crates/ogdb-core/src/lib.rs
11816:    pub fn export_nodes(&self) -> Result<Vec<ExportNode>, DbError> {
11820:    pub fn export_edges(&self) -> Result<Vec<ExportEdge>, DbError> {
17794:    fn export_nodes_at(&self, snapshot_txn_id: u64) -> Result<Vec<ExportNode>, DbError> {
17809:    fn export_edges_at(&self, snapshot_txn_id: u64) -> Result<Vec<ExportEdge>, DbError> {
$ grep -rnE '\bExportNode\b|\bExportEdge\b' crates/ --include='*.rs' \
    | grep -v 'crates/ogdb-core/' | wc -l
17     # source-level references downstream (16 in ogdb-cli + 1 doc-comment in ogdb-types)
$ grep -rnE 'use ogdb_core::' crates/ --include='*.rs' \
    | grep -E '\b(ExportNode|ExportEdge)\b' | grep -v 'crates/ogdb-core/'
crates/ogdb-cli/src/lib.rs:3:    Database, DbError, DocumentFormat, EnrichedRagResult, ExportEdge, ExportNode, Header,
```

### 2.2 After this plan (end of GREEN — Phases 3–5)

```bash
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-export ogdb-ffi  ogdb-fuzz  ogdb-import  ogdb-node
ogdb-python ogdb-tck  ogdb-temporal  ogdb-text  ogdb-types  ogdb-vector
$ cat crates/ogdb-export/Cargo.toml          # ~10 lines
$ wc -l crates/ogdb-export/src/lib.rs
~110         # ExportNode + ExportEdge + module doc + #[cfg(test)] mod tests
$ wc -l crates/ogdb-core/src/lib.rs
~40 913      # ~20 LOC lighter (21 deleted, 1 pub use line added)
$ grep -n 'pub use ogdb_export' crates/ogdb-core/src/lib.rs
1            # one re-export line for two record types
$ cargo test -p ogdb-export --tests                              # PASS (5 smoke tests)
$ cargo test -p ogdb-core --test ogdb_export_reexport_shim       # PASS (4 shim tests)
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/ crates/ogdb-vector/ crates/ogdb-algorithms/ \
           crates/ogdb-text/ crates/ogdb-temporal/ crates/ogdb-import/ \
           crates/ogdb-types/
# empty — zero downstream changes
```

## 3. Module map + LOC estimate — current `ExportNode`/`ExportEdge` footprint in `ogdb-core`

Grep-derived, from `crates/ogdb-core/src/lib.rs` as of commit `39f9e7c`:

| Item                                           | Line range  | LOC | Category                                                                                                                       | Moves?                                                                                                                                                                                  |
|-------------------------------------------------|-------------|----:|--------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `pub struct ExportNode`                         | 1003–1009   |   7 | Plain data: `#[derive(Debug, Clone, PartialEq, Eq)]`; 3 fields (`id: u64`, `labels: Vec<String>`, `properties: PropertyMap`)   | **YES**                                                                                                                                                                                  |
| (blank line between)                            | 1010–1011   |   2 | —                                                                                                                              | (whitespace; collapsed)                                                                                                                                                                  |
| `pub struct ExportEdge`                         | 1012–1023   |  12 | Plain data: `#[derive(Debug, Clone, PartialEq, Eq)]`; 8 fields                                                                 | **YES**                                                                                                                                                                                  |
| `Database::export_nodes` (method)               | 11816–11818 |   3 | One-liner that delegates to `export_nodes_at(self.current_snapshot_txn_id())`. `&self → Result<Vec<ExportNode>, DbError>`.     | **NO** (stays — reads `Snapshot` state)                                                                                                                                                  |
| `Database::export_edges` (method)               | 11820–11822 |   3 | One-liner delegate to `export_edges_at(self.current_snapshot_txn_id())`. `&self → Result<Vec<ExportEdge>, DbError>`.           | **NO** (stays)                                                                                                                                                                            |
| `Database::export_nodes_at` (private method)    | 17794–17806 |  13 | Iterates `0..self.node_count()`, calls `is_node_visible_at`, `node_labels_at`, `node_properties_at`. Heavy `Database` coupling. | **NO** (stays — would force `ExportableDatabase` trait)                                                                                                                                   |
| `Database::export_edges_at` (private method)    | 17809–17835 |  27 | Iterates `self.edge_records`, calls `is_edge_visible_at`, `is_node_visible_at`, `edge_valid_window_at`, `edge_type_at`, `edge_properties_at`, `edge_transaction_time_millis_at`. Heaviest coupling of the four. | **NO** (stays)                                                                                                                                                                            |
| 2 in-core `#[cfg(test)] #[test]` integration tests | 25952–25994; 26012–26043 | ~75 | `export_snapshots_include_node_and_edge_metadata` (calls `db.export_nodes()` / `db.export_edges()` and asserts on returned record fields); `export_snapshot_helpers_skip_invisible_nodes_and_edges` (calls `db.export_nodes_at(0)` / `db.export_edges_at(...)` and tests visibility under MVCC). Both `#[cfg(test)] mod tests`. | **NO** — they continue to test `Database::export_*` end-to-end via the (now re-exported) `ExportNode`/`ExportEdge` types                                                                |
| Module-level doc-comment ref to `ExportNode`/`ExportEdge` | 78          |   1 | Single line in the file's top-level doc comment about the property-bag pattern: `// field, the `ExportNode`/`ExportEdge`/`TemporalNodeVersion` properties:` | **NO** (doc comment; non-load-bearing — left as a historical reference) |

**LOC moved in this plan:** **~21 LOC** out of `ogdb-core` (2 plain
struct definitions including doc comments + the blank line between
them collapses on insert). **New unit + integration tests in
`ogdb-export`:** ~80 LOC covering field round-trips on both structs,
`Default::default()` invariants for `Vec<String>` / `PropertyMap`
fields via direct construction, the `Eq`/`PartialEq` contract, and
the `Clone`/`Debug` derives. **Net `ogdb-core` shrinkage:** ~20 LOC
(21 deleted − 1 line added: `pub use
ogdb_export::{ExportEdge, ExportNode};`).

The 2 existing `Database::export_*` integration tests at @25952 and
@26012 are **kept in `ogdb-core/src/lib.rs`** unchanged — they
exercise the `Database` orchestrator methods, not the record types.
No helper-level unit tests exist in core that target `ExportNode`/
`ExportEdge` field access in isolation, so nothing migrates with the
move (unlike the import seed, which migrated
`test_cross_reference_detection`).

## 4. Internal dependency graph for the items being moved

```
┌──────────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs                                                 │
│                                                                      │
│  ExportNode (pub struct @1005, → ogdb-export)                        │
│    ↑                                                                 │
│    ├── Database::export_nodes return type (@11816)         ← STAYS   │
│    ├── Database::export_nodes_at return type (@17794)      ← STAYS   │
│    ├── Database::export_nodes_at body construction         ← STAYS   │
│    │     (@17800-17804: ExportNode { id, labels, properties })       │
│    ├── 2 in-core test field-read sites                                │
│    │     (@25981-25994: nodes[0].id, .labels, .properties)            │
│    │     ← STAYS (resolved via pub use re-export)                    │
│    └── 16 ogdb-cli source-level refs                                  │
│        (1 import line + 14 use sites + 1 nested test construction)    │
│          ← STAYS (resolved via pub use re-export)                    │
│                                                                      │
│  ExportEdge (pub struct @1013, → ogdb-export)                        │
│    ↑                                                                 │
│    ├── Database::export_edges return type (@11820)         ← STAYS   │
│    ├── Database::export_edges_at return type (@17809)      ← STAYS   │
│    ├── Database::export_edges_at body construction         ← STAYS   │
│    │     (@17822-17832: ExportEdge { id, src, dst, edge_type,        │
│    │                                  properties, valid_from,         │
│    │                                  valid_to,                       │
│    │                                  transaction_time_millis })      │
│    ├── 2 in-core test field-read sites                                │
│    │     (@25995-26000, @26031-26039: edges[0].id, .src, .dst,        │
│    │       .edge_type, .properties)                                   │
│    │     ← STAYS (resolved via pub use re-export)                    │
│    └── 16 ogdb-cli refs (same import line as ExportNode)              │
│          ← STAYS (resolved via pub use re-export)                    │
│                                                                      │
│  PropertyMap (now in ogdb-types, used by both fields above)          │
│    └── New edge: ogdb-export → ogdb-types                            │
│        (Cargo.toml workspace path dep)                                │
└──────────────────────────────────────────────────────────────────────┘
```

**Key property:** every "STAYS" arrow into the moved cluster is a
call that resolves via the `pub use ogdb_export::{ExportEdge,
ExportNode};` line at the top of `crates/ogdb-core/src/lib.rs`.
Since `pub use` hoists the type into the `ogdb_core::` namespace,
every existing in-core construction (`ExportNode { id, labels,
properties }`), every method signature (`fn export_nodes(&self) ->
Result<Vec<ExportNode>, DbError>`), every test field-read
(`nodes[0].id`, `edges[0].edge_type`), and every downstream import
(`use ogdb_core::{..., ExportEdge, ExportNode, ...}`) continues to
resolve byte-for-byte identically.

**No outbound `ogdb-export → ogdb-core` edge exists.** The new edge
is `ogdb-export → ogdb-types`. `ogdb-types` has zero `ogdb-core`
references (verified `grep -n ogdb_core crates/ogdb-types/src/lib.rs
crates/ogdb-types/Cargo.toml` returns zero hits) — DAG remains
acyclic:

```
ogdb-vector (serde)
   ↓
ogdb-types (serde, serde_json, ogdb-vector)
   ↓
ogdb-export (ogdb-types)        ← NEW seed
   ↓
ogdb-core (every other crate)
```

## 5. Downstream inventory — who imports `ogdb_core::ExportNode`/`ExportEdge` today

Exhaustive survey via
`grep -rnE '\bExportNode\b|\bExportEdge\b' crates/ --include='*.rs'`:

### 5.1 The 1 downstream import site

| Downstream file              | Import line                                                                                                      | Symbols used in body                                       | After shim? |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|:-----------:|
| `ogdb-cli/src/lib.rs:2-7`     | `use ogdb_core::{ Database, DbError, DocumentFormat, EnrichedRagResult, ExportEdge, ExportNode, Header, IngestConfig, PropertyMap, PropertyValue, QueryResult, SharedDatabase, ShortestPathOptions, VectorDistanceMetric, WriteConcurrencyMode, };` | 16 source-level refs (signatures, type-annotations, slice element types, test constructors) | ✅ no change |

### 5.2 The 16 use sites in `ogdb-cli` (same file, expanded)

| Line | Usage                                                                                              | Form                                       |
|-----:|-----------------------------------------------------------------------------------------------------|--------------------------------------------|
| 3    | `use ogdb_core::{ ..., ExportEdge, ExportNode, ... };`                                              | import line                                |
| 4203 | `fn render_http_export_csv(nodes: &[ExportNode], edges: &[ExportEdge]) -> Result<String, CliError>` | function signature (slice arg)             |
| 7311 | `.collect::<HashMap<u64, &ExportNode>>();`                                                          | turbofish + reference type                 |
| 7599 | `fn collect_sorted_node_property_keys(nodes: &[ExportNode]) -> Vec<String>`                          | function signature                          |
| 7609 | `fn collect_sorted_edge_property_keys(edges: &[ExportEdge]) -> Vec<String>`                          | function signature                          |
| 7624 | `) -> Result<(Vec<ExportNode>, Vec<ExportEdge>), CliError>`                                          | function return tuple                      |
| 7625 | `let mut selected_nodes = Vec::<ExportNode>::new();`                                                  | turbofish constructor                      |
| 7642 | `let mut selected_edges = Vec::<ExportEdge>::new();`                                                  | turbofish constructor                      |
| 7660 | `nodes: &[ExportNode], edges: &[ExportEdge]`                                                          | function args                              |
| 7740 | `nodes: &[ExportNode], edges: &[ExportEdge]`                                                          | function args                              |
| 7780 | `nodes: &[ExportNode], edges: &[ExportEdge]`                                                          | function args                              |
| 15928| `&[ExportNode { id: 1, labels: vec![...], properties: ... }]` (inside `#[cfg(test)] mod`)              | test struct construction                   |
| 15936| `&[ExportEdge { id: 0, src: 1, dst: 2, edge_type: ..., properties: ..., valid_from: ..., ... }]`     | test struct construction                   |

All 16 sites resolve through the `pub use ogdb_export::{ExportEdge,
ExportNode};` re-export — every type appearance is unqualified
(`ExportNode`, not `ogdb_core::ExportNode`) and the public field
names + types are unchanged.

### 5.3 Total source-level reference count

```
16  crates/ogdb-cli/src/lib.rs
 1  crates/ogdb-types/src/lib.rs       ← doc-comment only @17 (non-load-bearing)
 0  crates/ogdb-ffi/src/lib.rs
 0  crates/ogdb-python/src/lib.rs
 0  crates/ogdb-node/src/lib.rs
 0  crates/ogdb-bolt/src/lib.rs
 0  crates/ogdb-eval/**/*.rs
 0  crates/ogdb-bench/tests/rag_accuracy.rs
 0  crates/ogdb-e2e/tests/comprehensive_e2e.rs
 0  crates/ogdb-tck/**/*.rs
 0  crates/ogdb-fuzz/**/*.rs
 0  crates/ogdb-vector/src/lib.rs
 0  crates/ogdb-algorithms/src/lib.rs
 0  crates/ogdb-text/src/lib.rs
 0  crates/ogdb-temporal/src/lib.rs
 0  crates/ogdb-import/src/lib.rs
─────
17 total (16 load-bearing in 1 source file + 1 doc-comment)
```

**Effective downstream reference count protected by the shim: 16**
(across **1 source file**).

**Downstream-crate edits required by this plan: 0.**

This is the **smallest downstream-impact seed of the entire 7-crate
split** — only one downstream consumer (the CLI), which already
shells the export records into private CSV/JSON/RDF rendering
helpers (`render_http_export_csv` @4203, `collect_sorted_*` @7599 /
@7609, three `render_*` orchestrators @7660 / @7740 / @7780). Those
helpers are **CLI-private free functions** that take
`&[ExportNode]`/`&[ExportEdge]` and emit format strings using
`CliError` and clap-state context — **out of scope** for this seed
(see §10).

## 6. Coupling verdict — Option A vs Option B

### 6.1 Option A — full extraction of records + Database orchestrator methods

**What moves:** the two structs + `Database::export_nodes` /
`export_edges` / `export_nodes_at` / `export_edges_at` (4 methods,
~46 LOC of method bodies) + 2 in-core integration tests (~75 LOC).
Total ~142 LOC.

**What it forces:**

1. A new `pub trait ExportableDatabase` on `ogdb-export` with **9
   reader methods** (`current_snapshot_txn_id`, `node_count`,
   `is_node_visible_at`, `node_labels_at`, `node_properties_at`,
   `edge_records` accessor, `is_edge_visible_at`,
   `edge_valid_window_at`, `edge_type_at`, `edge_properties_at`,
   `edge_transaction_time_millis_at`). Each method needs a `Result<_,
   DbError>` signature for error propagation.
2. `DbError` to leak into `ogdb-export` (every reader returns
   `Result<_, DbError>`). That re-implements the
   `DbError`-stays-in-core invariant the prior 5 splits all upheld.
3. The 2 in-core integration tests migrate to a shared test harness
   in `ogdb-export/tests/` that re-exports the trait and constructs a
   real `Database`. That doubles the cross-crate test surface and
   creates a `dev-dependency` cycle (`ogdb-export[dev-deps] →
   ogdb-core → ogdb-export`).

**Pros:**

- All export logic lives in `ogdb-export`. Future CSV/JSON/RDF row
  formatters could land alongside the records.
- Symmetric with the eventual `plan/ogdb-core-split-export-runtime`
  end state.

**Cons:**

- Forces `ExportableDatabase` trait design **before** the
  algorithms-traversal follow-up (`plan/ogdb-core-split-algorithms-traversal`)
  has produced its `NodeRead` / `EdgeRead` contracts. The two trait
  sets overlap (`is_node_visible_at`, `node_count`, edge iteration)
  and should be designed together.
- Forces `DbError` leakage into `ogdb-export` — a contract regression.
- Forces the dev-deps cycle (`ogdb-export[dev-deps] → ogdb-core`)
  for the migrated integration tests.
- Net LOC moved (~142) is 6.7× the Option-B move (~21) for ~zero
  additional unblock value (the only downstream consumer is the CLI,
  which uses the records as plain data — not the orchestrator).

### 6.2 Option B (chosen) — plain-data records only; orchestrator stays in core

**What moves:** `ExportNode` (@1005) + `ExportEdge` (@1013) only.
Total **~21 LOC**.

**What stays:** all 4 `Database::export_*` methods, both in-core
integration tests, all internal helpers (`is_node_visible_at`,
`edge_records`, etc.). Their bodies and signatures don't change —
unqualified `ExportNode`/`ExportEdge` references resolve via the
`pub use` shim.

**Workspace dep added:** `ogdb-export → ogdb-types` (one-line entry
in `crates/ogdb-export/Cargo.toml`) — needed by the `properties:
PropertyMap` field on both structs. `ogdb-types` is already a
zero-Database leaf with `serde`, `serde_json`, and `ogdb-vector` as
its deps, so the transitive cost is tiny.

**Pros:**

- Mirrors all 5 prior split precedents (vector / algorithms / text /
  temporal / import all chose the same plain-data subset).
- Smallest LOC move of any seed in the 7-crate split (~21 LOC).
- Smallest downstream blast-radius of any seed (1 file, 16 refs).
- Zero `DbError` leakage. Zero `Database` dep. Zero new traits.
- Zero new third-party deps. One workspace path dep
  (`ogdb-types`).
- **Reversible** — the moved items are 2 plain structs; if the
  follow-up runtime extraction reveals a constraint that wants them
  back in core, a `git revert` of the Phase-4 commit is mechanical.
- Validates the pattern (records-in-leaf, orchestrator-in-core)
  before commitment — sets the template for the temporal-runtime
  follow-up's `TemporalNodeVersion` extraction (same property-bag
  shape).

**Cons:**

- `Database::export_*` methods stay in core. The follow-up plan
  (`plan/ogdb-core-split-export-runtime`) will revisit once the
  algorithms-traversal trait set is settled.

### 6.3 Why the choice is uncontroversial

The five prior beachhead splits all chose Option B explicitly:

- **Vector** (`plan/ogdb-core-split-vector` §6) — moved 5 items
  (`VectorDistanceMetric`, `VectorIndexDefinition`, 3 helper fns);
  every Database-coupled reader/writer stayed in core.
- **Algorithms** (`plan/ogdb-core-split-algorithms` §6) — moved
  4 plain-data result types + 3 pure kernels; the
  `Database::shortest_path` orchestrator stayed in core; a
  `NodeRead`/`EdgeRead` trait set was deferred to the
  `*-traversal` follow-up.
- **Text** (`plan/ogdb-core-split-text` §6) — moved 1 plain-data
  type + 4 pure helpers; `Database::*_text_index` orchestrators
  stayed.
- **Temporal** (`plan/ogdb-core-split-temporal` §6) — moved 2 types
  + 2 pure helpers; `TemporalNodeVersion` (a `PropertyMap`-embedding
  type) was explicitly **deferred** with the same blocker that
  motivated `plan/ogdb-types-extraction`.
- **Import** (`plan/ogdb-core-split-import` §6) — moved 4 types + 5
  pure helpers; the heavy `Database::ingest_document` orchestrator
  stayed.

Option B follows the established pattern verbatim. Option A is
inconsistent with all five precedents and would require pre-empting
the deferred `*-traversal` design work. **Reject Option A; ship
Option B.**

### 6.4 Why `Database::export_*` methods stay in core

The four method bodies access `Database` internals that have not
been abstracted:

- `Database::export_nodes_at` body @17794-17806:
  - `self.node_count()` — bare `u64` getter on `Database`
  - `self.is_node_visible_at(node_id, snapshot_txn_id)` — MVCC
    visibility check; reads `self.node_versions`
  - `self.node_labels_at(node_id, snapshot_txn_id)?` — MVCC label
    snapshot read; reads `self.node_label_history`
  - `self.node_properties_at(node_id, snapshot_txn_id)?` — MVCC
    property snapshot read; reads `self.node_property_history`

- `Database::export_edges_at` body @17809-17835:
  - `self.edge_records.iter().enumerate()` — direct `&[EdgeRecord]`
    field access on `Database` (no method exists for this; the field
    is `pub(crate)`)
  - `self.is_edge_visible_at(edge_id, snapshot_txn_id)` — MVCC edge
    visibility check; reads `self.edge_versions`
  - `self.is_node_visible_at(record.src, snapshot_txn_id)` (×2)
  - `self.edge_valid_window_at(edge_id, snapshot_txn_id)?` — MVCC
    validity window
  - `self.edge_type_at(edge_id, snapshot_txn_id)?`
  - `self.edge_properties_at(edge_id, snapshot_txn_id)?`
  - `self.edge_transaction_time_millis_at(edge_id, snapshot_txn_id)?`

Every one of those 9 distinct readers + the `edge_records` field
access is an internal Database/MVCC contract that has not yet been
codified as a public trait. The right time to design that trait is
when the algorithms-traversal follow-up needs `NodeRead`/`EdgeRead`
for the same readers — at that point, `ExportableDatabase` becomes a
2-method extension trait on top of it, and the export-runtime
follow-up extracts the four `Database::export_*` methods alongside
the algorithms runtime tail.

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level re-export

At the top of `crates/ogdb-core/src/lib.rs` (right after the existing
`pub use ogdb_types::{PropertyMap, PropertyValue};` at line 81),
insert exactly one line:

```rust
// Re-export the foundational property-bag record types so every existing
// `use ogdb_core::ExportNode` / `use ogdb_core::ExportEdge` caller in
// the workspace (today: only `ogdb-cli`) keeps compiling. Both types
// are plain data with no methods or custom impls; their `properties:
// PropertyMap` field already resolves through the `ogdb_types`
// re-export above, so the new edge `ogdb-export → ogdb-types` is
// strictly acyclic.
pub use ogdb_export::{ExportEdge, ExportNode};
```

No private `use ogdb_export::{...}` is needed — `pub use` already
hoists the types into `ogdb_core::` so unqualified in-core
references like `ExportNode { id, labels, properties }` and method
signatures like `Result<Vec<ExportEdge>, DbError>` resolve
transparently.

### 7.2 Why `pub use` is byte-for-byte compatible for `ExportNode`/`ExportEdge`

`pub use ogdb_export::ExportNode;` re-exports the struct **and all
3 public fields**. Every downstream `ExportNode { id, labels,
properties }` constructor, every `nodes[0].id` field-read, every
`Vec::<ExportNode>::new()` turbofish, every `&[ExportNode]` slice
arg, every `HashMap<u64, &ExportNode>` generic argument, every
`Debug`/`Clone`/`PartialEq`/`Eq` trait bound resolves to the same
`TypeId`, the same `size_of`, and the same `Layout`. `ExportEdge`
behaves identically with all 8 of its public fields.

There are no custom trait impls (no `Serialize`, no `Deserialize`,
no `Hash`, no `Display`, no `Default`, no methods) on either struct
in the current code — verified by `grep -nE '^impl.*for (ExportNode|ExportEdge)|^impl (ExportNode|ExportEdge)' crates/ogdb-core/src/lib.rs` returning **zero matches**. The
re-export is therefore a complete public-surface lift: nothing is
left behind in core that would force a downstream crate to change
its imports.

### 7.3 `Cargo.toml` edits

- **New** `crates/ogdb-export/Cargo.toml`:

  ```toml
  [package]
  name = "ogdb-export"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [dependencies]
  ogdb-types = { path = "../ogdb-types" }
  ```

  No `serde`, no `serde_json`, no optional features — the moved
  types do not derive `Serialize`/`Deserialize` and have no methods
  that need them. `ogdb-types` is the only required path dep
  (provides `PropertyMap`).

- **Modified** `crates/ogdb-core/Cargo.toml` adds one line to
  `[dependencies]` (placed alphabetically after `ogdb-algorithms`,
  before `ogdb-import`):

  ```toml
  ogdb-export = { path = "../ogdb-export" }
  ```

- **Modified** root `Cargo.toml` adds one entry to `[workspace]
  members` (placed alphabetically right after `ogdb-eval`,
  before `ogdb-ffi`):

  ```toml
  "crates/ogdb-export",
  ```

  *(Already added in this RED commit.)*

No other crate's `Cargo.toml` changes.

## 8. RED-phase failing tests (already on disk)

Two new tests are introduced. Both fail on this commit (because the
source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-export/tests/api_smoke.rs`

5 tests (~80 LOC) covering:

- **`export_node_has_three_pub_fields`** — pin every field name,
  type, and visibility (`id: u64`, `labels: Vec<String>`,
  `properties: PropertyMap`). If a future refactor renames a field,
  this test stops compiling and surfaces the break before the CLI
  rebuilds.
- **`export_edge_has_eight_pub_fields`** — pin all 8 fields on
  `ExportEdge` (`id: u64`, `src: u64`, `dst: u64`, `edge_type:
  Option<String>`, `properties: PropertyMap`, `valid_from:
  Option<i64>`, `valid_to: Option<i64>`, `transaction_time_millis:
  i64`).
- **`export_node_round_trips_via_clone_and_eq`** — pin the
  `#[derive(Debug, Clone, PartialEq, Eq)]` contract (used by the
  CLI's `HashMap<u64, &ExportNode>` collection at @7311 and by both
  in-core integration tests' `assert_eq!` calls).
- **`export_edge_round_trips_via_clone_and_eq`** — same for
  `ExportEdge`.
- **`property_map_field_uses_ogdb_types_alias`** — `TypeId` equality
  between the `properties` field type on a `ogdb_export::ExportNode`
  literal and `ogdb_types::PropertyMap`. Pin that the field type is
  truly the re-exported alias (not a private duplicate).

**Expected RED output:**

```
$ cargo test -p ogdb-export --tests
error[E0432]: unresolved imports `ogdb_export::ExportEdge`, `ogdb_export::ExportNode`
  --> crates/ogdb-export/tests/api_smoke.rs:N:M
```

### 8.2 `crates/ogdb-core/tests/ogdb_export_reexport_shim.rs`

4 tests covering:

- **`export_node_is_reexported_from_ogdb_export`** — `TypeId`
  equality between `ogdb_core::ExportNode` and
  `ogdb_export::ExportNode`.
- **`export_edge_is_reexported_from_ogdb_export`** — `TypeId`
  equality between `ogdb_core::ExportEdge` and
  `ogdb_export::ExportEdge`.
- **`exported_records_round_trip_via_database_helpers_through_shim`** —
  end-to-end smoke test: construct a `Database`, add 2 nodes and 1
  edge, call `db.export_nodes()` and `db.export_edges()`, assert the
  returned `Vec<ogdb_core::ExportNode>` / `Vec<ogdb_core::ExportEdge>`
  values equal hand-built `ogdb_export::ExportNode { ... }` /
  `ogdb_export::ExportEdge { ... }` literals via `PartialEq`. Pins
  the contract that the in-core orchestrator and the leaf-crate
  record types interoperate without any adapter layer.
- **`field_layout_is_stable_across_shim`** — explicit construction
  of both records via field literal syntax in core's namespace and
  field literal syntax in `ogdb_export`'s namespace; pin that field
  ordering, names, and types are byte-for-byte identical.

**Expected RED output:**

```
$ cargo test -p ogdb-core --test ogdb_export_reexport_shim
error[E0433]: cannot find module or crate `ogdb_export` in this scope
   --> crates/ogdb-core/tests/ogdb_export_reexport_shim.rs:N:M
```

The error count splits as: N references to `ogdb_export` in the test
itself + 1 wrap-up "could not compile" — all caused by the missing
`ogdb-export = { path = "..." }` entry in `crates/ogdb-core/Cargo.toml`,
which is intentional in RED.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit on this branch.

### Phase 3 — populate the new crate

1. `crates/ogdb-export/src/lib.rs`:

   - Replace the doc-only comment with the two struct definitions
     verbatim from `crates/ogdb-core/src/lib.rs:1003-1023` (21 lines
     including doc comments + derive lines + struct{} bodies).
   - Add the imports the moved code needs at the top of the file:

     ```rust
     use ogdb_types::PropertyMap;
     ```

   - Add `#[cfg(test)] mod tests { ... }` covering the same contract
     as `tests/api_smoke.rs` for in-crate unit tests of any
     non-public invariant (e.g. `properties.is_empty()` after
     default construction; ~30 LOC).

2. **Do not** touch any of the helper methods that stay in core
   (`Database::export_nodes`, `export_edges`, `export_nodes_at`,
   `export_edges_at`) — they continue to use `ExportNode { ... }` /
   `ExportEdge { ... }` constructors, which the `pub use` in core
   resolves.

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`, add (alphabetically after
   `ogdb-algorithms`, before `ogdb-import`):

   ```toml
   ogdb-export = { path = "../ogdb-export" }
   ```

2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** lines 1003–1023 (`ExportNode` doc + struct +
     `ExportEdge` doc + struct + intervening blank line; 21 LOC).
   - **Insert** at line 82 (right after the existing
     `pub use ogdb_types::{PropertyMap, PropertyValue};` at @81):

     ```rust
     pub use ogdb_export::{ExportEdge, ExportNode};
     ```

   - Verify no in-file reference uses `crate::ExportNode` /
     `crate::ExportEdge` (a `grep` of the current file confirms
     current callers use the unqualified name only — the `pub use`
     covers them all).

3. **Do not** touch any downstream crate.

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test
cargo test -p ogdb-export --tests

# Core — the shim regression test + every existing ogdb-core test
cargo test -p ogdb-core --test ogdb_export_reexport_shim
cargo test -p ogdb-core --tests     # the big integration test suite
cargo test -p ogdb-core --lib       # unit tests inside lib.rs mod tests

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-cli ogdb-ffi ogdb-python ogdb-bolt ogdb-eval \
             ogdb-bench ogdb-node ogdb-e2e ogdb-tck ogdb-fuzz \
             ogdb-vector ogdb-algorithms ogdb-text ogdb-temporal \
             ogdb-import ogdb-types; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

No edits to any downstream `Cargo.toml` or `src/` file are expected.
If any `cargo build -p <crate>` fails, the shim is wrong — revert
the `pub use` line and investigate; do **not** paper over with
downstream edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append an `[ogdb-core-split-export]`
  section describing the plain-data record extraction, the shim
  strategy, and a reference to this PLAN.md. Note that this seed
  was unblocked by the `2026-04-26` `ogdb-types` extraction.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-export` crate exposes `ExportNode` (3
    fields: `id`, `labels`, `properties: PropertyMap`) and
    `ExportEdge` (8 fields, including bitemporal `valid_from` /
    `valid_to` / `transaction_time_millis`). Plain-data record
    types consumed by the CLI's CSV/JSON/RDF rendering helpers."
  - `### Changed` — "`ogdb-core` re-exports the export-record types
    from `ogdb-export` via `pub use`; public surface unchanged."
- `ARCHITECTURE.md` §13: tick the `ogdb-export` row from
  ❌-blocked → ✅-shipped, and update the dep DAG diagram to show
  `ogdb-export → ogdb-types`.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-core-split-export` referencing this plan (matches the
  pattern of every recent plan, e.g. `ogdb-types-extraction`,
  `ogdb-core-split-import`).

## 10. Out-of-scope (explicitly deferred to later plans)

- Moving `Database::export_nodes`, `Database::export_edges`,
  `Database::export_nodes_at`, `Database::export_edges_at` (4
  methods, ~46 LOC of method bodies + ~75 LOC of in-core
  integration tests). Requires the `ExportableDatabase` trait
  designed alongside `NodeRead`/`EdgeRead` from
  `plan/ogdb-core-split-algorithms-traversal`. Follow-up:
  `plan/ogdb-core-split-export-runtime`.
- Moving the CLI's CSV/JSON/RDF rendering helpers
  (`render_http_export_csv` @4203, `collect_sorted_node_property_keys`
  @7599, `collect_sorted_edge_property_keys` @7609,
  `render_*` orchestrators @7660 / @7740 / @7780). They are
  CLI-private free functions that take `&[ExportNode]` /
  `&[ExportEdge]` and emit format strings using `CliError` and
  clap-state context. Lifting them up requires (a) decoupling from
  `CliError` (likely via `Result<_, String>`-style adapters), (b)
  decoupling from the `oxrdf`/`oxrdfio` deps that currently live
  only in `ogdb-cli`. Not load-bearing for any downstream
  unblock; defer to a future `plan/ogdb-export-formatters` plan if
  the surface ever grows beyond the CLI consumer.
- Moving `TemporalNodeVersion` (@8409) into `ogdb-temporal` (the
  runtime tail of the temporal split). Same property-bag
  embedding; same unblock by `ogdb-types`. Follow-up:
  `plan/ogdb-core-split-temporal-runtime` — orthogonal to this
  plan.
- Adding `Serialize`/`Deserialize` / `Hash` / `Display` / `Default`
  derives or methods to `ExportNode` / `ExportEdge`. Public-surface
  expansion; would require a separate API plan.
- The `ogdb-query` Cypher engine extraction. Terminal refactor;
  unchanged by this plan.
- **Any** `cargo build --workspace` or `cargo test --workspace`
  invocation. AGENTS contract + user directive: per-crate only.

## 11. Commit plan

| Phase | Commit subject                                                                          | Scope                                                                           |
|------:|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| 2     | `plan(ogdb-core-split-export): PLAN.md + RED-phase failing tests`                        | this commit                                                                    |
| 3     | `chore(ogdb-core-split-export): populate ogdb-export crate with ExportNode + ExportEdge` | doc-only `lib.rs` → populated with 2 record structs + doc comments + tests     |
| 4     | `refactor(ogdb-core-split-export): replace in-core export records with pub-use shim`     | delete 21 LOC from `ogdb-core/src/lib.rs`, add `pub use ogdb_export::{...};` line, wire dep |
| 5     | `test(ogdb-core-split-export): per-crate green under shim`                               | runs the per-crate matrix from §9 Phase 5 and records results                  |
| 6     | `docs(ogdb-core-split-export): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`               | docs only                                                                      |
| 7     | `chore(release-tests): append ogdb-core-split-export manifest entry`                     | release-tests yaml only                                                        |

One follow-up plan picks up where this leaves off:

- `plan/ogdb-core-split-export-runtime` — lift the four
  `Database::export_*` methods + the 2 in-core integration tests
  into `ogdb-export`, gated on the `ExportableDatabase` trait
  designed alongside `plan/ogdb-core-split-algorithms-traversal`.
