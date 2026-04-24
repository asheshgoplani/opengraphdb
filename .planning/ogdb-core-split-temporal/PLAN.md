# ogdb-core-split-temporal — extract temporal plain-data + pure filter helpers into new `ogdb-temporal` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-temporal/` (stub `Cargo.toml`, empty `src/lib.rs`, and two
> failing existence tests — one in the new crate, one shim-compat test
> in `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-core-split-temporal`.
>
> Phases 3–5 (GREEN) move the two plain-data temporal types and two
> new pure helper functions out of `crates/ogdb-core/src/lib.rs` into
> `crates/ogdb-temporal/src/lib.rs`, replace the in-core definitions
> with a `pub use ogdb_temporal::{TemporalScope, TemporalFilter};` shim
> + private `use ogdb_temporal::{temporal_filter_matches,
> validate_valid_window};` import, and refactor the one in-core caller
> of `Database::edge_matches_temporal_filter` to delegate to
> `ogdb_temporal::temporal_filter_matches` + refactor `parse_edge_valid_window`
> to delegate the pure check to `ogdb_temporal::validate_valid_window`.
> Phases 6–8 cover CHANGELOG + docs/IMPLEMENTATION-LOG + per-crate
> tests + the release-tests manifest entry.

**Goal:** land the **fourth** facet of the 7-crate split from
`ARCHITECTURE.md` §13 / `DESIGN.md` `ogdb-temporal/` by extracting the
two pure plain-data temporal types (`TemporalScope`, `TemporalFilter`)
and two pure decision-logic helpers (`temporal_filter_matches`,
`validate_valid_window`) out of the 41 543-line
`crates/ogdb-core/src/lib.rs` monolith into a brand-new
`crates/ogdb-temporal/` crate, with a `pub use` backward-compat shim
in `ogdb-core`. Mirrors the beachhead-plus-shim strategy shipped in
`plan/ogdb-core-split-vector` (commit `472ad2e`),
`plan/ogdb-core-split-algorithms` (commit `df41dbb`), and
`plan/ogdb-core-split-text` (commit `4c25af6`).

**Architecture:** `ogdb-temporal` owns two plain-data types and two
pure free functions. Every moved item has a signature that depends
only on `i64`, `Option<i64>`, `bool`, and `String` — **no `Database`,
no `Snapshot`, no `DbError`, no `PropertyMap`, no `PropertyValue`, no
WAL, no storage layer references.** The Database-coupled, MVCC-aware
layer — `Database::add_node_temporal_version` (@17496),
`Database::compact_temporal_versions` (@17532),
`Database::node_temporal_version_count` (@12374),
`Database::set_temporal_compaction_floor` (@12155),
`Database::edge_valid_window` (@20687),
`Database::edge_transaction_time_millis` (@20691),
`Database::edge_valid_window_at` (@18330),
`Database::edge_transaction_time_millis_at` (@18347),
`Database::edge_matches_temporal_filter` (@19861),
`BackgroundCompactor` (@8992), `TemporalNodeVersion` (@8460),
`Episode` (@1304), `parse_edge_valid_window` (@5641),
`temporal_i64_property` (@5630), and the Cypher parser entry point
`parse_match_temporal_filter` (@6846) — **stays in `ogdb-core`** for
this seed. The only Database-side edits are:

1. `Database::edge_matches_temporal_filter` swaps its 12-line
   match arm for a single `Ok(ogdb_temporal::temporal_filter_matches(filter, valid_from, valid_to, tx_time_or_zero))`.
2. `parse_edge_valid_window` swaps its 6-line `if let (Some, Some)` /
   `to <= from` clause for a single
   `ogdb_temporal::validate_valid_window(valid_from, valid_to).map_err(DbError::InvalidArgument)?`.

A `pub use ogdb_temporal::{TemporalScope, TemporalFilter};` line at
the top of `crates/ogdb-core/src/lib.rs` keeps every existing call
site (the ~20 in-core uses + 2 in-core test-construction sites at
lines 26747 and 37669/37680, and the 6 AST struct fields at
1705/2097/2192/2231/2341 holding `Option<TemporalFilter>`) compiling
byte-for-byte identically. **No downstream-crate edits required**:
exhaustive grep across all 14 workspace crates returns **zero**
imports of `TemporalScope`, `TemporalFilter`, `TemporalNodeVersion`,
`Episode`, or `BackgroundCompactor`. The only downstream temporal
touchpoint is `ogdb-e2e/tests/comprehensive_e2e.rs:291,294` calling
`db.edge_valid_window(...)` and `db.edge_transaction_time_millis(...)`
— both **stay on `Database`** unchanged.

**Tech stack:** Rust 2021, workspace-inherited version metadata, **no
new runtime deps** (the moved types do not derive `Serialize`/`Deserialize`
today — they are pure runtime types with `Debug, Clone, Copy?,
PartialEq, Eq` only). `ogdb-temporal` ships with **zero dependencies**.
Per-crate `cargo test -p <crate>` only — **never** `--workspace`
(AGENTS contract + user directive).

**Coupling verdict (Option A vs Option B):** **Option B** — move only
the plain-data type pair and two newly-extracted pure helpers, and
leave the storage/MVCC-coupled methods + `TemporalNodeVersion` +
`BackgroundCompactor` + `Episode` in core. See §6 for the full A-vs-B
tradeoff; the tl;dr is that a true Option A would require:

1. A `TemporalNodeVersion<P>` generic over the property-map type,
   because `TemporalNodeVersion` embeds `PropertyMap` — a core type
   that cannot be moved without dragging the entire property-store
   beachhead. Generics on a serde-derived field would also require
   moving the `Serialize`/`Deserialize` implementations into the new
   crate, where they cannot reach `PropertyMap`'s custom serde impl
   (lib.rs:575–598).
2. A `NodeTemporalRead` trait abstracting `node_temporal_versions[idx]`
   chain access + `add_node_temporal_version` + `compact_temporal_versions`
   + `set_temporal_compaction_floor` — a 4-method contract whose
   semantics are tied to the meta-catalog persistence layer (see
   `node_temporal_versions: Vec<Vec<TemporalNodeVersion>>` field on
   `Database` @11914, on `DbMeta` @7914, on `DbMetaPersist` @8074,
   threaded through `to_persisted` @8161 and `loaded.node_temporal_versions`
   @20935 — moving this requires designing a serde-on-trait-objects
   contract first).
3. `BackgroundCompactor` is parameterised over `Arc<RwLock<Database>>`
   (@9020, @9044, @9070); abstracting it requires a
   `CompactableDatabase` trait with `compact_temporal_versions`,
   `flush_buffer_pool`, `persist_compacted_csr_layouts`, and
   `node_temporal_versions` mutable accessors. That trait would
   become public API on day 1.

Option B lets us land a tight, verifiable seed that moves exactly the
pure plain-data + decision-logic surface and leaves the
storage-coupled methods for a follow-up plan (`plan/ogdb-core-split-temporal-runtime`)
that can reuse the `NodeRead`-style trait contract designed by the
`plan/ogdb-core-split-algorithms-traversal` follow-up.

---

## 1. Problem summary — `ogdb-temporal` is the smallest plain-data seed remaining

The vector split (`plan/ogdb-core-split-vector`, commit `472ad2e`),
algorithms split (`plan/ogdb-core-split-algorithms`, commit `df41dbb`),
and text split (`plan/ogdb-core-split-text`, commit `4c25af6`)
established the beachhead pattern:

1. New crate with empty `lib.rs` + Cargo stub.
2. Extract only **pure items** with zero coupling to `Database`,
   `DbError`, `PropertyMap`, `PropertyValue`, the Cypher runtime, or
   storage.
3. `pub use` re-export in `ogdb-core` → zero downstream crate edits.
4. Per-crate `cargo test` matrix, never `--workspace`.

Applying that pattern to the next seed requires picking the next
candidate facet from the remaining 4 planned crates. `ogdb-core/src/lib.rs`
is now 41 543 LOC (down 379 LOC from main as of `bcbdbec`, across
the vector + algorithms + text extractions). The remaining
candidates, with their coupling profiles after the three prior seeds:

| Planned crate   | Minimum viable seed (pure-math/data only)                                  | Coupling risk                                                                                                                                                                                                                                                       |
|-----------------|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ogdb-temporal` | 2 plain-data types + 2 pure helpers (this plan)                             | **Low** for this seed: moved items take only `i64`/`Option<i64>` and return `bool`/`Result<(), String>`. MVCC + WAL + `TemporalNodeVersion`/`BackgroundCompactor`/`Episode` stay in core.                                                                              |
| `ogdb-import`   | CSV / RDF / JSON readers                                                    | **High**: `Database::import_*` methods drive the readers; changes would ripple through WAL record writers and the document-ingest feature (`lopdf` + `pulldown-cmark`).                                                                                                |
| `ogdb-export`   | Schema / dataset export                                                     | **Medium-low**: `ExportNode` (@1264) + `ExportEdge` (@1271) are plain-data aggregates of `PropertyMap` (still core) — same `PropertyMap` cycle as `TemporalNodeVersion`. The `Database::export_nodes`/`export_edges`/`*_at` methods would stay on Database. The pure surface is small. Could be the next plan after temporal. |
| `ogdb-query`    | ~25 000 LOC Cypher engine                                                    | **Highest**: parser + analyser + planner + executor all cohabit with the Database methods; this is the terminal refactor, not a seed.                                                                                                                                  |

The temporal facet wins because **the plain-data subset is genuinely
pure and self-contained**: `TemporalScope` is a 2-variant `Copy` enum;
`TemporalFilter` is a 2-field plain struct; the two new pure helpers
take only `Option<i64>` and `i64` and return `bool` or `Result<(), String>`.
They have **zero** coupling to any core type — strictly tighter than
the `ogdb-text` seed, which had a `Result<_, String>` adapter on the
validator. Net moved LOC is the smallest of the four seeds (~7 LOC of
data + ~25 LOC of new helpers vs ~91 / ~207 / ~70 prior).

The Database-coupled cohort (TemporalNodeVersion, BackgroundCompactor,
the 5 `*_temporal_version*` Database methods, the 4 `edge_*_at` /
`edge_matches_*` accessors, `parse_edge_valid_window`,
`temporal_i64_property`, `parse_match_temporal_filter`) is **not in
this seed** — each touches `PropertyMap`, `Arc<RwLock<Database>>`,
or the meta-catalog persist layer. Lifting them requires the Option-A
trait set; follow-up plan.

## 2. Exact reproducer — what "after vector+algo+text split, before temporal split" looks like

### 2.1 Before this plan (main as of `4c25af6`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-text
ogdb-vector
$ wc -l crates/ogdb-core/src/lib.rs
41543 crates/ogdb-core/src/lib.rs
$ grep -cE '^(pub )?mod ' crates/ogdb-core/src/lib.rs
1            # the test module only — still flat namespace
$ grep -rnE 'ogdb_core::(TemporalScope|TemporalFilter|TemporalNodeVersion|Episode|BackgroundCompactor)' crates/ --include='*.rs' | grep -v 'crates/ogdb-core/' | wc -l
0            # zero downstream type-level imports today
$ grep -cE '\b(TemporalScope|TemporalFilter)\b' crates/ogdb-core/src/lib.rs
~30          # in-file references (definitions + AST fields + 3 in-test
             # constructions + 3 match arms)
```

### 2.2 After this plan (end of GREEN — Phases 3–5)

```bash
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck  ogdb-temporal
ogdb-text   ogdb-vector
$ cat crates/ogdb-temporal/Cargo.toml    # new, 6 lines (no deps)
$ wc -l crates/ogdb-temporal/src/lib.rs
~110         # 2 plain-data types + 2 pure fns + unit tests
$ wc -l crates/ogdb-core/src/lib.rs
~41 535      # ~5–10 LOC lighter (7 LOC of types deleted, 12 LOC of
             # match arm body simplified to single fn call, 6 LOC of
             # validation collapsed to .map_err(...))
$ grep -n 'pub use ogdb_temporal' crates/ogdb-core/src/lib.rs
1            # one re-export line for both plain-data types
$ grep -n 'use ogdb_temporal::' crates/ogdb-core/src/lib.rs
1            # one private import for the 2 pure fns
$ cargo test -p ogdb-temporal --tests                              # PASS
$ cargo test -p ogdb-core --test ogdb_temporal_reexport_shim       # PASS
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/ crates/ogdb-vector/ crates/ogdb-algorithms/ \
           crates/ogdb-text/
# empty — zero downstream changes
```

## 3. Module map + LOC estimate — current temporal footprint in `ogdb-core`

Grep-derived, from `crates/ogdb-core/src/lib.rs` as of commit `4c25af6`:

| Item                                                     | Line range        | LOC  | Category                                                               | Moves?                                            |
|----------------------------------------------------------|-------------------|-----:|------------------------------------------------------------------------|---------------------------------------------------|
| `pub enum TemporalScope`                                 | 1284–1288         |    5 | Plain data (`#[derive(Debug, Clone, Copy, PartialEq, Eq)]`)            | **YES**                                           |
| `pub struct TemporalFilter`                              | 1290–1294         |    5 | Plain data (`#[derive(Debug, Clone, PartialEq, Eq)]`)                  | **YES**                                           |
| `pub fn temporal_filter_matches` (NEW)                   | n/a (extracted)   |    ~10 | Pure decision logic extracted from `Database::edge_matches_temporal_filter` | **YES** (new pure fn body)                         |
| `pub fn validate_valid_window` (NEW)                     | n/a (extracted)   |    ~6 | Pure invariant extracted from `parse_edge_valid_window`                | **YES** (new pure fn body)                         |
| `pub struct Episode`                                     | 1303–1312         |    9 | Plain data (`Debug, Clone, PartialEq, Serialize, Deserialize`)         | NO — RAG/agent-memory concept, not in DESIGN.md `ogdb-temporal/` sub-module list (bitemporal/versioning/compaction). Defer to a future `ogdb-rag` or stays in core. |
| `pub struct TemporalNodeVersion`                         | 8460–8465         |    6 | Plain data (`Debug, Clone, PartialEq, Serialize, Deserialize`) embedding `PropertyMap` | NO — embeds `PropertyMap` (core type). Moving creates `ogdb-temporal → ogdb-core` cycle. Requires generic `<P>` + serde-on-generic, deferred to runtime follow-up. |
| `struct BackgroundCompactor`                             | 8991–9008         |   18 | Database-coupled (`Arc<RwLock<Database>>`)                              | NO                                                |
| `impl BackgroundCompactor`                               | 9010–9241         |  232 | Worker thread loop, calls `compact_temporal_versions` etc.              | NO                                                |
| `compactor: BackgroundCompactor` field (Database)        | 9503, 9520        |    2 | Plain field                                                             | NO (stays with Database)                          |
| `fn temporal_i64_property`                               | 5630–5639         |   10 | Reads `&PropertyMap`, `PropertyValue::I64` — uses core types            | NO                                                |
| `fn parse_edge_valid_window`                             | 5641–5654         |   14 | Reads `&PropertyMap`, returns `DbError`                                | NO (stays; gains `validate_valid_window` delegation) |
| `fn parse_match_temporal_filter` (Cypher parser method)  | 6846–6858         |   13 | Method on `CypherParser` state, returns `ParseError`                    | NO (Cypher parser stays in core)                  |
| `Database::set_temporal_compaction_floor`                | 12155–12157       |    3 | Database method                                                         | NO                                                |
| `Database::node_temporal_version_count`                  | 12374–12378       |    5 | Database method                                                         | NO                                                |
| `Database::add_node_temporal_version`                    | 17496–17530       |   35 | Database method, mutates `node_temporal_versions` field                 | NO                                                |
| `Database::compact_temporal_versions`                    | 17532–17550       |   19 | Database method, mutates `node_temporal_versions` field                 | NO                                                |
| `Database::edge_valid_window_at` (private)               | 18330–18345       |   16 | Database method, reads `meta.edge_valid_from/to`                        | NO                                                |
| `Database::edge_transaction_time_millis_at` (private)    | 18347–18364       |   18 | Database method, reads `meta.edge_transaction_time_millis`              | NO                                                |
| `Database::edge_valid_window` (public)                   | 20687–20689       |    3 | Database method (delegates to `_at`)                                    | NO (downstream-callable surface)                  |
| `Database::edge_transaction_time_millis` (public)        | 20691–20693       |    3 | Database method (delegates to `_at`)                                    | NO (downstream-callable surface)                  |
| `Database::edge_matches_temporal_filter` (private)       | 19861–19886       |   26 | Database method, decision logic                                         | NO (stays; gains `temporal_filter_matches` delegation in body) |
| `node_temporal_versions: Vec<Vec<TemporalNodeVersion>>`  | 7914, 8074, 11914 | 3    | Field on `DbMeta` / `DbMetaPersist` / `Database`                        | NO                                                |
| `temporal_compaction_floor_millis: Option<i64>`          | (Database field)  |    1 | Database state                                                          | NO                                                |
| `temporal_filter: Option<TemporalFilter>` (AST/plan fields) | 1705, 2097, 2192, 2231, 2341, 4259, 16894, 16947, 19864 | 9 | Type usage on `MatchClause` + planner ops + `expand_*_for_node` | NO (re-export keeps these compiling)              |
| `expand_neighbors_for_node` body using `edge_matches_temporal_filter` | 16903       |    1 | Call site                                                              | NO (unchanged)                                    |
| `expand_hash_lookup` body using `edge_matches_temporal_filter` | 16956            |    1 | Call site                                                              | NO (unchanged)                                    |

**LOC moved in this plan:** **5 LOC** (`TemporalScope`) + **5 LOC**
(`TemporalFilter`) = **10 LOC** of plain-data types out of `ogdb-core`,
plus **~16 LOC** of newly-authored pure helper bodies in `ogdb-temporal`
(re-derived from `edge_matches_temporal_filter` and `parse_edge_valid_window`,
not deleted from core in the same form). **New unit tests in `ogdb-temporal`:**
~85 LOC covering enum variant pinning, struct field round-trip, every
combination of `Some`/`None` valid-window bounds for ValidTime scope,
SystemTime cutoff semantics, and the validator's lower-bound error.
**Net `ogdb-core` shrinkage:** ~14 LOC (10 LOC of type definitions
deleted + 12 LOC of `edge_matches_temporal_filter` match-arm body
collapsed to a single fn call (saves ~11 LOC) + 5 LOC of
`parse_edge_valid_window` lower-bound check collapsed to one fn call
+ `.map_err(DbError::InvalidArgument)` (saves ~3 LOC) − 1 new
`pub use` line − 1 new `use` line).

The existing in-core integration test
`crates/ogdb-core/tests/temporal_versioning.rs` is **kept unchanged**
— its 4 tests call `Database::add_node_temporal_version`,
`Database::compact_temporal_versions`,
`Database::node_temporal_version_count`, and
`Database::node_properties_at_time` (all stay on Database). Zero test
churn.

The 3 in-core constructor sites at lines 26747 (physical-plan
hash-join test) and 37669/37680 (parser AT-TIME / AT-SYSTEM-TIME test)
continue to work via the `pub use` re-export (`TemporalScope::ValidTime`
etc. resolves identically through the re-exported enum).

## 4. Internal dependency graph for the 4 items being moved

```
┌──────────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs                                                 │
│                                                                      │
│  TemporalScope (pub enum @1284, → ogdb-temporal)                     │
│    ↑                                                                 │
│    ├── TemporalFilter.scope field                                    │
│    ├── parse_match_temporal_filter (CypherParser method @6846)       │
│    │     ← STAYS                                                      │
│    └── 2 in-core test constructions (26747-26748, 37669-37670, 37680-37681) │
│          ← STAYS (resolved via pub use re-export)                    │
│                                                                      │
│  TemporalFilter (pub struct @1290, → ogdb-temporal)                  │
│    ↑                                                                 │
│    ├── MatchClause.temporal_filter field (@1705)        ← STAYS      │
│    ├── 5 planner-op variant fields (@2097, 2192, 2231, 2341)         │
│    │     ← STAYS (Option<TemporalFilter>)                            │
│    ├── 1 SQL-builder field (@4259)                      ← STAYS      │
│    ├── parse_match_temporal_filter return type          ← STAYS      │
│    ├── expand_neighbors_for_node arg (@16894)           ← STAYS      │
│    ├── expand_hash_lookup arg (@16947)                  ← STAYS      │
│    ├── edge_matches_temporal_filter arg (@19864)        ← STAYS (body refactored) │
│    └── 4 plan-construction sites (@3441, 4349, 4660, 4684)           │
│          ← STAYS (clone via re-exported type)                        │
│                                                                      │
│  temporal_filter_matches (pub fn after move @ogdb-temporal, NEW)     │
│    signature:                                                         │
│      (filter: &TemporalFilter,                                        │
│       valid_from: Option<i64>,                                        │
│       valid_to: Option<i64>,                                          │
│       transaction_time_millis: i64) -> bool                           │
│    ↑                                                                 │
│    └── one call site in ogdb-core:                                   │
│        Database::edge_matches_temporal_filter body (@19867-19885)    │
│        replaced by:                                                  │
│          let Some(filter) = temporal_filter else { return Ok(true); };│
│          let (vf, vt) = self.edge_valid_window_at(edge_id, txn)?;     │
│          let tx_time = self.edge_transaction_time_millis_at(...)?;    │
│          Ok(temporal_filter_matches(filter, vf, vt, tx_time))         │
│                                                                      │
│  validate_valid_window (pub fn after move @ogdb-temporal, NEW)       │
│    signature:                                                         │
│      (valid_from: Option<i64>, valid_to: Option<i64>)                │
│        -> Result<(), String>                                          │
│    ↑                                                                 │
│    └── one call site in ogdb-core:                                   │
│        parse_edge_valid_window body (@5646-5652) replaced by:         │
│          ogdb_temporal::validate_valid_window(valid_from, valid_to)   │
│              .map_err(DbError::InvalidArgument)?;                    │
│          Ok((valid_from, valid_to))                                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Key property:** every arrow into a "STAYS" box is a call from
`ogdb-core` code into a moved item. After the split, those call sites
continue to resolve via either:

- **`pub use ogdb_temporal::{TemporalScope, TemporalFilter};`** at the
  top of `crates/ogdb-core/src/lib.rs`, and
- **`use ogdb_temporal::{temporal_filter_matches, validate_valid_window};`**
  (crate-private import so the two refactored Database/parser
  functions can call the helpers unqualified).

No outbound `ogdb-temporal → ogdb-core` edge exists. No cycle. The
new crate has **zero dependencies** (the moved types do not derive
serde — `TemporalScope` derives only `Debug, Clone, Copy, PartialEq,
Eq`; `TemporalFilter` derives only `Debug, Clone, PartialEq, Eq`; no
`Serialize`/`Deserialize` is on either today and none is added).

## 5. Downstream inventory — who imports the temporal surface today

Exhaustive survey via
`grep -rnE 'ogdb_core::(TemporalScope|TemporalFilter|TemporalNodeVersion|Episode|BackgroundCompactor)' crates/ --include='*.rs'`:

| Downstream crate / file                                        | Imports                                                                            | After shim? |
|-----------------------------------------------------------------|------------------------------------------------------------------------------------|:-----------:|
| *(none)*                                                        | **Zero** downstream `use ogdb_core::TemporalScope;`, `use ogdb_core::TemporalFilter;`, `use ogdb_core::TemporalNodeVersion;`, `use ogdb_core::Episode;`, `use ogdb_core::BackgroundCompactor;` today | ✅ N/A      |

**Method-level downstream calls** (via
`grep -rnE '\b(TemporalScope|TemporalFilter|TemporalNodeVersion|Episode|BackgroundCompactor|compact_temporal|add_node_temporal|set_temporal_compaction|node_temporal_version_count|edge_valid_window|edge_transaction_time)\b' crates/ --include='*.rs' | grep -v 'crates/ogdb-core/'`):

| Downstream crate / file                                        | Calls                                                                              | After shim? |
|-----------------------------------------------------------------|------------------------------------------------------------------------------------|:-----------:|
| `ogdb-e2e/tests/comprehensive_e2e.rs:291`                       | `db.edge_valid_window(edge)?`                                                       | ✅ no change |
| `ogdb-e2e/tests/comprehensive_e2e.rs:294`                       | `db.edge_transaction_time_millis(edge)? > 0`                                        | ✅ no change |

**Count:** 2 call sites — both call public `Database` methods that
**stay on `Database`**. The split does not touch them.

**Downstream-crate edits required by this plan: 0.**

## 6. Facet choice — why pure plain-data + 2 helpers first, and Option B over Option A

### 6.1 Candidate seeds inside `ogdb-temporal`

| Candidate                                                                | LOC moved | Coupling to `Database` / `PropertyMap` / WAL | Downstream refs | Requires abstraction? |
|---------------------------------------------------------------------------|----------:|-----------------------------------------------|----------------:|:---------------------:|
| 2 plain-data types + 2 pure helpers (this plan)                           | ~10 +new  | **None**: `i64`/`Option<i64>` in, `bool`/`Result<_, String>` out | 0               | No                    |
| + `TemporalNodeVersion` (struct)                                          | +6        | `PropertyMap` (core type — cycle)              | 0               | **Yes** (`<P>` generic + serde-on-generic) |
| + `Episode` (struct)                                                       | +9        | None (plain types) — but DESIGN.md places this elsewhere (RAG/agent memory, not bitemporal) | 0 | No (but out-of-scope by design)  |
| + `Database::add_node_temporal_version` / `compact_temporal_versions` / `node_temporal_version_count` / `set_temporal_compaction_floor` | +62 | `Database` state (`node_temporal_versions`, `temporal_compaction_floor_millis` fields), `sync_meta`, undo log | 0 | **Yes** (`NodeTemporalRead`/`NodeTemporalWrite` trait) |
| + `Database::edge_valid_window_at` / `edge_transaction_time_millis_at`    | +34       | `Database` state (`meta.edge_valid_from/to`, `meta.edge_transaction_time_millis`, `is_edge_visible_at`) | 0 | **Yes** (`EdgeMetadataRead` trait)   |
| + `Database::edge_matches_temporal_filter` (full method)                  | +26       | `edge_valid_window_at` + `edge_transaction_time_millis_at` accessors | 0 | **Yes** (pairs with above)            |
| + `BackgroundCompactor`                                                   | +250      | `Arc<RwLock<Database>>` + thread spawn + `compact_temporal_versions` | 0 | **Yes** (`CompactableDatabase` trait) |
| + `parse_edge_valid_window` / `temporal_i64_property`                     | +24       | `&PropertyMap`, `PropertyValue::I64`           | 0               | **Yes** (would either move `PropertyValue::I64` extractor or expose a generic getter) |
| + `parse_match_temporal_filter` (Cypher parser method)                    | +13       | `CypherParser` state (lexer cursor, `expect_keyword`, `parse_i64_literal`) | 0 | **Yes** (Cypher parser is its own future crate) |

The plain-data + 2-helpers subset is the only temporal surface whose
signatures reference **no** `Database`, `DbError`, `PropertyMap`,
`PropertyValue`, `CypherParser`, or `Arc<RwLock<…>>`. Every other
temporal item either holds a `PropertyMap`, calls a `Database`
accessor, or uses the parser/undo-log infrastructure.

### 6.2 Option A vs Option B

| Dimension                                       | Option A: trait-based extraction (move runtime + compactor + accessors) | Option B: pure data + 2 helpers only, runtime stays in core |
|--------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------|
| New abstractions introduced in this plan          | 3+ traits (`NodeTemporalRead`, `NodeTemporalWrite`, `EdgeMetadataRead`, `CompactableDatabase`) + 1 generic `TemporalNodeVersion<P>` + 1 serde-on-generic impl | 0                                                              |
| Items moved                                       | All 14 entries from §3 marked NO except `parse_match_temporal_filter`    | 2 plain-data types + 2 newly-extracted pure helpers           |
| LOC moved                                         | ~430                                                                    | ~10 + ~16 new                                                  |
| Forces a `<P>` generic on `TemporalNodeVersion`?  | **Yes** (PropertyMap cycle)                                              | No                                                             |
| Forces serde-on-trait-objects design?             | **Yes** (`DbMetaPersist` round-trips a `Vec<Vec<TemporalNodeVersion>>` via serde_json @20942/21056; abstracting it loses the derive) | No                                                             |
| Forces `DbError` to leak into the new crate?      | **Yes** (`Result<_, DbError>` returns on every accessor + write method)  | No — validator's error is `String`; core adapts via `.map_err(DbError::InvalidArgument)` |
| Reversible?                                       | Hard — trait contracts and generic become public API                     | Trivial — the 4 moved items are standalone free fns + 2 plain types |
| Validates the pattern before commitment?          | No — ships traits + generics + dep migration without data                | Yes — ships the subset that's obviously pure                   |
| Matches the vector-split precedent?               | No                                                                       | **Directly** (vector shipped 3 free fns + 2 data types, ~91 LOC, zero new deps) |
| Matches the algorithms-split precedent?           | No — algorithms explicitly deferred Option A to a follow-up              | **Directly** — algorithms shipped 3 pure kernels + 4 data types, ~207 LOC, zero new deps |
| Matches the text-split precedent?                 | No — text explicitly deferred Option A                                   | **Directly** — text shipped 1 type + 4 fns, ~70 LOC, zero new deps (only serde) |
| Downstream risk                                   | Higher — trait change is a breaking `ogdb-temporal` major                | Lower — moved signatures are concrete types                    |
| Trait design work can come from…                  | This plan (cold design)                                                  | The `plan/ogdb-core-split-algorithms-traversal` follow-up, which has the same need (`neighbors_at` + `node_labels_at` + `node_properties_at`) and will naturally generate the `NodeRead` contract that this seed's runtime follow-up can reuse |

**Choice: Option B**, because:

1. **Mirrors all three prior precedents.** Vector moved 5 items
   zero-dep, zero-trait. Algorithms moved 7 items zero-dep, zero-trait.
   Text moved 5 items zero-extra-dep, zero-trait, with an explicit
   "Option B now, Option A in follow-up" verdict. Temporal should
   follow the same shape — and is even tighter (zero dep, not even
   serde).
2. **No premature abstraction.** Designing `NodeTemporalRead` /
   `NodeTemporalWrite` / `EdgeMetadataRead` / `CompactableDatabase`
   requires deciding: how does the trait expose the
   `node_temporal_versions: Vec<Vec<TemporalNodeVersion>>` chain (raw
   slice access? iterator? key-only?), how does
   `add_node_temporal_version` interact with the undo log + WAL undo
   record format, and how does `BackgroundCompactor` get a
   typed-erased database handle. These are the same design decisions
   the algorithms-traversal follow-up will have to make for its
   `NodeRead` / `EdgeRead` contracts. Let that plan settle them first
   and reuse them in the temporal-runtime follow-up.
3. **Does not block Option A.** A follow-up plan
   (`plan/ogdb-core-split-temporal-runtime`) can introduce the trait
   set (or reuse the `NodeRead`/`EdgeRead` contracts from the
   algorithms-traversal follow-up) and move
   `Database::add_node_temporal_version`, `compact_temporal_versions`,
   `set_temporal_compaction_floor`, `node_temporal_version_count`,
   `edge_valid_window_at`, `edge_transaction_time_millis_at`,
   `edge_matches_temporal_filter`, `BackgroundCompactor`,
   `TemporalNodeVersion`, `parse_edge_valid_window`, and
   `temporal_i64_property` behind it once this seed is in.
4. **Zero `DbError` leakage.** The validator's error becomes `String`
   (its only `DbError` arm is `DbError::InvalidArgument(String)`);
   the matcher returns `bool`. `DbError` stays owned by `ogdb-core`.
5. **Zero new dep.** `ogdb-temporal` has no `tantivy`, no
   `instant-distance`, no `serde`, not even `roaring`. `Cargo.toml`
   has only `[package]` metadata — the tightest crate in the
   workspace.

### 6.3 What moves (and only these)

| Item                                | Kind             | Current location in `ogdb-core/src/lib.rs` | After the move, in `ogdb-temporal/src/lib.rs` | Approx. LOC |
|-------------------------------------|------------------|--------------------------------------------|-----------------------------------------------|------------:|
| `TemporalScope`                     | `pub enum` + derives | lines 1284–1288                       | `pub enum` (verbatim, same derives)           |   5         |
| `TemporalFilter`                    | `pub struct` + derives | lines 1290–1294                     | `pub struct` (verbatim, same derives)         |   5         |
| `temporal_filter_matches`           | `pub fn` (new — pure logic extracted from `Database::edge_matches_temporal_filter` body @19867-19885) | n/a (extracted)                  | `pub fn(&TemporalFilter, Option<i64>, Option<i64>, i64) -> bool` |   ~12       |
| `validate_valid_window`             | `pub fn` (new — pure logic extracted from `parse_edge_valid_window` body @5646-5652) | n/a (extracted)                  | `pub fn(Option<i64>, Option<i64>) -> Result<(), String>` |   ~8        |
| `#[cfg(test)] mod tests` for each (new, in `ogdb-temporal/src/lib.rs`) | `#[test]` | new | new | ~85 |

**Total moved + new source:** ~30 LOC. **New unit tests in
`ogdb-temporal`:** ~85 LOC (a `#[cfg(test)] mod tests` inside
`src/lib.rs` covering enum variants, struct field round-trip, every
`Some`/`None` combo of valid-window bounds for ValidTime scope, the
SystemTime cutoff edge cases, and the validator's lower-bound error).
**Net `ogdb-core` shrinkage:** ~14 LOC (10 LOC of type definitions
deleted + 12 LOC of `edge_matches_temporal_filter` body collapsed
to a single fn call (saves ~11 LOC) + 5 LOC of `parse_edge_valid_window`
lower-bound check collapsed to one fn call (saves ~3 LOC) − 1 new
`pub use` line − 1 new `use` line).

### 6.4 What stays in `ogdb-core` (explicit non-scope)

Every item below **must remain** in `ogdb-core`; a follow-up plan
(`plan/ogdb-core-split-temporal-runtime`) extracts them once Option
B has proven out and either this plan or the algorithms-traversal
follow-up has produced a validated `NodeRead` / `EdgeRead` trait pair.

- `pub struct TemporalNodeVersion` (@8460) — embeds `PropertyMap`
  (cycle if moved without `<P>` generic). Moves with the runtime
  cohort.
- `pub struct Episode` (@1303) — RAG/agent-memory concept, not in
  DESIGN.md `ogdb-temporal/` sub-module list (`bitemporal.rs` /
  `versioning.rs` / `compaction.rs`). Belongs in a future `ogdb-rag`
  crate or stays in core indefinitely. Out of scope for this seed.
- `struct BackgroundCompactor` (@8991) + `impl BackgroundCompactor`
  (@9010) — `Arc<RwLock<Database>>` + `std::thread::spawn`. Heavy
  Database coupling.
- `Database::add_node_temporal_version` (@17496),
  `Database::compact_temporal_versions` (@17532),
  `Database::node_temporal_version_count` (@12374),
  `Database::set_temporal_compaction_floor` (@12155) — Database
  methods that mutate `node_temporal_versions` field + call
  `sync_meta`.
- `Database::edge_valid_window_at` (@18330),
  `Database::edge_transaction_time_millis_at` (@18347),
  `Database::edge_valid_window` (@20687),
  `Database::edge_transaction_time_millis` (@20691) — Database
  accessors over `meta.edge_valid_from/to` and
  `meta.edge_transaction_time_millis`.
- `Database::edge_matches_temporal_filter` (@19861) — body **is**
  refactored in this plan to call
  `ogdb_temporal::temporal_filter_matches`, but the method itself
  stays on `Database` (it does the `edge_valid_window_at` /
  `edge_transaction_time_millis_at` lookups).
- `parse_edge_valid_window` (@5641),
  `temporal_i64_property` (@5630) — read `&PropertyMap` /
  `PropertyValue::I64` (core types). The pure invariant inside
  `parse_edge_valid_window` is delegated to
  `ogdb_temporal::validate_valid_window` in Phase 4, but the function
  stays in `ogdb-core` (it still extracts properties from the
  `PropertyMap`).
- `parse_match_temporal_filter` (@6846) — method on the Cypher
  parser; stays with the parser until `ogdb-query` extraction.
- `node_temporal_versions: Vec<Vec<TemporalNodeVersion>>` field on
  `DbMeta` (@7914), `DbMetaPersist` (@8074), `Database` (@11914),
  threaded through `to_persisted` (@8161), `loaded.node_temporal_versions`
  (@20935), `serde_json::to_string_pretty(&self.meta.to_persisted(&self.node_temporal_versions))`
  (@20942, @21056), `ensure_node_temporal_version_lengths` (@21381)
  — part of `Database` state. Stays.
- `temporal_compaction_floor_millis: Option<i64>` field on
  `Database` — Database state. Stays.
- `compactor: BackgroundCompactor` field (@9503) on `Database` —
  stays with `BackgroundCompactor`.
- All ~9 `temporal_filter: Option<TemporalFilter>` AST/plan fields
  (@1705, 2097, 2192, 2231, 2341, 4259, 16894, 16947, 19864) — these
  still reference `TemporalFilter`, which is re-exported via
  `pub use ogdb_temporal::TemporalFilter;` — so the AST definitions
  continue to compile byte-for-byte (TypeId equality pinned by RED
  test §8.2).

### 6.5 API shapes (the exact signatures GREEN will land)

```rust
//! crates/ogdb-temporal/src/lib.rs — the seed surface.

/// Bitemporal scope of a Cypher `AT TIME` / `AT SYSTEM TIME` filter.
///
/// `ValidTime` queries the application time axis (`valid_from` /
/// `valid_to` per edge); `SystemTime` queries the transaction-time
/// axis (`transaction_time_millis` per edge).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TemporalScope {
    ValidTime,
    SystemTime,
}

/// Snapshot-style temporal filter applied to a `MATCH` clause —
/// `MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000`.
///
/// Constructed by the Cypher parser's `parse_match_temporal_filter`
/// (in ogdb-core) and consumed by `Database::edge_matches_temporal_filter`
/// (in ogdb-core, body refactored to call
/// `ogdb_temporal::temporal_filter_matches`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemporalFilter {
    pub scope: TemporalScope,
    pub timestamp_millis: i64,
}

/// Pure decision predicate for whether a single edge (described by
/// its valid-window endpoints + transaction time) satisfies a
/// `TemporalFilter`. Mirrors the body of
/// `Database::edge_matches_temporal_filter` (ogdb-core lib.rs:19867-19885)
/// byte-for-byte:
///
/// * `ValidTime`: `valid_from <= filter.timestamp_millis` AND
///                `valid_to  > filter.timestamp_millis`. Open
///                endpoints (`None`) are treated as ∞ (always-ok).
/// * `SystemTime`: `transaction_time_millis <= filter.timestamp_millis`.
///
/// Pure: takes only primitive scalars + a `TemporalFilter` borrow.
/// Returns `bool` (the database accessor lookups happen at the call
/// site in ogdb-core, which then calls this fn).
pub fn temporal_filter_matches(
    filter: &TemporalFilter,
    valid_from: Option<i64>,
    valid_to: Option<i64>,
    transaction_time_millis: i64,
) -> bool;

/// Validate the lower-bound invariant on an edge's valid-time
/// window: if both `valid_from` and `valid_to` are present,
/// `valid_to > valid_from` MUST hold. Mirrors the inline
/// invariant inside `parse_edge_valid_window` (ogdb-core lib.rs:5646-5652)
/// byte-for-byte. Returns the same human-readable error message
/// (`"valid_to must be greater than valid_from"`); the call site
/// in `parse_edge_valid_window` adapts via `.map_err(DbError::InvalidArgument)`.
///
/// Pure: takes only `Option<i64>`. Returns `Result<(), String>`.
pub fn validate_valid_window(
    valid_from: Option<i64>,
    valid_to: Option<i64>,
) -> Result<(), String>;
```

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level imports

At the top of `crates/ogdb-core/src/lib.rs` (right after the existing
`pub use ogdb_text::FullTextIndexDefinition;` line, before the next
`use` block), add exactly two lines:

```rust
// Re-export the public temporal plain-data types so every existing
// in-core call site (the AST struct fields at MatchClause, the 5
// planner-op variants, the 4 plan-construction sites, the 3
// expand_*/edge_matches_temporal_filter args, the Cypher parser
// constructor, and the 2 in-test constructions in this file) keeps
// resolving without a fully-qualified path. No downstream crate
// imports either type today, but pinning the re-export identity
// guards against future breakage.
pub use ogdb_temporal::{TemporalFilter, TemporalScope};

// Crate-private import so the two refactored call sites (the
// edge_matches_temporal_filter body and the parse_edge_valid_window
// body) can call the helpers unqualified.
use ogdb_temporal::{temporal_filter_matches, validate_valid_window};
```

### 7.2 Why `pub use` is byte-for-byte compatible for enums + structs

`pub use ogdb_temporal::TemporalScope;` re-exports the enum **and
all its variants**. Every in-file occurrence of
`TemporalScope::ValidTime` / `TemporalScope::SystemTime` resolves via
`ogdb_core::TemporalScope::ValidTime` → pointer to
`ogdb_temporal::TemporalScope::ValidTime`. Pattern matching in
`edge_matches_temporal_filter` (lines 19871, 19881) and
`parse_match_temporal_filter` (lines 6847-6850), `Debug`/`Clone`/`Copy`/`PartialEq`/`Eq`
derives, and `std::mem::size_of` are all preserved because it is
literally the same type.

`TemporalFilter` gets the same treatment — derives
(`Debug, Clone, PartialEq, Eq`) are attached to the single
definition in `ogdb-temporal`, and every in-core usage (plus all 9
`Option<TemporalFilter>` AST/plan fields) stays valid.

**Note:** neither type derives `Serialize`/`Deserialize` today. There
is no on-disk meta-catalog round-trip to worry about (unlike
`FullTextIndexDefinition` and `IndexDefinition`). The shim is purely
compile-time; no wire-format invariant is at stake.

### 7.3 `Cargo.toml` edits

- **New** `crates/ogdb-temporal/Cargo.toml`:
  ```toml
  [package]
  name = "ogdb-temporal"
  version.workspace = true
  edition.workspace = true
  license.workspace = true
  ```
  No `[dependencies]` block at all. The tightest crate in the
  workspace.

- **Modified** `crates/ogdb-core/Cargo.toml` adds one line to
  `[dependencies]`:
  ```toml
  ogdb-temporal = { path = "../ogdb-temporal" }
  ```

- **Modified** root `Cargo.toml` adds one entry to `[workspace] members`:
  ```toml
  "crates/ogdb-temporal",
  ```

No other crate's `Cargo.toml` changes.

## 8. RED-phase failing tests (exact file contents)

Two new tests are introduced. Both must fail on this commit (because
the source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-temporal/tests/api_smoke.rs`

This asserts that the new crate exposes the expected public API once
it is populated in GREEN. It compiles only after `ogdb-temporal`'s
`src/lib.rs` is populated; in RED the `lib.rs` is literally empty
(`//! RED`) so every test **fails to compile** with
`error[E0432]: unresolved imports`, which is the expected RED signal.

```rust
//! RED-phase API smoke test for the extracted ogdb-temporal crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_temporal::{TemporalScope, TemporalFilter, temporal_filter_matches,
//! validate_valid_window}` are not yet defined (src/lib.rs is
//! intentionally empty).
//!
//! GREEN state (Phase 5 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been added to
//! crates/ogdb-temporal/src/lib.rs (TemporalScope + TemporalFilter
//! moved out of crates/ogdb-core/src/lib.rs lines 1284-1294;
//! temporal_filter_matches + validate_valid_window are pure helpers
//! re-derived from edge_matches_temporal_filter @19861 and
//! parse_edge_valid_window @5641 bodies).

use ogdb_temporal::{
    temporal_filter_matches, validate_valid_window, TemporalFilter,
    TemporalScope,
};

#[test]
fn temporal_scope_has_two_variants() {
    // The enum's two variants are the contract `parse_match_temporal_filter`
    // (ogdb-core lib.rs:6847-6850) and `edge_matches_temporal_filter`
    // (ogdb-core lib.rs:19871/19881) pattern-match on. Adding or
    // removing a variant is a breaking change for the in-core callers.
    let variants = [TemporalScope::ValidTime, TemporalScope::SystemTime];
    assert_eq!(variants.len(), 2);
    // Copy + Clone + PartialEq + Eq must survive the move.
    let copy = variants[0];
    assert_eq!(copy, TemporalScope::ValidTime);
    let cloned = variants[1].clone();
    assert_eq!(format!("{cloned:?}"), "SystemTime");
}

#[test]
fn temporal_filter_is_plain_data() {
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_750_000_000_000,
    };
    let cloned = f.clone();
    assert_eq!(f, cloned);
    assert_eq!(cloned.scope, TemporalScope::ValidTime);
    assert_eq!(cloned.timestamp_millis, 1_750_000_000_000);
}

#[test]
fn validtime_with_no_filter_window_always_passes() {
    // Open both ends → filter is satisfied for any timestamp.
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, None, None, 0));
}

#[test]
fn validtime_lower_bound_inclusive() {
    // valid_from <= timestamp_millis ⇒ pass.
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, Some(1_000), None, 0));
    assert!(temporal_filter_matches(&f, Some(999), None, 0));
    assert!(!temporal_filter_matches(&f, Some(1_001), None, 0));
}

#[test]
fn validtime_upper_bound_exclusive() {
    // valid_to > timestamp_millis ⇒ pass. Half-open interval.
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, None, Some(1_001), 0));
    assert!(!temporal_filter_matches(&f, None, Some(1_000), 0)); // exclusive
    assert!(!temporal_filter_matches(&f, None, Some(999), 0));
}

#[test]
fn validtime_both_bounds_combine() {
    let f = TemporalFilter {
        scope: TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    // [500, 1500) — 1000 is inside.
    assert!(temporal_filter_matches(&f, Some(500), Some(1_500), 0));
    // [1000, 1500) — 1000 is the lower bound (inclusive).
    assert!(temporal_filter_matches(&f, Some(1_000), Some(1_500), 0));
    // [500, 1000) — 1000 is the upper bound (exclusive).
    assert!(!temporal_filter_matches(&f, Some(500), Some(1_000), 0));
    // [1500, 2000) — 1000 is below the lower bound.
    assert!(!temporal_filter_matches(&f, Some(1_500), Some(2_000), 0));
}

#[test]
fn systemtime_uses_transaction_time_only() {
    // SystemTime: transaction_time_millis <= filter.timestamp_millis.
    // valid_from / valid_to are ignored entirely.
    let f = TemporalFilter {
        scope: TemporalScope::SystemTime,
        timestamp_millis: 1_000,
    };
    assert!(temporal_filter_matches(&f, None, None, 1_000));
    assert!(temporal_filter_matches(&f, None, None, 999));
    assert!(!temporal_filter_matches(&f, None, None, 1_001));
    // Even with valid_from/valid_to set to mismatched values,
    // SystemTime ignores them.
    assert!(temporal_filter_matches(&f, Some(99_999), Some(99_999), 500));
}

#[test]
fn validate_valid_window_accepts_all_open_combinations() {
    assert!(validate_valid_window(None, None).is_ok());
    assert!(validate_valid_window(Some(100), None).is_ok());
    assert!(validate_valid_window(None, Some(200)).is_ok());
    assert!(validate_valid_window(Some(100), Some(200)).is_ok());
}

#[test]
fn validate_valid_window_rejects_inverted_or_zero_width() {
    let err_inverted = validate_valid_window(Some(200), Some(100))
        .expect_err("inverted window must be rejected");
    assert!(
        err_inverted.contains("valid_to must be greater than valid_from"),
        "got: {err_inverted}",
    );
    // valid_to == valid_from is also rejected (zero-width window).
    let err_equal = validate_valid_window(Some(100), Some(100))
        .expect_err("zero-width window must be rejected");
    assert!(
        err_equal.contains("valid_to must be greater than valid_from"),
        "got: {err_equal}",
    );
}

#[test]
fn validate_valid_window_error_message_pins_in_core_format() {
    // The exact error string is load-bearing: parse_edge_valid_window
    // (ogdb-core lib.rs:5648) wraps it via DbError::InvalidArgument(_)
    // and surfaces it to Cypher CREATE callers + the ogdb-e2e harness.
    // Changing this message is a user-visible breaking change.
    let err = validate_valid_window(Some(200), Some(100))
        .expect_err("inverted window");
    assert_eq!(err, "valid_to must be greater than valid_from");
}
```

Running today (RED):
```
$ cargo test -p ogdb-temporal --tests
error[E0432]: unresolved import `ogdb_temporal::TemporalScope`
  --> crates/ogdb-temporal/tests/api_smoke.rs:14:5
   |
14 |     temporal_filter_matches, validate_valid_window, TemporalFilter,
   |     ...
```

Running after Phase 5 (GREEN): all 10 tests PASS.

### 8.2 `crates/ogdb-core/tests/ogdb_temporal_reexport_shim.rs`

This is the **backward-compat guarantee** that no in-core call site
breaks. It asserts `ogdb_core::TemporalScope` and
`ogdb_core::TemporalFilter` are still nameable from the
`ogdb_core::` root, that their variants pattern-match, and that their
`TypeId` matches the `ogdb_temporal` originals. It also exercises the
two pure helpers via `ogdb_temporal::` to pin their callable paths.

```rust
//! Shim regression: `ogdb_core::TemporalScope` and
//! `ogdb_core::TemporalFilter` must remain nameable from the
//! `ogdb_core::` root after the Phase-4 temporal split.
//!
//! No downstream crate today imports either type, but the in-core
//! Cypher AST (`MatchClause.temporal_filter` @1705 + 5 planner-op
//! variants @2097/2192/2231/2341 + 1 SQL-builder field @4259) and
//! the Cypher parser's `parse_match_temporal_filter` (@6846) rely
//! on these types being the same single definition shared with
//! `ogdb_temporal`. A silent parallel definition in ogdb-core would
//! corrupt pattern matching in `edge_matches_temporal_filter`
//! (@19871/19881) and break the parser's constructor at @6854.
//! Pin the re-export identity here.
//!
//! RED state (this commit): fails to compile because ogdb-core
//! does not yet depend on ogdb-temporal (`unresolved import
//! ogdb_temporal`), and `ogdb_core::TemporalScope` /
//! `ogdb_core::TemporalFilter` are still the in-core originals,
//! not re-exports — so the TypeId equality below would spuriously
//! hold (same type is on both sides) if the test compiled, but it
//! does not compile.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_temporal::{TemporalFilter, TemporalScope};`
//! and the TypeId equalities below hold because both sides resolve
//! to the single definitions in ogdb-temporal.

use std::any::TypeId;

#[test]
fn temporal_scope_is_reexported_from_ogdb_temporal() {
    // If this line fails to compile, any future downstream caller
    // writing `use ogdb_core::TemporalScope;` will also break.
    let _vt = ogdb_core::TemporalScope::ValidTime;
    let _st = ogdb_core::TemporalScope::SystemTime;

    assert_eq!(
        TypeId::of::<ogdb_core::TemporalScope>(),
        TypeId::of::<ogdb_temporal::TemporalScope>(),
        "ogdb_core::TemporalScope must be a `pub use` re-export of \
         ogdb_temporal::TemporalScope, not a duplicate type. See \
         .planning/ogdb-core-split-temporal/PLAN.md §7.",
    );
}

#[test]
fn temporal_filter_is_reexported_from_ogdb_temporal() {
    assert_eq!(
        TypeId::of::<ogdb_core::TemporalFilter>(),
        TypeId::of::<ogdb_temporal::TemporalFilter>(),
        "ogdb_core::TemporalFilter must be a `pub use` re-export of \
         ogdb_temporal::TemporalFilter, not a duplicate type.",
    );

    // Constructor round-trip across the shim — proves field layout
    // survives the re-export. Pinned to the literal value used in
    // the in-core parser test at lib.rs:37671/37682.
    let f = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::ValidTime,
        timestamp_millis: 1_750_000_000_000,
    };
    assert_eq!(f.timestamp_millis, 1_750_000_000_000);
    assert_eq!(f.scope, ogdb_core::TemporalScope::ValidTime);
}

#[test]
fn cross_shim_equality_via_construction() {
    // Construct via the ogdb-core re-export, compare against a
    // value constructed via ogdb-temporal directly — proves the
    // shim is a pure re-export, not a parallel copy. Pattern-match
    // is the load-bearing path inside Database::edge_matches_temporal_filter.
    let via_core = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::SystemTime,
        timestamp_millis: 42,
    };
    let via_temporal = ogdb_temporal::TemporalFilter {
        scope: ogdb_temporal::TemporalScope::SystemTime,
        timestamp_millis: 42,
    };
    assert_eq!(via_core, via_temporal);
    // And the inverse construction direction.
    let via_temporal_to_core: ogdb_core::TemporalFilter = via_temporal.clone();
    assert_eq!(via_temporal_to_core, via_core);
}

#[test]
fn ogdb_temporal_helpers_are_callable_via_ogdb_temporal_root() {
    // Regression pin: the 2 pure fns must be directly callable from
    // `ogdb_temporal::` — `ogdb-core`'s `Database::edge_matches_temporal_filter`
    // (body refactored in Phase 4) and `parse_edge_valid_window`
    // (body refactored in Phase 4) both depend on these paths via
    // `use ogdb_temporal::{temporal_filter_matches,
    // validate_valid_window};`.
    //
    // We assert the callable paths here (not just type identities)
    // because free fns cannot be compared via TypeId.
    let f = ogdb_temporal::TemporalFilter {
        scope: ogdb_temporal::TemporalScope::ValidTime,
        timestamp_millis: 1_000,
    };
    assert!(ogdb_temporal::temporal_filter_matches(
        &f,
        Some(500),
        Some(1_500),
        0,
    ));
    assert!(!ogdb_temporal::temporal_filter_matches(
        &f,
        Some(2_000),
        None,
        0,
    ));

    assert!(ogdb_temporal::validate_valid_window(Some(100), Some(200)).is_ok());
    let err = ogdb_temporal::validate_valid_window(Some(200), Some(100))
        .expect_err("inverted window");
    assert_eq!(err, "valid_to must be greater than valid_from");
}

#[test]
fn pattern_match_through_shim_compiles() {
    // The hot path inside Database::edge_matches_temporal_filter
    // (@19871/19881) does `match filter.scope { ValidTime => …,
    // SystemTime => … }` against a `&TemporalFilter` whose type is
    // referenced via the re-exported in-core path. Prove that
    // pattern matching across the shim still exhausts both arms.
    fn classify(f: &ogdb_core::TemporalFilter) -> &'static str {
        match f.scope {
            ogdb_core::TemporalScope::ValidTime => "valid",
            ogdb_core::TemporalScope::SystemTime => "system",
        }
    }
    let v = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::ValidTime,
        timestamp_millis: 0,
    };
    let s = ogdb_core::TemporalFilter {
        scope: ogdb_core::TemporalScope::SystemTime,
        timestamp_millis: 0,
    };
    assert_eq!(classify(&v), "valid");
    assert_eq!(classify(&s), "system");
}
```

To make these tests usable, `ogdb-core` gains the
`ogdb-temporal = { path = "../ogdb-temporal" }` dependency in Phase 4.

In RED the test file lives in `crates/ogdb-core/tests/` but **does
not compile** because `use ogdb_temporal` is unresolved — `ogdb-core`
does not yet depend on `ogdb-temporal`. That is the expected RED
signal:

```
$ cargo test -p ogdb-core --test ogdb_temporal_reexport_shim
error[E0432]: unresolved import `ogdb_temporal`
error[E0433]: failed to resolve: could not find `temporal_filter_matches`
               in `ogdb_temporal`
```

Running after Phase 5 (GREEN): all 5 tests PASS.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit.

### Phase 3 — populate the new crate

1. `crates/ogdb-temporal/Cargo.toml` — the 5-line stub in §7.3 (no
   `[dependencies]` block).
2. `crates/ogdb-temporal/src/lib.rs`:
   - Add 2 plain-data items verbatim from `ogdb-core/src/lib.rs`
     line ranges in §6.3:
     ```rust
     #[derive(Debug, Clone, Copy, PartialEq, Eq)]
     pub enum TemporalScope {
         ValidTime,
         SystemTime,
     }

     #[derive(Debug, Clone, PartialEq, Eq)]
     pub struct TemporalFilter {
         pub scope: TemporalScope,
         pub timestamp_millis: i64,
     }
     ```
   - Add the 2 pure helpers re-derived from
     `Database::edge_matches_temporal_filter` body @19867-19885 and
     `parse_edge_valid_window` body @5646-5652:
     ```rust
     /// Pure decision predicate. See PLAN §6.5 for invariant pinning.
     pub fn temporal_filter_matches(
         filter: &TemporalFilter,
         valid_from: Option<i64>,
         valid_to: Option<i64>,
         transaction_time_millis: i64,
     ) -> bool {
         match filter.scope {
             TemporalScope::ValidTime => {
                 let lower_ok = valid_from
                     .map(|v| v <= filter.timestamp_millis)
                     .unwrap_or(true);
                 let upper_ok = valid_to
                     .map(|v| v > filter.timestamp_millis)
                     .unwrap_or(true);
                 lower_ok && upper_ok
             }
             TemporalScope::SystemTime => {
                 transaction_time_millis <= filter.timestamp_millis
             }
         }
     }

     /// Pure invariant validator. See PLAN §6.5.
     pub fn validate_valid_window(
         valid_from: Option<i64>,
         valid_to: Option<i64>,
     ) -> Result<(), String> {
         if let (Some(from), Some(to)) = (valid_from, valid_to) {
             if to <= from {
                 return Err(
                     "valid_to must be greater than valid_from".to_string(),
                 );
             }
         }
         Ok(())
     }
     ```
   - Add a `#[cfg(test)] mod tests { … }` block covering the same
     contract as `tests/api_smoke.rs` (RED file 8.1), so
     `cargo test -p ogdb-temporal --lib` exercises the pure logic
     in isolation (the integration `tests/api_smoke.rs` repeats the
     same surface as a public-API smoke test).
3. Add `"crates/ogdb-temporal",` to root `Cargo.toml` `[workspace]
   members` list.

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`, add
   `ogdb-temporal = { path = "../ogdb-temporal" }` under
   `[dependencies]` (alphabetically, after `ogdb-text`).
2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** the 2 type definitions at lines 1284–1294.
   - **Add** the 2-line import block from §7.1 right after the
     existing `pub use ogdb_text::FullTextIndexDefinition;` line.
   - **Refactor** `Database::edge_matches_temporal_filter`
     (@19861-19886): replace lines 19867-19885 with:
     ```rust
     let Some(filter) = temporal_filter else {
         return Ok(true);
     };
     let (valid_from, valid_to) = match filter.scope {
         TemporalScope::ValidTime => self.edge_valid_window_at(edge_id, snapshot_txn_id)?,
         TemporalScope::SystemTime => (None, None),
     };
     let tx_time = match filter.scope {
         TemporalScope::SystemTime => self.edge_transaction_time_millis_at(edge_id, snapshot_txn_id)?,
         TemporalScope::ValidTime => 0,
     };
     Ok(temporal_filter_matches(filter, valid_from, valid_to, tx_time))
     ```
     **Note:** the existing body fetches `valid_window` only for
     ValidTime scope and `transaction_time_millis` only for SystemTime
     scope (lazy lookup). The refactor preserves that laziness —
     the unused-arm value is the trivial default (`(None, None)` /
     `0`) and never reaches `temporal_filter_matches` in a way that
     changes the outcome (verified by the unit test
     `systemtime_uses_transaction_time_only` which pins that
     valid-window args are ignored under SystemTime scope, and the
     `validtime_*` tests pin that `transaction_time_millis` is
     ignored under ValidTime scope).
   - **Refactor** `parse_edge_valid_window` (@5641-5654): replace
     lines 5646-5652 with:
     ```rust
     validate_valid_window(valid_from, valid_to)
         .map_err(DbError::InvalidArgument)?;
     ```
   - Verify no in-file reference uses `crate::TemporalScope` or
     `crate::TemporalFilter` (grep confirms current callers use the
     unqualified name only — both the `pub use` and the `use` cover
     them).
3. **Do not** touch any downstream crate.

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test + lib.rs unit tests.
cargo test -p ogdb-temporal --tests
cargo test -p ogdb-temporal --lib

# Core — the shim regression test + every existing ogdb-core test.
cargo test -p ogdb-core --test ogdb_temporal_reexport_shim
cargo test -p ogdb-core --test temporal_versioning  # existing — must still pass
cargo test -p ogdb-core --tests     # the big integration test suite
cargo test -p ogdb-core --lib       # unit tests inside lib.rs mod tests

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-cli ogdb-ffi ogdb-python ogdb-bolt ogdb-eval \
             ogdb-bench ogdb-node ogdb-e2e ogdb-tck ogdb-fuzz \
             ogdb-vector ogdb-algorithms ogdb-text; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

No edits to any downstream `Cargo.toml` or `src/` file are expected.
If any `cargo build -p <crate>` fails, the shim is wrong — revert
the `pub use` line and investigate; do **not** paper over with
downstream edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append a `[ogdb-core-split-temporal]`
  section describing the plain-data + 2-helpers extraction, the shim
  strategy, and a reference to this PLAN.md.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-temporal` crate exposes `TemporalScope`,
    `TemporalFilter`, `temporal_filter_matches`, and
    `validate_valid_window`."
  - `### Changed` — "`ogdb-core` re-exports the temporal plain-data
    types from `ogdb-temporal` via `pub use`; public surface
    unchanged. `Database::edge_matches_temporal_filter` and
    `parse_edge_valid_window` delegate the pure decision logic to
    `ogdb-temporal`."
- `ARCHITECTURE.md` §13: no change — the tiers hold.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-temporal-primitive-split` referencing this plan (matches the
  pattern of the prior three plans).

## 10. Out-of-scope (explicitly deferred to later plans)

- Moving `TemporalNodeVersion` (~6 LOC). Embeds `PropertyMap`. Requires
  generic `<P>` on the struct + serde-on-generic for the on-disk
  meta-catalog round-trip. Follow-up: `plan/ogdb-core-split-temporal-runtime`.
- Moving `Database::add_node_temporal_version`,
  `Database::compact_temporal_versions`,
  `Database::node_temporal_version_count`,
  `Database::set_temporal_compaction_floor`,
  `Database::edge_valid_window_at`,
  `Database::edge_transaction_time_millis_at`,
  `Database::edge_valid_window`,
  `Database::edge_transaction_time_millis` (~110 LOC). Each touches
  `Database` mutable state, the meta-catalog, or undo-log entries.
  Requires a `NodeTemporalRead`/`NodeTemporalWrite`/`EdgeMetadataRead`
  trait set. Follow-up: `plan/ogdb-core-split-temporal-runtime`.
- Moving `BackgroundCompactor` (~250 LOC) + the `compactor` field on
  `Database`. Requires a `CompactableDatabase` trait abstracting
  `Arc<RwLock<Database>>`-typed worker access. Follow-up.
- Moving `parse_edge_valid_window` and `temporal_i64_property` (~24 LOC).
  Both read `&PropertyMap` and `PropertyValue::I64`. Requires either
  moving `PropertyValue` (huge ripple) or designing a
  `PropertyExtract` trait. Follow-up. (This plan does delegate the
  pure invariant inside `parse_edge_valid_window` to
  `ogdb_temporal::validate_valid_window` without moving the function
  itself.)
- Moving `parse_match_temporal_filter` (~13 LOC). Method on
  `CypherParser`; belongs in the future `ogdb-query` crate, not
  `ogdb-temporal`.
- Moving `Episode` (~9 LOC). RAG/agent-memory concept; DESIGN.md
  places `ogdb-temporal/` as bitemporal/versioning/compaction only.
  Belongs in a future `ogdb-rag` crate or stays in core.
- Adding `Serialize`/`Deserialize` derives to the moved types. Today
  `TemporalScope` and `TemporalFilter` are runtime-only types (they
  are not in the on-disk meta-catalog and are not on the WAL record
  format); adding serde derives now would inflate `ogdb-temporal`'s
  dep tree without a consumer.
- Any change to `IndexDefinition`, `FullTextIndexDefinition`,
  `VectorIndexDefinition`, or `PropertyMap`. Out of scope.
- The other 3 planned crates (`ogdb-import`, `ogdb-export`,
  `ogdb-query`). Each gets its own `.planning/` plan and its own
  `plan/ogdb-core-split-<facet>` branch.
- **Any** `cargo build --workspace` or `cargo test --workspace`
  invocation. AGENTS contract + user directive: per-crate only.

## 11. Commit plan

| Phase | Commit subject                                                                       | Scope                                                                           |
|------:|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| 2     | `plan(ogdb-core-split-temporal): PLAN.md + RED-phase failing tests`                    | this commit                                                                    |
| 3     | `chore(ogdb-core-split-temporal): add ogdb-temporal crate skeleton`                    | populated `lib.rs` with 2 types + 2 fns + unit tests; root Cargo.toml members  |
| 4     | `refactor(ogdb-core-split-temporal): replace in-core temporal primitives with pub-use shim` | delete 2 type defs from `ogdb-core/src/lib.rs`, add `pub use` shim, wire dep, refactor 2 call-site bodies |
| 5     | `test(ogdb-core-split-temporal): per-crate green under shim`                           | run the per-crate matrix from §9 Phase 5 and record results                    |
| 6     | `docs(ogdb-core-split-temporal): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`           | docs only                                                                       |
| 7     | `chore(release-tests): append ogdb-temporal-primitive-split manifest entry`            | release-tests yaml only                                                         |

A follow-up plan `plan/ogdb-core-split-temporal-runtime` will pick up
where this leaves off (moving `TemporalNodeVersion`, the 8 Database
temporal methods, `BackgroundCompactor`, `parse_edge_valid_window`,
and `temporal_i64_property` once the trait contract from
`plan/ogdb-core-split-algorithms-traversal` is settled).
