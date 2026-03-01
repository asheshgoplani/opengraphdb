# Phase 3: Operational Capabilities — Research Notes

## Requirement → Existing Code Mapping

### INDX-01: Auto-index creation on frequently queried properties

**Existing infrastructure:**
- `IndexDefinition` struct (ogdb-core line 1134): `{ label: String, property_keys: Vec<String> }`
- `BTreeIndex` (line 7022): `BTreeMap<PropertyValue, Vec<u64>>` for single-column indexes
- `create_index_definition()` (line 14909): Inserts into `meta.index_catalog`, rebuilds materialized indexes, syncs metadata
- `rebuild_property_indexes_from_catalog()` (line 16758): Full rebuild of all materialized indexes from catalog
- `lookup_indexed_nodes_for_filter_scan()` (line 17128): Used during query execution to check if an index covers a filter predicate
- `collect_index_predicates_for_variable()` (line 3274): Extracts property predicates from WHERE clauses
- `PhysicalScanStrategy::PropertyIndexScan` (line 1822): Used when an index is selected during physical planning

**What's missing:**
- No query frequency tracking (no `query_stats`, `access_freq`, or similar)
- No configurable threshold for auto-creation
- No hook point in the query execution path to record property accesses

**Approach:** Add a `query_property_access_counts: HashMap<(String, String), u64>` field to `Database` (keyed by `(label, property_key)`). Increment during query planning when a filter references a label+property. After each query, check if any counts exceed the configurable `auto_index_threshold`. If so, call `create_index_definition()`. Add `auto_index_threshold: Option<u64>` to `Database` (default: 100). Set to `None` to disable.

---

### IMEX-01: All-or-nothing bulk import

**Existing infrastructure:**
- `ImportBatcher` in ogdb-cli (line 4181): Batches records and flushes per `batch_size`
- `WriteTransaction` (ogdb-core line 7731): Full MVCC transaction with undo log
- `begin_write()` / `commit()` / `rollback()` (lines 14594, 7911, 7936): Complete transaction lifecycle
- `UndoLogEntry` (line 7473): `CreateNode`, `CreateEdge`, `SetNodeLabels`, `SetNodeProperties`
- Auto-rollback on `Drop` (line 7942): Uncommitted transactions roll back automatically
- `continue_on_error` flag on `ImportCommand` (line 192): Currently controls per-record skip vs abort
- `handle_import()` (ogdb-cli line 4951): Opens DB, creates batcher, streams records, flushes batches

**What's missing:**
- Current import uses multiple transactions (one per batch). No single-transaction mode.
- No `--atomic` / `--all-or-nothing` flag on the import command.

**Approach:** Add `--atomic` flag to `ImportCommand`. When set, use `batch_size = usize::MAX` so all records accumulate in a single batch, yielding one transaction. On any record failure, the single transaction is rolled back via the existing `Drop` impl. This reuses the existing `ImportBatcher` architecture without new transaction machinery.

---

### CLI-01: Schema migration command (`migrate`)

**Existing infrastructure:**
- CLI uses clap `Subcommand` enum `Commands` (ogdb-cli line 66)
- `SchemaCatalog` (ogdb-core line 1066): `{ labels, edge_types, property_keys }`
- `register_schema_label()` / `register_schema_edge_type()` / `register_schema_property_key()` (lines 14866, 14879, 14892)
- `create_index_definition()` / `drop_index_definition()` (lines 14909, 14918)
- `Database::open()` for loading existing schema
- No existing `migrate` CLI command or migration script parser

**What's missing:**
- Migration script format definition and parser
- `migrate` subcommand in CLI
- Dry-run mode that prints planned changes without applying

**Approach:** Define a line-oriented migration script format with directives like `ADD LABEL Person`, `DROP LABEL Temp`, `ADD EDGE_TYPE KNOWS`, `DROP EDGE_TYPE OLD`, `ADD PROPERTY_KEY email`, `DROP PROPERTY_KEY legacy`, `ADD INDEX ON :Person(name)`, `DROP INDEX ON :Person(name)`. Parse with simple string splitting. In dry-run mode, print each action. In apply mode, execute each action against the Database.

---

### EAPI-01: Stable embedded API

**Existing infrastructure:**
- `Database::query()` (ogdb-core line 11282): `fn query(&mut self, query: &str) -> Result<QueryResult, QueryError>`
- `Database::query_profiled_cypher()` (line 11383): Returns `(QueryResult, QueryProfile)`
- `Database::query_profiled()` (line 11446): Generic profiling wrapper
- `QueryResult` (line 729): `{ columns: Vec<String>, batches: Vec<RecordBatch> }`
- `RecordBatch` (line 714): `{ columns: BTreeMap<String, Vec<PropertyValue>> }`
- `QueryProfile` (line 246): Detailed timing breakdown
- `PropertyValue` enum (line 451): All value types
- `PropertyMap` type alias (line 711): `BTreeMap<String, PropertyValue>`
- `SharedDatabase` (line 8308): Thread-safe wrapper with `read_snapshot()`, `with_write()`, `with_write_transaction()`
- `ReadSnapshot` (line 8097): Read-only snapshot with `query()` method (line 865)

**What's missing:**
- `Database::query()` takes `&mut self`, preventing concurrent reads in embedded mode
- No convenience method like `db.execute()` for write operations that returns affected count
- No `Database::explain()` method for plan inspection
- Some internal types leak through public API (e.g., `QueryError` is a simple struct, not a rich enum)

**Approach:** Add `explain()` method that returns plan text. Add `execute()` convenience method for mutations that returns a write summary. Keep `query()` and `query_profiled_cypher()` as the stable read API surface. Document all public types with doc comments. The `ReadSnapshot::query()` method (line 865) already provides `&self` read-only queries for concurrent access.

---

## Cross-cutting Observations

1. **All four plans modify `crates/ogdb-core/src/lib.rs`** for core logic changes
2. **Plans 03-01, 03-02, 03-03 also modify `crates/ogdb-cli/src/lib.rs`** for CLI changes
3. **Wave 1 (03-01, 03-02) are independent**: auto-index touches query planning; bulk import touches the import pipeline
4. **Wave 2 (03-03, 03-04) are independent**: migrate adds a CLI command; API stabilization adds methods and docs
5. **No new crates needed**: All changes fit within existing ogdb-core and ogdb-cli
