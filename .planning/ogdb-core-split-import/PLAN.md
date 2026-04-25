# ogdb-core-split-import — extract document-ingest plain-data + pure parser helpers into new `ogdb-import` crate

> **Phase 2 artifact (plan + RED).** This document + the RED scaffold at
> `crates/ogdb-import/` (stub `Cargo.toml`, empty `src/lib.rs`, and two
> failing tests — one in the new crate, one shim-compat test in
> `ogdb-core`) constitute the RED commit on branch
> `plan/ogdb-core-split-import`.
>
> Phases 3–5 (GREEN) move the four plain-data document-ingest types
> (`DocumentFormat`, `IngestConfig`, `IngestResult`, `ParsedSection`)
> and the five pure parser helpers (`parse_pdf_sections`,
> `parse_markdown_sections`, `parse_plaintext_sections`, `chunk_content`,
> `detect_cross_references`) out of `crates/ogdb-core/src/lib.rs` into
> `crates/ogdb-import/src/lib.rs`, replace the in-core definitions with
> a `pub use ogdb_import::{DocumentFormat, IngestConfig, IngestResult};`
> shim plus a private `use ogdb_import::{ParsedSection,
> parse_pdf_sections, parse_markdown_sections, parse_plaintext_sections,
> chunk_content, detect_cross_references};` import, refactor
> `Database::ingest_document` to call the moved helpers, and migrate
> the `lopdf` + `pulldown-cmark` optional dependencies from `ogdb-core`
> to `ogdb-import`. Phases 6–8 cover CHANGELOG + docs/IMPLEMENTATION-LOG
> + per-crate tests + the release-tests manifest entry.

**Goal:** land the **fifth** facet of the 7-crate split from
`ARCHITECTURE.md` §13 / `DESIGN.md` `ogdb-import/` by extracting four
plain-data document-ingest types and five pure parser/chunker helpers
out of the 41 533-line `crates/ogdb-core/src/lib.rs` monolith into a
brand-new `crates/ogdb-import/` crate, with a `pub use` backward-compat
shim in `ogdb-core`. Mirrors the beachhead-plus-shim strategy shipped in
`plan/ogdb-core-split-vector` (commit `472ad2e`),
`plan/ogdb-core-split-algorithms` (commit `df41dbb`),
`plan/ogdb-core-split-text` (commit `4c25af6`), and
`plan/ogdb-core-split-temporal` (commit `63b9dfa`).

**Architecture:** `ogdb-import` owns four plain-data types and five
pure free functions. Every moved item has a signature that depends
only on `&[u8]`, `&str`, `usize`, `Vec<String>`, and the new crate's
own `ParsedSection` plain-data type — **no `Database`, no `Snapshot`,
no `DbError`, no `PropertyMap`, no `PropertyValue`, no WAL, no
storage layer references.** The Database-coupled, ingest-orchestrating
layer — `Database::ingest_document` (@22137) — **stays in `ogdb-core`**
for this seed. The only Database-side edit is:

1. `Database::ingest_document` body keeps its current shape but the
   three `match config.format { Pdf => parse_pdf_sections(data)?, ...
   }` arms (@22149-22161), the `chunk_content(&section.content,
   config.max_chunk_words)` call (@22254), and the
   `detect_cross_references(&sections)` call (@22291) all continue to
   resolve unqualified via the new private `use ogdb_import::{…}`
   import added to the top of `crates/ogdb-core/src/lib.rs`. **No
   line of `Database::ingest_document` body changes.**

A `pub use ogdb_import::{DocumentFormat, IngestConfig, IngestResult};`
line at the top of `crates/ogdb-core/src/lib.rs` keeps every existing
call site (`Database::ingest_document` parameter type, the 9 in-core
`#[cfg(feature = "document-ingest")] #[test]` test functions at
lines 41020/41064/41100/41123/41150/41168/41186/41220/41250 that
construct `IngestConfig` and `DocumentFormat` variants, and the 1
in-core unit test at line 41186 that constructs `ParsedSection`)
compiling byte-for-byte identically. **Two downstream-crate users**
(`ogdb-cli/src/lib.rs` line 4 and `ogdb-bench/{tests,benches}/rag_*.rs`
line 1-2) keep their `use ogdb_core::{DocumentFormat, IngestConfig,
IngestResult, ...};` lines unchanged — covered by the `pub use` shim.
**Zero downstream-crate edits required.**

**Tech stack:** Rust 2021, workspace-inherited version metadata. The
two heavy optional deps `lopdf` (PDF extraction) and `pulldown-cmark`
(Markdown parsing) **migrate from `ogdb-core` to `ogdb-import`**, both
behind a new `document-ingest` feature on `ogdb-import`. `ogdb-core`'s
`document-ingest` feature becomes a passthrough: `document-ingest =
["ogdb-import/document-ingest"]`. `serde` is added to `ogdb-import`
because `DocumentFormat` and `IngestResult` derive `Serialize`/`Deserialize`
(and `IngestConfig` does not — its `embed_fn: Option<Box<dyn Fn>>`
field forbids it; `IngestConfig` has only `Default + ` no derives
beyond what's needed for construction). Per-crate `cargo test -p <crate>`
only — **never** `--workspace` (AGENTS contract + user directive).

**Coupling verdict (Option A vs Option B):** **Option B** — move only
the plain-data type quartet, the four-field `ParsedSection` plain-data
struct, and the five pure parser/chunker helpers; leave
`Database::ingest_document` (the storage-coupled orchestrator) in
core. See §6 for the full A-vs-B tradeoff; the tl;dr is that a true
Option A would require:

1. Moving `Database::ingest_document` (@22137-22320, ~190 LOC) into
   `ogdb-import` requires abstracting **8 distinct Database-mutating
   methods** (`create_node_with`, `add_typed_edge`, `create_fulltext_index`,
   `create_vector_index`, `rebuild_vector_indexes_from_catalog`,
   `node_count`, plus implicit access to the WAL undo log for any of
   the above) behind a new `IngestableDatabase` trait. That trait
   would become public API on day 1.
2. Migrating the 9 in-core `#[test]` functions at @41018-41270 (all
   call `db.ingest_document(...)`) into a shared test harness that
   re-exports the trait. That doubles the surface to maintain.
3. Forcing `DbError` to leak into `ogdb-import` (every `create_node_with`
   call returns `Result<u64, DbError>`).

Option B lets us land a tight, verifiable seed that moves exactly the
pure plain-data + parser surface and leaves the storage-coupled
orchestrator for a follow-up plan (`plan/ogdb-core-split-import-runtime`)
that can reuse the `IngestableDatabase` trait designed alongside
the `NodeRead` contract from
`plan/ogdb-core-split-algorithms-traversal`.

---

## 1. Problem summary — `ogdb-import` is the next viable plain-data seed

The vector split (`plan/ogdb-core-split-vector`, commit `472ad2e`),
algorithms split (`plan/ogdb-core-split-algorithms`, commit `df41dbb`),
text split (`plan/ogdb-core-split-text`, commit `4c25af6`), and
temporal split (`plan/ogdb-core-split-temporal`, commit `63b9dfa`)
established the beachhead pattern:

1. New crate with empty `lib.rs` + Cargo stub.
2. Extract only **pure items** with zero coupling to `Database`,
   `DbError`, `PropertyMap`, `PropertyValue`, the Cypher runtime, or
   storage.
3. `pub use` re-export in `ogdb-core` → zero downstream crate edits.
4. Per-crate `cargo test` matrix, never `--workspace`.

Applying that pattern to the next seed requires picking the next
candidate facet from the remaining 3 planned crates. `ogdb-core/src/lib.rs`
is at 41 533 LOC (down from main's pre-split 41 922 across the prior
four extractions). The remaining candidates, with their coupling
profiles after the four prior seeds:

| Planned crate   | Minimum viable seed (pure-data + pure helpers)                                              | Coupling risk                                                                                                                                                                                                                                                                                                                                            |
|-----------------|----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ogdb-import`   | 4 plain-data types + 5 pure parser/chunker helpers (this plan)                               | **Low** for this seed: moved items take only `&[u8]` / `&str` / `usize`, return `Vec<ParsedSection>` / `Vec<String>` / `Vec<(usize, usize)>`. `Database::ingest_document` (the orchestrator) stays in core. Two optional deps (`lopdf`, `pulldown-cmark`) migrate cleanly under feature flag.                                                              |
| `ogdb-export`   | `ExportNode` (@1278), `ExportEdge` (@1286)                                                   | **Blocked**: both embed `PropertyMap` (the `BTreeMap<String, PropertyValue>` core type @877). Same circular-dependency blocker that defers `TemporalNodeVersion` from the temporal seed. Moving requires either a `<P>` generic on each struct + serde-on-generic for round-trips, or splitting out a foundational `ogdb-types` crate first. Out of scope for this seed; defer to `plan/ogdb-core-split-export-runtime` once `PropertyValue` extraction is solved. |
| `ogdb-query`    | ~25 000 LOC Cypher engine (parser + analyser + planner + executor)                            | **Highest**: terminal refactor, not a seed. Cohabits with most of `Database`'s public surface. Defer until all small seeds land.                                                                                                                                                                                                                              |

The import facet wins because **the plain-data + pure-helper subset is
genuinely pure and self-contained**: `ParsedSection` is a 5-field
plain struct with only stdlib types; `DocumentFormat` is a 3-variant
`Copy` enum; `IngestResult` is a 6-field plain struct;
`IngestConfig` has a `Box<dyn Fn(&str) -> Vec<f32> + Send + Sync>`
closure field but **no** Database/PropertyMap reference; the five
parser/chunker helpers take only primitives + `&[ParsedSection]` and
return `Vec<ParsedSection>` / `Vec<String>` / `Vec<(usize, usize)>` /
`Result<_, DbError>` (with `DbError` adapted at the call site, same as
`ogdb-text`'s `Result<_, String>` → `DbError::InvalidArgument` adapter).

Net moved LOC is ~270 — bigger than vector (~91) / temporal (~10) /
text (~70) but smaller than algorithms (~207 + new community kernels).
Two optional deps migrate cleanly because they are **already
documented as the document-ingest feature's transitive cost** in the
existing `Cargo.toml` line 11 (`document-ingest = ["dep:lopdf",
"dep:pulldown-cmark"]`).

The Database-coupled cohort (`Database::ingest_document` and the 9
in-core integration tests) is **not in this seed** — it touches
`create_node_with`, `add_typed_edge`, `create_fulltext_index`,
`create_vector_index`, `rebuild_vector_indexes_from_catalog`, and the
WAL undo log via every mutation. Lifting it requires the Option-A
trait set; follow-up plan.

The export facet is **deferred** because `ExportNode` / `ExportEdge`
both embed `PropertyMap`, identical to the `TemporalNodeVersion`
blocker that the temporal seed deferred. Once `PropertyValue` is
extracted (a future foundational split), `ogdb-export` can land as
plain-data; until then it shares the temporal-runtime follow-up's
fate.

## 2. Exact reproducer — what "after vector+algo+text+temporal split, before import split" looks like

### 2.1 Before this plan (main as of `55be5b3`)

```bash
$ cd ~/opengraphdb
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-node ogdb-python ogdb-tck
ogdb-temporal  ogdb-text  ogdb-vector
$ wc -l crates/ogdb-core/src/lib.rs
41533 crates/ogdb-core/src/lib.rs
$ grep -nE '^(pub )?(fn|struct|enum) (parse_pdf_sections|parse_markdown_sections|parse_plaintext_sections|chunk_content|detect_cross_references|ParsedSection|DocumentFormat|IngestConfig|IngestResult)' crates/ogdb-core/src/lib.rs
1440:pub enum DocumentFormat {
1447:pub struct IngestConfig {
1479:pub struct IngestResult {
1523:struct ParsedSection {
11654:fn parse_pdf_sections(data: &[u8]) -> Result<Vec<ParsedSection>, DbError> {
11748:fn parse_markdown_sections(text: &str) -> Result<Vec<ParsedSection>, DbError> {
11828:fn parse_plaintext_sections(text: &str, max_chunk_words: usize) -> Vec<ParsedSection> {
11848:fn chunk_content(content: &str, max_words: usize) -> Vec<String> {
11860:fn detect_cross_references(sections: &[ParsedSection]) -> Vec<(usize, usize)> {
$ grep -rnE 'use ogdb_core::.*\b(DocumentFormat|IngestConfig|IngestResult)\b' crates/ --include='*.rs' | grep -v 'crates/ogdb-core/'
crates/ogdb-bench/benches/rag_benchmark.rs:2:use ogdb_core::{Database, DocumentFormat, Header, IngestConfig, RetrievalSignal, RrfConfig};
crates/ogdb-bench/tests/rag_accuracy.rs:1:use ogdb_core::{Database, DocumentFormat, Header, IngestConfig, RagResult, RetrievalSignal, RrfConfig};
crates/ogdb-cli/src/lib.rs:3:    Database, DbError, DocumentFormat, EnrichedRagResult, ExportEdge, ExportNode, Header,
crates/ogdb-cli/src/lib.rs:4:    IngestConfig, PropertyMap, PropertyValue, QueryResult,
$ grep -rnE 'use ogdb_core::.*\b(ParsedSection|parse_pdf_sections|parse_markdown_sections|parse_plaintext_sections|chunk_content|detect_cross_references)\b' crates/ --include='*.rs' | grep -v 'crates/ogdb-core/'
# (empty — zero downstream type/fn-level imports of the moved items)
```

### 2.2 After this plan (end of GREEN — Phases 3–5)

```bash
$ ls crates/
ogdb-algorithms  ogdb-bench  ogdb-bolt  ogdb-cli  ogdb-core  ogdb-e2e
ogdb-eval   ogdb-ffi    ogdb-fuzz  ogdb-import  ogdb-node ogdb-python
ogdb-tck  ogdb-temporal  ogdb-text  ogdb-vector
$ cat crates/ogdb-import/Cargo.toml    # new, ~16 lines
$ wc -l crates/ogdb-import/src/lib.rs
~480         # 4 plain-data types + 5 parsers + impl Default + ~120 LOC of unit tests
$ wc -l crates/ogdb-core/src/lib.rs
~41 270      # ~263 LOC lighter (270 LOC of types + helpers deleted, 7 new lines added — pub use + use + Cargo.toml entries)
$ grep -n 'pub use ogdb_import' crates/ogdb-core/src/lib.rs
1            # one re-export line for three plain-data types
$ grep -n 'use ogdb_import::' crates/ogdb-core/src/lib.rs
1            # one private import line for ParsedSection + 5 helpers (under document-ingest cfg)
$ cargo test -p ogdb-import --tests                               # PASS
$ cargo test -p ogdb-core --test ogdb_import_reexport_shim        # PASS
$ git diff crates/ogdb-cli/ crates/ogdb-ffi/ crates/ogdb-python/ \
           crates/ogdb-bolt/ crates/ogdb-eval/ crates/ogdb-node/ \
           crates/ogdb-bench/ crates/ogdb-e2e/ crates/ogdb-tck/ \
           crates/ogdb-fuzz/ crates/ogdb-vector/ crates/ogdb-algorithms/ \
           crates/ogdb-text/ crates/ogdb-temporal/
# empty — zero downstream changes
```

## 3. Module map + LOC estimate — current import footprint in `ogdb-core`

Grep-derived, from `crates/ogdb-core/src/lib.rs` as of commit `55be5b3`:

| Item                                                     | Line range        | LOC  | Category                                                                      | Moves?                                            |
|----------------------------------------------------------|-------------------|-----:|-------------------------------------------------------------------------------|---------------------------------------------------|
| `pub enum DocumentFormat`                                | 1438–1444         |    7 | Plain data (`#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]`) | **YES**                                           |
| `pub struct IngestConfig`                                | 1446–1462         |   17 | Plain data + `Box<dyn Fn(&str) -> Vec<f32> + Send + Sync>` closure (no derives — closure forbids serde) | **YES**                                           |
| `impl Default for IngestConfig`                          | 1464–1475         |   12 | Plain `impl` block                                                              | **YES**                                           |
| `pub struct IngestResult`                                | 1477–1492         |   16 | Plain data (`#[derive(Debug, Clone, Serialize, Deserialize)]`)                | **YES**                                           |
| `struct ParsedSection`                                   | 1521–1529         |    9 | Plain data (`#[derive(Debug, Clone)]`); fields: `title: String`, `level: u32`, `content: String`, `page_start: Option<u32>`, `page_end: Option<u32>` | **YES** (becomes `pub struct ParsedSection` with `pub` fields in ogdb-import) |
| `fn parse_pdf_sections`                                  | 11653–11745       |   93 | Pure: `&[u8] → Result<Vec<ParsedSection>, DbError>`. Uses `lopdf::Document`. `#[cfg(feature = "document-ingest")]`. | **YES** (returns `Result<_, String>` — call site adapts via `.map_err(DbError::InvalidArgument)`) |
| `fn parse_markdown_sections`                             | 11747–11825       |   79 | Pure: `&str → Result<Vec<ParsedSection>, DbError>`. Uses `pulldown_cmark::Parser`. `#[cfg(feature = "document-ingest")]`. | **YES** (returns `Result<_, String>`) |
| `fn parse_plaintext_sections`                            | 11827–11845       |   19 | Pure stdlib: `(&str, usize) → Vec<ParsedSection>`. `#[cfg(feature = "document-ingest")]`. | **YES** (no third-party dep needed) |
| `fn chunk_content`                                       | 11847–11857       |   11 | Pure stdlib: `(&str, usize) → Vec<String>`. `#[cfg(feature = "document-ingest")]`. | **YES** (no third-party dep needed) |
| `fn detect_cross_references`                             | 11859–11878       |   20 | Pure stdlib: `&[ParsedSection] → Vec<(usize, usize)>`. `#[cfg(feature = "document-ingest")]`. | **YES** (no third-party dep needed) |
| `Database::ingest_document` (method)                     | 22136–22320       |  185 | Database-coupled orchestrator. Calls `create_node_with`, `add_typed_edge`, `create_fulltext_index`, `create_vector_index`, `rebuild_vector_indexes_from_catalog`. `#[cfg(feature = "document-ingest")]`. | NO (stays in core; body unchanged — call sites resolve via private `use ogdb_import::{...}`) |
| 9 in-core integration `#[test]` functions                 | 41018–41270       | ~250 | All call `db.ingest_document(...)`. `#[cfg(feature = "document-ingest")]`.    | NO — they continue to test `Database::ingest_document` end-to-end via the (now re-exported) `IngestConfig`/`DocumentFormat` types |
| `test_cross_reference_detection` unit test (in-core)     | 41184–41216       |   33 | Constructs `ParsedSection` directly + calls `detect_cross_references`.        | **MOVES** to `ogdb-import/src/lib.rs` `#[cfg(test)] mod tests` (the test's coverage migrates with the code) |
| `lopdf = { version = "0.34", optional = true }` in Cargo.toml | core/Cargo.toml line 25 | 1 | Optional dep                                                                  | **MIGRATES** to `ogdb-import/Cargo.toml`           |
| `pulldown-cmark = { version = "0.13", optional = true }` in Cargo.toml | core/Cargo.toml line 26 | 1 | Optional dep                                                                  | **MIGRATES** to `ogdb-import/Cargo.toml`           |
| `document-ingest = ["dep:lopdf", "dep:pulldown-cmark"]` feature | core/Cargo.toml line 11 | 1 | Feature definition                                                              | **REPLACED** by `document-ingest = ["ogdb-import/document-ingest"]` (passthrough) |

**LOC moved in this plan:** **~270 LOC** out of `ogdb-core` (4 type
definitions + 1 impl + 5 parser bodies + 1 in-core test that migrates
with its tested code). **New unit + integration tests in `ogdb-import`:**
~200 LOC covering enum variant pinning, struct field round-trip,
plain-text chunk count invariants, markdown heading-level extraction,
cross-reference detection truth table, and the `Default` impl's
field defaults. **Net `ogdb-core` shrinkage:** ~263 LOC (270 LOC
deleted − 5 lines added: `pub use` + `use` + 1-line Cargo dep + 1-line
feature passthrough + 1-line member-list passthrough are all in
`Cargo.toml`, only 2 `use` lines land in `lib.rs`).

The existing 9 `Database::ingest_document` integration tests at
@41018-41270 are **kept in `ogdb-core/src/lib.rs`** unchanged — they
exercise the Database method, not the parsers. The 1 helper-level
unit test at @41184-41216 (`test_cross_reference_detection`) **moves**
to `crates/ogdb-import/src/lib.rs` `#[cfg(test)] mod tests`, since
that's where the tested function now lives.

## 4. Internal dependency graph for the 10 items being moved

```
┌──────────────────────────────────────────────────────────────────────┐
│ ogdb-core/src/lib.rs                                                 │
│                                                                      │
│  DocumentFormat (pub enum @1438, → ogdb-import)                      │
│    ↑                                                                 │
│    ├── IngestConfig.format field                                     │
│    ├── Database::ingest_document body match arms                     │
│    │     (@22149-22161)                  ← STAYS                     │
│    └── 9 in-core test constructions                                  │
│        (@41039, 41087, 41109, 41134, 41156, 41174, 41231, 41256)    │
│          ← STAYS (resolved via pub use re-export)                    │
│                                                                      │
│  IngestConfig (pub struct @1446, → ogdb-import)                      │
│    ↑                                                                 │
│    ├── Database::ingest_document second-param type (@22140)          │
│    │     ← STAYS                                                      │
│    └── 9 in-core test constructions + impl Default usage              │
│          ← STAYS (resolved via pub use re-export)                    │
│                                                                      │
│  IngestResult (pub struct @1477, → ogdb-import)                      │
│    ↑                                                                 │
│    ├── Database::ingest_document return type (@22141)                │
│    │     ← STAYS                                                      │
│    ├── ingest_document body construction (@22312-22319)              │
│    │     ← STAYS                                                      │
│    └── 9 in-core test result-binding sites                           │
│          ← STAYS (resolved via pub use re-export)                    │
│                                                                      │
│  ParsedSection (pub struct after move @ogdb-import)                  │
│    ↑                                                                 │
│    ├── parse_pdf_sections / parse_markdown_sections /                │
│    │   parse_plaintext_sections return-element type                  │
│    │     ← MOVES with the parsers                                     │
│    ├── chunk_content body (uses ParsedSection.content) — wait, no:   │
│    │   chunk_content takes `&str`, not `&ParsedSection`. Independent.│
│    ├── detect_cross_references arg type (`&[ParsedSection]`)         │
│    │     ← MOVES with detect_cross_references                         │
│    ├── Database::ingest_document body iteration (@22221-22288)       │
│    │     ← STAYS — accesses `.title`, `.level`, `.content`,          │
│    │     `.page_start`, `.page_end`. Resolves via private             │
│    │     `use ogdb_import::ParsedSection;`                           │
│    └── test_cross_reference_detection (in-core @41186)               │
│          ← MOVES to ogdb-import/src/lib.rs tests                     │
│                                                                      │
│  parse_pdf_sections, parse_markdown_sections,                        │
│  parse_plaintext_sections, chunk_content, detect_cross_references    │
│    (pub fn after move @ogdb-import)                                  │
│    ↑                                                                 │
│    └── all 5 call sites are inside Database::ingest_document body    │
│        (@22150, 22154, 22159, 22254, 22291). Resolve via private     │
│        `use ogdb_import::{parse_pdf_sections, parse_markdown_sections,│
│        parse_plaintext_sections, chunk_content,                      │
│        detect_cross_references};` at the top of                      │
│        crates/ogdb-core/src/lib.rs (under                            │
│        #[cfg(feature = "document-ingest")]).                         │
└──────────────────────────────────────────────────────────────────────┘
```

**Key property:** every arrow into a "STAYS" box is a call from
`ogdb-core` code into a moved item. After the split, those call sites
continue to resolve via either:

- **`pub use ogdb_import::{DocumentFormat, IngestConfig, IngestResult};`**
  at the top of `crates/ogdb-core/src/lib.rs` (always-on), and
- **`#[cfg(feature = "document-ingest")] use ogdb_import::{ParsedSection,
  parse_pdf_sections, parse_markdown_sections, parse_plaintext_sections,
  chunk_content, detect_cross_references};`** (crate-private import
  so `Database::ingest_document` body keeps its current unqualified
  call shape).

No outbound `ogdb-import → ogdb-core` edge exists. No cycle. The new
crate has **two** dependencies (both already in `ogdb-core`'s tree
today): `serde` and the optional `lopdf` + `pulldown-cmark`
(activated by `ogdb-import`'s own `document-ingest` feature, which
`ogdb-core/document-ingest` chains into).

## 5. Downstream inventory — who imports the import surface today

Exhaustive survey via
`grep -rnE 'ogdb_core::(DocumentFormat|IngestConfig|IngestResult|ParsedSection|parse_pdf_sections|parse_markdown_sections|parse_plaintext_sections|chunk_content|detect_cross_references)' crates/ --include='*.rs'`:

| Downstream crate / file                                          | Imports                                                                  | After shim? |
|-------------------------------------------------------------------|--------------------------------------------------------------------------|:-----------:|
| `ogdb-cli/src/lib.rs:1-5`                                         | `use ogdb_core::{Database, DbError, DocumentFormat, EnrichedRagResult, ExportEdge, ExportNode, Header, IngestConfig, PropertyMap, PropertyValue, QueryResult};` | ✅ pub-use shim re-exports `DocumentFormat` + `IngestConfig` from `ogdb-core::` root |
| `ogdb-bench/benches/rag_benchmark.rs:2`                            | `use ogdb_core::{Database, DocumentFormat, Header, IngestConfig, RetrievalSignal, RrfConfig};` | ✅ same shim                                  |
| `ogdb-bench/tests/rag_accuracy.rs:1`                               | `use ogdb_core::{Database, DocumentFormat, Header, IngestConfig, RagResult, RetrievalSignal, RrfConfig};` | ✅ same shim                                  |

**Method-level downstream calls** (via
`grep -rnE '\b(ingest_document|IngestConfig::default|DocumentFormat::(Pdf|Markdown|PlainText)|IngestResult)\b' crates/ --include='*.rs' | grep -v 'crates/ogdb-core/'`):

| Downstream crate / file                                          | Calls                                                                              | After shim? |
|-------------------------------------------------------------------|------------------------------------------------------------------------------------|:-----------:|
| `ogdb-cli/src/lib.rs:4717-4719`                                    | `match raw { "Pdf" \| "pdf" \| "PDF" => DocumentFormat::Pdf, "Markdown" ... }`     | ✅ no change |
| `ogdb-cli/src/lib.rs:4735-4741`                                    | `let config = IngestConfig { ... ..IngestConfig::default() }; ... db.ingest_document(&data, &config)` | ✅ no change |
| `ogdb-bench/benches/rag_benchmark.rs:62-69`                        | `let config = IngestConfig { ... format: DocumentFormat::Markdown, ..IngestConfig::default() }; db.ingest_document(content.as_bytes(), &config)` | ✅ no change |
| `ogdb-bench/tests/rag_accuracy.rs:54-62`                            | same shape as above                                                                 | ✅ no change |

**Count:** 4 downstream files, ~12 call sites — all use public types
(`DocumentFormat`, `IngestConfig`, `IngestResult`) re-exported via the
`pub use` shim, plus the `Database::ingest_document` method which
**stays on `Database`**. The split does not touch any of them.

**Downstream-crate edits required by this plan: 0.**

## 6. Facet choice — why pure plain-data + 5 helpers, and Option B over Option A

### 6.1 Candidate seeds inside `ogdb-import`

| Candidate                                                                | LOC moved | Coupling to `Database` / `PropertyMap` / WAL | Downstream refs | Requires abstraction? |
|---------------------------------------------------------------------------|----------:|-----------------------------------------------|----------------:|:---------------------:|
| 4 plain-data types + 5 pure parser helpers (this plan)                    | ~270      | **None**: `&[u8]` / `&str` / `usize` in, `Vec<ParsedSection>` / `Vec<String>` / `Vec<(usize,usize)>` out (parsers' `DbError` arm becomes `String`, adapted at call site) | 4 files, ~12 call sites — all covered by `pub use` | No                    |
| + `Database::ingest_document` (method)                                    | +185      | `Database` state via `create_node_with`, `add_typed_edge`, `create_fulltext_index`, `create_vector_index`, `rebuild_vector_indexes_from_catalog`, `node_count`; WAL undo log on every mutation | +12 sites (db method calls)                   | **Yes** (`IngestableDatabase` trait with 6 mutating methods) |
| + 9 `Database::ingest_document` integration tests                          | +250      | Each test constructs a `Database`, calls `ingest_document`, asserts on `node_labels`/`node_properties`/`node_count` | 0                                              | **Yes** (test harness built around the trait) |

The plain-data + 5-helpers subset is the only import surface whose
signatures reference **no** `Database`, `DbError` (the 2 `DbError`
returns become `String` adapters), `PropertyMap`, `PropertyValue`,
`Snapshot`, or WAL types. Every other import-related item either
mutates `Database`, calls a `Database` accessor for graph state, or
uses the WAL undo log on insertion failure.

### 6.2 Option A vs Option B

| Dimension                                       | Option A: trait-based extraction (move ingest_document + tests) | Option B: pure data + 5 helpers only, orchestrator stays in core |
|--------------------------------------------------|------------------------------------------------------------------|------------------------------------------------------------------|
| New abstractions introduced in this plan          | 1 trait (`IngestableDatabase`) with 6 methods + integration test harness | 0                                                                 |
| Items moved                                       | All 10 entries from §3 marked YES + Database::ingest_document + 9 tests | 4 plain-data types + `ParsedSection` + 5 pure helpers + 1 helper-level unit test |
| LOC moved                                         | ~705                                                              | ~270                                                              |
| Forces a `IngestableDatabase` trait?              | **Yes** (`create_node_with`, `add_typed_edge`, `create_fulltext_index`, `create_vector_index`, `rebuild_vector_indexes_from_catalog`, `node_count`) | No                                                                |
| Forces `DbError` to leak into the new crate?     | **Yes** (every Database method returns `Result<_, DbError>`)     | No — parsers' error becomes `String`; core adapts via `.map_err(DbError::InvalidArgument)` |
| Forces `PropertyValue` / `PropertyMap` to leak?  | **Yes** (`create_node_with(labels, properties: &PropertyMap)`)    | No — `ParsedSection` is pure stdlib types                          |
| Reversible?                                       | Hard — trait contract becomes public API; tests bound to harness | Trivial — the moved items are standalone free fns + 5 plain types |
| Validates the pattern before commitment?          | No — ships traits + harness without data                          | Yes — ships the subset that's obviously pure                       |
| Matches the vector-split precedent?               | No                                                                | **Directly** (vector shipped 3 free fns + 2 data types, ~91 LOC)   |
| Matches the algorithms-split precedent?           | No — algorithms explicitly deferred Option A to a follow-up        | **Directly** — algorithms shipped 3 pure kernels + 4 data types, ~207 LOC |
| Matches the text-split precedent?                 | No — text explicitly deferred Option A                             | **Directly** — text shipped 1 type + 4 fns, ~70 LOC                |
| Matches the temporal-split precedent?             | No — temporal explicitly deferred Option A                         | **Directly** — temporal shipped 2 types + 2 fns, ~10 LOC + ~16 new |
| Downstream risk                                   | Higher — trait change is a breaking `ogdb-import` major            | Lower — moved signatures are concrete types                        |
| Trait design work can come from…                  | This plan (cold design)                                            | The `plan/ogdb-core-split-algorithms-traversal` follow-up, which has the same need (`NodeRead` / `EdgeRead`) and will naturally generate the contract that this seed's runtime follow-up can extend with `IngestableDatabase` |

**Choice: Option B**, because:

1. **Mirrors all four prior precedents.** Vector moved 5 items
   zero-trait. Algorithms moved 7 items zero-trait. Text moved 5 items
   zero-trait. Temporal moved 4 items zero-trait. Import should follow
   the same shape — even though it's larger by LOC, the structure is
   identical.
2. **No premature abstraction.** Designing `IngestableDatabase` trait
   requires deciding: how does the trait expose `create_fulltext_index`
   (which takes a `Option<&str>` label + `&[String]` keys + creates a
   tantivy index file), how does the WAL undo log get a typed-erased
   handle, how does `rebuild_vector_indexes_from_catalog` interact
   with the meta-catalog persist layer. These are the same design
   decisions the algorithms-traversal follow-up will have to make for
   its `NodeRead` / `EdgeRead` contracts. Let that plan settle them
   first and reuse them in the import-runtime follow-up.
3. **Does not block Option A.** A follow-up plan
   (`plan/ogdb-core-split-import-runtime`) can introduce the trait
   and move `Database::ingest_document` + its 9 integration tests
   once this seed is in.
4. **Zero `DbError` leakage.** Both Database-coupled parsers
   (`parse_pdf_sections`, `parse_markdown_sections`) currently return
   `Result<_, DbError>` with only the `DbError::InvalidArgument(String)`
   variant. After the move they return `Result<_, String>` and the
   call site (inside `Database::ingest_document` body @22150 / @22154)
   adapts via `.map_err(DbError::InvalidArgument)?`. `DbError` stays
   owned by `ogdb-core`.
5. **`lopdf` + `pulldown-cmark` deps migrate cleanly.** Both are
   already optional in `ogdb-core` under the `document-ingest`
   feature. Move them to `ogdb-import` with the same feature flag;
   `ogdb-core/document-ingest` becomes a passthrough to
   `ogdb-import/document-ingest`. Net dep count of `ogdb-core` drops
   by 2 (replaced by 1 path dep on `ogdb-import`).

### 6.3 What moves (and only these)

| Item                                | Kind             | Current location in `ogdb-core/src/lib.rs` | After the move, in `ogdb-import/src/lib.rs` | Approx. LOC |
|-------------------------------------|------------------|--------------------------------------------|-----------------------------------------------|------------:|
| `DocumentFormat`                    | `pub enum` + derives | lines 1438–1444                       | `pub enum` (verbatim, same derives)           |   7         |
| `IngestConfig`                      | `pub struct` + closure field | lines 1446–1462             | `pub struct` (verbatim)                       |  17         |
| `impl Default for IngestConfig`     | `impl` block      | lines 1464–1475                       | `impl` (verbatim)                              |  12         |
| `IngestResult`                      | `pub struct` + derives | lines 1477–1492                     | `pub struct` (verbatim, same derives)         |  16         |
| `ParsedSection`                     | private `struct` → `pub struct`, fields → `pub` | lines 1521–1529 | `pub struct ParsedSection { pub title: String, pub level: u32, pub content: String, pub page_start: Option<u32>, pub page_end: Option<u32>, }` |   9 (10 with field-pub) |
| `parse_pdf_sections`                | `fn` → `pub fn` (gated) | lines 11653–11745                  | `pub fn(&[u8]) -> Result<Vec<ParsedSection>, String>` (returns `String` not `DbError`) |  93         |
| `parse_markdown_sections`           | `fn` → `pub fn` (gated) | lines 11747–11825                  | `pub fn(&str) -> Result<Vec<ParsedSection>, String>` |  79         |
| `parse_plaintext_sections`          | `fn` → `pub fn` (un-gated) | lines 11827–11845                | `pub fn(&str, usize) -> Vec<ParsedSection>`   |  19         |
| `chunk_content`                     | `fn` → `pub fn` (un-gated) | lines 11847–11857                | `pub fn(&str, usize) -> Vec<String>`           |  11         |
| `detect_cross_references`           | `fn` → `pub fn` (un-gated) | lines 11859–11878                | `pub fn(&[ParsedSection]) -> Vec<(usize, usize)>` |  20         |
| `test_cross_reference_detection` (move with code) | `#[test]`     | lines 41184–41216 (in core)               | `#[cfg(test)] mod tests { #[test] fn ... }` block in `ogdb-import/src/lib.rs` |  33         |
| `#[cfg(test)] mod tests` for the rest (new)        | `#[test]`     | new                                        | new                                            | ~120        |

**Total moved + new source:** ~436 LOC, but only ~270 of which are
deleted from `ogdb-core/src/lib.rs` (~50 LOC of the `~120 LOC of new
unit tests` is genuinely new content). **Net `ogdb-core` shrinkage:**
~263 LOC.

### 6.4 What stays in `ogdb-core` (explicit non-scope)

Every item below **must remain** in `ogdb-core`; a follow-up plan
(`plan/ogdb-core-split-import-runtime`) extracts them once Option B
has proven out and either this plan or the algorithms-traversal
follow-up has produced a validated `NodeRead` / `EdgeRead` /
`IngestableDatabase` trait set.

- `Database::ingest_document` (@22137-22320, 184 LOC). Calls
  `create_node_with`, `add_typed_edge`, `create_fulltext_index`,
  `create_vector_index`, `rebuild_vector_indexes_from_catalog`,
  `node_count`. Heavy Database coupling. Moves with the runtime
  cohort. Body **does not change** in this plan — its 5 helper-call
  sites resolve via the new private `use ogdb_import::{...}` import.
- All 9 `#[cfg(feature = "document-ingest")] #[test]` integration
  tests at @41018-41270 (excluding `test_cross_reference_detection`
  which moves with the helper). Each constructs a `Database` and
  calls `db.ingest_document(...)`. Stays.
- `Database` struct + all storage/MVCC/WAL/index machinery. Out of
  scope.
- `RagResult` (@1392), `EnrichedRagResult` (@1513), `RetrievalSignal`
  (@1399), `RrfConfig` (@1407), `CommunitySummary` (@1316),
  `CommunityMember` (@1332), `CommunityHierarchy` (@1343),
  `DrillResult` (@1496), `Episode` (@1305), `NodeSummary` (@1505),
  `SchemaCatalog` (@1270). These are RAG/community concepts that
  belong in a future `ogdb-rag` crate (per DESIGN.md), not
  `ogdb-import`. Out of scope.
- `ExportNode` (@1278), `ExportEdge` (@1286). Both embed
  `PropertyMap`. Defer to `plan/ogdb-core-split-export-runtime` once
  `PropertyValue` extraction is solved.
- `parse_wasm_labels_json` (@1181), `parse_wasm_properties_json`
  (@1201), `json_value_to_property_value` (@1131),
  `property_value_to_json` (@4959). These are WASM-bridge JSON
  helpers tied to `PropertyMap` / `PropertyValue`. Belong in either
  the wasm-bindings cohort or a future `ogdb-types` crate. Out of
  scope.
- `IngestConfig`'s `embed_fn: Option<Box<dyn Fn(&str) -> Vec<f32> +
  Send + Sync>>` field is preserved verbatim — the closure type has
  no Database coupling.
- The 9 `#[cfg(feature = "document-ingest")]` test gates at
  @41018/41062/41098/41121/41148/41166/41184/41218/41248 stay,
  except @41184 (`test_cross_reference_detection`) which moves to
  ogdb-import.
- `ingest_document` feature gate on the `Database` method (@22136)
  stays. The feature passthrough chain is:
  `ogdb-core/document-ingest → ogdb-import/document-ingest → dep:lopdf, dep:pulldown-cmark`.

### 6.5 API shapes (the exact signatures GREEN will land)

```rust
//! crates/ogdb-import/src/lib.rs — the seed surface.

use serde::{Deserialize, Serialize};

/// Supported document formats for ingestion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DocumentFormat {
    Pdf,
    Markdown,
    PlainText,
}

/// Configuration for document ingestion.
pub struct IngestConfig {
    /// Document title (used as :Document node title property).
    pub title: String,
    /// Document format.
    pub format: DocumentFormat,
    /// Optional embedding callback: given text, returns embedding vector.
    /// If `None`, content nodes are added to text index only (no vector index).
    #[allow(clippy::type_complexity)]
    pub embed_fn: Option<Box<dyn Fn(&str) -> Vec<f32> + Send + Sync>>,
    /// Vector dimensions (required if `embed_fn` is provided).
    pub embedding_dimensions: Option<usize>,
    /// Optional source URI for provenance tracking.
    pub source_uri: Option<String>,
    /// Max words per content chunk (default: 512).
    pub max_chunk_words: usize,
}

impl Default for IngestConfig {
    fn default() -> Self {
        Self {
            title: String::new(),
            format: DocumentFormat::PlainText,
            embed_fn: None,
            embedding_dimensions: None,
            source_uri: None,
            max_chunk_words: 512,
        }
    }
}

/// Result of document ingestion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestResult {
    pub document_node_id: u64,
    pub section_count: u64,
    pub content_count: u64,
    pub reference_count: u64,
    pub text_indexed: bool,
    pub vector_indexed: bool,
}

/// Plain-data parsed document section. Produced by [`parse_pdf_sections`],
/// [`parse_markdown_sections`], and [`parse_plaintext_sections`]; consumed
/// by `Database::ingest_document` (in `ogdb-core`).
#[derive(Debug, Clone)]
pub struct ParsedSection {
    pub title: String,
    pub level: u32,
    pub content: String,
    pub page_start: Option<u32>,
    pub page_end: Option<u32>,
}

/// Pure PDF parser (heuristic: ALL CAPS / Title Case → heading; rest → body).
/// `lopdf`-backed; gated by the `document-ingest` feature.
///
/// Returns `Err(message)` for invalid PDF bytes; the call site in
/// `Database::ingest_document` (in `ogdb-core`) adapts via
/// `.map_err(DbError::InvalidArgument)`.
#[cfg(feature = "document-ingest")]
pub fn parse_pdf_sections(data: &[u8]) -> Result<Vec<ParsedSection>, String>;

/// Pure Markdown parser using `pulldown_cmark`.
/// Gated by the `document-ingest` feature.
#[cfg(feature = "document-ingest")]
pub fn parse_markdown_sections(text: &str) -> Result<Vec<ParsedSection>, String>;

/// Pure plain-text chunker. Splits on whitespace, groups into chunks of
/// `max_chunk_words` words; one section per chunk titled `"Chunk N"`.
/// Always-on (no feature gate; uses only stdlib).
pub fn parse_plaintext_sections(text: &str, max_chunk_words: usize) -> Vec<ParsedSection>;

/// Pure word-bounded content chunker. Splits on whitespace, returns
/// joined chunks of up to `max_words` words each. If `max_words == 0`
/// or the input is shorter, returns a single chunk.
/// Always-on (no feature gate).
pub fn chunk_content(content: &str, max_words: usize) -> Vec<String>;

/// Pure cross-reference detector. For each pair (i, j) where i ≠ j,
/// returns `(i, j)` iff `sections[i].content.to_lowercase()` contains
/// `sections[j].title.to_lowercase()` AND
/// `sections[j].title` has ≥ 3 whitespace-delimited words (heuristic
/// to suppress false positives on common 1-2-word titles like
/// "Introduction").
/// Always-on (no feature gate).
pub fn detect_cross_references(sections: &[ParsedSection]) -> Vec<(usize, usize)>;
```

## 7. Shim strategy — how zero-downstream-change is guaranteed

### 7.1 `ogdb-core`'s new top-level imports

At the top of `crates/ogdb-core/src/lib.rs` (right after the existing
`pub use ogdb_temporal::{TemporalFilter, TemporalScope};` line, before
the next `use` block), add exactly two lines:

```rust
// Re-export the public document-ingest plain-data types so every
// existing in-core call site (Database::ingest_document parameter
// type, the 9 in-core #[cfg(feature = "document-ingest")] #[test]
// constructions at @41020-41250, and the 4 downstream-crate imports
// in ogdb-cli / ogdb-bench) keeps resolving without a fully-qualified
// path. Pinning the re-export identity guards against silent
// duplicate-type breakage.
pub use ogdb_import::{DocumentFormat, IngestConfig, IngestResult};

// Crate-private import so Database::ingest_document body can call
// the helpers unqualified at lines 22150 / 22154 / 22159 / 22254 /
// 22291, and so the body's `for section in sections.iter()`
// loop (@22221-22288) can dereference ParsedSection.title /
// .level / .content / .page_start / .page_end via the same name.
#[cfg(feature = "document-ingest")]
use ogdb_import::{
    chunk_content, detect_cross_references, parse_markdown_sections,
    parse_pdf_sections, parse_plaintext_sections, ParsedSection,
};
```

### 7.2 Why `pub use` is byte-for-byte compatible for plain-data types

`pub use ogdb_import::DocumentFormat;` re-exports the enum **and all
its variants**. Every in-file occurrence of `DocumentFormat::Pdf` /
`DocumentFormat::Markdown` / `DocumentFormat::PlainText` resolves via
`ogdb_core::DocumentFormat::Pdf` → pointer to
`ogdb_import::DocumentFormat::Pdf`. Pattern matching in
`Database::ingest_document` (lines 22149-22161), `Debug`/`Clone`/`Copy`/`PartialEq`/`Eq`/`Serialize`/`Deserialize`
derives, and `std::mem::size_of` are all preserved because it is
literally the same type. Downstream crate imports
(`ogdb-cli/src/lib.rs:3-4`, `ogdb-bench/{benches,tests}/rag_*.rs`)
continue to resolve `ogdb_core::DocumentFormat` without modification.

`IngestConfig` and `IngestResult` get the same treatment. Crucially,
`IngestConfig::default()` (called at 6 in-core test sites and 3
downstream sites) continues to work because the `impl Default`
block moves with the type to `ogdb-import` — `Default::default()` is
trait-routed, not name-routed.

`IngestConfig`'s `embed_fn` field type
(`Option<Box<dyn Fn(&str) -> Vec<f32> + Send + Sync>>`) survives the
move because the closure trait `Fn` + `Send` + `Sync` are stdlib /
auto-trait names that are universal across crate boundaries — there
is no name resolution to perform. The `Box<dyn Fn>` representation is
identical regardless of which crate defines the struct.

`ParsedSection` is `pub` in `ogdb-import` (with `pub` fields) but
**not** re-exported from `ogdb-core` — instead, the private
`use ogdb_import::ParsedSection;` makes it visible inside
`Database::ingest_document` body unqualified. Today `ParsedSection`
is private to `ogdb-core` (`struct ParsedSection { … }` with
non-`pub` fields); after the move it must become `pub` in
`ogdb-import` because parsers are also `pub` and return
`Vec<ParsedSection>`. The change in visibility is contained to the
new crate; `ogdb-core` does not re-export it (so no public-API
expansion of `ogdb-core`).

### 7.3 `Cargo.toml` edits

- **New** `crates/ogdb-import/Cargo.toml`:
  ```toml
  [package]
  name = "ogdb-import"
  version.workspace = true
  edition.workspace = true
  license.workspace = true

  [features]
  default = ["document-ingest"]
  document-ingest = ["dep:lopdf", "dep:pulldown-cmark"]

  [dependencies]
  serde = { version = "1", features = ["derive"] }
  lopdf = { version = "0.34", optional = true }
  pulldown-cmark = { version = "0.13", optional = true }
  ```
  Three deps total (one always, two under feature). `serde` is needed
  because `DocumentFormat` and `IngestResult` carry serde derives that
  are exercised by `ogdb-cli`'s JSON output paths.

- **Modified** `crates/ogdb-core/Cargo.toml`:
  - Add `ogdb-import = { path = "../ogdb-import", default-features = false }`
    under `[dependencies]` (alphabetically, after `ogdb-temporal`).
  - **Delete** `lopdf = { version = "0.34", optional = true }` (line 25).
  - **Delete** `pulldown-cmark = { version = "0.13", optional = true }` (line 26).
  - **Replace** `document-ingest = ["dep:lopdf", "dep:pulldown-cmark"]`
    (line 11) with `document-ingest = ["ogdb-import/document-ingest"]`.

- **Modified** root `Cargo.toml` adds one entry to `[workspace] members`:
  ```toml
  "crates/ogdb-import",
  ```

No other crate's `Cargo.toml` changes.

### 7.4 Wire-format / serde stability

`DocumentFormat` and `IngestResult` derive `Serialize`/`Deserialize`.
Their on-the-wire format is **unchanged** because the `pub use` shim
makes `ogdb_core::DocumentFormat` and `ogdb_import::DocumentFormat`
the literal same type — `serde` generates a single
`Serialize`/`Deserialize` impl in `ogdb-import`, which is reached
identically by either name path. JSON output emitted by `ogdb-cli`'s
`--format json` mode (and the bolt protocol's structured payloads) is
byte-for-byte unchanged.

`IngestConfig` does **not** derive serde (its `embed_fn` field is
non-serializable). No on-disk or on-wire compatibility surface is at
stake for it.

## 8. RED-phase failing tests (exact file contents)

Two new tests are introduced. Both must fail on this commit (because
the source moves have not happened yet). They pass in Phase 5 (GREEN).

### 8.1 `crates/ogdb-import/tests/api_smoke.rs`

This asserts that the new crate exposes the expected public API once
it is populated in GREEN. It compiles only after `ogdb-import`'s
`src/lib.rs` is populated; in RED the `lib.rs` is literally empty
(`//! RED`) so every test **fails to compile** with
`error[E0432]: unresolved imports`, which is the expected RED signal.

```rust
//! RED-phase API smoke test for the extracted ogdb-import crate.
//!
//! RED state (this commit): every test fails to compile because
//! `ogdb_import::{DocumentFormat, IngestConfig, IngestResult,
//! ParsedSection, parse_pdf_sections, parse_markdown_sections,
//! parse_plaintext_sections, chunk_content,
//! detect_cross_references}` are not yet defined (src/lib.rs is
//! intentionally empty).
//!
//! GREEN state (Phase 5 of the 8-phase workflow, see PLAN §6):
//! every test passes because the items have been added to
//! crates/ogdb-import/src/lib.rs (DocumentFormat + IngestConfig +
//! IngestResult moved out of crates/ogdb-core/src/lib.rs lines
//! 1438-1492; ParsedSection moved out of @1521-1529; the 5 parser
//! helpers moved out of @11653-11878).

use ogdb_import::{
    chunk_content, detect_cross_references, parse_plaintext_sections,
    DocumentFormat, IngestConfig, IngestResult, ParsedSection,
};

#[test]
fn document_format_has_three_variants() {
    // The enum's three variants are the contract Database::ingest_document
    // (ogdb-core lib.rs:22149-22161) pattern-matches on.
    let variants = [
        DocumentFormat::Pdf,
        DocumentFormat::Markdown,
        DocumentFormat::PlainText,
    ];
    assert_eq!(variants.len(), 3);
    let copy = variants[0];
    assert_eq!(copy, DocumentFormat::Pdf);
    assert_eq!(format!("{:?}", DocumentFormat::PlainText), "PlainText");
}

#[test]
fn document_format_serde_roundtrip() {
    // ogdb-cli surfaces DocumentFormat via JSON output; pin the
    // serde-derived format byte-for-byte so the wire format does not
    // drift across the move.
    let json = serde_json::to_string(&DocumentFormat::Markdown)
        .expect("DocumentFormat must serialize");
    assert_eq!(json, "\"Markdown\"");
    let back: DocumentFormat = serde_json::from_str("\"Pdf\"")
        .expect("DocumentFormat must deserialize");
    assert_eq!(back, DocumentFormat::Pdf);
}

#[test]
fn ingest_config_default_pins_field_values() {
    let cfg = IngestConfig::default();
    assert_eq!(cfg.title, "");
    assert_eq!(cfg.format, DocumentFormat::PlainText);
    assert!(cfg.embed_fn.is_none());
    assert_eq!(cfg.embedding_dimensions, None);
    assert_eq!(cfg.source_uri, None);
    assert_eq!(cfg.max_chunk_words, 512);
}

#[test]
fn ingest_config_accepts_embedding_closure() {
    // Pin the closure-field type-erasure surface — Database::ingest_document
    // calls (config.embed_fn)(&chunk_text) at lib.rs:22268.
    let cfg = IngestConfig {
        title: "Doc".to_string(),
        format: DocumentFormat::Markdown,
        embed_fn: Some(Box::new(|_text: &str| vec![1.0f32, 0.0, 0.0])),
        embedding_dimensions: Some(3),
        source_uri: Some("https://example.com".to_string()),
        max_chunk_words: 256,
    };
    assert_eq!(cfg.title, "Doc");
    assert_eq!(cfg.embedding_dimensions, Some(3));
    let embed = cfg.embed_fn.as_ref().expect("embed_fn must round-trip");
    assert_eq!(embed("anything"), vec![1.0f32, 0.0, 0.0]);
}

#[test]
fn ingest_result_is_plain_data() {
    let r = IngestResult {
        document_node_id: 7,
        section_count: 3,
        content_count: 12,
        reference_count: 2,
        text_indexed: true,
        vector_indexed: false,
    };
    let cloned = r.clone();
    assert_eq!(cloned.document_node_id, 7);
    assert_eq!(cloned.section_count, 3);
    assert_eq!(cloned.content_count, 12);
    assert_eq!(cloned.reference_count, 2);
    assert!(cloned.text_indexed);
    assert!(!cloned.vector_indexed);
}

#[test]
fn ingest_result_serde_roundtrip() {
    let r = IngestResult {
        document_node_id: 1,
        section_count: 1,
        content_count: 1,
        reference_count: 0,
        text_indexed: true,
        vector_indexed: true,
    };
    let json = serde_json::to_string(&r).expect("IngestResult must serialize");
    let back: IngestResult =
        serde_json::from_str(&json).expect("IngestResult must round-trip");
    assert_eq!(back.document_node_id, 1);
    assert_eq!(back.vector_indexed, true);
}

#[test]
fn parsed_section_is_plain_data() {
    let s = ParsedSection {
        title: "Intro".to_string(),
        level: 1,
        content: "Body".to_string(),
        page_start: Some(1),
        page_end: Some(2),
    };
    let cloned = s.clone();
    assert_eq!(cloned.title, "Intro");
    assert_eq!(cloned.level, 1);
    assert_eq!(cloned.content, "Body");
    assert_eq!(cloned.page_start, Some(1));
    assert_eq!(cloned.page_end, Some(2));
}

#[test]
fn plaintext_chunker_splits_on_word_count() {
    // 100 words, max_chunk_words = 30 ⇒ ceil(100/30) = 4 chunks.
    let words: Vec<String> = (0..100).map(|i| format!("w{i}")).collect();
    let text = words.join(" ");
    let sections = parse_plaintext_sections(&text, 30);
    assert_eq!(sections.len(), 4);
    assert_eq!(sections[0].title, "Chunk 1");
    assert_eq!(sections[1].title, "Chunk 2");
    assert_eq!(sections[2].title, "Chunk 3");
    assert_eq!(sections[3].title, "Chunk 4");
    assert_eq!(sections[0].level, 1);
    assert!(sections[0].page_start.is_none());
    assert!(sections[0].page_end.is_none());
}

#[test]
fn plaintext_chunker_handles_empty_input() {
    let sections = parse_plaintext_sections("", 10);
    assert!(sections.is_empty());
    let sections_ws = parse_plaintext_sections("   \n\t  ", 10);
    assert!(sections_ws.is_empty());
}

#[test]
fn plaintext_chunker_with_zero_max_returns_single_chunk() {
    // max_chunk_words = 0 is the "no chunking" sentinel; one chunk
    // containing all words.
    let sections = parse_plaintext_sections("a b c d e", 0);
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0].content, "a b c d e");
}

#[test]
fn chunk_content_zero_max_returns_full_input() {
    let chunks = chunk_content("a b c d e", 0);
    assert_eq!(chunks, vec!["a b c d e".to_string()]);
}

#[test]
fn chunk_content_short_input_returns_single_chunk() {
    let chunks = chunk_content("a b c", 10);
    assert_eq!(chunks, vec!["a b c".to_string()]);
}

#[test]
fn chunk_content_long_input_splits() {
    let words: Vec<String> = (0..20).map(|i| format!("w{i}")).collect();
    let text = words.join(" ");
    let chunks = chunk_content(&text, 5);
    // 20 words / 5-per-chunk = 4 chunks.
    assert_eq!(chunks.len(), 4);
    assert_eq!(chunks[0], "w0 w1 w2 w3 w4");
    assert_eq!(chunks[3], "w15 w16 w17 w18 w19");
}

#[test]
fn cross_reference_detector_finds_3_word_title_mentions() {
    // Pinned from the in-core test_cross_reference_detection
    // (ogdb-core lib.rs:41184-41216) which is migrated in this plan.
    let sections = vec![
        ParsedSection {
            title: "Introduction".to_string(),
            level: 1,
            content: "This paper discusses graph algorithms.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "Graph Algorithms Overview".to_string(),
            level: 2,
            content: "Various algorithms exist.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "Results and Discussion".to_string(),
            level: 2,
            content: "As described in Graph Algorithms Overview, the results show improvement.".to_string(),
            page_start: None,
            page_end: None,
        },
    ];
    let refs = detect_cross_references(&sections);
    // (2, 1) — section[2].content contains section[1].title (3 words ≥ 3).
    assert!(
        refs.contains(&(2, 1)),
        "Should detect cross-reference from index 2 → index 1; got: {refs:?}"
    );
}

#[test]
fn cross_reference_detector_skips_short_titles() {
    // 1-word and 2-word titles should not produce false-positive refs
    // (heuristic: title must have ≥ 3 whitespace-delimited words).
    let sections = vec![
        ParsedSection {
            title: "Intro".to_string(), // 1 word
            level: 1,
            content: "We mention Intro a lot.".to_string(),
            page_start: None,
            page_end: None,
        },
        ParsedSection {
            title: "The End".to_string(), // 2 words
            level: 2,
            content: "We mention The End frequently.".to_string(),
            page_start: None,
            page_end: None,
        },
    ];
    let refs = detect_cross_references(&sections);
    assert!(refs.is_empty(), "short titles must not generate refs; got: {refs:?}");
}
```

Running today (RED):
```
$ cargo test -p ogdb-import --tests
error[E0432]: unresolved import `ogdb_import::DocumentFormat`
  --> crates/ogdb-import/tests/api_smoke.rs:18:5
   |
18 |     chunk_content, detect_cross_references, parse_plaintext_sections,
   |     ...
```

Running after Phase 5 (GREEN): all 14 tests PASS.

### 8.2 `crates/ogdb-core/tests/ogdb_import_reexport_shim.rs`

This is the **backward-compat guarantee** that no in-core call site
breaks. It asserts `ogdb_core::DocumentFormat`, `ogdb_core::IngestConfig`,
and `ogdb_core::IngestResult` are still nameable from the
`ogdb_core::` root, that their variants/fields round-trip, and that
their `TypeId` matches the `ogdb_import` originals. It also exercises
the un-gated pure helpers via `ogdb_import::` to pin their callable
paths from a non-`document-ingest` build.

```rust
//! Shim regression: `ogdb_core::DocumentFormat`,
//! `ogdb_core::IngestConfig`, and `ogdb_core::IngestResult` must
//! remain nameable from the `ogdb_core::` root after the Phase-4
//! import split.
//!
//! Four downstream files import these types today:
//!   * `ogdb-cli/src/lib.rs:3-4`
//!   * `ogdb-bench/benches/rag_benchmark.rs:2`
//!   * `ogdb-bench/tests/rag_accuracy.rs:1`
//! and 9 in-core integration tests at @41020-41250 construct them.
//! A silent parallel definition in ogdb-core would corrupt
//! `serde_json`-emitted DocumentFormat strings (ogdb-cli surfaces
//! these via JSON output) and break pattern matching inside
//! `Database::ingest_document` body @22149-22161. Pin the re-export
//! identity here.
//!
//! RED state (this commit): fails to compile because ogdb-core does
//! not yet depend on ogdb-import (`unresolved import ogdb_import`),
//! and `ogdb_core::DocumentFormat` etc. are still the in-core
//! originals — so the TypeId equality below would spuriously hold
//! (same type on both sides) if the test compiled, but it does not
//! compile.
//!
//! GREEN state (Phase 4): ogdb-core re-exports via
//! `pub use ogdb_import::{DocumentFormat, IngestConfig, IngestResult};`
//! and the TypeId equalities below hold because both sides resolve
//! to the single definitions in ogdb-import.

use std::any::TypeId;

#[test]
fn document_format_is_reexported_from_ogdb_import() {
    let _pdf = ogdb_core::DocumentFormat::Pdf;
    let _md = ogdb_core::DocumentFormat::Markdown;
    let _txt = ogdb_core::DocumentFormat::PlainText;

    assert_eq!(
        TypeId::of::<ogdb_core::DocumentFormat>(),
        TypeId::of::<ogdb_import::DocumentFormat>(),
        "ogdb_core::DocumentFormat must be a `pub use` re-export of \
         ogdb_import::DocumentFormat, not a duplicate type. See \
         .planning/ogdb-core-split-import/PLAN.md §7.",
    );
}

#[test]
fn ingest_config_is_reexported_from_ogdb_import() {
    assert_eq!(
        TypeId::of::<ogdb_core::IngestConfig>(),
        TypeId::of::<ogdb_import::IngestConfig>(),
        "ogdb_core::IngestConfig must be a `pub use` re-export of \
         ogdb_import::IngestConfig, not a duplicate type.",
    );

    // Construct via the ogdb-core re-export — proves field layout +
    // Default impl survive the re-export. Pinned to the literal value
    // used in ogdb-bench/tests/rag_accuracy.rs:54-59.
    let cfg = ogdb_core::IngestConfig {
        title: "Pinned".to_string(),
        format: ogdb_core::DocumentFormat::Markdown,
        ..ogdb_core::IngestConfig::default()
    };
    assert_eq!(cfg.title, "Pinned");
    assert_eq!(cfg.format, ogdb_core::DocumentFormat::Markdown);
    assert_eq!(cfg.max_chunk_words, 512);
}

#[test]
fn ingest_result_is_reexported_from_ogdb_import() {
    assert_eq!(
        TypeId::of::<ogdb_core::IngestResult>(),
        TypeId::of::<ogdb_import::IngestResult>(),
        "ogdb_core::IngestResult must be a `pub use` re-export of \
         ogdb_import::IngestResult, not a duplicate type.",
    );

    let r = ogdb_core::IngestResult {
        document_node_id: 99,
        section_count: 4,
        content_count: 16,
        reference_count: 1,
        text_indexed: true,
        vector_indexed: false,
    };
    assert_eq!(r.document_node_id, 99);
    assert_eq!(r.section_count, 4);
}

#[test]
fn cross_shim_equality_via_construction() {
    // Construct via the ogdb-core re-export, compare against a value
    // constructed via ogdb-import directly — proves the shim is a
    // pure re-export, not a parallel copy. Pattern matching is the
    // load-bearing path inside Database::ingest_document body
    // @22149-22161.
    let via_core = ogdb_core::DocumentFormat::Markdown;
    let via_import = ogdb_import::DocumentFormat::Markdown;
    assert_eq!(via_core, via_import);

    let via_import_to_core: ogdb_core::DocumentFormat = via_import;
    assert_eq!(via_import_to_core, via_core);
}

#[test]
fn ogdb_import_helpers_are_callable_via_ogdb_import_root() {
    // Regression pin: the 3 always-on pure helpers must be directly
    // callable from `ogdb_import::` — Database::ingest_document body
    // (refactored in Phase 4 to import them privately) depends on
    // these paths via `use ogdb_import::{parse_plaintext_sections,
    // chunk_content, detect_cross_references, ...};`.
    //
    // We assert the callable paths here (not just type identities)
    // because free fns cannot be compared via TypeId.
    let sections = ogdb_import::parse_plaintext_sections("hello world", 100);
    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0].title, "Chunk 1");

    let chunks = ogdb_import::chunk_content("a b c d", 2);
    assert_eq!(chunks.len(), 2);

    let refs = ogdb_import::detect_cross_references(&sections);
    assert!(refs.is_empty(), "single-section input has no cross-refs");
}

#[test]
fn pattern_match_through_shim_compiles() {
    // The hot path inside Database::ingest_document (@22149-22161)
    // does `match config.format { Pdf => …, Markdown => …, PlainText
    // => … }` against a `DocumentFormat` whose type is referenced via
    // the re-exported in-core path. Prove that pattern matching across
    // the shim still exhausts all three arms.
    fn classify(f: &ogdb_core::DocumentFormat) -> &'static str {
        match f {
            ogdb_core::DocumentFormat::Pdf => "pdf",
            ogdb_core::DocumentFormat::Markdown => "md",
            ogdb_core::DocumentFormat::PlainText => "txt",
        }
    }
    assert_eq!(classify(&ogdb_core::DocumentFormat::Pdf), "pdf");
    assert_eq!(classify(&ogdb_core::DocumentFormat::Markdown), "md");
    assert_eq!(classify(&ogdb_core::DocumentFormat::PlainText), "txt");
}
```

To make these tests usable, `ogdb-core` gains the
`ogdb-import = { path = "../ogdb-import" }` dependency in Phase 4.

In RED the test file lives in `crates/ogdb-core/tests/` but **does
not compile** because `use ogdb_import` is unresolved — `ogdb-core`
does not yet depend on `ogdb-import`. That is the expected RED
signal:

```
$ cargo test -p ogdb-core --test ogdb_import_reexport_shim
error[E0432]: unresolved import `ogdb_import`
error[E0433]: failed to resolve: could not find `parse_plaintext_sections`
               in `ogdb_import`
```

Running after Phase 5 (GREEN): all 6 tests PASS.

## 9. Implementation sketch for Phases 3–5 (GREEN)

> **Do not execute these in RED.** This section is the recipe the
> executor follows in the next commit.

### Phase 3 — populate the new crate

1. `crates/ogdb-import/Cargo.toml` — the §7.3 stub with `[features]`
   block + 3 deps.
2. `crates/ogdb-import/src/lib.rs`:
   - Add the 4 plain-data items verbatim from `ogdb-core/src/lib.rs`
     line ranges in §6.3 (`DocumentFormat`, `IngestConfig`,
     `impl Default for IngestConfig`, `IngestResult`, `ParsedSection`
     — note `ParsedSection` becomes `pub struct` with `pub` fields).
   - Add the 5 parser/chunker fns verbatim, with these adaptations:
     - `parse_pdf_sections` and `parse_markdown_sections`: change
       return type from `Result<Vec<ParsedSection>, DbError>` to
       `Result<Vec<ParsedSection>, String>`. Replace
       `DbError::InvalidArgument(format!("…"))` constructors with
       bare `format!("…")` strings.
     - `parse_plaintext_sections`, `chunk_content`,
       `detect_cross_references`: drop the
       `#[cfg(feature = "document-ingest")]` gate (these helpers use
       only stdlib and are always-on in the new crate).
     - `parse_pdf_sections` and `parse_markdown_sections`: keep
       `#[cfg(feature = "document-ingest")]` (their `lopdf` /
       `pulldown_cmark` imports require the feature).
   - Add a `#[cfg(test)] mod tests { … }` block covering:
     - The migrated `test_cross_reference_detection` (verbatim from
       `ogdb-core/src/lib.rs:41184-41216`, with `ParsedSection`
       constructed via the now-`pub` fields).
     - The same surface as `tests/api_smoke.rs` (RED file 8.1) so
       `cargo test -p ogdb-import --lib` exercises the pure logic in
       isolation.
3. Add `"crates/ogdb-import",` to root `Cargo.toml` `[workspace]
   members` list.

### Phase 4 — switch `ogdb-core` to the shim

1. In `crates/ogdb-core/Cargo.toml`:
   - Add `ogdb-import = { path = "../ogdb-import", default-features = false }`
     under `[dependencies]` (alphabetically, after `ogdb-temporal`).
   - **Delete** `lopdf = { version = "0.34", optional = true }` (line 25).
   - **Delete** `pulldown-cmark = { version = "0.13", optional = true }`
     (line 26).
   - **Replace** `document-ingest = ["dep:lopdf", "dep:pulldown-cmark"]`
     (line 11) with `document-ingest = ["ogdb-import/document-ingest"]`.
2. In `crates/ogdb-core/src/lib.rs`:
   - **Delete** the 5 type/impl definitions:
     - `pub enum DocumentFormat` @1438-1444 (with surrounding `///`
       doc + `#[derive]`).
     - `pub struct IngestConfig` @1446-1462.
     - `impl Default for IngestConfig` @1464-1475.
     - `pub struct IngestResult` @1477-1492.
     - `struct ParsedSection` @1521-1529.
   - **Delete** the 5 parser fns @11651-11878 (the 3 always-on +
     2 `cfg`-gated, plus the `// ─── Document ingestion helpers ───`
     comment banner).
   - **Add** the 2-block import set from §7.1 right after the
     existing `pub use ogdb_temporal::{TemporalFilter, TemporalScope};`
     line.
   - **Refactor** `Database::ingest_document` body to adapt the 2
     `Result<_, DbError>` → `Result<_, String>` parser returns:
     - Line 22150 `parse_pdf_sections(data)?` becomes
       `parse_pdf_sections(data).map_err(DbError::InvalidArgument)?`.
     - Line 22154 `parse_markdown_sections(text)?` becomes
       `parse_markdown_sections(text).map_err(DbError::InvalidArgument)?`.
     - All other call sites (`parse_plaintext_sections`,
       `chunk_content`, `detect_cross_references`) unchanged — they
       did not return `Result<_, DbError>` even before the move.
   - **Move** `test_cross_reference_detection` (@41184-41216) — delete
     the test from `ogdb-core/src/lib.rs`. Its replacement lives in
     `ogdb-import/src/lib.rs` `#[cfg(test)] mod tests`.
   - Verify no in-file reference uses `crate::DocumentFormat` /
     `crate::IngestConfig` / `crate::IngestResult` / `crate::ParsedSection`
     (grep confirms current callers use the unqualified name only —
     both the `pub use` and the `use` cover them).
3. **Do not** touch any downstream crate.

### Phase 5 — run per-crate tests (never `--workspace`)

```bash
# New crate — the api_smoke.rs test + lib.rs unit tests, in both
# default-features and no-default-features modes.
cargo test -p ogdb-import --tests
cargo test -p ogdb-import --lib
cargo test -p ogdb-import --tests --no-default-features
cargo test -p ogdb-import --lib --no-default-features

# Core — the shim regression test + every existing ogdb-core test,
# in both default-features and no-default-features modes (the latter
# because the document-ingest feature is now a passthrough).
cargo test -p ogdb-core --test ogdb_import_reexport_shim
cargo test -p ogdb-core --tests              # the big integration test suite
cargo test -p ogdb-core --lib                # unit tests inside lib.rs mod tests
cargo test -p ogdb-core --no-default-features --tests
cargo test -p ogdb-core --no-default-features --lib

# Every downstream crate must still build + its tests must still pass.
# Run individually; NEVER --workspace.
for crate in ogdb-cli ogdb-ffi ogdb-python ogdb-bolt ogdb-eval \
             ogdb-bench ogdb-node ogdb-e2e ogdb-tck ogdb-fuzz \
             ogdb-vector ogdb-algorithms ogdb-text ogdb-temporal; do
  cargo build -p "$crate"
  cargo test  -p "$crate" --tests || true   # some crates have no tests
done
```

No edits to any downstream `Cargo.toml` or `src/` file are expected.
If any `cargo build -p <crate>` fails, the shim is wrong — revert
the `pub use` line and investigate; do **not** paper over with
downstream edits in this plan.

### Phases 6–8 — docs + changelog + implementation log

- `docs/IMPLEMENTATION-LOG.md`: append a `[ogdb-core-split-import]`
  section describing the plain-data + 5-helpers extraction, the shim
  strategy, the dep migration (lopdf + pulldown-cmark from ogdb-core
  to ogdb-import under feature passthrough), and a reference to this
  PLAN.md.
- `CHANGELOG.md` under `## [Unreleased]`:
  - `### Added` — "New `ogdb-import` crate exposes `DocumentFormat`,
    `IngestConfig`, `IngestResult`, `ParsedSection`,
    `parse_pdf_sections`, `parse_markdown_sections`,
    `parse_plaintext_sections`, `chunk_content`, and
    `detect_cross_references`."
  - `### Changed` — "`ogdb-core` re-exports the document-ingest
    plain-data types from `ogdb-import` via `pub use`; public surface
    unchanged. `Database::ingest_document` delegates the pure
    parsing/chunking/cross-ref helpers to `ogdb-import`. The `lopdf`
    and `pulldown-cmark` optional dependencies migrate from
    `ogdb-core` to `ogdb-import`; `ogdb-core/document-ingest` is now a
    passthrough to `ogdb-import/document-ingest`."
- `ARCHITECTURE.md` §13: no change — the tiers hold.
- Append to `.github/workflows/release-tests.yaml` a manifest entry
  `ogdb-import-primitive-split` referencing this plan (matches the
  pattern of the prior four plans).

## 10. Out-of-scope (explicitly deferred to later plans)

- Moving `Database::ingest_document` (~185 LOC). Calls 6 Database
  mutating methods + the WAL undo log. Requires an
  `IngestableDatabase` trait abstracting `create_node_with`,
  `add_typed_edge`, `create_fulltext_index`, `create_vector_index`,
  `rebuild_vector_indexes_from_catalog`, `node_count`. Follow-up:
  `plan/ogdb-core-split-import-runtime`.
- Moving the 9 `Database::ingest_document` integration tests at
  @41018-41270 (excluding the migrated
  `test_cross_reference_detection`). Each constructs a `Database` and
  calls `db.ingest_document`. Stays with `Database::ingest_document`
  in the runtime follow-up.
- Moving `ExportNode` / `ExportEdge` (~15 LOC each). Both embed
  `PropertyMap`. Follow-up: `plan/ogdb-core-split-export-runtime`,
  blocked on `PropertyValue` extraction (foundational split, not yet
  scheduled).
- Moving `Database::export_nodes` / `Database::export_edges` (the
  Database-coupled export entry points). Follow-up.
- Moving `parse_wasm_labels_json` / `parse_wasm_properties_json` /
  `json_value_to_property_value` / `property_value_to_json` (the
  WASM-bridge JSON helpers). Tied to `PropertyMap` / `PropertyValue`.
  Out of scope for `ogdb-import`; belongs in the wasm-bindings cohort
  or a future `ogdb-types` crate.
- Migrating CSV / JSON / RDF importers (those live in `ogdb-cli/src/lib.rs`,
  not `ogdb-core`). Future plan can extract `JsonNodeRecord` /
  `JsonEdgeRecord` (currently private to `ogdb-cli` at @5836-5854)
  into a shared `ogdb-io-types` crate alongside `ogdb-import`, but
  those moves are CLI-side, not core-side. Out of scope here.
- Moving `RagResult`, `EnrichedRagResult`, `RetrievalSignal`,
  `RrfConfig`, `CommunitySummary`, `CommunityMember`,
  `CommunityHierarchy`, `DrillResult`, `Episode`, `NodeSummary`.
  These belong in a future `ogdb-rag` crate per DESIGN.md.
- Adding `Default` derive on `DocumentFormat` (no consumer needs it).
- Adding `Hash` / `Ord` derives on `DocumentFormat` (no consumer needs
  them).
- The other 2 planned crates (`ogdb-export`, `ogdb-query`). Each gets
  its own `.planning/` plan and its own `plan/ogdb-core-split-<facet>`
  branch.
- **Any** `cargo build --workspace` or `cargo test --workspace`
  invocation. AGENTS contract + user directive: per-crate only.

## 11. Commit plan

| Phase | Commit subject                                                                       | Scope                                                                           |
|------:|---------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| 2     | `plan(ogdb-core-split-import): PLAN.md + RED-phase failing tests`                      | this commit                                                                    |
| 3     | `chore(ogdb-core-split-import): add ogdb-import crate skeleton`                        | populated `lib.rs` with 4 types + 5 fns + impl Default + unit tests; root Cargo.toml members |
| 4     | `refactor(ogdb-core-split-import): replace in-core document-ingest helpers with pub-use shim` | delete 4 type defs + 5 fns + 1 helper test from `ogdb-core/src/lib.rs`; add `pub use` shim + private `use`; wire dep; migrate `lopdf` + `pulldown-cmark` to `ogdb-import`; refactor 2 call sites with `.map_err(DbError::InvalidArgument)` |
| 5     | `test(ogdb-core-split-import): per-crate green under shim`                             | run the per-crate matrix from §9 Phase 5 (incl. `--no-default-features`) and record results |
| 6     | `docs(ogdb-core-split-import): CHANGELOG + IMPLEMENTATION-LOG + ARCH note`             | docs only                                                                       |
| 7     | `chore(release-tests): append ogdb-import-primitive-split manifest entry`              | release-tests yaml only                                                         |

A follow-up plan `plan/ogdb-core-split-import-runtime` will pick up
where this leaves off (moving `Database::ingest_document` + its 9
integration tests once the `IngestableDatabase` trait contract from
`plan/ogdb-core-split-algorithms-traversal` is settled, or designed
fresh from the helper migration alongside).

## 12. Risk register

| Risk                                                                       | Likelihood | Mitigation                                                                                                                                                                                              |
|----------------------------------------------------------------------------|:----------:|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `IngestConfig`'s `embed_fn: Option<Box<dyn Fn(...) + Send + Sync>>` field rejects re-export across crate boundary | Very low | `Box<dyn Fn(...)>` is purely stdlib type machinery; the field type is identical regardless of which crate owns the struct. RED test §8.1 `ingest_config_accepts_embedding_closure` pins this end-to-end. |
| `serde` derive on `DocumentFormat` / `IngestResult` produces a different on-wire format after the move | Very low | `serde` derives are emitted into the type's owning crate. `pub use` makes both names point at the same impl. RED test §8.1 `document_format_serde_roundtrip` pins JSON byte format pre/post. |
| `lopdf` / `pulldown-cmark` feature flag wiring breaks `--no-default-features` builds | Low      | Phase 5 adds `--no-default-features` to the per-crate test matrix for both `ogdb-import` and `ogdb-core`. Failure on no-default surfaces immediately, before merge. |
| `Database::ingest_document` body's call sites resolve to the wrong function (e.g., a `crate::parse_pdf_sections` left over) | Low      | Phase 4 step 2 explicitly says "delete the 5 parser fns". Phase 5's `cargo build -p ogdb-core` would fail with "function `parse_pdf_sections` is private" or duplicate-defn errors if any leftover. |
| `ParsedSection` field-visibility change breaks an in-core consumer        | Very low | Today only `Database::ingest_document` body and `test_cross_reference_detection` consume `ParsedSection`. Both are in this plan's surveyed set. The migration makes fields `pub` — strictly more permissive. |
| `test_cross_reference_detection` migration causes a coverage gap in the in-core test suite | Very low | The migrated test exercises the same fn (`detect_cross_references`) at the new home (`ogdb-import/src/lib.rs` mod tests). Total coverage is preserved; coverage just moves with the code. |
| Renaming `parse_pdf_sections` etc. to `pub fn` widens public API beyond intended | Low      | New surface is documented in CHANGELOG.md (`### Added`). The widening is intentional — the helpers are valuable to other consumers (future `ogdb-cli` document-ingest paths, eval harnesses). |
| `Cargo.lock` resolution differs after dep migration                       | Very low | `lopdf` and `pulldown-cmark` are pinned at the same versions in both old (ogdb-core) and new (ogdb-import) Cargo.toml. `cargo update` is not run; lock entries simply re-target. |

## 13. Acceptance criteria for this RED commit

- [ ] `crates/ogdb-import/Cargo.toml` exists with the §7.3 stub
      content (no implementation in `src/lib.rs` yet — the file is
      either empty `//! RED` or contains only the doc comment).
- [ ] `crates/ogdb-import/src/lib.rs` exists; its body is a one-line
      `//! RED — populated in Phase 3.` doc comment (no items defined).
- [ ] `crates/ogdb-import/tests/api_smoke.rs` contains the §8.1 file
      verbatim (14 tests).
- [ ] `crates/ogdb-core/tests/ogdb_import_reexport_shim.rs` contains
      the §8.2 file verbatim (6 tests).
- [ ] Root `Cargo.toml` `[workspace] members` list includes
      `"crates/ogdb-import"`.
- [ ] No edits to `crates/ogdb-core/Cargo.toml` (the dep migration
      happens in Phase 4 GREEN).
- [ ] No edits to `crates/ogdb-core/src/lib.rs` (the type/fn moves
      happen in Phase 4 GREEN).
- [ ] No edits to any downstream crate.
- [ ] `cargo test -p ogdb-import --tests` fails to compile with
      `unresolved import ogdb_import::*` (expected RED signal).
- [ ] `cargo test -p ogdb-core --test ogdb_import_reexport_shim`
      fails to compile with `unresolved import ogdb_import` (expected
      RED signal).
- [ ] All other `cargo test -p <crate>` invocations remain unchanged.
- [ ] Single commit with subject
      `plan(ogdb-core-split-import): PLAN.md + RED-phase failing tests`
      on branch `plan/ogdb-core-split-import`.
