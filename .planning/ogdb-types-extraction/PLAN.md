# ogdb-types-extraction — extract `PropertyValue` + `PropertyMap` foundational data types into new `ogdb-types` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-types/` (stub `Cargo.toml`, doc-only `src/lib.rs`, and two
> failing tests — one in the new crate, one shim-compat test in
> `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-types-extraction`.
>
> Phases 3–5 (GREEN) move the `PropertyValue` enum (lines 593–605), its
> four custom impls (`Serialize` 607–665, `Deserialize` 667–820,
> `Eq`/`PartialOrd`/`Ord` 822–878), the private `property_value_variant_rank`
> helper (880–893), and the `pub type PropertyMap = BTreeMap<String,
> PropertyValue>` alias (896) out of `crates/ogdb-core/src/lib.rs` into
> `crates/ogdb-types/src/lib.rs`. `ogdb-core` then re-exports them via
> `pub use ogdb_types::{PropertyMap, PropertyValue};`. Phases 6–8 cover
> CHANGELOG + `docs/IMPLEMENTATION-LOG.md` + per-crate tests +
> `.github/workflows/release-tests.yaml` manifest entry.

**Goal:** unblock the last two facets of the 7-crate split from
`ARCHITECTURE.md` §13 (`ogdb-export` and the temporal-runtime tail of
`ogdb-temporal`) by extracting the **foundational data type pair**
`PropertyValue` + `PropertyMap` out of the 41 232-line
`crates/ogdb-core/src/lib.rs` monolith into a brand-new
`crates/ogdb-types/` crate, with a `pub use` backward-compat shim in
`ogdb-core`. Mirrors the beachhead-plus-shim strategy shipped in
`plan/ogdb-core-split-vector` (commit `472ad2e`),
`plan/ogdb-core-split-algorithms` (commit `df41dbb`),
`plan/ogdb-core-split-text` (commit `4c25af6`),
`plan/ogdb-core-split-temporal` (commit `63b9dfa`), and
`plan/ogdb-core-split-import` (commit `01acb72`).

**Architecture:** `ogdb-types` owns one enum, one type alias, and five
trait impls. Every moved item depends only on `BTreeMap`, `Vec`,
primitive numerics, and **one** workspace dep — `ogdb-vector` — for the
seven-line call to `compare_f32_vectors` inside the `Ord` impl
(`lib.rs:846`, `lib.rs:5036`). No `Database`, no `Snapshot`, no
`DbError`, no `RuntimeValue`, no Cypher AST, no WAL, no storage layer
references. The Database-coupled property helpers (`property_value_to_json`
@4915, `format_property_value` @4961, `property_value_type_name` @5008,
`property_value_is_null` @5024, `compare_property_values` @5031,
`json_value_to_property_value` @1153, `runtime_to_property_value` @5797)
**stay in `ogdb-core`** for this seed — they import `serde_json::Value`,
`RuntimeValue`, or `DbError` and resolve unqualified against the
re-exported `PropertyValue` via the shim. `RecordBatch` (@900) **stays
in `ogdb-core`** even though its `columns` field stores
`Vec<PropertyValue>` — it is `pub` and downstream-visible but its
extraction is non-load-bearing for the export/temporal cycle break and
adds zero shim value.

A `pub use ogdb_types::{PropertyMap, PropertyValue};` line at the top
of `crates/ogdb-core/src/lib.rs` keeps every existing call site
compiling byte-for-byte identically. **Eight downstream import lines**
across **9 files** + **2 fully-qualified `ogdb_core::PropertyValue::*`
pattern matches** in `ogdb-bench/tests/rag_accuracy.rs` —
**558 source-level references** total — flow through the shim
unchanged. **Zero downstream-crate edits required.**

**Tech stack:** Rust 2021, workspace-inherited version metadata. The
two non-optional deps `serde` (already in core, used by every variant's
custom (de)serialization) and `serde_json` (already a regular core
dep, used by `Deserialize<'de>` to re-parse nested
`{"List":[…]}` / `{"Map":{…}}` payloads) **migrate as direct
dependencies of `ogdb-types`**. No optional-feature flags. No new heavy
deps. `ogdb-types` adds **one** workspace path dep on `ogdb-vector`
(already a leaf with only `serde`) for `compare_f32_vectors`. The
resulting dep DAG is acyclic:

```
ogdb-vector (serde)
   ↓
ogdb-types (serde, serde_json, ogdb-vector)
   ↓
ogdb-core (every other crate, including ogdb-temporal,
           ogdb-text, ogdb-algorithms, ogdb-import — see §6.3)
```

Per-crate `cargo test -p <crate>` only — **never** `--workspace`
(AGENTS contract + user directive).

**Coupling verdict (Option A vs Option B vs Option C vs BLOCKED):**
**Option A** — full extraction of `PropertyValue` + all four impls +
`property_value_variant_rank` + `PropertyMap`, with a single-line
workspace dep on `ogdb-vector` to satisfy the `compare_f32_vectors`
call at `lib.rs:846`. See §6 for the full A-vs-B-vs-C tradeoff; the
tl;dr is that Option A is feasible because the only inbound dep on
`ogdb-vector` is the seven-line `compare_f32_vectors` call (which is
already extracted as `pub fn` and leaf-clean), the `Deserialize` impl
already uses `serde_json::Value` (no Cypher coupling), and the
`Database`-coupled property helpers can stay in core via the shim
(they call `PropertyValue::Variant(...)` constructors which the
re-export resolves transparently). **No cycle exists** — `ogdb-vector`
does not reference `PropertyValue` (verified by `grep -n PropertyValue
crates/ogdb-vector/src/lib.rs` returning a single doc-comment hit on
line 14). **No BLOCKED state.**

---

## 1. Problem summary — the foundational-types extraction unlocks the last two facets

The five prior splits established a stable beachhead pattern:

1. New crate with empty/doc-only `lib.rs` + Cargo stub.
2. Extract only **pure items** with zero (or one re-exportable)
   coupling to `Database`, `DbError`, the Cypher runtime, or storage.
3. `pub use` re-export in `ogdb-core` → zero downstream crate edits.
4. Per-crate `cargo test` matrix, never `--workspace`.

After those five splits, the remaining 7-crate plan items break down:

| Planned crate   | Status                                                                                                                                                                                                                                              | Blocker (if any)                                                                                                                                                                                                                                                                                                                                          |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ogdb-vector`   | **Shipped** (commit `472ad2e`)                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                          |
| `ogdb-algorithms` | **Shipped** (commit `df41dbb`)                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                          |
| `ogdb-text`     | **Shipped** (commit `4c25af6`)                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                          |
| `ogdb-temporal` | **Plain-data shipped** (commit `63b9dfa`); **runtime tail blocked** by `TemporalNodeVersion` embedding `PropertyMap` (`crates/ogdb-core/src/lib.rs:8409`).                                                                                                                                                                | This plan unblocks it.                                                                                                                                                                                                                                                                                                                                     |
| `ogdb-import`   | **Plain-data + parsers shipped** (commit `01acb72`); orchestrator (`Database::ingest_document`) deferred to a follow-up that depends on a future `IngestableDatabase` trait.                                                                                                                                                | Orthogonal to this plan.                                                                                                                                                                                                                                                                                                                                   |
| `ogdb-export`   | **Blocked** (per `ogdb-core-split-import/PLAN.md` §1): `ExportNode` (@1297) and `ExportEdge` (@1305) both embed `PropertyMap`. Same circular blocker that defers the temporal-runtime tail.                                                                                                                              | This plan unblocks it.                                                                                                                                                                                                                                                                                                                                     |
| `ogdb-query`    | **~25 000 LOC Cypher engine** — terminal refactor, not a seed. Cohabits with most of `Database`'s public surface.                                                                                                                                                                                                          | Defer until all small seeds + foundational `ogdb-types` land.                                                                                                                                                                                                                                                                                              |

The blocker pattern in both `ogdb-temporal` (runtime tail) and
`ogdb-export` is identical: **a struct that's logically pure data
(only stdlib + `PropertyMap` fields) but cannot live in the leaf
crate because `PropertyMap` is currently defined in
`ogdb-core`.** Lifting `PropertyMap` (and its `PropertyValue`
underpinning) into a foundational `ogdb-types` crate breaks both
cycles in one stroke: any future crate that wants to own
`TemporalNodeVersion`, `ExportNode`, or `ExportEdge` simply adds
`ogdb-types = { path = "../ogdb-types" }` and embeds `PropertyMap`
directly.

`ogdb-types` is the **right shape** for this seed because:

- `PropertyValue` and `PropertyMap` are the **highest-fan-in pair** in
  the workspace: 558 source-level references across 14 files (vs. 26
  for `VectorDistanceMetric`, 4 for `ShortestPathOptions`, 2 for
  `DocumentFormat`/`IngestConfig`). Locking their identity behind a
  `pub use` re-export protects the largest possible downstream surface
  with the smallest possible LOC move.
- The only outbound dep is `ogdb_vector::compare_f32_vectors`,
  already extracted and leaf-clean. No fancy circular-import gymnastics
  needed.
- The four trait impls (`Serialize`, `Deserialize`, `Eq`,
  `PartialOrd`, `Ord`) are **non-derive** custom impls — they cannot
  be reproduced by `#[derive]` because (a) the JSON shape is a
  hand-rolled single-key object (not the default Serde untagged or
  externally-tagged form) and (b) the `Ord` impl has a numeric-family
  cross-variant rule (`I64 ↔ F64` total-order) that derives can't
  express. Moving them is therefore a pure cut-paste — the GREEN diff
  is essentially `git mv` semantics.

## 2. Exact reproducer — what "after the 5 prior splits, before the types split" looks like

### 2.1 Before this plan (main as of `23d4dfd`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-import  ogdb-node ogdb-python
ogdb-tck  ogdb-temporal  ogdb-text  ogdb-vector
$ wc -l crates/ogdb-core/src/lib.rs
41232 crates/ogdb-core/src/lib.rs
$ grep -nE '^(pub )?(struct|enum|type) (PropertyMap|PropertyValue)\b' crates/ogdb-core/src/lib.rs
593:pub enum PropertyValue {
896:pub type PropertyMap = BTreeMap<String, PropertyValue>;
$ grep -nE '^impl[[:space:]<].*for PropertyValue|^impl PropertyValue' crates/ogdb-core/src/lib.rs
607:impl Serialize for PropertyValue {
667:impl<'de> Deserialize<'de> for PropertyValue {
822:impl Eq for PropertyValue {}
824:impl PartialOrd for PropertyValue {
830:impl Ord for PropertyValue {
$ grep -rnE 'PropertyValue|PropertyMap' crates/ --include='*.rs' | grep -v 'crates/ogdb-core/' | wc -l
558           # source-level references downstream
$ grep -rn 'use ogdb_core::' crates/ --include='*.rs' | grep -E '\b(PropertyMap|PropertyValue)\b' | grep -v 'crates/ogdb-core/' | wc -l
8             # distinct multi-symbol import lines downstream
```

### 2.2 After this plan (end of GREEN — Phases 3–5)

```bash
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-import  ogdb-node ogdb-python
ogdb-tck  ogdb-temporal  ogdb-text  ogdb-types  ogdb-vector
$ cat crates/ogdb-types/Cargo.toml          # 10 lines
$ wc -l crates/ogdb-types/src/lib.rs
~325         # PropertyValue + 5 impls + variant_rank + PropertyMap + #[cfg(test)] mod tests
$ wc -l crates/ogdb-core/src/lib.rs
~40 935      # ~297 LOC lighter (296 deleted, 1 pub use line added)
$ grep -n 'pub use ogdb_types' crates/ogdb-core/src/lib.rs
1            # one re-export line for two foundational types
$ cargo test -p ogdb-types --tests                              # PASS (8 smoke tests)
$ cargo test -p ogdb-core --test ogdb_types_reexport_shim       # PASS (4 shim tests)
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/ crates/ogdb-vector/ crates/ogdb-algorithms/ \
           crates/ogdb-text/ crates/ogdb-temporal/ crates/ogdb-import/
# empty — zero downstream changes
```

## 3. Module map + LOC estimate — current `PropertyValue`/`PropertyMap` footprint in `ogdb-core`

Grep-derived, from `crates/ogdb-core/src/lib.rs` as of commit `23d4dfd`:

| Item                                                      | Line range  | LOC | Category                                                                                                         | Moves?                                                                                                                                                          |
|-----------------------------------------------------------|-------------|----:|------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `pub enum PropertyValue`                                  | 591–605     |  15 | Plain data enum, 11 variants, `#[derive(Debug, Clone, PartialEq)]`                                              | **YES**                                                                                                                                                          |
| `impl Serialize for PropertyValue`                        | 607–665     |  59 | Hand-rolled single-key `{"Variant": payload}` JSON form. Non-derivable.                                          | **YES**                                                                                                                                                          |
| `impl<'de> Deserialize<'de> for PropertyValue`            | 667–820     | 154 | Inverse of the above; uses `serde_json::Value` for nested `List`/`Map` recursion.                                | **YES** (carries `serde_json` import)                                                                                                                            |
| `impl Eq for PropertyValue {}`                            | 822         |   1 | Marker (custom `PartialEq` derive forbids automatic `Eq`)                                                        | **YES**                                                                                                                                                          |
| `impl PartialOrd for PropertyValue`                       | 824–828     |   5 | Delegates to `Ord::cmp`                                                                                          | **YES**                                                                                                                                                          |
| `impl Ord for PropertyValue`                              | 830–878     |  49 | Hand-rolled total order: I64↔F64 cross-cmp via `total_cmp`, vector lex via `compare_f32_vectors`, variant-rank fallback | **YES** (carries one inbound: `compare_f32_vectors` from `ogdb-vector`)                                                                                  |
| `fn property_value_variant_rank`                          | 880–893     |  14 | Private helper used only by the `Ord` fallback                                                                   | **YES** (private in `ogdb-types`)                                                                                                                                |
| `pub type PropertyMap = BTreeMap<String, PropertyValue>;` | 895–896     |   2 | Type alias                                                                                                       | **YES**                                                                                                                                                          |
| `pub struct RecordBatch`                                  | 899–902     |   4 | `BTreeMap<String, Vec<PropertyValue>>` — but no downstream-blocking type embeds it; defer.                       | **NO** (stays; out of seed scope; column-batch type used only by the in-core Cypher executor)                                                                    |
| `fn property_value_to_json`                               | 4915–4956   |  42 | Database-coupled helper (uses `serde_json::Value`)                                                               | **NO**                                                                                                                                                           |
| `fn format_property_value`                                | 4961–5006   |  46 | Used by Cypher runtime for string formatting                                                                     | **NO**                                                                                                                                                           |
| `fn property_value_type_name`                             | 5008–5021   |  14 | Used by Cypher type-error messages                                                                               | **NO**                                                                                                                                                           |
| `fn property_value_is_null`                               | 5024–5028   |   5 | Used by Cypher null-check                                                                                        | **NO**                                                                                                                                                           |
| `fn compare_property_values`                              | 5031–5045   |  15 | Used by Cypher range-filter (uses `Some(compare_f32_vectors(l, r))` for `Vector`); calls `cmp` on the rest       | **NO**                                                                                                                                                           |
| `fn json_value_to_property_value`                         | 1153–1218   |  66 | Used by WASM `parse_wasm_properties_json`                                                                        | **NO**                                                                                                                                                           |
| `fn parse_wasm_properties_json`                           | 1220–1240   |  21 | WASM-only entry point                                                                                            | **NO**                                                                                                                                                           |
| `fn temporal_i64_property`                                | 5587–5600   |  14 | Helper that reads `PropertyMap` for `valid_from` / `valid_to`                                                    | **NO**                                                                                                                                                           |
| `fn runtime_to_property_value`                            | 5797–5830   |  34 | Cypher runtime conversion                                                                                        | **NO**                                                                                                                                                           |
| 3 `compare_f32_vectors` test invocations (in-core)        | 34402, 34406, 34410 |  ~6 | `#[cfg(test) mod tests]` integration tests of `Ord` semantics                                                    | **NO** (continue to test the re-exported `PropertyValue` end-to-end)                                                                                             |
| Direct `compare_f32_vectors` import from `ogdb-vector`    | 9           |   1 | `use ogdb_vector::{compare_f32_vectors, ...}`                                                                    | **NO** (stays — `ogdb-core` still calls it directly inside `compare_property_values` @5036; `ogdb-types` gets its own private `use` line)                       |

**LOC moved in this plan:** **~299 LOC** out of `ogdb-core` (1 enum +
4 impls + 1 helper fn + 1 type alias). **New unit + integration tests
in `ogdb-types`:** ~210 LOC covering all 11 variant constructors, the
serde JSON shape contract for every variant, the I64↔F64 cross-cmp,
the vector lex order, the variant-rank fallback, the `Eq` marker via
`BTreeSet` membership, and the deserializer's two error paths
(unknown variant, multi-key object). **Net `ogdb-core` shrinkage:**
~297 LOC (299 deleted − 2 lines added: `pub use ogdb_types::{PropertyMap,
PropertyValue};` + a direct `use ogdb_types::PropertyValue;` is **not
needed** because the `pub use` covers in-crate resolution too — every
existing in-core call site like `PropertyValue::I64(1)` resolves
transparently via the re-export).

## 4. Internal dependency graph for the items being moved

```
┌────────────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs (today)                                           │
│                                                                        │
│   PropertyValue (pub enum @593, → ogdb-types)                          │
│       ↑                                                                │
│       ├── PropertyMap type alias @896          ← MOVES (with it)       │
│       ├── property_value_variant_rank @883    ← MOVES (private helper) │
│       ├── impl Serialize @607                 ← MOVES                  │
│       ├── impl Deserialize @667               ← MOVES                  │
│       ├── impl Eq @822 + PartialOrd @824 + Ord @830  ← MOVE            │
│       │                                                                │
│       ├── compare_f32_vectors (from ogdb-vector @9)                    │
│       │     used at @846 inside Ord::cmp                               │
│       │     used at @5036 inside compare_property_values (STAYS)       │
│       │                                                                │
│       ├── property_value_to_json @4915        ← STAYS                  │
│       ├── format_property_value @4961         ← STAYS                  │
│       ├── property_value_type_name @5008      ← STAYS                  │
│       ├── property_value_is_null @5024        ← STAYS                  │
│       ├── compare_property_values @5031       ← STAYS                  │
│       ├── json_value_to_property_value @1153  ← STAYS                  │
│       ├── parse_wasm_properties_json @1220    ← STAYS                  │
│       ├── temporal_i64_property @5587         ← STAYS                  │
│       ├── runtime_to_property_value @5797     ← STAYS                  │
│       ├── runtime_to_vector @5934             ← STAYS                  │
│       ├── ExportNode @1297 (.properties: PropertyMap)  ← STAYS         │
│       ├── ExportEdge @1305 (.properties: PropertyMap)  ← STAYS         │
│       ├── TemporalNodeVersion @8409 (.properties: PropertyMap) ← STAYS │
│       ├── RecordBatch @900 (.columns: BTreeMap<_, Vec<PropertyValue>>) │
│       │                                                  ← STAYS       │
│       ├── Database::* methods that build/read PropertyMap ← STAY       │
│       ├── WAL serialization (RuntimeValue ↔ PropertyValue) ← STAYS     │
│       └── 558 downstream source-level references          ← STAY       │
│            (8 import lines + 2 fully-qualified pattern matches)        │
└────────────────────────────────────────────────────────────────────────┘
```

**Key property:** every "STAYS" arrow into the moved cluster is a call
that resolves in two ways after the split:

- in-crate (within `ogdb-core/src/lib.rs`) via the
  `pub use ogdb_types::{PropertyMap, PropertyValue};` line at the
  top of the file. Since `pub use` hoists the type into the
  `ogdb_core::` namespace, every unqualified `PropertyValue::I64(_)`
  match arm, every `let map: PropertyMap = ...`, every
  `properties: PropertyMap` field, and every `Vec<PropertyValue>`
  generic argument continues to resolve byte-for-byte identically.
- downstream (other crates) via the same `pub use` re-export — every
  existing `use ogdb_core::{PropertyMap, PropertyValue}` import keeps
  working.

**No outbound `ogdb-types → ogdb-core` edge exists.** No cycle.

The single new edge is `ogdb-types → ogdb-vector` (for
`compare_f32_vectors`). `ogdb-vector` has zero `ogdb-core` references
(verified `grep -n ogdb_core crates/ogdb-vector/src/lib.rs` returns
zero hits) and zero `PropertyValue` references (verified the lone
`PropertyValue` mention in `ogdb-vector/src/lib.rs:14` is a
doc-comment), so `ogdb-vector → ogdb-types` is impossible — DAG is
acyclic.

## 5. Downstream inventory — who imports `ogdb_core::PropertyValue`/`ogdb_core::PropertyMap` today

Exhaustive survey via
`grep -rnE 'use ogdb_core::|ogdb_core::PropertyValue|ogdb_core::PropertyMap' crates/`:

### 5.1 The 8 multi-symbol import sites

| Downstream file                                        | Import line                                                                               | Symbols used in body                                  | After shim? |
|--------------------------------------------------------|--------------------------------------------------------------------------------------------|-------------------------------------------------------|-------------|
| `ogdb-cli/src/lib.rs:2-5`                              | `Database, DbError, DocumentFormat, EnrichedRagResult, ExportEdge, ExportNode, Header, IngestConfig, PropertyMap, PropertyValue, QueryResult, SharedDatabase, ShortestPathOptions, VectorDistanceMetric, WriteConcurrencyMode` | 262 refs (largest consumer)                            | ✅ no change |
| `ogdb-ffi/src/lib.rs:2`                                | `DbError, Header, PropertyMap, PropertyValue, SharedDatabase`                              | 35 refs                                                | ✅ no change |
| `ogdb-python/src/lib.rs:2-4`                           | `DbError, Header, PropertyMap, PropertyValue, SharedDatabase, VectorDistanceMetric`        | 61 refs                                                | ✅ no change |
| `ogdb-node/src/lib.rs:2-4`                             | `DbError, Header, PropertyMap, PropertyValue, SharedDatabase, VectorDistanceMetric`        | 38 refs                                                | ✅ no change |
| `ogdb-bolt/src/lib.rs:1`                               | `DbError, PropertyValue, QueryResult, SharedDatabase, WriteConcurrencyMode`                | 16 refs (incl. `BTreeMap<String, PropertyValue>`)      | ✅ no change |
| `ogdb-bolt/src/lib.rs:955` (in `#[cfg(test)] mod`)     | `Header, PropertyMap`                                                                       | (bolt protocol round-trip tests)                       | ✅ no change |
| `ogdb-eval/src/drivers/ai_agent.rs:22`                 | `Database, Header, PropertyMap, PropertyValue, VectorDistanceMetric`                       | 9 refs                                                 | ✅ no change |
| `ogdb-eval/src/drivers/ldbc_mini.rs:10`                | `Database, Header, PropertyMap, PropertyValue`                                              | 6 refs                                                 | ✅ no change |
| `ogdb-eval/src/drivers/ldbc_snb.rs:14`                 | `Database, PropertyValue`                                                                  | 2 refs                                                 | ✅ no change |
| `ogdb-eval/src/drivers/throughput.rs:24`               | `Database, Header, PropertyMap, PropertyValue`                                              | 3 refs                                                 | ✅ no change |
| `ogdb-cli/tests/shacl_validation.rs:2`                 | `Database, Header, PropertyMap, PropertyValue`                                              | 15 refs                                                | ✅ no change |
| `ogdb-e2e/tests/comprehensive_e2e.rs:5-7`              | `CompressionAlgorithm, ..., PropertyMap, PropertyValue, ..., VectorDistanceMetric`         | 107 refs                                               | ✅ no change |

(Total: **9 unique import sites across 11 downstream files** — `ogdb-eval/drivers/{ai_agent,ldbc_mini,ldbc_snb,throughput}` each have one.)

### 5.2 The 2 fully-qualified pattern matches

| Downstream file                              | Match                                                           | After shim?                                                              |
|----------------------------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------|
| `ogdb-bench/tests/rag_accuracy.rs:88`         | `Some(ogdb_core::PropertyValue::String(s)) => s.to_lowercase()` | ✅ no change — `pub use` resolves `ogdb_core::PropertyValue` to `ogdb_types::PropertyValue` |
| `ogdb-bench/tests/rag_accuracy.rs:92`         | `Some(ogdb_core::PropertyValue::String(s)) => s.to_lowercase()` | ✅ no change                                                              |

### 5.3 Total source-level reference count (per `awk`/`uniq -c` distribution)

```
262  crates/ogdb-cli/src/lib.rs
107  crates/ogdb-e2e/tests/comprehensive_e2e.rs
 61  crates/ogdb-python/src/lib.rs
 38  crates/ogdb-node/src/lib.rs
 35  crates/ogdb-ffi/src/lib.rs
 16  crates/ogdb-bolt/src/lib.rs
 15  crates/ogdb-cli/tests/shacl_validation.rs
  9  crates/ogdb-eval/src/drivers/ai_agent.rs
  6  crates/ogdb-eval/src/drivers/ldbc_mini.rs
  3  crates/ogdb-eval/src/drivers/throughput.rs
  2  crates/ogdb-eval/src/drivers/ldbc_snb.rs
  2  crates/ogdb-bench/tests/rag_accuracy.rs
  1  crates/ogdb-vector/src/lib.rs       ← doc-comment only
  1  crates/ogdb-temporal/src/lib.rs     ← doc-comment only
─────
558 total source-level `PropertyValue`/`PropertyMap` references
     across 14 files (the 2 doc-comment hits are non-load-bearing)
```

**Effective downstream reference count protected by the shim: 556**
(across **12 source files** + **2 doc-comment mentions**).

**Downstream-crate edits required by this plan: 0.**

## 6. Coupling verdict — Option A vs Option B vs Option C vs BLOCKED

### 6.1 Option A (chosen) — full extraction of `PropertyValue` + `PropertyMap` + impls; ogdb-types depends on ogdb-vector

**What moves:** the entire 11-variant `PropertyValue` enum, its four
custom impls (`Serialize`, `Deserialize`, `Eq`/`PartialOrd`/`Ord`),
the private `property_value_variant_rank` helper, and the
`pub type PropertyMap = ...` alias. Total **~299 LOC**.

**Workspace dep added:** `ogdb-types → ogdb-vector` (one-line entry
in `crates/ogdb-types/Cargo.toml`) — needed by the `Ord` impl's
`compare_f32_vectors(left, right)` call at the new
`crates/ogdb-types/src/lib.rs` (currently `lib.rs:846`).

**Pros:**

- Single round-trip move; everything that the export/temporal-runtime
  follow-ups need lives in `ogdb-types` from day one.
- Only one new dep edge (`ogdb-types → ogdb-vector`); the resulting
  DAG mirrors the natural conceptual layering ("vector primitives
  underpin the Vector variant of PropertyValue").
- The trivial 7-line `compare_f32_vectors` call site is reused, not
  duplicated. No drift risk between two parallel implementations.
- Zero code in `ogdb-vector` changes — the prior plan's contract
  (vector primitives owns `compare_f32_vectors`) is preserved
  byte-for-byte.

**Cons:**

- `ogdb-types` is no longer a true zero-deps "leaf-of-leaves" crate —
  it carries one workspace dep. Future crates that want only
  `PropertyValue` (e.g. a hypothetical `ogdb-types-core` for a future
  no_std target) will pull `ogdb-vector` transitively. **Mitigation:**
  `ogdb-vector` itself has only `serde` as a dep (verified
  `crates/ogdb-vector/Cargo.toml`), so the transitive cost is exactly
  `serde` — the same dep `ogdb-types` already has.

### 6.2 Option B — partial extraction (PropertyValue only, leave PropertyMap in core)

**What moves:** `PropertyValue` + its impls + variant-rank helper.
**What stays:** `PropertyMap` (still defined as
`pub type PropertyMap = BTreeMap<String, PropertyValue>;` inside
`ogdb-core`, with the alias resolving the now-re-exported type).

**Pros:**

- Smaller blast radius — only one type extracted per facet.
- Trivially shimmable: `pub use ogdb_types::PropertyValue;` in
  ogdb-core covers the type; `PropertyMap` keeps its current
  in-core definition.

**Cons:**

- Doesn't unblock the load-bearing case. The blocker for
  `ogdb-export`/`ogdb-temporal-runtime` is **`ExportNode`/`ExportEdge`/`TemporalNodeVersion`
  embedding `PropertyMap`**, which still depends on `ogdb-core`'s
  `PropertyMap` definition. Splitting `PropertyMap` from
  `PropertyValue` creates two extraction events — twice the churn for
  zero unblock value.
- The 4 downstream import lines that spell `PropertyMap` would still
  resolve via `ogdb_core::PropertyMap`, but that re-export targets a
  re-export — adding a hop without simplifying anything.

**Verdict:** Option B is a strictly worse Option A. Reject.

### 6.3 Option C — minimal extraction (PropertyValue enum only, no impls)

**What moves:** just the 11-variant enum body + derives. **What stays:**
all four custom impls, the variant-rank helper, the type alias.

**Pros:**

- Truly minimal LOC move (~15 LOC).

**Cons:**

- **Breaks the orphan rule.** `impl Serialize for PropertyValue` cannot
  live in `ogdb-core` if `PropertyValue` is defined in `ogdb-types`
  unless `Serialize` is also a local trait — which it isn't (it's
  `serde::Serialize`). Rust's coherence rules forbid this. The impl
  block must follow the type. Option C is **technically infeasible**.

**Verdict:** Reject — mechanically impossible.

### 6.4 BLOCKED — none of the above feasible

**Could the seed be split into ogdb-types (no deps) + ogdb-types-rich
(depends on ogdb-vector)?** This was the user's pre-emptive fallback
proposal. It would mean:

- `ogdb-types` (zero workspace deps): `PropertyValue` enum **without**
  the `Ord` impl (which needs `compare_f32_vectors`). But the four
  impls are coherent with the type — splitting them off means
  `ogdb-types-rich` has to define `Ord` for a type it doesn't own,
  hitting the orphan rule again. **Mechanically infeasible.**

- Alternative: `ogdb-types` **inlines** a private duplicate of
  `compare_f32_vectors` (a 7-line `total_cmp`-based loop) instead of
  taking the `ogdb-vector` dep. **This works** but introduces drift
  risk: the in-core `compare_property_values` (@5036) still calls
  `ogdb_vector::compare_f32_vectors`, while `PropertyValue::Ord` would
  call `ogdb_types::__inline_compare`. If anyone ever fixes a bug in
  one and forgets the other, vector ordering diverges silently across
  call sites. **Reject in favour of Option A** — the single dep edge
  is cheaper than the duplication risk.

**Verdict: NOT BLOCKED.** Option A is feasible; ship it.

### 6.5 Why `ExportNode`/`ExportEdge`/`TemporalNodeVersion`/`RecordBatch` stay in core

The four "tip-of-the-iceberg" types that *would* benefit from moving
to a crate that owns `PropertyMap` are explicitly **not in scope** for
this seed:

- `ExportNode` (@1297), `ExportEdge` (@1305) — destined for
  `ogdb-export` in a follow-up plan. They reference `PropertyMap`,
  which after this plan lives in `ogdb-types`, so they become
  `ogdb-export → ogdb-types` — clean DAG.
- `TemporalNodeVersion` (@8409) — destined for the
  `ogdb-temporal-runtime` follow-up.
- `RecordBatch` (@900) — used only by the in-core Cypher executor's
  columnar batching path. Has no downstream import that would be
  blocked by core ownership. Leave it in `ogdb-core` indefinitely
  unless a future planner-extraction needs it.

This seed lifts the **dependency**, not the **dependents**. The
follow-ups land later.

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level re-export

At the top of `crates/ogdb-core/src/lib.rs` (right after the existing
`pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`
line at line 8 — see prior plan §7.1), insert exactly one line:

```rust
// Re-export the foundational property data types so every existing
// `use ogdb_core::PropertyValue` / `use ogdb_core::PropertyMap` caller
// in the workspace (and every embedder pinning the 0.3 surface) keeps
// compiling. PropertyMap is a type alias; the `pub use` of PropertyValue
// + the alias's reference resolves both via one re-export site.
pub use ogdb_types::{PropertyMap, PropertyValue};
```

No private `use ogdb_types::PropertyValue;` is needed — `pub use`
already hoists the type into `ogdb_core::` so unqualified in-core
references like `PropertyValue::I64(_)` and `let map: PropertyMap`
resolve transparently.

### 7.2 Why `pub use` is byte-for-byte compatible for `PropertyValue` + `PropertyMap`

`pub use ogdb_types::PropertyValue;` re-exports the enum **and all 11
variants**. Every downstream `match` arm, every `PropertyValue::I64(x)`
constructor, every `Debug`/`Clone`/`PartialEq`/`Serialize`/`Deserialize`
trait bound resolves to the same `TypeId`, the same `size_of`, and
the same `Layout`. The `Serialize`/`Deserialize` JSON shape is
preserved bit-for-bit because the impls travel with the type.

`PropertyMap` is a `pub type` (not a newtype), so re-exporting it
forwards the alias verbatim. Downstream code that writes
`let map: PropertyMap = BTreeMap::new();` continues to compile because
the alias still expands to `BTreeMap<String, PropertyValue>` — only
the source crate of `PropertyValue` has changed.

### 7.3 `Cargo.toml` edits

- **New** `crates/ogdb-types/Cargo.toml`:

  ```toml
  [package]
  name = "ogdb-types"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [dependencies]
  ogdb-vector = { path = "../ogdb-vector" }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  ```

  No optional features in this seed — keep the dep tree of the
  beachhead crate as thin as possible. (The Phase-1 vector beachhead
  shipped with only `serde`; this beachhead adds `serde_json` and one
  workspace path — strictly necessary because the `Deserialize` impl
  uses `serde_json::Value` for nested `List`/`Map` recursion.)

- **Modified** `crates/ogdb-core/Cargo.toml` adds one line to
  `[dependencies]` (placed alphabetically next to `ogdb-vector`):

  ```toml
  ogdb-types = { path = "../ogdb-types" }
  ```

- **Modified** root `Cargo.toml` adds one entry to `[workspace] members`
  (placed alphabetically right after `ogdb-vector`):

  ```toml
  "crates/ogdb-types",
  ```

  *(Already added in this RED commit.)*

No other crate's `Cargo.toml` changes.

## 8. RED-phase failing tests (already on disk)

Two new tests are introduced. Both fail on this commit (because the
source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-types/tests/api_smoke.rs`

8 tests (~210 LOC) covering:

- **`property_value_has_eleven_variants`** — pin every variant
  constructor with the names downstream code uses.
- **`property_map_is_a_plain_btreemap_alias`** — confirm the alias
  remains transparent (not a newtype).
- **`serde_round_trip_preserves_every_variant`** — pin the exact JSON
  shape (`{"I64":42}`, `{"DateTime":{"micros":...,"tz_offset_minutes":...}}`,
  etc.) for the WAL/bolt wire compatibility contract.
- **`ord_orders_within_numeric_family`** — pin the I64↔F64 cross-cmp
  (load-bearing for Cypher MIN/MAX).
- **`ord_orders_vectors_via_compare_f32_vectors`** — pin the vector
  lex order (delegates to the `ogdb-vector` helper).
- **`ord_falls_back_to_variant_rank_across_families`** — pin the
  cross-family stable rank order (Bool < Numeric < String < Bytes <
  Vector < Date < DateTime < Duration < List < Map).
- **`property_value_is_eq_for_btreeset_membership`** — pin the marker
  `impl Eq for PropertyValue {}` (without it, `BTreeSet<PropertyValue>`
  stops compiling).
- **`deserialize_rejects_unknown_variant_and_multikey_object`** — pin
  the deserializer's two error paths (used by every embedder that
  writes JSON-encoded `PropertyValue` payloads).

**Expected RED output** (already verified):

```
$ cargo test -p ogdb-types --tests
error[E0432]: unresolved imports `ogdb_types::PropertyMap`, `ogdb_types::PropertyValue`
  --> crates/ogdb-types/tests/api_smoke.rs:40:18
```

### 8.2 `crates/ogdb-core/tests/ogdb_types_reexport_shim.rs`

4 tests covering:

- **`property_value_is_reexported_from_ogdb_types`** — `TypeId` equality
  between `ogdb_core::PropertyValue` and `ogdb_types::PropertyValue`.
- **`property_map_is_reexported_from_ogdb_types`** — `TypeId` equality
  between `ogdb_core::PropertyMap` and
  `BTreeMap<String, ogdb_types::PropertyValue>` (the alias must remain
  a transparent newtype-free expansion).
- **`all_eleven_variants_pattern_match_through_shim`** — exhaustive
  `match` on `ogdb_core::PropertyValue` covering every variant; if a
  variant is renamed in `ogdb-types`, this test stops compiling and
  surfaces the break before downstream crates rebuild.
- **`json_round_trip_through_shim_matches_ogdb_types_directly`** —
  serialize via `ogdb_core::PropertyValue`, deserialize via
  `ogdb_types::PropertyValue` directly, prove identity round-trips
  through the shim (the contract that lets the bolt server and a
  future `ogdb-export` crate interoperate without an adapter layer).

**Expected RED output** (already verified):

```
$ cargo test -p ogdb-core --test ogdb_types_reexport_shim
error[E0433]: cannot find module or crate `ogdb_types` in this scope
   --> crates/ogdb-core/tests/ogdb_types_reexport_shim.rs:69:39
   ...
error: could not compile `ogdb-core` (test "ogdb_types_reexport_shim") due to 6 previous errors
```

The 6 errors split as: 5 references to `ogdb_types` in the test
itself + 1 wrap-up "could not compile" — all caused by the missing
`ogdb-types = { path = "..." }` entry in `crates/ogdb-core/Cargo.toml`,
which is intentional in RED.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit on this branch.

### Phase 3 — populate the new crate

1. `crates/ogdb-types/src/lib.rs`:

   - Replace the doc-only comment with the 11-variant `PropertyValue`
     enum verbatim from `crates/ogdb-core/src/lib.rs:591-605` (16
     lines including the `#[derive]` line and the doc comment).
   - Paste the four impl blocks verbatim from `crates/ogdb-core/src/lib.rs:607-878`
     (267 LOC). Adjust the `Serialize` impl's `use serde::ser::SerializeMap`
     line — the `use` already-bundled inside the impl body remains
     valid because `serde` is a direct dep of `ogdb-types`. The
     `Deserialize` impl already uses fully-qualified
     `serde_json::Value::deserialize(deserializer)` — leave as-is;
     `serde_json` is a direct dep of `ogdb-types`.
   - Paste `fn property_value_variant_rank` verbatim from
     `crates/ogdb-core/src/lib.rs:880-893` (14 LOC). Mark it `pub(crate)`
     — it has no downstream consumers.
   - Paste `pub type PropertyMap = BTreeMap<String, PropertyValue>;`
     verbatim from `crates/ogdb-core/src/lib.rs:895-896` (2 LOC).
   - Add the imports the moved code needs at the top of the file:

     ```rust
     use ogdb_vector::compare_f32_vectors;
     use serde::{Deserialize, Serialize};
     use std::collections::BTreeMap;
     ```

   - Add `#[cfg(test)] mod tests { … }` covering the same contract as
     `tests/api_smoke.rs` for in-crate unit tests of any private
     helper (`property_value_variant_rank` rank-order pin; ~30 LOC).

2. **Do not** touch any of the helper functions that stay in core
   (`property_value_to_json`, `compare_property_values`, etc.) — they
   continue to call `PropertyValue::*` constructors, which the
   `pub use` in core resolves.

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`, add (alphabetically after
   `ogdb-vector`):

   ```toml
   ogdb-types = { path = "../ogdb-types" }
   ```

2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** lines 591–605 (`PropertyValue` enum).
   - **Delete** lines 607–878 (`Serialize`, `Deserialize`, `Eq`,
     `PartialOrd`, `Ord` impls).
   - **Delete** lines 880–893 (`property_value_variant_rank`).
   - **Delete** lines 895–896 (`PropertyMap` alias).
   - **Insert** at line 9 (right after the existing
     `pub use ogdb_vector::{VectorDistanceMetric, VectorIndexDefinition};`):

     ```rust
     pub use ogdb_types::{PropertyMap, PropertyValue};
     ```

   - Verify no in-file reference uses `crate::PropertyValue` (a `grep`
     of the current file confirms current callers use the unqualified
     name only — the `pub use` covers them all).

3. **Do not** touch any downstream crate.

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test
cargo test -p ogdb-types --tests

# Core — the shim regression test + every existing ogdb-core test
cargo test -p ogdb-core --test ogdb_types_reexport_shim
cargo test -p ogdb-core --tests     # the big integration test suite
cargo test -p ogdb-core --lib       # unit tests inside lib.rs mod tests

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-cli ogdb-ffi ogdb-python ogdb-bolt ogdb-eval \
             ogdb-bench ogdb-node ogdb-e2e ogdb-tck ogdb-fuzz \
             ogdb-vector ogdb-algorithms ogdb-text ogdb-temporal \
             ogdb-import; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

No edits to any downstream `Cargo.toml` or `src/` file are expected.
If any `cargo build -p <crate>` fails, the shim is wrong — revert the
`pub use` line and investigate; do **not** paper over with downstream
edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append an `[ogdb-types-extraction]`
  section describing the data-type extraction, the shim strategy, and
  a reference to this PLAN.md.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-types` crate exposes
    `PropertyValue` (the 11-variant enum) and `PropertyMap` (the
    `BTreeMap<String, PropertyValue>` alias). Foundational layer that
    will gate the upcoming `ogdb-export` and temporal-runtime extractions."
  - `### Changed` — "`ogdb-core` re-exports the foundational data
    types from `ogdb-types` via `pub use`; public surface unchanged."
- `ARCHITECTURE.md` §13: append a paragraph noting the foundational
  position of `ogdb-types` (depended on by every other crate that
  embeds `PropertyMap`); update the dep DAG diagram if one exists.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-types-property-data-extraction` referencing this plan
  (matches the pattern of every recent plan, e.g.
  `ogdb-import-extraction`).

## 10. Out-of-scope (explicitly deferred to later plans)

- Moving `ExportNode` (@1297) and `ExportEdge` (@1305) into a new
  `ogdb-export` crate. **Now unblocked** by this plan; follow-up:
  `plan/ogdb-core-split-export`.
- Moving `TemporalNodeVersion` (@8409) into `ogdb-temporal` (the
  runtime tail of the temporal split). **Now unblocked** by this plan;
  follow-up: `plan/ogdb-core-split-temporal-runtime`.
- Moving `RecordBatch` (@900) and the columnar batching helpers.
  Out of scope; consumed only by the in-core Cypher executor.
- Moving the Database-coupled property helpers (`property_value_to_json`,
  `format_property_value`, `property_value_type_name`,
  `property_value_is_null`, `compare_property_values`,
  `json_value_to_property_value`, `parse_wasm_properties_json`,
  `temporal_i64_property`, `runtime_to_property_value`). They depend
  on `serde_json::Value` (already a core dep), `RuntimeValue` (Cypher
  type), or `DbError` (core type) — not portable to `ogdb-types`
  without dragging the Cypher engine across.
- Moving the WAL serialization layer (`PropertyValue` ↔ raw bytes).
  Stays with `Database`'s storage codec.
- Any change to the `serde` JSON shape of `PropertyValue` —
  forward-compat-breaking; would require a separate migration plan.
- The `ogdb-query` Cypher engine extraction. Terminal refactor;
  unchanged by this plan.
- **Any** `cargo build --workspace` or `cargo test --workspace`
  invocation. AGENTS contract + user directive: per-crate only.

## 11. Commit plan

| Phase | Commit subject                                                                          | Scope                                                                           |
|------:|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| 2     | `plan(ogdb-types-extraction): PLAN.md + RED-phase failing tests`                         | this commit                                                                    |
| 3     | `chore(ogdb-types-extraction): populate ogdb-types crate with PropertyValue + PropertyMap` | doc-only `lib.rs` → populated with enum + 4 impls + variant_rank + alias       |
| 4     | `refactor(ogdb-types-extraction): replace in-core property types with pub-use shim`      | delete 299 LOC from `ogdb-core/src/lib.rs`, add `pub use ogdb_types::{...};` line, wire dep |
| 5     | `test(ogdb-types-extraction): per-crate green under shim`                                | runs the per-crate matrix from §9 Phase 5 and records results                  |
| 6     | `docs(ogdb-types-extraction): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`                | docs only                                                                      |
| 7     | `chore(release-tests): append ogdb-types-property-data-extraction manifest entry`        | release-tests yaml only                                                        |

Two follow-up plans pick up where this leaves off:

- `plan/ogdb-core-split-export` — lift `ExportNode`/`ExportEdge` into
  a new `ogdb-export` crate that depends on `ogdb-types`.
- `plan/ogdb-core-split-temporal-runtime` — lift
  `TemporalNodeVersion` and the runtime tail into the existing
  `ogdb-temporal` crate, which gains a dep on `ogdb-types`.
