# Phase 5: Independent Extensions - Research

**Researched:** 2026-02-27
**Domain:** Temporal graph compaction + SHACL shape validation
**Confidence:** HIGH (temporal), MEDIUM (SHACL library choice)

---

## Summary

Phase 5 has two independent features with no shared dependencies between them: temporal version compaction (TEMP-01) and SHACL shape validation (RDF-01). Both are new-feature additions; neither is a bugfix.

For TEMP-01, the codebase already has extensive temporal infrastructure: `valid_from`/`valid_to` on edges, `AT TIME`/`AT SYSTEM TIME` Cypher parsing and execution, MVCC version chains (`node_property_versions`, `node_label_versions`, `edge_property_versions`) with a working `gc_version_chain` GC at checkpoint time. What is missing is a distinct, user-visible "temporal versioning" model for *nodes* that records explicit time-stamped snapshots and then compacts superseded ones via background compaction. The success criterion says "1000 versioned updates to the same node" — these must be stored as separate on-disk/in-memory version entries per node, and "running compaction reduces on-disk version count" means an explicit compaction API must exist. The existing MVCC GC (`gc_version_chain`) is transaction-level housekeeping, not temporal version compaction.

For RDF-01, no SHACL code exists anywhere in the codebase. Oxigraph does not support SHACL (GitHub issue open since 2020). The primary Rust options are the `shacl_validation` crate (part of the rudof project) or a hand-rolled subset of SHACL Core. Given that success only requires detecting missing required properties (`sh:minCount`) and reporting violations, a targeted in-house implementation using `oxrdfio` to parse shapes files is the lowest-risk approach and avoids a heavy dependency. Both plans implement in the existing `ogdb-core` and `ogdb-cli` crates — no new crates are needed.

**Primary recommendation:** Implement TEMP-01 as a named-snapshot temporal model on top of the existing MVCC version chain infrastructure, reusing `BackgroundCompactor` for scheduling. Implement RDF-01 as a focused SHACL Core subset parser + validator in `ogdb-cli`, using `oxrdfio` (already a dependency) to read the shapes TTL, without adding any new Rust crate dependency.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEMP-01 | Temporal graph supports append-only versioning with background compaction of superseded versions | Existing `VersionedValue` chain + `BackgroundCompactor` + `gc_version_chain` provide the building blocks; need explicit per-node temporal version API + compaction that reduces `node_property_versions` length |
| RDF-01 | Engine validates graph data against SHACL shape constraints and reports violations | `oxrdfio` already in `ogdb-cli`; parse shapes as TTL quads; validate nodes against `sh:targetClass` + `sh:minCount`; report violations as structured output |
</phase_requirements>

---

## Existing Codebase State (Critical Context)

This section documents what exists so the planner does not duplicate or contradict it.

### Temporal Infrastructure (already done)

| Component | Location | Status |
|-----------|----------|--------|
| `valid_from` / `valid_to` on edges | `Database.meta` (`MetaStore`) | DONE — stored as `Vec<Option<i64>>`, persisted in `PersistedMetaStore` |
| `transaction_time_millis` on edges | `Database.meta` | DONE — system-managed via `current_unix_millis()` |
| `AT TIME` / `AT SYSTEM TIME` parsing | `ogdb-core` parser | DONE — produces `TemporalFilter { scope, timestamp_millis }` |
| Temporal filter pushdown into edge expansion | `ogdb-core` executor | DONE — `edge_matches_temporal_filter()` checks `valid_from`/`valid_to` |
| MVCC version chains | `Database.node_property_versions`, `node_label_versions` | DONE — `Vec<Vec<VersionedValue<T>>>` per node |
| `gc_version_chain` MVCC GC | `Database::gc_versions()` called at `checkpoint()` | DONE — prunes old MVCC txn versions, not temporal versions |
| `BackgroundCompactor` | `SharedDatabase.compactor` | DONE — thread-based background worker with request/wait semantics |
| `compact_now()` public API | `SharedDatabase::compact_now()` | DONE — merges CSR delta buffers |
| `temporal_diff` MCP tool | `ogdb-cli` | DONE — compares edge counts at two timestamps |
| Bi-temporal model defined | DESIGN.md §19 | Design only; node temporal version chain not yet implemented |

### What TEMP-01 Needs to Add

The DESIGN.md §19 describes a version chain per entity where each node has `valid_from`, `valid_to`, and `txn_created` temporal fields per version. This model is NOT yet implemented for nodes. The existing `node_property_versions` is MVCC (transaction visibility), not a user-controlled temporal history with explicit `valid_from`/`valid_to` per property snapshot.

TEMP-01 requires:
1. A mechanism for the user to create an explicit temporal snapshot of a node's properties at a given `valid_from` timestamp.
2. A per-node temporal version chain (separate from MVCC chains) that grows with each versioned update.
3. A `compact_temporal_versions()` API that removes versions that cannot contribute to any `AT TIME` query result (i.e., superseded versions where `valid_to` <= the compaction floor timestamp), while preserving correctness of all time-travel queries.
4. Background scheduling of this compaction via the existing `BackgroundCompactor` or a new dedicated temporal compactor.
5. A test asserting that after 1000 versioned updates, compaction reduces the stored version count while all `AT TIME` queries return unchanged results.

The existing `node_property_versions` already stores `VersionedValue<PropertyMap>` per txn. The temporal model needs a parallel `node_temporal_versions: Vec<Vec<TemporalVersion>>` where `TemporalVersion` holds `valid_from: i64`, `valid_to: Option<i64>`, and `properties: PropertyMap`. This is conceptually separate from MVCC because temporal snapshots are user-visible history, not transaction isolation.

### RDF Infrastructure (already done)

| Component | Location | Status |
|-----------|----------|--------|
| `oxrdfio` crate dependency | `ogdb-cli/Cargo.toml` | DONE — `oxrdfio = "0.2.3"`, `oxrdf = "0.3.3"` |
| RDF quad parsing | `ogdb-cli::parse_rdf_into_plan()` | DONE — streams quads from TTL/NT/XML/JSON-LD/NQ |
| `rdf:type` → label conversion | `ogdb-cli::process_rdf_quad()` | DONE |
| `import-rdf` CLI command | `Commands::ImportRdf` | DONE |
| SHACL validation | anywhere | NOT PRESENT — zero SHACL code in codebase |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `oxrdf` | 0.3.3 (already in use) | RDF term types for SHACL shape parsing | Already a dependency; provides `NamedNode`, `Literal`, `Term` |
| `oxrdfio` | 0.2.3 (already in use) | Parse SHACL shapes TTL file | Already a dependency; streaming quad parser |
| (no new crate for TEMP-01) | — | Temporal compaction uses existing `VersionedValue` and `BackgroundCompactor` | Zero new dependencies |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shacl_validation` (rudof) | 0.2.2 | Full SHACL Core processor | Only if hand-rolled subset proves inadequate; adds heavy dependency tree |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled SHACL subset | `shacl_validation` (rudof) | rudof is 0.2.x, poorly documented (7.72% coverage), and brings in a large dependency tree. Since success criterion only requires `sh:minCount` detection, hand-rolling via `oxrdfio` is safer and keeps binary size small |
| Hand-rolled SHACL subset | oxigraph's SHACL | Oxigraph does not implement SHACL (GitHub issue open since 2020, milestone "after 1.0") |
| New `ogdb-temporal` crate | In-place in `ogdb-core` | DESIGN.md planned a separate crate but the workspace has consolidated everything into `ogdb-core` and `ogdb-cli`; adding a crate would break the established pattern |

**Installation (no changes needed — oxrdf and oxrdfio already present):**
```toml
# ogdb-cli/Cargo.toml already has:
oxrdf = "0.3.3"
oxrdfio = "0.2.3"
```

---

## Architecture Patterns

### Pattern 1: Temporal Versioning Model (TEMP-01)

**What:** Extend `Database` with a per-node temporal version chain: `node_temporal_versions: Vec<Vec<TemporalNodeVersion>>`. Each `TemporalNodeVersion` holds an explicit `valid_from: i64`, `valid_to: Option<i64>`, and `properties: PropertyMap`. The user adds a new temporal version by calling `db.add_node_temporal_version(node_id, valid_from, properties)`.

**When to use:** When the user wants to record that a node had a particular set of properties during a time interval, not just at the current transaction time.

**Relationship to existing MVCC:** The temporal version chain is user-controlled history. The MVCC version chain (`node_property_versions`) is transaction isolation. They are separate. The temporal chain is what the success criterion refers to as "on-disk version count".

**Compaction rule:** A temporal version is superseded if a newer version has a `valid_from` that makes the older one unreachable by any `AT TIME T` query. Specifically: version `v` is safe to remove if it has a `valid_to` that is not `None` and `valid_to <= compaction_floor`. The compaction floor should be configurable but can default to "remove versions older than the oldest active temporal query timestamp" or "remove all but the last version plus one per unique time window."

**Correctness invariant:** After compaction, `AT TIME T` for any `T` that was answerable before compaction must return the same result.

**Code structure (recommended):**
```rust
// In ogdb-core/src/lib.rs (or a new temporal module)

#[derive(Debug, Clone)]
pub struct TemporalNodeVersion {
    pub valid_from: i64,      // unix millis
    pub valid_to: Option<i64>, // None means open/current
    pub properties: PropertyMap,
}

// Added to Database struct:
// node_temporal_versions: Vec<Vec<TemporalNodeVersion>>,

impl Database {
    pub fn add_node_temporal_version(
        &mut self,
        node_id: u64,
        valid_from: i64,
        properties: PropertyMap,
    ) -> Result<(), DbError> {
        // Close the previous version's valid_to = valid_from
        // Append new TemporalNodeVersion { valid_from, valid_to: None, properties }
        // Persist to meta store
    }

    pub fn node_temporal_version_count(&self, node_id: u64) -> usize {
        // Returns chain length — used in tests to verify compaction
    }

    pub fn compact_temporal_versions(&mut self, compaction_floor_millis: i64) -> Result<usize, DbError> {
        // Remove all temporal versions where valid_to.is_some() && valid_to <= compaction_floor
        // Return count of versions removed
        // Must preserve AT TIME T correctness for all T >= compaction_floor
    }
}
```

**Background compaction extension (for TEMP-01 "background" requirement):**

Extend `BackgroundCompactor` or create a parallel `TemporalBackgroundCompactor`. The simplest approach is to add temporal compaction to `compact_delta_buffers_and_persist()` so the existing compaction worker also compacts temporal versions. Use a configurable `temporal_compaction_floor_millis` stored in `Database`.

### Pattern 2: AT TIME Query on Node Temporal Versions

**What:** Extend the Cypher execution engine so `MATCH (n) AT TIME T` also filters nodes by their temporal version chain (not just edges). Currently `AT TIME` only filters edges via `valid_from`/`valid_to` metadata.

**Assessment for TEMP-01:** The success criterion says "does not change any AT TIME query result" — this means the existing `AT TIME` on *edges* must still work. If the new temporal versioning is for *nodes*, the `AT TIME` semantics for nodes must be added to the executor. However, this can be scoped: the success criterion can be satisfied by the node temporal version chain API + compaction even without wiring it into the Cypher executor, as long as the test verifies version count before/after compaction and queries the correct version directly via the API.

**Recommendation:** For plan 05-01, implement the core temporal versioning API and compaction. Wire `AT TIME` node filtering into the query executor only if needed for the test harness. Document as a follow-on if out of scope.

### Pattern 3: SHACL Core Subset Parser (RDF-01)

**What:** Parse a SHACL shapes file (TTL format) using `oxrdfio` and extract `NodeShape` constraints. Apply them to the current graph contents. Report violations.

**Scope (success criterion):** Only need to detect "a node is missing a required property" — this maps to `sh:minCount 1` on a `PropertyShape`. The shapes file declares:
- `sh:targetClass <Label>` — which nodes to validate (match by label)
- `sh:property [ sh:path <predicate>; sh:minCount 1 ]` — required property

**No SPARQL needed:** SHACL Core is implementable without SPARQL. The W3C spec states "all SHACL implementations MUST at least implement SHACL Core" and SHACL Core does not require SPARQL.

**Implementation plan:**
```rust
// 1. Parse shapes TTL with oxrdfio into a flat list of ShapeConstraint
#[derive(Debug, Clone)]
struct NodeShapeConstraint {
    target_class: String,    // e.g. "Person"
    required_properties: Vec<String>, // property keys that must exist
}

// 2. Walk graph nodes, match by label, check properties
fn validate_against_shacl(db: &Database, shapes: &[NodeShapeConstraint]) -> Vec<ShacklViolation> {
    // For each NodeShapeConstraint:
    //   for each node with label == target_class:
    //     for each required_property:
    //       if !node.properties.contains_key(required_property):
    //         emit ShacklViolation { node_id, shape, message }
}

#[derive(Debug, Clone)]
struct ShaclViolation {
    node_id: u64,
    shape_target_class: String,
    violated_property: String,
    message: String,
}
```

**CLI surface:**
```bash
ogdb validate-shacl mydb.ogdb shapes.ttl
# Output: violations as JSON or table
# Exit 0 if conformant, exit 1 if violations
```

**MCP surface (optional):** Add a `validate_shacl` tool to the MCP server that accepts `db_path` and `shapes_path` and returns violations as JSON.

### Recommended File Placement

```
crates/ogdb-core/src/lib.rs
  + TemporalNodeVersion struct
  + node_temporal_versions field in Database
  + add_node_temporal_version() method
  + node_temporal_version_count() method (for tests)
  + compact_temporal_versions(floor_millis) method
  + compact_delta_buffers_and_persist() extended to include temporal compaction

crates/ogdb-cli/src/lib.rs
  + NodeShapeConstraint struct (shapes parser)
  + parse_shacl_shapes() function (uses oxrdfio)
  + validate_against_shacl() function
  + ShaclViolation struct
  + Commands::ValidateShacl variant
  + handle_validate_shacl() CLI handler
  + execute_mcp_validate_shacl_tool() (MCP adapter)
```

### Anti-Patterns to Avoid

- **Conflating MVCC versions with temporal versions.** `node_property_versions` is MVCC (transaction isolation). `node_temporal_versions` is user-visible time-travel history. Compacting MVCC versions does not satisfy TEMP-01.
- **Using `gc_version_chain()` as the temporal compactor.** `gc_version_chain` prunes MVCC txn versions above the GC floor. Temporal compaction prunes user-recorded historical snapshots by `valid_to` timestamp. These are semantically different.
- **Adding a new crate.** DESIGN.md mentions `ogdb-temporal` but the actual workspace does not have it. Everything lives in `ogdb-core` and `ogdb-cli`. Adding a new crate disrupts the established pattern and requires workspace plumbing.
- **Adding `shacl_validation`/`rudof` crate dependency.** The crate is at version 0.2.2 with 7.72% documentation coverage. Success only needs `sh:minCount` detection, which is ~50 lines of custom quad-walking code using existing `oxrdfio`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TTL parsing for SHACL shapes | Custom TTL parser | `oxrdfio::RdfParser` | Already a dep; handles all RDF formats and edge cases |
| RDF term comparison for shapes extraction | Custom IRI matching | `oxrdf::NamedNode::as_str()` + `oxrdf::vocab::rdf`, `oxrdf::vocab::rdfs` | Already used throughout `ogdb-cli` |
| Background thread management for compaction | Custom thread pool | Existing `BackgroundCompactor` pattern (thread-per-request + condvar) | Proven pattern already in the codebase |

**Key insight:** For SHACL, the complexity is in parsing the shapes graph, not in the validation logic itself. `oxrdfio` handles all the parsing complexity. The validation loop is straightforward: match nodes by label, check property presence.

---

## Common Pitfalls

### Pitfall 1: Confusing Temporal Compaction with MVCC GC

**What goes wrong:** Developer adds the temporal compaction test but calls `db.checkpoint()` and finds that `node_property_versions[0].len()` drops to 1 — this is the MVCC GC at work, not temporal compaction. The test passes but TEMP-01 is not actually satisfied.

**Why it happens:** `gc_version_chain` and temporal compaction look similar. `checkpoint_reclaims_old_mvcc_versions` test even asserts `.len() == 1` after checkpoint.

**How to avoid:** Keep `node_temporal_versions` strictly separate from `node_property_versions`. The success criterion test must use `node_temporal_version_count()` (the new API), not `node_property_versions[n].len()`.

**Warning signs:** Tests pass but no new `node_temporal_versions` field was added.

### Pitfall 2: AT TIME Query Semantics Break After Compaction

**What goes wrong:** The temporal compactor removes versions that are still needed for some `AT TIME T` queries. A query for `AT TIME T` returns different results after compaction.

**Why it happens:** Incorrect compaction floor calculation. If the floor is set too aggressively (e.g., "remove all versions older than 1 hour"), queries for `AT TIME 2025-01-01` may fail.

**How to avoid:** The compaction floor must be explicitly passed by the caller (not auto-computed). The floor means "it is safe to remove any version whose `valid_to <= floor`". Any version with `valid_to > floor` or `valid_to == None` must be kept. The test must verify AT TIME queries before and after compaction.

**Warning signs:** AT TIME query returns empty result after compaction for a valid timestamp.

### Pitfall 3: SHACL sh:targetClass Requires URI vs Label Matching

**What goes wrong:** The SHACL shapes file uses `sh:targetClass schema:Person` (a URI), but the property graph stores labels as bare strings (`"Person"`). The validator fails to match any nodes.

**Why it happens:** In RDF, `schema:Person` expands to `http://schema.org/Person`. The `_uri` property of nodes stores the full URI, but the label is just the local name (`"Person"`).

**How to avoid:** When parsing `sh:targetClass`, extract the local name from the IRI (`Person` from `http://schema.org/Person`) and match against the graph's label strings. Or accept a `--base-namespace` option that strips the prefix when matching.

**Warning signs:** `validate_against_shacl` reports zero violations even for clearly invalid graphs.

### Pitfall 4: SHACL Property Paths vs Simple Property Keys

**What goes wrong:** The full SHACL spec uses `sh:path` with SPARQL property paths (`sh:path [sh:inversePath ex:name]`). The hand-rolled validator only handles simple `sh:path ex:name` (direct property lookup).

**Why it happens:** The W3C SHACL spec allows complex property paths that require SPARQL evaluation.

**How to avoid:** Scope to simple `sh:path` only (direct predicate IRI). Reject or warn on complex paths. Document the subset in the CLI help text. Success criterion only requires "missing a required property" — simple paths are sufficient.

**Warning signs:** Shapes with inverse/sequence paths silently pass validation when they should fail.

### Pitfall 5: Temporal Version Persistence

**What goes wrong:** `node_temporal_versions` is stored only in memory and lost on restart. After restart, `node_temporal_version_count()` returns 0.

**Why it happens:** Developer adds the in-memory struct but forgets to wire it into the existing `PersistedMetaStore` JSON serialization.

**How to avoid:** Add `node_temporal_versions` to `PersistedMetaStore` (JSON) with `#[serde(default)]`. Include roundtrip test: write temporal versions, checkpoint, reopen, verify version count.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing Pattern: VersionedValue Chain (MVCC)

```rust
// Source: ogdb-core/src/lib.rs line 6817
#[derive(Debug, Clone, PartialEq)]
struct VersionedValue<T> {
    txn_id: u64,
    committed: bool,
    value: T,
}

// Stored in Database as:
node_property_versions: Vec<Vec<VersionedValue<PropertyMap>>>,

// GC at checkpoint (line 16315):
fn gc_version_chain<T: Clone>(chain: &mut Vec<VersionedValue<T>>, gc_floor: u64) {
    // Prunes committed versions below gc_floor, keeping latest below floor
    // and all versions at or above floor
}
```

**For TEMP-01:** Add a parallel temporal chain. The key difference: temporal versions use `valid_from`/`valid_to` (user-supplied timestamps) not `txn_id` (system transaction IDs).

### Existing Pattern: BackgroundCompactor Request

```rust
// Source: ogdb-core/src/lib.rs line 7342
fn request(&self, db: Arc<RwLock<Database>>) -> u64 {
    // Increments requested_generation
    // Spawns worker thread if not running
    // Worker calls run_one_compaction -> compact_delta_buffers_and_persist
}

// In SharedDatabase, temporal compaction can be added to run_one_compaction:
fn run_one_compaction(&self, db: &Arc<RwLock<Database>>) -> Result<(), DbError> {
    loop {
        match db.try_write() {
            Ok(mut guard) => {
                let _ = guard.compact_delta_buffers_and_persist(false)?;
                // ADD: guard.compact_temporal_versions(guard.temporal_compaction_floor)?;
                return Ok(());
            }
            // ...
        }
    }
}
```

### Existing Pattern: RDF Quad Walking for oxrdfio

```rust
// Source: ogdb-cli/src/lib.rs line 5120
fn process_rdf_quad(plan: &mut RdfImportPlan, quad: Quad, schema_only: bool) {
    // quad.subject, quad.predicate, quad.object
    // oxrdf::vocab::rdf::TYPE == rdf:type
    // quad.predicate.as_ref() == NamedNodeRef
}

// For SHACL shapes parsing, walk the same way:
// sh:NodeShape === "http://www.w3.org/ns/shacl#NodeShape"
// sh:targetClass === "http://www.w3.org/ns/shacl#targetClass"
// sh:property === "http://www.w3.org/ns/shacl#property"
// sh:path === "http://www.w3.org/ns/shacl#path"
// sh:minCount === "http://www.w3.org/ns/shacl#minCount"
```

### New Pattern: SHACL Shapes Extraction Sketch

```rust
const SHACL_BASE: &str = "http://www.w3.org/ns/shacl#";
const SHACL_NODE_SHAPE: &str = "http://www.w3.org/ns/shacl#NodeShape";
const SHACL_TARGET_CLASS: &str = "http://www.w3.org/ns/shacl#targetClass";
const SHACL_PROPERTY: &str = "http://www.w3.org/ns/shacl#property";
const SHACL_PATH: &str = "http://www.w3.org/ns/shacl#path";
const SHACL_MIN_COUNT: &str = "http://www.w3.org/ns/shacl#minCount";

struct ShapeAccumulator {
    // blank_node_id -> (target_class, Vec<required_property>)
    shapes: HashMap<String, PartialShape>,
    // blank_node_id -> (path, min_count)
    property_shapes: HashMap<String, PartialPropertyShape>,
}

// Pass 1: collect all quads from shapes TTL
// Pass 2: extract NodeShapes with targetClass + property shapes with minCount >= 1
// Return Vec<NodeShapeConstraint>
```

### New Pattern: Temporal Node Version Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalNodeVersion {
    pub valid_from: i64,          // unix millis, user-supplied
    pub valid_to: Option<i64>,    // None = open (current version)
    pub properties: PropertyMap,
}

// Compaction: remove if valid_to.is_some() && valid_to <= floor
fn compact_temporal_version_chain(
    chain: &mut Vec<TemporalNodeVersion>,
    floor_millis: i64,
) -> usize {
    let before = chain.len();
    chain.retain(|v| v.valid_to.is_none() || v.valid_to.unwrap() > floor_millis);
    before - chain.len()
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full SHACL processor (SPARQL required) | SHACL Core without SPARQL | W3C SHACL Core spec (2017) | Core constraints (minCount, maxCount, datatype) are implementable without SPARQL |
| Storing full node snapshots per version | Delta-based (anchor+delta) as in AeonG | 2024 VLDB paper | More efficient storage; not needed for MVP since success criterion is "reduces version count", not "minimizes delta size" |
| oxigraph for SHACL | Hand-rolled subset via oxrdfio | Oxigraph does not plan SHACL before v1.0 | Must use other approach |

---

## Open Questions

1. **Where does the temporal compaction floor come from?**
   - What we know: the success criterion says "running compaction" — implying a user-triggered call, not automatic.
   - What's unclear: does the caller pass an explicit timestamp, or does the system derive it from some high-water mark?
   - Recommendation: expose `db.compact_temporal_versions(floor_millis: i64)` with an explicit floor. In the CLI, add a `compact-temporal --before <ISO-date>` command. The test can pass any floor safely above all inserted `valid_to` values.

2. **Should SHACL validation be a CLI command, an MCP tool, or both?**
   - What we know: the success criterion says "a graph loaded with a SHACL shapes file reports a violation" — this requires a programmatic API but the surface is not specified.
   - What's unclear: CLI vs MCP vs Rust API.
   - Recommendation: implement CLI command first (`validate-shacl`), add as MCP tool in the same plan. This satisfies the criterion and follows the pattern of `import-rdf` / `export-rdf`.

3. **Does TEMP-01 require the temporal node versions to survive a restart (persistence)?**
   - What we know: "append-only versioning with background compaction" — append-only implies persistence is expected; otherwise it's just in-memory.
   - What's unclear: whether the success criterion's test exercises persistence.
   - Recommendation: wire into `PersistedMetaStore` for correctness. The test should close and reopen the database to verify persistence.

4. **Does AT TIME need to filter nodes (not just edges) after TEMP-01?**
   - What we know: the current `AT TIME` implementation filters edges via `valid_from`/`valid_to`. DESIGN.md §19 shows the design intent for node version chains.
   - What's unclear: whether plan 05-01 must also wire node temporal versions into the Cypher executor.
   - Recommendation: add node-level `AT TIME` filtering in plan 05-01 to make the feature actually useful and to support the success criterion test naturally via Cypher queries. Otherwise the temporal compaction feature has no query path to exercise it.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `crates/ogdb-core/src/lib.rs` (33,624 lines) — temporal infrastructure, MVCC version chains, BackgroundCompactor, VersionedValue, gc_version_chain
- Codebase direct read: `crates/ogdb-cli/src/lib.rs` (14,150 lines) — oxrdfio usage, RDF import, CLI commands, no SHACL code
- `ARCHITECTURE.md` — locked decisions; RDF via oxrdfio/Oxigraph family
- `DESIGN.md` §19 — temporal storage design intent
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md` — `PENDING append-only versioning with compaction` (§14), `PENDING SHACL shape validation` (§9)
- W3C SHACL specification (https://www.w3.org/TR/shacl/) — NodeShape, PropertyShape, sh:targetClass, sh:minCount semantics, Core vs SPARQL extension
- GitHub oxigraph/oxigraph issue #55 — confirmed SHACL not implemented, milestone "after 1.0"

### Secondary (MEDIUM confidence)
- AeonG VLDB 2024 paper (https://www.vldb.org/pvldb/vol17/p1515-lu.pdf) — anchor+delta temporal compaction strategy (informative; project uses simpler flat vector approach)
- docs.rs/shacl_validation — rudof crate at v0.2.2, 7.72% documentation coverage; not recommended for use

### Tertiary (LOW confidence — not used in recommendations)
- WebSearch: temporal graph versioning patterns (general background only)

---

## Metadata

**Confidence breakdown:**
- TEMP-01 architecture: HIGH — built directly on top of well-understood existing code
- TEMP-01 compaction semantics: HIGH — invariant is clear from success criterion
- RDF-01 SHACL subset: HIGH — W3C spec defines Core constraints precisely
- RDF-01 library choice: MEDIUM — recommending hand-rolled over rudof; rudof could work but is risky at 0.2.2
- Temporal persistence: MEDIUM — pattern is clear (add to PersistedMetaStore) but persistence logic needs careful testing

**Research date:** 2026-02-27
**Valid until:** 2026-04-27 (stable domain; library versions may drift but core approach remains valid)
