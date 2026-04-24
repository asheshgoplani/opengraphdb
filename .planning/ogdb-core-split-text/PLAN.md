# ogdb-core-split-text — extract FTS plain-data + validation + path helpers into new `ogdb-text` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-text/` (stub `Cargo.toml`, empty `src/lib.rs`, and two
> failing existence tests — one in the new crate, one shim-compat test
> in `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-core-split-text`.
>
> Phases 3–5 (GREEN) move the one plain-data FTS type, the pure
> validation function, and the three pure path-helper functions out of
> `crates/ogdb-core/src/lib.rs` into `crates/ogdb-text/src/lib.rs`,
> replace the in-core definitions with a `pub use ogdb_text::*` shim
> plus a crate-private `use ogdb_text::{...};` import, and rewire the
> one in-core caller of `normalize_fulltext_index_definition` to the
> new `Result<_, String>` signature. Phases 6–8 cover CHANGELOG +
> docs/IMPLEMENTATION-LOG + per-crate tests + the release-tests
> manifest entry.

**Goal:** land the **third** facet of the 7-crate split from
`ARCHITECTURE.md` §13 by extracting the one plain-data full-text-index
type (`FullTextIndexDefinition`), the pure validation function
(`normalize_fulltext_index_definition`), and the three pure path
helpers (`fulltext_index_root_path_for_db`, `sanitize_index_component`,
`fulltext_index_path_for_name`) out of the 41 593-line
`crates/ogdb-core/src/lib.rs` monolith into a brand-new
`crates/ogdb-text/` crate, with a `pub use` backward-compat shim in
`ogdb-core`. Mirrors the beachhead-plus-shim strategy shipped in
`plan/ogdb-core-split-vector` (commit `472ad2e`) and
`plan/ogdb-core-split-algorithms` (commit `df41dbb`).

**Architecture:** `ogdb-text` owns one plain-data struct and four pure
free functions. Every moved function has a signature that depends
only on `&str`, `&[String]`, `&Path`, and `PathBuf` — **no `Database`,
no `Snapshot`, no `DbError`, no storage layer references, and no
`tantivy` dep.** The tantivy-heavy, Database-adapting layer — the
runtime `FullTextIndexRuntime` struct, `Database::create_fulltext_index`,
`Database::drop_fulltext_index`, `Database::list_fulltext_indexes`,
`Database::text_search`, `Database::fulltext_query_nodes`,
`Database::fulltext_query_nodes_all_indexes`,
`Database::fulltext_scan_nodes_without_index`,
`Database::hybrid_query_nodes`, and
`Database::rebuild_fulltext_indexes_from_catalog` — **stays in
`ogdb-core`** exactly as today; the only Database-side edits are a
one-line call-site update (`ogdb_text::normalize_fulltext_index_definition(...).map_err(DbError::InvalidArgument)?`)
and two one-line call-site updates for the path helpers. A
`pub use ogdb_text::FullTextIndexDefinition;` line at the top of
`crates/ogdb-core/src/lib.rs` keeps every existing call site (in
`ogdb-core` and in every downstream crate) compiling byte-for-byte
identically. The tantivy dep stays behind the existing
`fulltext-search` feature flag in `ogdb-core`; **no tantivy dep
migration in this seed.**

**Tech stack:** Rust 2021, workspace-inherited version metadata,
`serde` (inherited from core — `FullTextIndexDefinition` already
derives `Serialize`/`Deserialize` for the meta-catalog WAL record),
no new runtime deps. `ogdb-text` pulls only `serde` through workspace
inheritance. Per-crate `cargo test -p <crate>` only — **never**
`--workspace` (AGENTS contract + user directive).

**Coupling verdict (Option A vs Option B):** **Option B** — move only
the plain-data type, the pure validation function, and the pure path
helpers, and leave the `tantivy`-bound Database-adapting layer
(query + rebuild + hybrid) in core. See §6 for the full A-vs-B
tradeoff; the tl;dr is that Option A (a `NodeRead` trait abstracting
`node_properties_at` + `is_node_visible_at` + `latest_visible_version`
+ `current_snapshot_txn_id` + `node_count`) would require designing a
~6-method contract with a generic `Error` associated type up front,
freezing an abstraction shared with the algorithms-traversal follow-up
which we have not yet validated. Option B lets us land a tight,
verifiable seed that moves exactly the pure plain-data + validation +
path helpers surface and leaves the tantivy runtime for a follow-up
plan (`plan/ogdb-core-split-text-runtime`) that can reuse the
`NodeRead` trait designed by the algorithms-traversal seed.

---

## 1. Problem summary — `ogdb-text` is the smallest-self-contained next facet after `ogdb-algorithms`

The vector split (`plan/ogdb-core-split-vector`, commit `472ad2e`) and
algorithms split (`plan/ogdb-core-split-algorithms`, commit `df41dbb`)
established the beachhead pattern:

1. New crate with empty `lib.rs` + Cargo stub.
2. Extract only **pure items** with zero coupling to `Database`,
   `DbError`, `PropertyValue`, the Cypher runtime, or storage.
3. `pub use` re-export in `ogdb-core` → zero downstream crate edits.
4. Per-crate `cargo test` matrix, never `--workspace`.
5. Every `_at`-family method that previously owned the moved primitive
   now imports it from the new crate (as a crate-private `use`) or
   calls it via a one-line delegation.

Applying that pattern to the next seed requires picking the next
candidate facet from the remaining 5 planned crates. `ogdb-core/src/lib.rs`
is now 41 593 LOC (down 343 LOC from main as of `bcbdbec`, split across
the vector and algorithms extractions). The remaining candidates, with
their coupling profiles:

| Planned crate  | Minimum viable seed (pure-math/data only)                               | Coupling risk                                                                                                                                                                                                                                     |
|----------------|-------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ogdb-text`    | 1 plain-data type + 1 validator + 3 path helpers (this plan)            | **Low** for this seed: moved items take `&str`/`&[String]`/`&Path` and return `Result<_, String>` or `PathBuf`. Tantivy runtime + Database-coupled query/rebuild stay in core behind `fulltext-search` feature flag.                               |
| `ogdb-temporal`| `TemporalScope`, `TemporalFilter`, `Episode`                            | Medium: `Episode` embeds `Vec<f32>` (already in `ogdb-vector`'s sphere); temporal filters bleed into Cypher planner expressions; community hierarchy already consumes `CommunitySummary`; retrieval callbacks tie it to RAG runtime.               |
| `ogdb-import`  | CSV / RDF / JSON readers                                                 | **High**: `Database::import_*` methods drive the readers; changes would ripple through WAL record writers and the document-ingest feature (`lopdf` + `pulldown-cmark`).                                                                            |
| `ogdb-export`  | Schema / dataset export                                                  | Medium–high: exports are serde-derived views on core types; any move pulls those types too.                                                                                                                                                       |
| `ogdb-query`   | ~25 000 LOC Cypher engine                                                | **Highest**: parser + analyser + planner + executor all cohabit with the Database methods; this is the terminal refactor, not a seed.                                                                                                              |

The text facet wins because **the plain-data subset is genuinely pure
and self-contained**: `FullTextIndexDefinition` is a 3-field struct
with the same `Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize,
Deserialize` derives as `VectorIndexDefinition` (already moved to
`ogdb-vector`); `normalize_fulltext_index_definition` only does string
trimming and duplicate-detection on a `&[String]` and returns a
`Result<FullTextIndexDefinition, DbError>` whose `DbError` arm is
**always** `DbError::InvalidArgument(String)` — a signature
cleaner-up to `Result<_, String>` with a single `.map_err(DbError::InvalidArgument)`
adapter at the one remaining call site; and the three path helpers
(`fulltext_index_root_path_for_db`, `sanitize_index_component`,
`fulltext_index_path_for_name`) take `&Path`/`&str` and return
`PathBuf`/`String` with zero Database or feature-gated dependencies.

The tantivy-heavy methods (`fulltext_query_nodes` at line 13360,
`rebuild_fulltext_indexes_from_catalog` at line 20244,
`hybrid_query_nodes` at 13586) are **not in this seed** — each reads
`self.materialized_fulltext_indexes`, `self.node_properties_at`,
`self.is_node_visible_at`, `self.node_label_versions`,
`self.latest_visible_version`, `self.current_snapshot_txn_id`, and
`self.node_count()` (at minimum six `Database` accessors). Lifting
them requires the Option-A `NodeRead` trait; follow-up plan.

## 2. Exact reproducer — what "after vector+algo split, before text split" looks like

### 2.1 Before this plan (main as of `df41dbb`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-vector
$ wc -l crates/ogdb-core/src/lib.rs
41593 crates/ogdb-core/src/lib.rs
$ grep -cE '^(pub )?mod ' crates/ogdb-core/src/lib.rs
1            # the test module only — still flat namespace
$ grep -rn 'ogdb_core::FullTextIndexDefinition' crates/ --include='*.rs' | grep -v 'ogdb-core/src/lib.rs' | wc -l
0            # zero downstream type-level imports today
$ grep -cE 'FullTextIndexDefinition' crates/ogdb-core/src/lib.rs
9            # 9 in-file references, all via the unqualified name
$ grep -n 'tantivy' crates/ogdb-core/Cargo.toml
10:fulltext-search = ["dep:tantivy"]
28:tantivy = { version = "0.25", optional = true }
```

### 2.2 After this plan (end of GREEN — Phases 3–5)

```bash
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-text
ogdb-vector
$ cat crates/ogdb-text/Cargo.toml    # new, 8 lines
$ wc -l crates/ogdb-text/src/lib.rs
~140        # 1 plain-data type + 4 pure fns + unit tests
$ wc -l crates/ogdb-core/src/lib.rs
~41 523     # ~70 LOC lighter (6 LOC of type + 41 LOC of validator +
            # 22 LOC of path helpers + 1 in-core test util)
$ grep -n 'pub use ogdb_text' crates/ogdb-core/src/lib.rs
1            # one re-export line for the plain-data type
$ grep -n 'use ogdb_text::' crates/ogdb-core/src/lib.rs
1            # one private import for the 4 pure fns
$ grep -n 'tantivy' crates/ogdb-core/Cargo.toml
10:fulltext-search = ["dep:tantivy"]   # unchanged — tantivy stays in core
28:tantivy = { version = "0.25", optional = true }
$ grep -n 'tantivy' crates/ogdb-text/Cargo.toml
# empty — ogdb-text has zero tantivy dep
$ cargo test -p ogdb-text --tests                              # PASS
$ cargo test -p ogdb-core --test ogdb_text_reexport_shim       # PASS
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/ crates/ogdb-vector/ crates/ogdb-algorithms/
# empty — zero downstream changes
```

## 3. Module map + LOC estimate — current FTS footprint in `ogdb-core`

Grep-derived, from `crates/ogdb-core/src/lib.rs` as of commit `df41dbb`:

| Item                                                        | Line range        | LOC  | Category                                 | Moves?                                       |
|-------------------------------------------------------------|-------------------|-----:|------------------------------------------|----------------------------------------------|
| `pub struct FullTextIndexDefinition`                        | 1287–1292         |    6 | Plain data                               | **YES**                                      |
| `fn normalize_fulltext_index_definition`                    | 3917–3957         |   41 | Pure validator, returns `Result<_, DbError::InvalidArgument>` | **YES** (sig adapted to `Result<_, String>`) |
| `fn fulltext_index_root_path_for_db`                        | 10894–10898       |    5 | Pure, `&Path -> PathBuf`                 | **YES**                                      |
| `fn sanitize_index_component`                               | 10900–10914       |   15 | Pure, `&str -> String`                   | **YES**                                      |
| `fn fulltext_index_path_for_name`                           | 10916–10918       |    3 | Pure, `&Path, &str -> PathBuf`           | **YES**                                      |
| `struct FullTextIndexRuntime` (private)                     | 8038–8042         |    5 | Plain data held by `Database`            | NO (coupled to materialization lifecycle — follow-up) |
| `Database::create_fulltext_index` (pub fn)                  | 12717–12729       |   13 | Database method                          | NO (stays on Database)                       |
| `Database::drop_fulltext_index` (pub fn)                    | 12731–12751       |   21 | Database method                          | NO (stays on Database)                       |
| `Database::list_fulltext_indexes` (pub fn)                  | 12753–12755       |    3 | Database method                          | NO (stays on Database)                       |
| `Database::text_search` (pub fn)                            | 12768–12776       |    9 | Database method                          | NO (stays on Database)                       |
| `Database::fulltext_query_nodes` (private)                  | 13360–13503       |  144 | Reads `materialized_fulltext_indexes`, `node_properties_at`, `node_label_versions`, etc. | NO — heavy Database + tantivy coupling (follow-up) |
| `Database::fulltext_query_nodes_all_indexes` (private)      | 13505–13535       |   31 | Calls `fulltext_query_nodes`             | NO (pairs with above)                        |
| `Database::fulltext_scan_nodes_without_index` (private)     | 13537–13584       |   48 | Reads `node_properties_at` + `is_node_visible_at` | NO (follow-up)                              |
| `Database::hybrid_query_nodes` (private)                    | 13586–13648       |   63 | Mixes vector + text retrieval             | NO — cross-facet, see `plan/ogdb-core-split-hybrid` (future) |
| `Database::rebuild_fulltext_indexes_from_catalog` (private) | 20244–20348       |  105 | Builds tantivy `Index` per definition     | NO — heavy tantivy + Database coupling (follow-up) |
| `materialized_fulltext_indexes` field on `Database`         | 11949             |    1 | `BTreeMap<String, FullTextIndexRuntime>`  | NO (stays on Database)                       |
| `fulltext_index_catalog` field on `DbMeta`/`DbMetaPersist`  | 7955, 7975, 8125, 8167 | 4 | `BTreeSet<FullTextIndexDefinition>` + vec on-disk | NO (stays — `FullTextIndexDefinition` is re-exported; catalog rows serialize identically via shim) |

**LOC moved in this plan:** **6 LOC** of plain-data type + **41 LOC**
of pure validator + **23 LOC** of pure path helpers = **70 LOC** out of
`ogdb-core`. **New unit tests in `ogdb-text`:** ~85 LOC covering
validator happy+error paths, path-helper edge cases, and struct
round-trip. **Net `ogdb-core` shrinkage:** ~69 LOC (moved bodies minus
1 `pub use` line minus 1 `use` line plus 1 adapter `.map_err(...)`
tacked onto the remaining `create_fulltext_index` call site).

Additionally, the existing in-core test fn at line 34870
(`normalize_fulltext_index_definition(" ", Some("Doc"), &["name".to_string()]).is_err()`)
and similar assertions at 34868, 34872 are **kept unchanged** — they
still call `normalize_fulltext_index_definition(...).is_err()` against
the in-core wrapper (which is a 3-line `.map_err(DbError::InvalidArgument)`
adapter calling `ogdb_text::normalize_fulltext_index_definition(...)`).
Zero test churn in the moved surface; 10 net LOC of test-call-site
edits.

## 4. Internal dependency graph for the 5 items being moved

```
┌──────────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs                                                 │
│                                                                      │
│  FullTextIndexDefinition (pub struct @1287)                          │
│    ↑                                                                 │
│    ├── normalize_fulltext_index_definition returns                   │
│    │     Result<FullTextIndexDefinition, DbError>  ← adapted in core │
│    ├── Database::create_fulltext_index (pub fn @12717)               │
│    │     calls normalize + inserts into fulltext_index_catalog       │
│    │     ← STAYS (but signature shifts to ogdb_text::...map_err)     │
│    ├── Database::drop_fulltext_index (pub fn @12731)                 │
│    │     .find(|def| def.name == name)                               │
│    │     ← STAYS                                                      │
│    ├── Database::list_fulltext_indexes (pub fn @12753)               │
│    │     returns Vec<FullTextIndexDefinition>       ← STAYS          │
│    ├── DbMeta.fulltext_index_catalog                                 │
│    │     : BTreeSet<FullTextIndexDefinition>        ← STAYS          │
│    ├── FullTextIndexRuntime.definition (private struct field @8040) │
│    │     ← STAYS                                                      │
│    └── Database::rebuild_fulltext_indexes_from_catalog               │
│          iterates fulltext_index_catalog                             │
│          ← STAYS                                                      │
│                                                                      │
│  normalize_fulltext_index_definition (pub fn after move @ogdb-text) │
│    signature: (&str, Option<&str>, &[String])                        │
│                -> Result<FullTextIndexDefinition, String>            │
│    ↑                                                                 │
│    └── one call site in ogdb-core:                                   │
│        Database::create_fulltext_index → updated to                  │
│        ogdb_text::normalize_fulltext_index_definition(...)           │
│            .map_err(DbError::InvalidArgument)?                       │
│                                                                      │
│  fulltext_index_root_path_for_db (pub fn after move)                 │
│    signature: (&Path) -> PathBuf                                     │
│    ↑                                                                 │
│    └── two call sites:                                               │
│        Database::rebuild_fulltext_indexes_from_catalog (@20246)      │
│        fulltext_index_path_for_name (@10917, moved)                  │
│                                                                      │
│  sanitize_index_component (pub fn after move)                        │
│    signature: (&str) -> String                                       │
│    ↑                                                                 │
│    └── two call sites:                                               │
│        Database::rebuild_fulltext_indexes_from_catalog (@20266)      │
│        fulltext_index_path_for_name (@10917, moved)                  │
│                                                                      │
│  fulltext_index_path_for_name (pub fn after move)                    │
│    signature: (&Path, &str) -> PathBuf                               │
│    ↑                                                                 │
│    └── one call site:                                                │
│        Database::rebuild_fulltext_indexes_from_catalog (@20277)      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key property:** every arrow into a "STAYS" box is a call from
`ogdb-core` code into a moved item. After the split, those call sites
continue to resolve via either:

- **`pub use ogdb_text::FullTextIndexDefinition;`** at the top of
  `crates/ogdb-core/src/lib.rs`, and
- **`use ogdb_text::{fulltext_index_path_for_name,
  fulltext_index_root_path_for_db, normalize_fulltext_index_definition,
  sanitize_index_component};`** (crate-private import so the Database
  methods and the one `rebuild_fulltext_indexes_from_catalog` path can
  call the helpers unqualified).

No outbound `ogdb-text → ogdb-core` edge exists. No cycle. The new
crate depends only on `serde` (because `FullTextIndexDefinition`
derives `Serialize`/`Deserialize` for the on-disk meta-catalog — this
derive is load-bearing; removing it would break the WAL record format).

## 5. Downstream inventory — who imports the FTS surface today

Exhaustive survey via `grep -rnE 'ogdb_core::[^;]*(FullText|Fulltext)' crates/ --include='*.rs'`:

| Downstream crate / file                                        | Imports                                                                            | After shim? |
|-----------------------------------------------------------------|------------------------------------------------------------------------------------|:-----------:|
| *(none)*                                                        | **Zero** downstream `use ogdb_core::FullTextIndexDefinition;` today                | ✅ N/A      |

**Method-level downstream calls** (via `grep -rnE '(create_fulltext_index|drop_fulltext_index|list_fulltext_indexes|text_search|fulltext)' crates/ --include='*.rs' | grep -v crates/ogdb-core/src/`):

| Downstream crate / file                                        | Calls                                                                              | After shim? |
|-----------------------------------------------------------------|------------------------------------------------------------------------------------|:-----------:|
| `ogdb-cli/src/lib.rs:2357`                                      | `"text_search" => execute_mcp_text_search_tool(...)` (MCP tool dispatch)           | ✅ no change |
| `ogdb-cli/src/lib.rs:2709–2716`                                 | `execute_mcp_text_search_tool` → `db.text_search(&index_name, &query_text, k)`     | ✅ no change |
| `ogdb-cli/src/lib.rs:3333`                                      | MCP tool schema entry `"name": "text_search"`                                      | ✅ no change |
| `ogdb-cli/src/lib.rs:14365–14841`                               | test harness: `call_tool(..., "text_search", ...)`, `db.create_fulltext_index(...)`| ✅ no change |
| `ogdb-python/src/lib.rs:405–479, 809–851`                       | PyO3 wrappers: `create_fulltext_index`, `text_search_raw`, `text_search`           | ✅ no change |
| `ogdb-python/tests/binding_smoke.rs:68–77`                      | `db.create_fulltext_index(...)`, `db.text_search(...)`                             | ✅ no change |
| `ogdb-node/src/lib.rs:405–479, 682–715`                         | napi-rs wrappers: mirrors ogdb-python                                              | ✅ no change |
| `ogdb-node/tests/binding_smoke.rs:68–77`                        | `db.create_fulltext_index(...)`, `db.text_search(...)`                             | ✅ no change |
| `ogdb-e2e/tests/comprehensive_e2e.rs:947–1476`                  | End-to-end: `db.create_fulltext_index`, `db.text_search`, MCP `text_search` tool   | ✅ no change |

**Count:** 9 downstream files call `Database::create_fulltext_index`,
`Database::drop_fulltext_index`, `Database::list_fulltext_indexes`,
and/or `Database::text_search`. Every one of these methods **stays on
`Database`** — the split does not touch them. Only their internal
helpers (the 5 moved items) relocate.

**Downstream-crate edits required by this plan: 0.**

## 6. Facet choice — why pure plain-data + validator + path helpers first, and Option B over Option A

### 6.1 Candidate seeds inside `ogdb-text`

| Candidate                                                          | LOC to move | Coupling to `Database`/`tantivy` | Downstream refs to moved items | Requires abstraction? |
|---------------------------------------------------------------------|------------:|-----------------------------------|-------------------------------:|:---------------------:|
| 1 plain-data type + 1 validator + 3 path helpers (this plan)        | ~70         | **None**: `&str`/`&Path` in, `PathBuf`/`String`/`Result<_, String>` out | 0 | No |
| + `fulltext_query_nodes` (private)                                  | +144        | `node_properties_at` + `is_node_visible_at` + `latest_visible_version` + `current_snapshot_txn_id` + `node_count` + `tantivy` | +0 | **Yes** (`NodeRead` trait or closure) |
| + `fulltext_query_nodes_all_indexes`                                | +31         | `materialized_fulltext_indexes` iteration | +0 | **Yes** (pairs with above) |
| + `fulltext_scan_nodes_without_index`                               | +48         | same as query_nodes (no tantivy)   | +0 | **Yes** |
| + `rebuild_fulltext_indexes_from_catalog`                           | +105        | `node_properties_at` + `is_node_visible_at` + `latest_visible_version` + `node_count` + `tantivy` + fs I/O | +0 | **Yes** |
| + `hybrid_query_nodes`                                              | +63         | cross-facet: vector + text hybrid  | +0 | **Yes** (cross-crate — belongs in a future `ogdb-hybrid` or stays in core) |

The plain-data + validator + path-helpers subset is the only FTS
surface whose signatures reference **no** `Database`, `DbError`,
`PropertyValue`, `tantivy::*`, or `RoaringBitmap`. Every other FTS
item either calls a `Database` accessor, touches `self.materialized_fulltext_indexes`,
or imports a `tantivy::*` symbol.

### 6.2 Option A vs Option B

| Dimension                                       | Option A: `NodeRead` trait in `ogdb-text` + tantivy dep migrated | Option B: pure data + validator + path helpers only, runtime stays in core |
|--------------------------------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------------|
| New abstractions introduced in this plan          | 1 trait with ~6 methods + 1 associated `Error` type + a `NodeRead` impl on `Database` | 0                                                                             |
| Items moved                                       | ~5 Database methods + plain data + path helpers + `tantivy` dep    | 1 type + 1 validator + 3 path helpers                                         |
| LOC moved                                         | ~470 (type + validator + path + fulltext_query_nodes + its two siblings + rebuild) | ~70                                                                           |
| Moves tantivy dep out of ogdb-core?               | Yes — `ogdb-text` takes the `fulltext-search` feature and `tantivy = { …, optional = true }` | No — tantivy stays in `ogdb-core` behind the existing feature flag            |
| Forces `DbError` to leak into the new crate?      | Yes (via `type Error: std::error::Error` on `NodeRead`)             | No — validator's error is `String`; core adapts via `.map_err(DbError::InvalidArgument)` |
| Reversible?                                       | Hard — trait contract becomes public API                            | Trivial — the 5 moved items are standalone free fns + one plain struct       |
| Validates the pattern before commitment?          | No — ships trait + dep migration without data                       | Yes — ships the subset that's obviously pure                                  |
| Matches the vector-split precedent?               | Partially                                                            | **Directly** (vector shipped 3 free fns + 2 data types, ~91 LOC, zero new deps) |
| Matches the algorithms-split precedent?           | No — algorithms explicitly deferred Option A to a follow-up         | **Directly** — algorithms shipped 3 pure kernels + 4 data types, ~207 LOC, zero new deps |
| Downstream risk                                   | Higher — trait change is a breaking `ogdb-text` major                | Lower — moved signatures are concrete types                                   |
| `NodeRead` trait design work can come from…       | This plan (cold design)                                              | The `plan/ogdb-core-split-algorithms-traversal` follow-up, which has the same need (`neighbors_at` + `node_labels_at` + `node_properties_at`) and will naturally generate the `NodeRead` contract |

**Choice: Option B**, because:

1. **Mirrors both prior precedents.** Vector moved 5 items zero-dep,
   zero-trait. Algorithms moved 7 items zero-dep, zero-trait, with an
   explicit "Option B now, Option A in follow-up" verdict. Text should
   follow the same shape.
2. **No premature abstraction.** Designing the `NodeRead` trait
   requires deciding: does it take `snapshot_txn_id` as a parameter
   (MVCC-aware), or does the implementor close over it? Does
   `node_properties` return `Result<PropertyMap, E>` or yield an
   iterator? Does it expose raw `node_label_versions` or only filtered
   access? These are the same design decisions the algorithms-traversal
   follow-up will have to make. Let that plan settle them first.
3. **Does not block Option A.** A follow-up plan
   (`plan/ogdb-core-split-text-runtime`) can introduce the `NodeRead`
   trait (or reuse the one from the algorithms-traversal follow-up)
   and move `fulltext_query_nodes` + `fulltext_query_nodes_all_indexes`
   + `fulltext_scan_nodes_without_index` + `rebuild_fulltext_indexes_from_catalog`
   behind it once this seed is in, at which point the tantivy dep
   migrates to `ogdb-text`.
4. **Zero `DbError` leakage.** The moved validator's error becomes
   `String` (its only `DbError` variant was always `DbError::InvalidArgument(String)`);
   the path helpers are infallible. `DbError` stays owned by `ogdb-core`.
5. **Zero tantivy dep migration.** `ogdb-text` has no `tantivy`
   dependency in this seed. `ogdb-core` keeps `tantivy = { version = "0.25", optional = true }`
   under the `fulltext-search` feature flag exactly as today. The
   migration happens in the follow-up along with the runtime methods.

### 6.3 What moves (and only these)

| Item                                     | Kind           | Current location in `ogdb-core/src/lib.rs` | After the move, in `ogdb-text/src/lib.rs`      | Approx. LOC |
|------------------------------------------|----------------|--------------------------------------------|------------------------------------------------|------------:|
| `FullTextIndexDefinition`                | `pub struct` + derives | lines 1287–1292                   | `pub struct` (verbatim, same derives)          |   6         |
| `normalize_fulltext_index_definition`    | `fn` with `Result<_, DbError>` | lines 3917–3957           | `pub fn` with `Result<_, String>` (same body, error arm rewritten to yield the inner string) | 41 |
| `fulltext_index_root_path_for_db`        | `fn`           | lines 10894–10898                          | `pub fn` (verbatim)                            |   5         |
| `sanitize_index_component`               | `fn`           | lines 10900–10914                          | `pub fn` (verbatim)                            |  15         |
| `fulltext_index_path_for_name`           | `fn`           | lines 10916–10918                          | `pub fn` (verbatim)                            |   3         |
| `#[cfg(test)] mod tests` for each of the above (new, in `ogdb-text/src/lib.rs`) | `#[test]` | new | new | ~60 |

**Total moved source:** ~70 LOC. **New unit tests in `ogdb-text`:**
~85 LOC (a `#[cfg(test)] mod tests` inside `src/lib.rs` covering every
error branch of the validator, plus the path-helper edge cases). **Net
`ogdb-core` shrinkage:** ~67 LOC (moved bodies minus 1 new `pub use`
line, 1 new `use` line, and 1 new `.map_err(DbError::InvalidArgument)`
adapter clause on the one validator call site).

### 6.4 What stays in `ogdb-core` (explicit non-scope)

Every item below **must remain** in `ogdb-core`; a follow-up plan
(`plan/ogdb-core-split-text-runtime`) extracts them once Option B has
proven out and either this plan or the algorithms-traversal follow-up
has produced a validated `NodeRead` trait.

- `struct FullTextIndexRuntime` (private, @8038) — holds
  `FullTextIndexDefinition` + `PathBuf` for the materialized on-disk
  tantivy index. Moves with the runtime cohort.
- `Database::create_fulltext_index` (@12717),
  `Database::drop_fulltext_index` (@12731),
  `Database::list_fulltext_indexes` (@12753),
  `Database::text_search` (@12768) — public methods on `Database`;
  cannot move without splitting `Database` itself. Their internal
  helper calls (the one `normalize_fulltext_index_definition`
  invocation inside `create_fulltext_index`) gain a single
  `.map_err(DbError::InvalidArgument)` adapter clause.
- `Database::fulltext_query_nodes` (@13360),
  `Database::fulltext_query_nodes_all_indexes` (@13505),
  `Database::fulltext_scan_nodes_without_index` (@13537),
  `Database::rebuild_fulltext_indexes_from_catalog` (@20244) — read
  `self.materialized_fulltext_indexes`, `self.node_properties_at`,
  `self.node_label_versions`, `self.latest_visible_version`,
  `self.is_node_visible_at`, `self.node_count()`,
  `self.current_snapshot_txn_id()`, and touch `tantivy` runtime. Not
  in this seed. Follow-up.
- `Database::hybrid_query_nodes` (@13586) — blends vector and text
  retrieval; cross-facet. Belongs in a future `ogdb-hybrid` crate or
  stays in core as the integration point. Not in this seed.
- `materialized_fulltext_indexes: BTreeMap<String, FullTextIndexRuntime>`
  field on `Database` (@11949) — part of `Database` state. Stays.
- `fulltext_index_catalog: BTreeSet<FullTextIndexDefinition>` on
  `DbMeta` (@7975) and `Vec<FullTextIndexDefinition>` on `DbMetaPersist`
  (@7955) — these still reference `FullTextIndexDefinition`, which is
  re-exported via `pub use ogdb_text::FullTextIndexDefinition;` — so
  the catalog rows continue to serialize/deserialize across the shim
  byte-for-byte (TypeId equality pinned by RED test §8.2).
- `fn contains_text_match` (@5931), `fn format_property_value` (@5028)
  — used by both `fulltext_query_nodes` (fuzzy scan fallback) and
  `fulltext_scan_nodes_without_index`. Stay with their callers.
- The `tantivy` dep itself (`Cargo.toml` @28) and the `fulltext-search`
  feature flag (@10) — stay in `ogdb-core` until the runtime cohort
  moves. `ogdb-text` ships with zero tantivy dep.

### 6.5 API shapes (the exact signatures GREEN will land)

```rust
//! crates/ogdb-text/src/lib.rs — the seed surface.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Persistent on-disk definition of a full-text index. Lives in the
/// meta-catalog as `BTreeSet<FullTextIndexDefinition>` so the `Ord`
/// lexicographic (name, label, property_keys) is load-bearing — any
/// derivation change silently corrupts catalog iteration order.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize,
)]
pub struct FullTextIndexDefinition {
    pub name: String,
    pub label: Option<String>,
    pub property_keys: Vec<String>,
}

/// Validate and normalize caller-supplied name / label / property keys
/// into a canonical `FullTextIndexDefinition`. Mirrors the semantics of
/// the in-core validator byte-for-byte:
///
/// * `name` trimmed, non-empty.
/// * `property_keys` non-empty; each trimmed, non-empty, unique.
/// * `label` trimmed; empty → `None`.
///
/// Returns a `String` error (the caller is `Database::create_fulltext_index`
/// which wraps via `.map_err(DbError::InvalidArgument)`).
pub fn normalize_fulltext_index_definition(
    name: &str,
    label: Option<&str>,
    property_keys: &[String],
) -> Result<FullTextIndexDefinition, String>;

/// Compute the sidecar directory path where a database at `path`
/// stores its per-definition tantivy indexes. Mirrors the in-core
/// suffix (`.ogdb.ftindex`) byte-for-byte so on-disk layout is
/// preserved across the split.
pub fn fulltext_index_root_path_for_db(path: &Path) -> PathBuf;

/// Sanitize an arbitrary index name into an ASCII-alphanumeric +
/// `-` + `_` slug suitable for a filesystem path component. Empty
/// input → `"_"`. Mirrors the in-core sanitizer byte-for-byte so
/// the sidecar directory names are stable across the split.
pub fn sanitize_index_component(name: &str) -> String;

/// Compute the per-index sidecar path for a database at `path` and
/// an index named `index_name`. Equivalent to
/// `fulltext_index_root_path_for_db(path).join(sanitize_index_component(index_name))`.
pub fn fulltext_index_path_for_name(path: &Path, index_name: &str) -> PathBuf;
```

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level imports

At the top of `crates/ogdb-core/src/lib.rs` (right below the existing
`pub use ogdb_algorithms::{GraphPath, ShortestPathOptions, Subgraph,
SubgraphEdge};` line from the algorithms split, to keep the three
re-export blocks adjacent), add exactly two lines:

```rust
// Re-export the plain-data FTS type so every (current or future)
// caller spelling `use ogdb_core::FullTextIndexDefinition;` keeps
// compiling byte-for-byte identically. No downstream caller today
// imports this type, but the `DbMeta::fulltext_index_catalog` field
// is `BTreeSet<FullTextIndexDefinition>` and is serialized into
// on-disk meta records — the TypeId equality pin in tests/ guards
// against accidental parallel definitions.
pub use ogdb_text::FullTextIndexDefinition;

// Crate-private import so the remaining in-core call sites of the
// validator + path helpers (inside Database::create_fulltext_index
// and Database::rebuild_fulltext_indexes_from_catalog) resolve the
// names unqualified.
use ogdb_text::{
    fulltext_index_path_for_name, fulltext_index_root_path_for_db,
    normalize_fulltext_index_definition as normalize_fulltext_index_definition_pure,
    sanitize_index_component,
};
```

> **Why the rename `normalize_fulltext_index_definition_pure`?**
> `ogdb-core` still defines a thin wrapper
> `fn normalize_fulltext_index_definition(...) -> Result<_, DbError>`
> at the original line 3917 (3 LOC) that calls
> `normalize_fulltext_index_definition_pure(...).map_err(DbError::InvalidArgument)`.
> This keeps the existing in-core test harness (lines 34866–34872,
> which call the core symbol with the `DbError` return type) and the
> one `create_fulltext_index` call site (@12723) working without
> touching either. The `_pure` suffix disambiguates the imported
> `ogdb_text::` function from the preserved in-core wrapper in the
> same module scope. This pattern is novel in this seed (vector and
> algorithms did not need a wrapper because their moved fns had no
> `DbError` in the signature); it is explicitly justified by the
> `DbError::InvalidArgument` ubiquity in the original validator.

### 7.2 Why `pub use` is byte-for-byte compatible for `FullTextIndexDefinition`

`FullTextIndexDefinition` has these derives today:

- `Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize`

All are preserved verbatim on the move. `pub use` hoists the single
`ogdb_text::FullTextIndexDefinition` into the `ogdb_core::` root
identically to how `pub use ogdb_vector::VectorDistanceMetric;` worked
in the vector split. The struct's field layout, ordering semantics,
and on-disk serde-JSON / bincode encodings are all a function of the
type's definition + derives, which are unchanged — so the meta-catalog
`BTreeSet<FullTextIndexDefinition>` continues to serialize
byte-for-byte identically to pre-split.

### 7.3 Why the validator + path-helper extraction is behavior-preserving

- `normalize_fulltext_index_definition` in `ogdb-text` is a verbatim
  copy of the in-core body at lines 3917–3957, with the three
  `DbError::InvalidArgument(format!(…))` constructors replaced by
  their inner `format!(…)` string expressions (one per branch).
  Semantics — trim rules, empty-name rejection, empty-keys rejection,
  duplicate-key detection, label-trim-and-filter-empty — are identical.
  The in-core wrapper at line 3917 collapses to 3 LOC:
  ```rust
  fn normalize_fulltext_index_definition(
      name: &str,
      label: Option<&str>,
      property_keys: &[String],
  ) -> Result<FullTextIndexDefinition, DbError> {
      normalize_fulltext_index_definition_pure(name, label, property_keys)
          .map_err(DbError::InvalidArgument)
  }
  ```
  so the existing tests at lines 34866, 34868, 34870, 34872 (which
  call `normalize_fulltext_index_definition(...).is_err()` and
  `.is_ok()`) continue to pass without edit.

- `fulltext_index_root_path_for_db` is infallible and deterministic
  (`path.as_os_str().to_os_string().push(".ogdb.ftindex"); PathBuf::from(…)`).
  Move verbatim.

- `sanitize_index_component` is infallible and deterministic (single
  pass over chars, ASCII-alphanumeric + `-` + `_` preserved, empty →
  `"_"`). Move verbatim.

- `fulltext_index_path_for_name` is a 1-line composition of the two
  above. Move verbatim.

### 7.4 `Cargo.toml` edits

- **New** `crates/ogdb-text/Cargo.toml`:
  ```toml
  [package]
  name = "ogdb-text"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [dependencies]
  serde = { version = "1", features = ["derive"] }

  [dev-dependencies]
  serde_json = "1"
  ```
  No other runtime deps — same minimum tree as `ogdb-vector` and
  `ogdb-algorithms`. **Specifically no `tantivy` dep** — the tantivy
  migration is a follow-up plan, not this one. `serde` is required at
  runtime because `FullTextIndexDefinition` derives
  `Serialize`/`Deserialize` for the on-disk meta-catalog (this is
  load-bearing — removing it would break the WAL record format).
  `serde_json` is a dev-only dep used by the smoke test
  (`tests/api_smoke.rs`) to pin the derive-serde round-trip.

- **Modified** `crates/ogdb-core/Cargo.toml` adds one line to
  `[dependencies]` (alongside the existing `ogdb-vector` and
  `ogdb-algorithms` entries):
  ```toml
  ogdb-text = { path = "../ogdb-text" }
  ```
  The `tantivy = { version = "0.25", optional = true }` line and the
  `fulltext-search = ["dep:tantivy"]` feature flag in `[features]`
  remain **unchanged**.

- **Modified** root `Cargo.toml` adds one entry to `[workspace] members`
  (in the same trailing position as `ogdb-text` in the DESIGN.md
  §37 layout, i.e. after `ogdb-algorithms`):
  ```toml
  "crates/ogdb-text",
  ```

No other crate's `Cargo.toml` changes. `ogdb-core`'s `Cargo.toml`
keeps `tantivy` untouched because nothing tantivy-bound moves.

## 8. RED-phase failing tests (exact file contents)

Two new tests are introduced. Both must fail on this commit (because
the source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-text/tests/api_smoke.rs`

This asserts the new crate exposes the expected public API once it is
populated in GREEN. The crate's `src/lib.rs` is empty (`//! RED`) so
the `use ogdb_text::*` lines fail with
`error[E0432]: unresolved imports`, which is the expected RED signal.

```rust
//! RED-phase API smoke test for the extracted ogdb-text crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_text::{FullTextIndexDefinition,
//! normalize_fulltext_index_definition, fulltext_index_root_path_for_db,
//! sanitize_index_component, fulltext_index_path_for_name}` are not
//! yet defined (src/lib.rs is intentionally empty).
//!
//! GREEN state (Phases 3–5 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been moved out of
//! crates/ogdb-core/src/lib.rs into crates/ogdb-text/src/lib.rs.

use std::path::{Path, PathBuf};

use ogdb_text::{
    fulltext_index_path_for_name, fulltext_index_root_path_for_db,
    normalize_fulltext_index_definition, sanitize_index_component,
    FullTextIndexDefinition,
};

#[test]
fn definition_is_plain_data_with_full_derive_surface() {
    // Load-bearing for the on-disk meta-catalog: FullTextIndexDefinition
    // lives in BTreeSet<_> on DbMeta.fulltext_index_catalog (ogdb-core
    // lib.rs:7975). Ord lexicographic across (name, label,
    // property_keys) is required — any derivation divergence silently
    // corrupts catalog iteration order across the shim boundary.
    let a = FullTextIndexDefinition {
        name: "a_idx".to_string(),
        label: Some("Doc".to_string()),
        property_keys: vec!["title".to_string(), "body".to_string()],
    };
    let b = a.clone();
    assert_eq!(a, b);
    assert!(a <= b); // Ord preserved
    // Debug + Serialize + Deserialize survive the move (WAL records
    // encode this struct via serde).
    let json = serde_json::to_string(&a).expect("serialize");
    let round: FullTextIndexDefinition =
        serde_json::from_str(&json).expect("deserialize");
    assert_eq!(round, a);
    assert!(format!("{a:?}").contains("a_idx"));
}

#[test]
fn normalize_accepts_valid_input() {
    let def = normalize_fulltext_index_definition(
        "  name_idx  ",
        Some("  Doc  "),
        &["title".to_string(), "body".to_string()],
    )
    .expect("valid input should normalize");
    assert_eq!(def.name, "name_idx"); // trimmed
    assert_eq!(def.label, Some("Doc".to_string())); // trimmed
    assert_eq!(def.property_keys, vec!["title".to_string(), "body".to_string()]);
}

#[test]
fn normalize_rejects_empty_name() {
    let err = normalize_fulltext_index_definition(
        "   ",
        Some("Doc"),
        &["title".to_string()],
    )
    .expect_err("blank name must error");
    assert!(
        err.contains("name cannot be empty"),
        "expected empty-name error, got: {err}",
    );
}

#[test]
fn normalize_rejects_empty_property_keys() {
    let err = normalize_fulltext_index_definition("idx", Some("Doc"), &[])
        .expect_err("empty property_keys must error");
    assert!(
        err.contains("at least one property key"),
        "expected empty-keys error, got: {err}",
    );
}

#[test]
fn normalize_rejects_blank_property_key() {
    let err = normalize_fulltext_index_definition(
        "idx",
        Some("Doc"),
        &["   ".to_string()],
    )
    .expect_err("blank key must error");
    assert!(
        err.contains("property key cannot be empty"),
        "expected blank-key error, got: {err}",
    );
}

#[test]
fn normalize_rejects_duplicate_property_keys() {
    let err = normalize_fulltext_index_definition(
        "idx",
        Some("Doc"),
        &["title".to_string(), "title".to_string()],
    )
    .expect_err("duplicate keys must error");
    assert!(
        err.contains("duplicate"),
        "expected duplicate-key error, got: {err}",
    );
    assert!(err.contains("title"));
}

#[test]
fn normalize_treats_blank_label_as_none() {
    let def =
        normalize_fulltext_index_definition("idx", Some("   "), &["k".to_string()])
            .expect("blank label → None");
    assert_eq!(def.label, None, "blank label should become None");
}

#[test]
fn normalize_accepts_none_label() {
    let def = normalize_fulltext_index_definition("idx", None, &["k".to_string()])
        .expect("None label is valid");
    assert_eq!(def.label, None);
}

#[test]
fn root_path_appends_ftindex_suffix() {
    // Regression pin: the `.ogdb.ftindex` suffix is load-bearing for
    // sidecar directory discovery and on-disk layout compatibility
    // (see ARCHITECTURE.md line 93 and ogdb-core lib.rs:10894).
    let base = Path::new("/tmp/mydb");
    let root = fulltext_index_root_path_for_db(base);
    assert_eq!(root, PathBuf::from("/tmp/mydb.ogdb.ftindex"));
}

#[test]
fn sanitize_preserves_alphanumerics_and_separators() {
    assert_eq!(sanitize_index_component("doc_idx-1"), "doc_idx-1");
}

#[test]
fn sanitize_replaces_unsafe_characters_with_underscore() {
    assert_eq!(sanitize_index_component("name with space"), "name_with_space");
    assert_eq!(sanitize_index_component("path/traversal"), "path_traversal");
    assert_eq!(sanitize_index_component("unicode:é"), "unicode__");
}

#[test]
fn sanitize_empty_yields_single_underscore() {
    // Regression pin: empty index-name slug maps to "_" (never empty
    // string), so the filesystem never sees a blank path component.
    assert_eq!(sanitize_index_component(""), "_");
}

#[test]
fn path_for_name_composes_root_and_slug() {
    let base = Path::new("/var/lib/ogdb/mydb");
    let p = fulltext_index_path_for_name(base, "weird name!");
    assert_eq!(
        p,
        PathBuf::from("/var/lib/ogdb/mydb.ogdb.ftindex/weird_name_"),
    );
}
```

Running today (RED):
```
$ cargo test -p ogdb-text --tests
error[E0432]: unresolved import `ogdb_text::FullTextIndexDefinition`
  --> crates/ogdb-text/tests/api_smoke.rs:16:5
```

Running after Phase 5 (GREEN): all 13 tests PASS.

### 8.2 `crates/ogdb-core/tests/ogdb_text_reexport_shim.rs`

This is the **backward-compat guarantee** that no downstream crate
breaks. It asserts `ogdb_core::FullTextIndexDefinition` is still
nameable from the `ogdb_core::` root, that its derives survive, and
that its `TypeId` matches the `ogdb_text` original (catching any
accidental duplicate definition that would silently break
`BTreeSet<FullTextIndexDefinition>` serialization across the shim).

```rust
//! Shim regression: the plain-data `FullTextIndexDefinition` type
//! must remain nameable from the `ogdb_core::` root after the
//! Phase-3 text split. No downstream crate today imports this type,
//! but `DbMeta::fulltext_index_catalog: BTreeSet<FullTextIndexDefinition>`
//! is serialized into the on-disk meta-catalog — a silent parallel
//! definition in ogdb-core would corrupt catalog iteration order
//! and serde round-trips across the shim boundary. This test pins
//! the re-export identity.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-text (`unresolved import ogdb_text`), and
//! `ogdb_core::FullTextIndexDefinition` is still the in-core original,
//! not a re-export — so the TypeId equality below would spuriously
//! hold (same type is on both sides of the equation) if the test
//! compiled, but it does not compile.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_text::FullTextIndexDefinition;` and the TypeId
//! equality below holds because both sides resolve to the single
//! definition in ogdb-text.

use std::any::TypeId;

#[test]
fn full_text_index_definition_is_reexported_from_ogdb_text() {
    // If this line fails to compile, any downstream caller (future or
    // current) writing `use ogdb_core::FullTextIndexDefinition;` will
    // also break — and more subtly, the serde round-trip of the
    // on-disk meta-catalog would go through two parallel type
    // definitions.
    let def = ogdb_core::FullTextIndexDefinition {
        name: "shim_idx".to_string(),
        label: Some("Doc".to_string()),
        property_keys: vec!["title".to_string()],
    };
    assert_eq!(def.property_keys.len(), 1);

    assert_eq!(
        TypeId::of::<ogdb_core::FullTextIndexDefinition>(),
        TypeId::of::<ogdb_text::FullTextIndexDefinition>(),
        "ogdb_core::FullTextIndexDefinition must be a `pub use` \
         re-export of ogdb_text::FullTextIndexDefinition, not a \
         duplicate type. See .planning/ogdb-core-split-text/PLAN.md §7.",
    );
}

#[test]
fn btreeset_ordering_is_stable_across_shim() {
    // DbMeta.fulltext_index_catalog: BTreeSet<FullTextIndexDefinition>
    // (ogdb-core lib.rs:7975). BTreeSet requires Ord, derived
    // lexicographically across (name, label, property_keys). Any
    // re-derivation divergence between the old in-core type and the
    // new ogdb-text type would silently corrupt catalog iteration
    // order. Pin it here.
    use std::collections::BTreeSet;
    let a = ogdb_core::FullTextIndexDefinition {
        name: "a".into(),
        label: Some("Doc".into()),
        property_keys: vec!["k".into()],
    };
    let b = ogdb_core::FullTextIndexDefinition {
        name: "b".into(),
        label: Some("Doc".into()),
        property_keys: vec!["k".into()],
    };
    let mut set = BTreeSet::new();
    set.insert(b.clone());
    set.insert(a.clone());
    let ordered: Vec<_> = set.iter().collect();
    assert_eq!(ordered[0].name, "a");
    assert_eq!(ordered[1].name, "b");
}

#[test]
fn serde_round_trip_survives_shim() {
    // The meta-catalog persists FullTextIndexDefinition via serde.
    // Round-trip through serde_json at the shim boundary to prove
    // both sides share derive output (Serialize + Deserialize).
    let original = ogdb_core::FullTextIndexDefinition {
        name: "serde_idx".into(),
        label: Some("Doc".into()),
        property_keys: vec!["title".into(), "body".into()],
    };
    let wire = serde_json::to_string(&original).expect("serialize shim-origin");
    // Deserialize into the ogdb-text-origin type to prove the wire
    // format is identical.
    let landed: ogdb_text::FullTextIndexDefinition =
        serde_json::from_str(&wire).expect("deserialize ogdb-text-origin");
    assert_eq!(landed.name, original.name);
    assert_eq!(landed.label, original.label);
    assert_eq!(landed.property_keys, original.property_keys);
}

#[test]
fn ogdb_text_helpers_are_callable_via_ogdb_text_root() {
    // Regression pin: the 4 pure fns must be directly callable from
    // `ogdb_text::` — `ogdb-core`'s `Database::create_fulltext_index`
    // and `Database::rebuild_fulltext_indexes_from_catalog` depend on
    // these paths via
    // `use ogdb_text::{normalize_fulltext_index_definition as
    // normalize_fulltext_index_definition_pure, fulltext_index_root_path_for_db,
    // sanitize_index_component, fulltext_index_path_for_name};`.
    //
    // We assert the callable paths here (not just type identities)
    // because free fns cannot be compared via TypeId.
    let def = ogdb_text::normalize_fulltext_index_definition(
        "call_idx",
        Some("Doc"),
        &["k".to_string()],
    )
    .expect("validator callable");
    assert_eq!(def.name, "call_idx");

    let root = ogdb_text::fulltext_index_root_path_for_db(
        std::path::Path::new("/tmp/ogdb-x"),
    );
    assert!(root.to_string_lossy().ends_with(".ogdb.ftindex"));

    let slug = ogdb_text::sanitize_index_component("has space");
    assert_eq!(slug, "has_space");

    let per = ogdb_text::fulltext_index_path_for_name(
        std::path::Path::new("/tmp/ogdb-y"),
        "x y",
    );
    assert!(per.to_string_lossy().ends_with(".ogdb.ftindex/x_y"));
}

#[test]
fn definition_constructor_round_trips_across_shim() {
    // Construct via the ogdb-core re-export, serde through
    // ogdb-text, land back on the ogdb-core view — proves the shim
    // is a pure re-export, not a parallel copy. The existing in-core
    // integration tests at lib.rs:34866–34872 already cover the
    // DbError::InvalidArgument mapping on the validator wrapper; we
    // do not duplicate that here (it would require spinning up a
    // Database on a tempdir, which is orthogonal to the shim).
    let via_core = ogdb_core::FullTextIndexDefinition {
        name: "round_idx".into(),
        label: None,
        property_keys: vec!["k1".into(), "k2".into()],
    };
    let wire = serde_json::to_string(&via_core).expect("serialize");
    let via_text: ogdb_text::FullTextIndexDefinition =
        serde_json::from_str(&wire).expect("deserialize");
    // And back again.
    let wire2 = serde_json::to_string(&via_text).expect("serialize ogdb-text");
    let via_core_again: ogdb_core::FullTextIndexDefinition =
        serde_json::from_str(&wire2).expect("deserialize back to ogdb-core");
    assert_eq!(via_core_again, via_core);
}
```

To make these tests usable, `ogdb-core`'s `[dependencies]` gains the
regular `ogdb-text = { path = "../ogdb-text" }` line in Phase 4 — no
`[dev-dependencies]` entry needed. `serde_json` is already a regular
dep of `ogdb-core` (@26 in Cargo.toml), so the serde round-trip tests
compile in the `ogdb-core/tests/` integration-test scope without new
dev-dep entries.

In RED, the test file lives in `crates/ogdb-core/tests/` but will
**not compile** because `use ogdb_text` is unresolved — `ogdb-core`
does not yet depend on `ogdb-text`. That is the expected RED signal:

```
$ cargo test -p ogdb-core --test ogdb_text_reexport_shim
error[E0432]: unresolved import `ogdb_text`
error[E0433]: failed to resolve: could not find `FullTextIndexDefinition` in `ogdb_core`
```

Running after Phase 5 (GREEN): all 5 tests PASS.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit.

### Phase 3 — create the new crate

1. `crates/ogdb-text/Cargo.toml` — the 8-line stub in §7.4.
2. `crates/ogdb-text/src/lib.rs`:
   - Paste `FullTextIndexDefinition` verbatim from lines 1287–1292
     (including all derives).
   - Paste `normalize_fulltext_index_definition` with its body from
     lines 3917–3957, changing only the return type
     (`Result<FullTextIndexDefinition, DbError>` →
     `Result<FullTextIndexDefinition, String>`) and the three error
     arms (`Err(DbError::InvalidArgument(…))` → `Err(…)` holding just
     the inner string). The duplicate-detection branch at line 3944
     already uses `format!("duplicate fulltext index property key: {key}")`
     — that string is preserved exactly.
   - Paste the three path helpers verbatim from lines 10894–10918.
   - Keep the item order stable (type first, validator second, path
     helpers third) so the `git log --follow` chain stays readable.
   - Add 4 doc-tests at the top of the file (one per pub fn) so
     `cargo doc --no-deps -p ogdb-text` renders examples.
   - Add a `#[cfg(test)] mod tests` at the bottom covering the same
     contracts as `tests/api_smoke.rs` plus property-style checks (e.g.
     "sanitize output is always ASCII-`[a-zA-Z0-9_-]+`").
3. Add `"crates/ogdb-text",` to the root `Cargo.toml` members list
   (after `crates/ogdb-algorithms`).

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`, add
   `ogdb-text = { path = "../ogdb-text" }` under `[dependencies]`
   (right after the existing `ogdb-algorithms` entry). **Do not** touch
   the `tantivy` dep line or the `fulltext-search` feature flag — they
   remain exactly as today.
2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** the `FullTextIndexDefinition` struct definition at
     lines 1287–1292.
   - **Delete** the body of `normalize_fulltext_index_definition` at
     lines 3917–3957 and replace with the 3-LOC wrapper described in
     §7.1 (calls `normalize_fulltext_index_definition_pure(...).map_err(DbError::InvalidArgument)`).
   - **Delete** the three path-helper functions at lines 10894–10918.
   - **Add** the 2-line `pub use` + `use` block from §7.1 right below
     the existing `pub use ogdb_algorithms::{…};` line near the top of
     the file (verify by grep that the `pub use ogdb_vector::…` and
     `pub use ogdb_algorithms::…` lines are already adjacent; insert
     immediately below them).
   - Verify (via `grep -n 'sanitize_index_component\|fulltext_index_root_path_for_db\|fulltext_index_path_for_name\|normalize_fulltext_index_definition' crates/ogdb-core/src/lib.rs`) that the only remaining references are:
     * the one `normalize_fulltext_index_definition(...)?` call in
       `Database::create_fulltext_index` at line 12723 (resolves to
       the 3-LOC core wrapper);
     * the two `fulltext_index_root_path_for_db(&self.path)` calls
       (@20246) and `fulltext_index_path_for_name(&self.path, &definition.name)`
       call (@20277) in `Database::rebuild_fulltext_indexes_from_catalog`
       (resolve to the `ogdb_text::…` private import);
     * the one `sanitize_index_component(&definition.name)` call
       (@20266) in the same method (resolves via the private import);
     * the four in-core test assertions at lines 34866, 34868, 34870,
       34872 (unchanged — they call the core wrapper for the `DbError`
       return type) and at 34949, 34951 (call `sanitize_index_component`
       directly — resolve via the private import);
     * zero references to `fulltext_index_root_path_for_db` or
       `fulltext_index_path_for_name` in tests (grep-confirmed).
3. **Do not** touch any downstream crate. Zero edits outside
   `ogdb-core/src/lib.rs` + `ogdb-core/Cargo.toml` + the new crate.

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test
cargo test -p ogdb-text --tests

# Core — the shim regression test + every existing ogdb-core test
# (the FTS integration tests at lines 35887+, 35971+, 36086+, 36143+,
# 36278+, 36994+ pin behavior preservation of Database::create_fulltext_index,
# rebuild, query, and hybrid paths).
cargo test -p ogdb-core --test ogdb_text_reexport_shim
cargo test -p ogdb-core --tests     # big integration suite
cargo test -p ogdb-core --lib       # unit tests inside mod tests

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-vector ogdb-algorithms ogdb-cli ogdb-ffi ogdb-python \
             ogdb-bolt ogdb-eval ogdb-bench ogdb-node ogdb-e2e \
             ogdb-tck ogdb-fuzz; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

If any `cargo build -p <crate>` fails, the shim is wrong — revert the
`pub use` block and investigate; do **not** paper over with downstream
edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append a
  `[ogdb-core-split-text]` section describing the plain-data + validator
  + path-helper extraction, the shim strategy, the A-vs-B verdict
  (with explicit "tantivy dep stays in core — follow-up plan
  `plan/ogdb-core-split-text-runtime` migrates it"), and a reference
  to this PLAN.md.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-text` crate exposes
    `FullTextIndexDefinition`, `normalize_fulltext_index_definition`,
    `fulltext_index_root_path_for_db`, `sanitize_index_component`,
    `fulltext_index_path_for_name`."
  - `### Changed` — "`ogdb-core` re-exports `FullTextIndexDefinition`
    from `ogdb-text` via `pub use`; the in-core
    `normalize_fulltext_index_definition` validator wrapper collapses
    to a 3-line `.map_err(DbError::InvalidArgument)` adapter on top of
    the new `ogdb_text::` function. Public surface unchanged; tantivy
    dependency and `fulltext-search` feature flag remain in
    `ogdb-core`."
- `ARCHITECTURE.md` §13: no change — the tiers hold.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-text-plain-data-split` referencing this plan (matches the
  pattern of `ogdb-vector-primitive-split` and
  `ogdb-algorithms-pure-kernels-split`).

## 10. Out-of-scope (explicitly deferred to later plans)

- **Runtime + tantivy-dep cohort** (follow-up plan
  `plan/ogdb-core-split-text-runtime`):
  `FullTextIndexRuntime`, `fulltext_query_nodes`,
  `fulltext_query_nodes_all_indexes`, `fulltext_scan_nodes_without_index`,
  `rebuild_fulltext_indexes_from_catalog`, plus migration of the
  `tantivy = { version = "0.25", optional = true }` dep and the
  `fulltext-search = ["dep:tantivy"]` feature flag from `ogdb-core` to
  `ogdb-text`. Requires either a closure-based node-reader or the
  Option-A `NodeRead` trait (whose design should be informed by the
  algorithms-traversal follow-up, which has an overlapping need for
  `neighbors_at` + `node_labels_at` + `node_properties_at`).
- **Hybrid cohort** (`plan/ogdb-core-split-hybrid` or stays in core):
  `hybrid_query_nodes` (@13586) blends vector + text retrieval and
  does not belong in either `ogdb-vector` or `ogdb-text`. Either a
  new `ogdb-hybrid` crate or keep it as the integration point in
  `ogdb-core`. Decision deferred.
- **Database methods** `create_fulltext_index`, `drop_fulltext_index`,
  `list_fulltext_indexes`, `text_search`, plus the CLI/ffi/python/node
  MCP `text_search` tool surface — all stay on `Database` until
  `Database` itself is split along the storage/query axis (terminal
  refactor).
- **Any `cargo build --workspace` or `cargo test --workspace`
  invocation.** AGENTS contract + user directive: per-crate only.
- The other 4 planned crates (`ogdb-query`, `ogdb-import`,
  `ogdb-export`, `ogdb-temporal`). Each gets its own `.planning/`
  plan and its own `plan/ogdb-core-split-<facet>` branch.

## 11. Commit plan

| Phase | Commit subject                                                                    | Scope                                                                                   |
|------:|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| 2     | `plan(ogdb-core-split-text): PLAN.md + RED-phase failing tests`                    | this commit                                                                             |
| 3     | `chore(ogdb-core-split-text): add ogdb-text crate skeleton`                        | empty `lib.rs` → populated with 1 type + 4 pure fns + unit tests                        |
| 4     | `refactor(ogdb-core-split-text): replace in-core FTS plain-data + validator + path helpers with pub-use shim` | delete 5 items from `ogdb-core/src/lib.rs`, add `pub use` shim + `use` import + 3-LOC `DbError` adapter wrapper, wire dep |
| 5     | `test(ogdb-core-split-text): per-crate green under shim`                           | runs the per-crate matrix from §9 Phase 5 and records results                           |
| 6     | `docs(ogdb-core-split-text): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`           | docs only                                                                               |
| 7     | `chore(release-tests): append ogdb-text-plain-data-split manifest entry`           | release-tests yaml only                                                                 |

A follow-up plan `plan/ogdb-core-split-text-runtime` will pick up
where this leaves off, migrating the tantivy dep and moving the
`fulltext_query_nodes` + `rebuild_fulltext_indexes_from_catalog`
cohort behind either closures or the `NodeRead` trait — a choice made
with this plain-data extraction's data in hand and the
algorithms-traversal follow-up's trait design in scope.
