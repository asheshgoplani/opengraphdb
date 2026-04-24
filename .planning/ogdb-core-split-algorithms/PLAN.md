# ogdb-core-split-algorithms — extract pure graph-algorithm kernels into new `ogdb-algorithms` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-algorithms/` (stub `Cargo.toml`, empty `src/lib.rs`, and two
> failing existence tests — one in the new crate, one shim-compat test
> in `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-core-split-algorithms`.
>
> Phases 3–5 (GREEN) move the four plain-data algorithm types and the
> three pure-math community-detection kernels out of
> `crates/ogdb-core/src/lib.rs` into `crates/ogdb-algorithms/src/lib.rs`,
> replace the in-core definitions with a `pub use ogdb_algorithms::*`
> shim, and rewrite the three `community_*_at` Database wrappers to
> delegate their pure-math loops to the new crate. Phases 6–8 cover
> CHANGELOG + docs/IMPLEMENTATION-LOG + per-crate tests + the
> release-tests manifest entry.

**Goal:** land the **second** facet of the 7-crate split from
`ARCHITECTURE.md` §13 by extracting the plain-data algorithm types
(`ShortestPathOptions`, `GraphPath`, `Subgraph`, `SubgraphEdge`) plus
the three pure-math community-detection kernels (label propagation,
Louvain, Leiden) out of the 41 836-line `crates/ogdb-core/src/lib.rs`
monolith into a brand-new `crates/ogdb-algorithms/` crate, with a
`pub use` backward-compat shim in `ogdb-core`. Mirrors the
beachhead-plus-shim strategy just shipped in
`plan/ogdb-core-split-vector` (commit `472ad2e`).

**Architecture:** `ogdb-algorithms` owns four plain-data types and
three pure-math kernels. Every kernel takes a precomputed
`adjacency: &[Vec<u64>]` + `visible_nodes: &[u64]` and returns
`Vec<(u64, u64)>` — **no `Database`, no `Snapshot`, no `DbError`, no
storage layer references**. The Database-adapting layer (the three
`community_*_at` methods, plus `collect_undirected_neighbors_at`,
`outgoing_edges_for_path_at`, `shortest_path_*_at`,
`extract_subgraph_at`, `hop_levels_*_at`, `build_community_hierarchy_at`,
and `reconstruct_graph_path`) **stays in `ogdb-core`**; the only
Database-side edit is delegating the inner modularity/label-propagation
loops to the new crate via free-function calls. A
`pub use ogdb_algorithms::{ShortestPathOptions, GraphPath, Subgraph,
SubgraphEdge};` line at the top of `crates/ogdb-core/src/lib.rs` keeps
every existing call site (in `ogdb-core` and in every downstream crate)
compiling byte-for-byte identically.

**Tech stack:** Rust 2021, workspace-inherited version metadata,
`serde` (via workspace inheritance — Subgraph/CommunitySummary-adjacent
types are `Serialize`/`Deserialize`), no new runtime deps. The new
crate pulls only `serde`; the BFS/Dijkstra traversal helpers and the
hierarchy-summary logic that touch `HashMap`, `VecDeque`,
`BinaryHeap`, `DbError`, and `edge_records` stay in `ogdb-core`
(follow-up plan). Per-crate `cargo test -p <crate>` only — **never**
`--workspace` (AGENTS contract + user directive).

**Coupling verdict (Option A vs Option B):** **Option B** — move only
the PURE-FN algo bodies (the math) and leave the Snapshot-adapting
layer in core. See §6 for the full A-vs-B tradeoff; the tl;dr is that
Option A (a `GraphView` trait) would require designing a ~10-method
contract with a generic `Error` associated type up front, freezing an
abstraction we have not yet validated, while Option B lets us land a
tight, verifiable seed that moves exactly the pure adjacency-list math
and leaves traversal closures for a follow-up plan (which can then
choose Option A with real data in hand).

---

## 1. Problem summary — `ogdb-algorithms` is the smallest-self-contained next facet after `ogdb-vector`

The vector split (`plan/ogdb-core-split-vector`, commit `472ad2e`)
established the beachhead pattern:

1. New crate with empty `lib.rs` + Cargo stub.
2. Extract only **pure items** with zero coupling to `Database`,
   `DbError`, `PropertyValue`, the Cypher runtime, or storage.
3. `pub use` re-export in `ogdb-core` → zero downstream crate edits.
4. Per-crate `cargo test` matrix, never `--workspace`.
5. Every `_at` method that previously owned the moved primitive now
   imports it from the new crate (as a crate-private `use`).

Applying that pattern to the next seed requires picking the next
candidate facet from the 7 planned crates. `ogdb-core/src/lib.rs`
is now 41 836 LOC (down 86 LOC from the vector split). The next
candidates, with their coupling profiles, are:

| Planned crate      | Minimum viable seed (pure-math only)                                    | Coupling risk                                                                                                                                                                              |
|--------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ogdb-algorithms`  | 4 plain-data types + 3 community-detection kernels (this plan)          | **Low** for this seed: kernels take `&[Vec<u64>]`, return `Vec<(u64, u64)>`. Traversal/subgraph paths stay in core behind a thin wrapper.                                                 |
| `ogdb-text`        | `FullTextIndexDefinition` + BM25 scorer fragments                       | **High**: runtime is `tantivy`-bound; planner hooks chain through `Database`; catalog rows touch `FullTextIndexDefinition` inside `schema_catalog`.                                        |
| `ogdb-temporal`    | `TemporalScope`, `TemporalFilter`, `Episode`                            | Medium: `Episode` embeds a `Vec<f32>` already in `ogdb-vector`'s sphere; temporal filters bleed into Cypher planner expressions; community hierarchy already consumes `CommunitySummary`. |
| `ogdb-import`      | CSV / RDF / JSON readers                                                 | **High**: `Database::import_*` methods drive the readers; changes would ripple through WAL record writers.                                                                                  |
| `ogdb-export`      | Schema / dataset export                                                  | Medium–high: exports are serde-derived views on core types; any move pulls those types too.                                                                                                 |
| `ogdb-query`       | ~25 000 LOC Cypher engine                                                | **Highest**: parser + analyser + planner + executor all cohabit with the Database methods; this is the terminal refactor, not a seed.                                                       |

The algorithms facet wins because **the community-detection inner
loops already operate on a flat `Vec<Vec<u64>>` adjacency list** that
`collect_undirected_neighbors_at` builds up front. The pure math —
Louvain modularity gain, Leiden connectivity refinement, label
propagation voting — never touches `self.edge_records`,
`self.neighbors_at`, or any other Database field; it only reads
`neighbors[idx]`. That subset is lift-and-shift-friendly.

The traversal algorithms (BFS `shortest_path_at`, Dijkstra
`shortest_path_with_options_at`, `hop_levels_*_at`,
`extract_subgraph_at`) are **not in this seed** — they call
`self.neighbors_at(node_id, snapshot_txn_id)?` lazily inside the
inner loop, so lifting them requires either (a) precomputing the
adjacency eagerly (a performance regression on sparse queries against
large graphs), (b) a closure-based neighbor producer (a new
abstraction we should validate later), or (c) the Option-A GraphView
trait. All three are follow-up work; see §10.

## 2. Exact reproducer — what "after vector split, before algo split" looks like

### 2.1 Before this plan (main as of `472ad2e`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e  ogdb-eval
ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-vector
$ wc -l crates/ogdb-core/src/lib.rs
41836 crates/ogdb-core/src/lib.rs
$ grep -cE '^(pub )?mod ' crates/ogdb-core/src/lib.rs
1            # the test module only — still flat namespace
$ grep -rn 'ogdb_core::ShortestPathOptions' crates/ --include='*.rs' | grep -v 'ogdb-core/src/lib.rs' | wc -l
2            # ogdb-cli + ogdb-e2e
$ grep -rn 'ogdb_core::\(GraphPath\|Subgraph\|SubgraphEdge\)' crates/ --include='*.rs' | grep -v 'ogdb-core/src/lib.rs' | wc -l
0            # zero downstream imports today
```

### 2.2 After this plan (end of GREEN — Phases 3–5)

```bash
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-vector
$ cat crates/ogdb-algorithms/Cargo.toml    # new, 8 lines
$ wc -l crates/ogdb-algorithms/src/lib.rs
~260         # 4 plain-data types + 3 kernels + unit tests
$ wc -l crates/ogdb-core/src/lib.rs
~41 630      # ~200 LOC lighter (21 LOC of types + ~185 LOC of kernels)
$ grep -n 'pub use ogdb_algorithms' crates/ogdb-core/src/lib.rs
1            # one re-export line for the 4 types
$ grep -n 'use ogdb_algorithms::' crates/ogdb-core/src/lib.rs
1            # one private import for the 3 kernels
$ cargo test -p ogdb-algorithms --tests                              # PASS
$ cargo test -p ogdb-core --test ogdb_algorithms_reexport_shim       # PASS
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/ crates/ogdb-vector/  # empty — zero downstream changes
```

## 3. Module map + LOC estimate — current algorithm footprint in `ogdb-core`

Grep-derived, from `crates/ogdb-core/src/lib.rs` as of commit `472ad2e`:

| Item                                         | Line range       | LOC | Category                | Moves? |
|----------------------------------------------|------------------|----:|-------------------------|--------|
| `pub struct ShortestPathOptions`             | 1271–1275        |   5 | Plain data              | **YES** |
| `pub struct GraphPath`                       | 1278–1282        |   5 | Plain data              | **YES** |
| `pub struct SubgraphEdge`                    | 1285–1290        |   6 | Plain data              | **YES** |
| `pub struct Subgraph`                        | 1293–1298        |   6 | Plain data              | **YES** |
| `fn hop_levels_at` (Database)                | 18531–18569      |  39 | Traversal, lazy `self.neighbors_at` | NO (follow-up) |
| `fn hop_levels_incoming_at` (Database)       | 18571–18609      |  39 | Traversal, lazy         | NO (follow-up) |
| `fn shortest_path_at` (Database)             | 18611–18661      |  51 | BFS, lazy               | NO (follow-up) |
| `fn shortest_path_with_options_at` (Database)| 18663–18805      | 143 | BFS + Dijkstra, lazy    | NO (follow-up) |
| `fn outgoing_edges_for_path_at` (Database)   | 18807–18834      |  28 | Edge-record scan        | NO — reads `self.edge_records` |
| `fn reconstruct_graph_path` (Database)       | 18836–18859      |  24 | Pure on `HashMap<u64,(u64,u64)>` parents | NO (paired with BFS/Dijkstra that stay) |
| `fn extract_subgraph_at` (Database)          | 18861–18920      |  60 | BFS + edge-record scan  | NO (follow-up) |
| `fn collect_undirected_neighbors_at` (Database) | 18922–18948   |  27 | Edge-record scan        | NO — reads `self.edge_records` |
| `fn community_label_propagation_at` (Database) | 18950–18994    |  45 | Pure math (after adjacency built) | **kernel body YES; Database wrapper NO** |
| `fn community_louvain_at` (Database)         | 18996–19075      |  80 | Pure math (after adjacency built) | **kernel body YES; Database wrapper NO** |
| `fn community_leiden_at` (Database)          | 19077–19208      | 132 | Pure math (after adjacency built) | **kernel body YES; Database wrapper NO** |
| `fn build_community_hierarchy_at` (Database) | 19211–19393      | 183 | Pure math + node label reads | NO — touches `node_labels_at`, `node_properties_at`, `edge_records` |
| Pub `fn shortest_path` / `shortest_path_with_options` (Snapshot @8615, Transaction @9238, Database @20967) | 15 LOC × 3 occurrences × 2 methods = ~90 | 90 | Thin passthroughs        | NO (stay as passthroughs) |
| Pub `fn community_*` (Snapshot @8639, Transaction @9262, Database @20997) | ~45 LOC × 3 occurrences × 3 methods | ~135 | Thin passthroughs | NO |
| Pub `fn extract_subgraph` / `hop_levels*` (Snapshot, Transaction, Database) | ~70 LOC | 70 | Thin passthroughs        | NO |

**LOC moved in this plan:** **22 LOC** of plain-data types + **~185
LOC** of pure-math kernel bodies = **~207 LOC** out of `ogdb-core`. New
unit tests in `ogdb-algorithms`: **~80 LOC**. Net `ogdb-core` shrinkage:
**~205 LOC** (moved bodies minus 2 new import lines). The three
Database wrapper methods each shrink from 45/80/132 LOC to roughly
8–12 LOC (just `let adjacency = self.collect_undirected_neighbors_at(...)?;
let visible = self.visible_node_ids_at(...)?; Ok(ogdb_algorithms::louvain(&adjacency, &visible, 1.0))`).

## 4. Internal dependency graph for the 7 items being moved

```
┌──────────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs                                                 │
│                                                                      │
│  ShortestPathOptions (pub struct @1271)                              │
│    ↑                                                                 │
│    ├── Snapshot::shortest_path_with_options (pub fn @8619)           │
│    ├── Transaction::shortest_path_with_options (pub fn @9242)        │
│    ├── Database::shortest_path_with_options (pub fn @20971)          │
│    └── shortest_path_with_options_at (@18663)    ← STAYS             │
│                                                                      │
│  GraphPath (pub struct @1278)                                        │
│    ↑                                                                 │
│    ├── shortest_path_with_options_at returns Option<GraphPath>       │
│    └── reconstruct_graph_path returns Option<GraphPath> ← STAYS      │
│                                                                      │
│  Subgraph (pub struct @1293) / SubgraphEdge (pub struct @1285)       │
│    ↑                                                                 │
│    ├── Snapshot::extract_subgraph (pub fn @8629)                     │
│    ├── Transaction::extract_subgraph (pub fn @9255)                  │
│    ├── Database::extract_subgraph (pub fn @20990)                    │
│    └── extract_subgraph_at (@18861) returns Subgraph ← STAYS         │
│                                                                      │
│  label_propagation(adjacency, visible) → Vec<(u64,u64)>              │
│    (NEW pub fn — extracted body of community_label_propagation_at)  │
│    ↑                                                                 │
│    └── community_label_propagation_at (@18950) becomes a wrapper    │
│        that calls collect_undirected_neighbors_at +                  │
│        visible_node_ids_at + ogdb_algorithms::label_propagation      │
│                                                                      │
│  louvain(adjacency, visible, resolution) → Vec<(u64,u64)>            │
│    (NEW pub fn — extracted body of community_louvain_at and          │
│     the Louvain phase of community_leiden_at)                        │
│    ↑                                                                 │
│    ├── community_louvain_at (@18996) wrapper → louvain(&a, &v, 1.0) │
│    └── community_leiden_at (@19077) wrapper → leiden which calls     │
│        louvain internally                                            │
│                                                                      │
│  leiden(adjacency, visible, resolution) → Vec<(u64,u64)>             │
│    (NEW pub fn — = louvain + connected-components refinement)        │
│    ↑                                                                 │
│    ├── community_leiden_at (@19077) wrapper                          │
│    └── build_community_hierarchy_at (@19211) calls                   │
│        community_leiden_at internally → still works                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Key property:** every arrow into a "STAYS" box is a call from
`ogdb-core` code into a moved item. After the split, those call sites
continue to resolve via either:

- **`pub use ogdb_algorithms::{ShortestPathOptions, GraphPath, Subgraph, SubgraphEdge};`**
  at the top of `crates/ogdb-core/src/lib.rs`, and
- **`use ogdb_algorithms::{label_propagation, louvain, leiden};`**
  (crate-private import so the three Database wrapper methods can call
  the kernels unqualified).

No outbound `ogdb-algorithms → ogdb-core` edge exists. No cycle. The
new crate depends only on `serde` (and only because `Subgraph` +
`SubgraphEdge` derive `Serialize`/`Deserialize` nowhere today but the
other three types already do via the surrounding file context — we
inherit their derives on the move verbatim).

> **Actually, measuring carefully:** `ShortestPathOptions` has
> `#[derive(Debug, Clone, PartialEq, Eq, Default)]`, `GraphPath` has
> `#[derive(Debug, Clone, PartialEq)]`, `SubgraphEdge` and `Subgraph`
> have `#[derive(Debug, Clone, PartialEq, Eq)]`. **None of the four
> moved types derive `Serialize`/`Deserialize` today** — so the new
> crate technically does not even need `serde`. I include it as a
> workspace-inherited dep anyway for forward-compat (the BFS/Dijkstra
> follow-up plan will likely want `Serialize` on `GraphPath` for
> MCP JSON output).

## 5. Downstream inventory — who imports the algorithm surface today

Exhaustive survey via `grep -rnE 'ogdb_core::.*(ShortestPathOptions|GraphPath|Subgraph|SubgraphEdge)' crates/`:

| Downstream crate / file                                        | Imports                                                                                        | After shim? |
|-----------------------------------------------------------------|------------------------------------------------------------------------------------------------|:-----------:|
| `ogdb-cli/src/lib.rs:5`                                         | `use ogdb_core::{SharedDatabase, ShortestPathOptions, VectorDistanceMetric, WriteConcurrencyMode};` | ✅ no change |
| `ogdb-cli/src/lib.rs:3130`                                      | `let options = ShortestPathOptions { … };` (MCP shortest_path tool)                            | ✅ no change |
| `ogdb-e2e/tests/comprehensive_e2e.rs:7`                         | `use ogdb_core::{PropertyMap, PropertyValue, SharedDatabase, ShortestPathOptions, VectorDistanceMetric};` | ✅ no change |
| `ogdb-e2e/tests/comprehensive_e2e.rs:1089`                      | `&ShortestPathOptions { … }` constructor                                                       | ✅ no change |

**`GraphPath`:** grep returns **zero** downstream imports. Re-exporting
via `pub use` is belt-and-braces — it covers any future caller
(`ogdb-cli` is the likely first consumer once the MCP shortest-path
response schema adopts typed paths).

**`Subgraph` / `SubgraphEdge`:** grep returns **zero** downstream
imports. Same belt-and-braces rationale — `ogdb-cli::extract_subgraph`
currently translates to JSON inline, but `ogdb-eval` or `ogdb-bench`
may want structured access later.

**Community-detection methods:** **zero** downstream type-level
imports. Only method calls on `&Database`:

- `ogdb-e2e/tests/comprehensive_e2e.rs:1099` → `db.community_label_propagation(None)`
- `ogdb-e2e/tests/comprehensive_e2e.rs:1100` → `db.community_louvain(None)`

These methods **stay on `Database`**; the pub-fn `community_*` public
methods at `Snapshot::community_label_propagation` (@8639),
`Transaction::community_label_propagation` (@9262), and
`Database::community_label_propagation` (@20997) are unchanged. Only
their private `*_at` backing methods get shorter.

**Count of references to moved types:** 4 `ShortestPathOptions` sites
across 2 files. All remain valid through the re-export.

**Downstream-crate edits required by this plan: 0.**

## 6. Facet choice — why pure community-detection kernels first, and Option B over Option A

### 6.1 Candidate seeds inside `ogdb-algorithms`

| Candidate                                             | LOC to move | Coupling to `Database` | Downstream refs to moved items | Requires abstraction? |
|-------------------------------------------------------|------------:|-------------------------|-------------------------------:|:---------------------:|
| 4 plain-data types + 3 community kernels (this plan)  | ~207        | **None** (kernels take `&[Vec<u64>]`) | 4 (all `ShortestPathOptions`) | No                 |
| + BFS `shortest_path_at`                              | +51         | `self.neighbors_at` per node | +0 | **Yes** (closure or trait) |
| + Dijkstra `shortest_path_with_options_at`            | +143        | `self.neighbors_at` + `self.edge_properties_at` | +0 | **Yes** |
| + Subgraph `extract_subgraph_at`                      | +60         | `self.edge_records` + `self.edge_type_at` | +0 | **Yes** |
| + `hop_levels_at` / `hop_levels_incoming_at`          | +78         | `self.neighbors_at` / `self.incoming_neighbors_at` | +0 | **Yes** |
| + `build_community_hierarchy_at`                      | +183        | `self.node_labels_at` + `self.node_properties_at` + `self.edge_records` | +0 | **Yes** (bigger trait) |

The community kernels (label propagation, Louvain, Leiden) are the
only algorithms whose inner loops operate on a **precomputed
`Vec<Vec<u64>>` adjacency list**. Every other algorithm calls
`self.<neighbor-producing-method>(…)` inside the hot loop, so moving
them requires a cross-crate abstraction (a closure, an `Fn` trait, or
a `GraphView` trait).

### 6.2 Option A vs Option B

| Dimension                                    | Option A: `GraphView` trait in `ogdb-algorithms` | Option B: pure-fn kernels, adaptation stays in core |
|-----------------------------------------------|--------------------------------------------------|----------------------------------------------------|
| New abstractions introduced in this plan      | 1 trait with ~10 methods + 1 associated `Error` type | 0                                                |
| Items moved                                   | ~10 methods' worth of Database logic              | 4 plain-data types + 3 pure kernels               |
| LOC moved                                     | ~700 (includes traversal)                          | ~207                                              |
| Forces `DbError` to leak into the new crate?  | Yes (via `type Error: std::error::Error`)          | No                                                |
| Reversible?                                   | Hard — trait contract becomes public API          | Trivial — kernels are standalone free functions   |
| Validates the pattern before commitment?      | No — ships trait without data                      | Yes — ships the subset that's obviously pure      |
| Matches the vector-split precedent?           | Partially (vector shipped free fns, not a trait)   | Directly (vector shipped 3 free fns + 2 data types)|
| Downstream risk                               | Higher — any trait change is a breaking `ogdb-algorithms` major | Lower — kernel signatures are concrete types   |

**Choice: Option B**, because:

1. **Mirrors the vector precedent.** The vector split moved three free
   functions (`vector_distance`, `parse_vector_literal_text`,
   `compare_f32_vectors`) plus two data types. Nothing needed a trait.
   The matching move here is three pure-math kernels plus four data
   types.
2. **No premature abstraction.** Designing the `GraphView` trait
   requires deciding: does it take `snapshot_txn_id` as a parameter
   (MVCC-aware), or does the implementor close over it? Does
   `neighbors` return `Result<Vec<u64>, E>` or yield an iterator? Does
   it expose raw `edge_records` or only filtered access? These are
   real design decisions that benefit from data gathered from one
   successful kernel extraction first.
3. **Does not block Option A.** A follow-up plan
   (`plan/ogdb-core-split-algorithms-traversal`) can introduce the
   `GraphView` trait and move BFS/Dijkstra/subgraph/hop_levels behind
   it once this seed is in.
4. **Zero `DbError` leakage.** The kernel signatures
   (`fn louvain(&[Vec<u64>], &[u64], f64) -> Vec<(u64, u64)>`) are
   infallible — adjacency-list math cannot fail. `DbError` stays
   owned by `ogdb-core`.

### 6.3 What moves (and only these)

| Item                         | Kind       | Current location in `ogdb-core/src/lib.rs` | Approx. LOC |
|------------------------------|------------|--------------------------------------------|------------:|
| `ShortestPathOptions`        | `pub struct` + derives | lines 1271–1275                    |   5        |
| `GraphPath`                  | `pub struct` + derives | lines 1278–1282                    |   5        |
| `SubgraphEdge`               | `pub struct` + derives | lines 1285–1290                    |   6        |
| `Subgraph`                   | `pub struct` + derives | lines 1293–1298                    |   6        |
| `label_propagation`          | `pub fn` (NEW — extracted from `community_label_propagation_at` body lines 18954–18993) | ~40 |
| `louvain`                    | `pub fn` (NEW — extracted from `community_louvain_at` body lines 19000–19074; resolution-generalised) | ~60 |
| `leiden`                     | `pub fn` (NEW — extracted from `community_leiden_at` body lines 19083–19207; internally calls `louvain` + refinement loop) | ~90 |
| `#[cfg(test)] mod tests` for each of the above (new, in `ogdb-algorithms/src/lib.rs`) | `#[test]` | new | ~60 |

**Total moved source:** ~212 LOC. **New unit tests in
`ogdb-algorithms`:** ~60 LOC. **Net `ogdb-core` shrinkage:** ~205 LOC
(22 of types + ~185 of kernel bodies + 1 `use` line + 1 `pub use` line).

### 6.4 What stays in `ogdb-core` (explicit non-scope)

Every item below **must remain** in `ogdb-core`; a follow-up plan
(`plan/ogdb-core-split-algorithms-traversal`) extracts them once
Option B has proven out and we can evaluate whether a `GraphView`
trait is warranted.

- `Database::hop_levels_at`, `Database::hop_levels_incoming_at` — each
  walks `self.neighbors_at` / `self.incoming_neighbors_at` lazily;
  moving them requires a closure or trait. Follow-up.
- `Database::shortest_path_at` (BFS), `Database::shortest_path_with_options_at`
  (BFS + Dijkstra) — same lazy-neighbor reason plus `edge_properties_at`
  for weights. Follow-up.
- `Database::outgoing_edges_for_path_at` — reads `self.edge_records`
  directly; stays with the traversal cohort.
- `Database::reconstruct_graph_path` — pure on a `HashMap<u64, (u64, u64)>`
  parents map, but only used by `shortest_path_with_options_at`, which
  stays. Keeping it co-located preserves one-call-site locality;
  move it with the traversal cohort.
- `Database::extract_subgraph_at` — reads `self.edge_records`. Follow-up.
- `Database::collect_undirected_neighbors_at` — reads
  `self.edge_records`. This is the adjacency-list **builder**; it
  **does not move**. Its callers (`community_*_at`) still invoke it,
  then hand the `Vec<Vec<u64>>` to the pure kernel in
  `ogdb-algorithms`.
- `Database::build_community_hierarchy_at` — calls
  `community_leiden_at` (stays in core), reads `node_labels_at`,
  `node_properties_at`, and `edge_records`. Not in this seed. Follow-up.
- `CommunitySummary`, `CommunityMember`, `CommunityHierarchy` (@1326,
  @1342, @1353) — tied to `BTreeMap<String, u64>` label distributions
  and LLM-summary callbacks. Stay.
- All `Snapshot::`/`Transaction::`/`Database::` public methods
  (`shortest_path`, `shortest_path_with_options`, `extract_subgraph`,
  `hop_levels*`, `community_*`) — thin pass-throughs that call the
  `_at` variants. They stay untouched.

### 6.5 Kernel API shapes (the exact signatures GREEN will land)

```rust
/// Asynchronous label-propagation community detection.
///
/// Runs up to 20 rounds of majority voting: each node adopts the
/// most common community label among its neighbors, tie-breaking on
/// the smallest community id. Converges when one full pass produces
/// no changes. Mirrors the in-core `community_label_propagation_at`
/// semantics exactly so catalog tests and `ogdb-e2e` regressions
/// keep passing.
///
/// * `adjacency` — `adjacency[node_id]` = list of neighbor ids
///   (undirected, deduplicated). Nodes outside `visible_nodes` may
///   have non-empty entries; the kernel only iterates `visible_nodes`
///   and reads neighbor labels by index.
/// * `visible_nodes` — ids to assign labels to. Other indices in
///   `adjacency` are touched only via neighbor reads.
///
/// Returns `Vec<(node_id, community_id)>` in `visible_nodes` order.
pub fn label_propagation(
    adjacency: &[Vec<u64>],
    visible_nodes: &[u64],
) -> Vec<(u64, u64)>;

/// Louvain modularity-optimising community detection with a
/// tunable resolution parameter.
///
/// * `resolution` = 1.0 reproduces the plain-Louvain behavior
///   currently in `community_louvain_at` (gain = k_i_in − total·deg/m2).
/// * `resolution` ≠ 1.0 scales the null-model term
///   (gain = k_i_in − resolution·total·deg/m2), matching the
///   Louvain phase of `community_leiden_at`.
///
/// Runs up to 20 rounds. Returns `Vec<(node_id, community_id)>`.
pub fn louvain(
    adjacency: &[Vec<u64>],
    visible_nodes: &[u64],
    resolution: f64,
) -> Vec<(u64, u64)>;

/// Leiden community detection: Louvain modularity pass followed by
/// a connectivity-refinement pass that splits disconnected
/// sub-clusters within each Louvain community via BFS. The refined
/// split assigns a fresh community id to the second (and subsequent)
/// connected component of every Louvain group.
///
/// Semantics match `community_leiden_at` byte-for-byte for any
/// `(adjacency, visible_nodes, resolution)` triple.
pub fn leiden(
    adjacency: &[Vec<u64>],
    visible_nodes: &[u64],
    resolution: f64,
) -> Vec<(u64, u64)>;
```

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level imports

At the top of `crates/ogdb-core/src/lib.rs` (right below the existing
`pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`
line from the vector split, to keep the two re-export blocks adjacent),
add exactly two lines:

```rust
// Re-export the plain-data algorithm types so every existing
// `use ogdb_core::ShortestPathOptions;` caller in the workspace
// (ogdb-cli, ogdb-e2e) keeps compiling byte-for-byte identically.
pub use ogdb_algorithms::{GraphPath, ShortestPathOptions, Subgraph, SubgraphEdge};

// Crate-private import so the 3 Database wrapper methods
// (community_label_propagation_at, community_louvain_at,
// community_leiden_at) resolve `label_propagation`, `louvain`,
// and `leiden` unqualified.
use ogdb_algorithms::{label_propagation, leiden, louvain};
```

### 7.2 Why `pub use` is byte-for-byte compatible for these types

The four moved types have these derives today:

- `ShortestPathOptions`: `Debug, Clone, PartialEq, Eq, Default`
- `GraphPath`: `Debug, Clone, PartialEq`
- `SubgraphEdge`: `Debug, Clone, PartialEq, Eq`
- `Subgraph`: `Debug, Clone, PartialEq, Eq`

All four are plain-data structs with `pub` fields and no private
invariants. Moving them with their derives intact preserves every
currently-valid usage (pattern matching, `.clone()`, `==`,
`Default::default()`, `Debug` printing). `pub use` hoists each name
into the `ogdb_core::` root identically to how
`pub use ogdb_vector::VectorDistanceMetric;` worked in the vector
split.

### 7.3 Why the kernel extraction is behavior-preserving

The three pure kernels are **verbatim extractions of the inner
loops** of the three existing Database methods:

- `label_propagation(adjacency, visible)` contains exactly the 20-iter
  loop at `lib.rs:18961–18988`, unchanged.
- `louvain(adjacency, visible, resolution)` contains the 20-iter loop at
  `lib.rs:19027–19069` (resolution=1.0 path) **unified with** the Louvain
  phase of Leiden at `lib.rs:19108–19150` (resolution-scaled path). Unifying
  them via the `resolution` parameter is safe because the only
  divergence is the `resolution *` multiplier on the `total * degree / m2`
  term; `community_louvain_at` always implies `resolution=1.0`.
- `leiden(adjacency, visible, resolution)` is `louvain` followed by the
  connected-components refinement loop at `lib.rs:19152–19202`.

### 7.4 `Cargo.toml` edits

- **New** `crates/ogdb-algorithms/Cargo.toml`:
  ```toml
  [package]
  name = "ogdb-algorithms"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [dependencies]
  serde = { version = "1", features = ["derive"] }
  ```
  No other deps — same minimum tree as `ogdb-vector`. `serde` is
  opt-in for forward-compat (see note in §4); none of the four moved
  types derive `Serialize`/`Deserialize` today, but the follow-up
  traversal plan will want it for `GraphPath` over MCP JSON.

- **Modified** `crates/ogdb-core/Cargo.toml` adds one line to
  `[dependencies]` (alongside the existing `ogdb-vector` entry):
  ```toml
  ogdb-algorithms = { path = "../ogdb-algorithms" }
  ```

- **Modified** root `Cargo.toml` adds one entry to `[workspace] members`
  (alphabetical, between `ogdb-e2e` and `ogdb-eval`):
  ```toml
  "crates/ogdb-algorithms",
  ```

No other crate's `Cargo.toml` changes.

## 8. RED-phase failing tests (exact file contents)

Two new tests are introduced. Both must fail on this commit (because
the source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-algorithms/tests/api_smoke.rs`

This asserts the new crate exposes the expected public API once it is
populated in GREEN. The crate's `src/lib.rs` is empty (`//! RED`) so
the `use ogdb_algorithms::*` lines fail with
`error[E0432]: unresolved imports`, which is the expected RED signal.

```rust
//! RED-phase API smoke test for the extracted ogdb-algorithms crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_algorithms::{ShortestPathOptions, GraphPath, Subgraph,
//! SubgraphEdge, label_propagation, louvain, leiden}` are not yet
//! defined (src/lib.rs is intentionally empty).
//!
//! GREEN state (Phases 3–5 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been moved out of
//! crates/ogdb-core/src/lib.rs into crates/ogdb-algorithms/src/lib.rs.

use ogdb_algorithms::{
    label_propagation, leiden, louvain, GraphPath, ShortestPathOptions,
    Subgraph, SubgraphEdge,
};

#[test]
fn shortest_path_options_is_plain_data_with_default() {
    // Derive surface must survive the move: Debug + Clone + PartialEq
    // + Eq + Default are load-bearing for `ogdb-cli` and `ogdb-e2e`
    // constructors + assertions.
    let opts = ShortestPathOptions::default();
    assert_eq!(opts.max_hops, None);
    assert_eq!(opts.edge_type, None);
    assert_eq!(opts.weight_property, None);

    let custom = ShortestPathOptions {
        max_hops: Some(5),
        edge_type: Some("KNOWS".to_string()),
        weight_property: Some("w".to_string()),
    };
    assert_ne!(opts, custom);
    assert_eq!(custom.clone(), custom);
}

#[test]
fn graph_path_round_trips_cloned_fields() {
    // Pinning: shortest_path_with_options_at returns Option<GraphPath>
    // and reconstruct_graph_path assembles it. Every field is pub.
    let p = GraphPath {
        node_ids: vec![0, 1, 2],
        edge_ids: vec![10, 20],
        total_weight: 3.5,
    };
    let q = p.clone();
    assert_eq!(p, q);
    assert_eq!(p.node_ids.len(), p.edge_ids.len() + 1);
}

#[test]
fn subgraph_and_subgraph_edge_are_plain_data() {
    // `extract_subgraph_at` returns Subgraph populated with
    // SubgraphEdge values. Every field is pub + Eq.
    let e = SubgraphEdge {
        edge_id: 42,
        src: 1,
        dst: 2,
        edge_type: Some("KNOWS".into()),
    };
    let sg = Subgraph {
        center: 1,
        max_hops: 2,
        nodes: vec![1, 2],
        edges: vec![e.clone()],
    };
    assert_eq!(sg.edges[0], e);
    assert_eq!(sg.nodes.len(), 2);
}

#[test]
fn label_propagation_converges_on_a_single_clique() {
    // 4-node clique → every node must end up in the same community.
    let adjacency = vec![
        vec![1, 2, 3], // 0
        vec![0, 2, 3], // 1
        vec![0, 1, 3], // 2
        vec![0, 1, 2], // 3
    ];
    let visible = vec![0u64, 1, 2, 3];
    let result = label_propagation(&adjacency, &visible);
    assert_eq!(result.len(), 4);
    let first_label = result[0].1;
    for (_, label) in &result {
        assert_eq!(
            *label, first_label,
            "all clique members must converge to one community",
        );
    }
}

#[test]
fn label_propagation_respects_disjoint_components() {
    // Two disconnected 2-node components → two distinct labels.
    let adjacency = vec![
        vec![1],    // 0 ↔ 1
        vec![0],
        vec![3],    // 2 ↔ 3
        vec![2],
    ];
    let visible = vec![0u64, 1, 2, 3];
    let result = label_propagation(&adjacency, &visible);
    let label_0 = result.iter().find(|(n, _)| *n == 0).unwrap().1;
    let label_1 = result.iter().find(|(n, _)| *n == 1).unwrap().1;
    let label_2 = result.iter().find(|(n, _)| *n == 2).unwrap().1;
    let label_3 = result.iter().find(|(n, _)| *n == 3).unwrap().1;
    assert_eq!(label_0, label_1, "connected pair must share a label");
    assert_eq!(label_2, label_3, "connected pair must share a label");
    assert_ne!(label_0, label_2, "disjoint components must differ");
}

#[test]
fn louvain_assigns_everyone_a_community() {
    // 3-node triangle at resolution=1.0 — standard Louvain.
    let adjacency = vec![
        vec![1, 2],
        vec![0, 2],
        vec![0, 1],
    ];
    let visible = vec![0u64, 1, 2];
    let result = louvain(&adjacency, &visible, 1.0);
    assert_eq!(result.len(), 3);
    // Every triangle node must land in the same community because the
    // modularity gain of merging is strictly positive.
    let first = result[0].1;
    assert!(result.iter().all(|(_, c)| *c == first));
}

#[test]
fn louvain_handles_empty_graph_as_self_communities() {
    // Regression pin: `community_louvain_at` returns (node_id, node_id)
    // when m2 <= 0.0 (no visible edges). That invariant is load-bearing
    // for callers that expect every visible node to appear in the
    // result even on an empty graph.
    let adjacency: Vec<Vec<u64>> = vec![Vec::new(); 3];
    let visible = vec![0u64, 1, 2];
    let result = louvain(&adjacency, &visible, 1.0);
    assert_eq!(result.len(), 3);
    for (node_id, community_id) in result {
        assert_eq!(node_id, community_id, "isolated node is its own community");
    }
}

#[test]
fn leiden_splits_louvain_cluster_when_disconnected() {
    // Craft a graph where plain Louvain would unify two disjoint
    // triangles into one community (not realistic without edges
    // between them) — but since there are no cross-triangle edges,
    // Leiden's connectivity refinement must split them back into two
    // communities even if Louvain's randomness merged the labels.
    //
    // Concretely: 6-node graph = two disjoint triangles {0,1,2} +
    // {3,4,5}. louvain should already produce two communities (there
    // are no edges linking them, so merging has zero modularity gain),
    // and leiden must agree (refinement is idempotent on connected
    // components).
    let adjacency = vec![
        vec![1, 2], vec![0, 2], vec![0, 1], // triangle A
        vec![4, 5], vec![3, 5], vec![3, 4], // triangle B
    ];
    let visible = (0u64..6).collect::<Vec<_>>();
    let result = leiden(&adjacency, &visible, 1.0);
    assert_eq!(result.len(), 6);
    let community_of = |node: u64| result.iter().find(|(n, _)| *n == node).unwrap().1;
    assert_eq!(community_of(0), community_of(1));
    assert_eq!(community_of(1), community_of(2));
    assert_eq!(community_of(3), community_of(4));
    assert_eq!(community_of(4), community_of(5));
    assert_ne!(
        community_of(0),
        community_of(3),
        "disconnected triangles must never share a Leiden community",
    );
}

#[test]
fn leiden_respects_resolution_parameter_type() {
    // Compile-level pin: the kernel's `resolution: f64` parameter must
    // accept finite positive values. Regressing to `f32` or an enum
    // would break `build_community_hierarchy_at`'s resolution sweep.
    let adjacency = vec![vec![1], vec![0]];
    let visible = vec![0u64, 1];
    let r0 = leiden(&adjacency, &visible, 0.5);
    let r1 = leiden(&adjacency, &visible, 1.0);
    let r2 = leiden(&adjacency, &visible, 2.0);
    for r in [r0, r1, r2] {
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].1, r[1].1, "connected pair always one community");
    }
}
```

Running today (RED):
```
$ cargo test -p ogdb-algorithms --tests
error[E0432]: unresolved import `ogdb_algorithms::ShortestPathOptions`
  --> crates/ogdb-algorithms/tests/api_smoke.rs:12:5
```

Running after Phase 5 (GREEN): all 9 tests PASS.

### 8.2 `crates/ogdb-core/tests/ogdb_algorithms_reexport_shim.rs`

This is the **backward-compat guarantee** that no downstream crate
breaks. It asserts `ogdb_core::ShortestPathOptions`,
`ogdb_core::GraphPath`, `ogdb_core::Subgraph`, and
`ogdb_core::SubgraphEdge` are still nameable from the `ogdb_core::`
root, that their derives pattern-match, and that their `TypeId`s match
the `ogdb_algorithms` originals (catching any accidental duplicate
definition).

```rust
//! Shim regression: the four plain-data algorithm types must remain
//! nameable from the `ogdb_core::` root after the Phase-2 algorithm
//! split. `ogdb-cli` and `ogdb-e2e` import `ShortestPathOptions` via
//! `use ogdb_core::ShortestPathOptions;` — if this file stops
//! compiling, the shim in `crates/ogdb-core/src/lib.rs` is broken
//! and both downstream crates would fail to build.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-algorithms (`unresolved import
//! ogdb_algorithms`), and `ogdb_core::ShortestPathOptions` is still
//! the in-core original, not a re-export.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_algorithms::{GraphPath, ShortestPathOptions,
//! Subgraph, SubgraphEdge};` and the TypeId equalities below hold.

use std::any::TypeId;

#[test]
fn shortest_path_options_is_reexported_from_ogdb_algorithms() {
    // If this line fails to compile, `use ogdb_core::ShortestPathOptions;`
    // at ogdb-cli/src/lib.rs:5 and ogdb-e2e/tests/comprehensive_e2e.rs:7
    // break too.
    let _opts = ogdb_core::ShortestPathOptions::default();

    assert_eq!(
        TypeId::of::<ogdb_core::ShortestPathOptions>(),
        TypeId::of::<ogdb_algorithms::ShortestPathOptions>(),
        "ogdb_core::ShortestPathOptions must be a `pub use` re-export \
         of ogdb_algorithms::ShortestPathOptions, not a duplicate type. \
         See .planning/ogdb-core-split-algorithms/PLAN.md §7.",
    );
}

#[test]
fn graph_path_is_reexported_from_ogdb_algorithms() {
    assert_eq!(
        TypeId::of::<ogdb_core::GraphPath>(),
        TypeId::of::<ogdb_algorithms::GraphPath>(),
        "ogdb_core::GraphPath must be a `pub use` re-export.",
    );
    let p = ogdb_core::GraphPath {
        node_ids: vec![0, 1],
        edge_ids: vec![10],
        total_weight: 1.0,
    };
    assert_eq!(p.node_ids.len(), 2);
}

#[test]
fn subgraph_types_are_reexported_from_ogdb_algorithms() {
    assert_eq!(
        TypeId::of::<ogdb_core::Subgraph>(),
        TypeId::of::<ogdb_algorithms::Subgraph>(),
    );
    assert_eq!(
        TypeId::of::<ogdb_core::SubgraphEdge>(),
        TypeId::of::<ogdb_algorithms::SubgraphEdge>(),
    );

    // Constructor round-trip across the shim — proves field layout
    // survives the re-export.
    let edge = ogdb_core::SubgraphEdge {
        edge_id: 7,
        src: 0,
        dst: 1,
        edge_type: None,
    };
    let sg = ogdb_core::Subgraph {
        center: 0,
        max_hops: 1,
        nodes: vec![0, 1],
        edges: vec![edge.clone()],
    };
    assert_eq!(sg.edges[0], edge);
    assert_eq!(sg.center, 0);
}

#[test]
fn shortest_path_options_default_matches_inline_construction() {
    // `ogdb-cli`'s MCP shortest_path tool currently constructs
    // `ShortestPathOptions { max_hops: … , edge_type: None,
    // weight_property: None }` inline (src/lib.rs:3130). After the
    // shim, that still resolves because the struct is a re-export.
    let from_default = ogdb_core::ShortestPathOptions::default();
    let from_explicit = ogdb_core::ShortestPathOptions {
        max_hops: None,
        edge_type: None,
        weight_property: None,
    };
    assert_eq!(from_default, from_explicit);
}

#[test]
fn community_kernels_are_callable_via_ogdb_algorithms_root() {
    // Regression pin: the three kernels must be directly callable
    // from `ogdb_algorithms::` — `ogdb-core`'s `community_*_at`
    // wrappers depend on this exact path via
    // `use ogdb_algorithms::{label_propagation, louvain, leiden};`.
    //
    // We assert the callable path here (not just the type identity)
    // because kernels are free fns, not types, so `TypeId` does not
    // apply.
    let adjacency = vec![vec![1u64], vec![0u64]];
    let visible = vec![0u64, 1];
    let lp = ogdb_algorithms::label_propagation(&adjacency, &visible);
    let lv = ogdb_algorithms::louvain(&adjacency, &visible, 1.0);
    let ld = ogdb_algorithms::leiden(&adjacency, &visible, 1.0);
    assert_eq!(lp.len(), 2);
    assert_eq!(lv.len(), 2);
    assert_eq!(ld.len(), 2);
}
```

To make these tests usable, `ogdb-core`'s `[dependencies]` gains the
regular `ogdb-algorithms = { path = "../ogdb-algorithms" }` line in
Phase 4 — no `[dev-dependencies]` entry needed.

In RED, the test file lives in `crates/ogdb-core/tests/` but will
**not compile** because `use ogdb_algorithms` is unresolved —
`ogdb-core` does not yet depend on `ogdb-algorithms`. That is the
expected RED signal:

```
$ cargo test -p ogdb-core --test ogdb_algorithms_reexport_shim
error[E0432]: unresolved import `ogdb_algorithms`
error[E0433]: failed to resolve: could not find `GraphPath` in `ogdb_core`
error[E0433]: failed to resolve: could not find `Subgraph` in `ogdb_core`
```

Running after Phase 5 (GREEN): all 5 tests PASS.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit.

### Phase 3 — create the new crate

1. `crates/ogdb-algorithms/Cargo.toml` — the 8-line stub in §7.4.
2. `crates/ogdb-algorithms/src/lib.rs`:
   - Paste the 4 plain-data types verbatim from lines 1271–1298.
   - Add the 3 pure kernels (`label_propagation`, `louvain`, `leiden`)
     by lift-and-shift from lines 18954–18993, 19000–19074 (resolution
     generalised to parameter), and 19083–19207 (with the Louvain
     phase delegated to the shared `louvain` helper).
   - Keep the item order stable (types first, kernels second) so the
     `git log --follow` chain stays readable.
   - Add 3 doc-tests at the top calling each kernel once, so
     `cargo doc --no-deps -p ogdb-algorithms` renders examples.
   - Add `#[cfg(test)] mod tests` covering the same contracts as
     `tests/api_smoke.rs` plus the behavior-preservation regressions
     against the in-core expected outputs (star graph, path graph,
     Zachary's Karate Club fixture if we already have one — otherwise
     skip).
3. Add `"crates/ogdb-algorithms",` to the root `Cargo.toml` members
   list (alphabetical order).

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`, add
   `ogdb-algorithms = { path = "../ogdb-algorithms" }` under
   `[dependencies]` (right after the existing `ogdb-vector` entry).
2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** the 4 type definitions at lines 1271–1298.
   - **Delete** the inner-loop bodies of `community_label_propagation_at`
     (lines 18954–18993), `community_louvain_at` (19000–19074), and
     `community_leiden_at` (19083–19207). Replace each body with a
     single-line call to the corresponding `ogdb_algorithms::` kernel
     (see shapes below). The `collect_undirected_neighbors_at` +
     visible-node builder prologue at lines 18955–18959 / 19001–19005 /
     19084–19088 stays — those read `self.edge_records` and cannot move.
   - **Add** the 2-line `pub use` + `use` block from §7.1 right below
     the existing `pub use ogdb_vector::{…};` line at lib.rs:8.
   - Verify no in-file reference uses `crate::ShortestPathOptions` or
     similar (grep confirms current callers use the unqualified names
     only — both the `pub use` and the `use` cover them).
3. **Do not** touch any downstream crate. Zero edits outside
   `ogdb-core/src/lib.rs` + `ogdb-core/Cargo.toml` + the new crate.

Example Database-wrapper shapes after Phase 4 (what
`community_louvain_at` reduces to):

```rust
fn community_louvain_at(
    &self,
    edge_type: Option<&str>,
    snapshot_txn_id: u64,
) -> Result<Vec<(u64, u64)>, DbError> {
    let adjacency = self.collect_undirected_neighbors_at(edge_type, snapshot_txn_id)?;
    let visible_nodes: Vec<u64> = (0..self.node_count())
        .filter(|id| self.is_node_visible_at(*id, snapshot_txn_id))
        .collect();
    Ok(louvain(&adjacency, &visible_nodes, 1.0))
}
```

Similarly for `community_label_propagation_at` (delegates to
`label_propagation`) and `community_leiden_at` (delegates to
`leiden(&adjacency, &visible_nodes, resolution)`).

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test
cargo test -p ogdb-algorithms --tests

# Core — the shim regression test + every existing ogdb-core test
# (the 11 community-detection unit tests at lines 27390–41036 pin
# behavior preservation of the wrappers)
cargo test -p ogdb-core --test ogdb_algorithms_reexport_shim
cargo test -p ogdb-core --tests     # big integration suite
cargo test -p ogdb-core --lib       # unit tests inside mod tests

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-vector ogdb-cli ogdb-ffi ogdb-python ogdb-bolt \
             ogdb-eval ogdb-bench ogdb-node ogdb-e2e ogdb-tck \
             ogdb-fuzz; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

If any `cargo build -p <crate>` fails, the shim is wrong — revert the
`pub use` block and investigate; do **not** paper over with downstream
edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append a
  `[ogdb-core-split-algorithms]` section describing the pure-kernel
  extraction, the shim strategy, the A-vs-B verdict, and a reference
  to this PLAN.md.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-algorithms` crate exposes
    `ShortestPathOptions`, `GraphPath`, `Subgraph`, `SubgraphEdge`,
    `label_propagation`, `louvain`, `leiden`."
  - `### Changed` — "`ogdb-core` re-exports the algorithm types from
    `ogdb-algorithms` via `pub use`; three private
    `community_*_at` Database methods now delegate their pure-math
    inner loops to `ogdb-algorithms` kernels. Public surface unchanged."
- `ARCHITECTURE.md` §13: no change — the tiers hold.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-algorithms-pure-kernels-split` referencing this plan (matches
  the pattern of every recent plan, e.g.
  `ogdb-vector-primitive-split`).

## 10. Out-of-scope (explicitly deferred to later plans)

- **Traversal cohort** (follow-up plan
  `plan/ogdb-core-split-algorithms-traversal`):
  `shortest_path_at`, `shortest_path_with_options_at`, `hop_levels_at`,
  `hop_levels_incoming_at`, `extract_subgraph_at`, plus their shared
  helpers (`outgoing_edges_for_path_at`, `reconstruct_graph_path`).
  These require either a closure-based neighbor producer or an
  Option-A `GraphView` trait; the choice should be informed by the
  kernel extraction we land here.
- **Hierarchy + summary cohort** (follow-up plan
  `plan/ogdb-core-split-algorithms-hierarchy`):
  `build_community_hierarchy_at`, `CommunitySummary`,
  `CommunityMember`, `CommunityHierarchy`. These touch
  `node_labels_at`, `node_properties_at`, `edge_records`, and take
  a `&dyn Fn(&[u64], &[(u64, u64, String)]) -> String` summary
  callback — design-heavy, not a pure extraction.
- **Adjacency builder** (`collect_undirected_neighbors_at`,
  `outgoing_edges_for_path_at`) — these read `self.edge_records`
  directly and represent the storage boundary. They remain in
  `ogdb-core` indefinitely or move only when `ogdb-core` itself is
  split along the storage/query axis.
- **Any `cargo build --workspace` or `cargo test --workspace`
  invocation.** AGENTS contract + user directive: per-crate only.
- The other 5 planned crates (`ogdb-query`, `ogdb-import`,
  `ogdb-export`, `ogdb-text`, `ogdb-temporal`). Each gets its own
  `.planning/` plan and its own `plan/ogdb-core-split-<facet>`
  branch.

## 11. Commit plan

| Phase | Commit subject                                                                             | Scope                                                                                               |
|------:|---------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| 2     | `plan(ogdb-core-split-algorithms): PLAN.md + RED-phase failing tests`                         | this commit                                                                                        |
| 3     | `chore(ogdb-core-split-algorithms): add ogdb-algorithms crate skeleton`                       | empty `lib.rs` → populated with 4 types + 3 kernels + unit tests                                   |
| 4     | `refactor(ogdb-core-split-algorithms): replace in-core algo types + community kernels with pub-use shim` | delete 4 types + 3 kernel bodies from `ogdb-core/src/lib.rs`, add `pub use` shim + `use` import, wire dep |
| 5     | `test(ogdb-core-split-algorithms): per-crate green under shim`                                | runs the per-crate matrix from §9 Phase 5 and records results                                       |
| 6     | `docs(ogdb-core-split-algorithms): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`                | docs only                                                                                          |
| 7     | `chore(release-tests): append ogdb-algorithms-pure-kernels-split manifest entry`              | release-tests yaml only                                                                            |

A follow-up plan `plan/ogdb-core-split-algorithms-traversal` will
pick up where this leaves off, moving BFS/Dijkstra/hop_levels/subgraph
behind either closures or the Option-A `GraphView` trait — a choice
made with this kernel extraction's data in hand.
