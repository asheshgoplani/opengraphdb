# Requirements: OpenGraphDB

**Defined:** 2026-02-27
**Core Value:** Extremely fast interactive graph traversal from CLI and embedded API with zero operational overhead

## v1 Requirements

Requirements to close all remaining gaps from the implementation checklist and reach architecture-complete status.

### Data Model

- [ ] **DATA-01**: Engine supports `date` property type with Cypher literal parsing, storage serialization, and query comparison
- [ ] **DATA-02**: Engine supports `datetime` property type with timezone handling, Cypher literal parsing, storage serialization, and query comparison
- [x] **DATA-03**: Engine supports `duration` property type with Cypher literal parsing, storage serialization, and arithmetic operations
- [ ] **DATA-04**: Engine supports `list<T>` property type with heterogeneous element storage, Cypher list operations (indexing, slicing, comprehensions), and serialization
- [ ] **DATA-05**: Engine supports `map<string, T>` property type with nested access, Cypher map operations (projection, key access), and serialization

### Query Optimization

- [ ] **QOPT-01**: Query planner selects worst-case optimal join (WCOJ) strategy for multi-way pattern queries when estimated cardinality favors it over binary joins
- [ ] **QOPT-02**: Execution engine supports factorized intermediate result representation to avoid Cartesian explosion on multi-pattern queries

### Indexes

- [ ] **INDX-01**: Engine auto-creates property indexes on columns that exceed a configurable query frequency threshold

### Import/Export

- [ ] **IMEX-01**: Import supports all-or-nothing bulk mode that rolls back entire import on any record failure

### CLI

- [ ] **CLI-01**: `migrate` command applies schema evolution scripts (add/drop labels, edge types, property keys, indexes) with dry-run support

### Temporal

- [ ] **TEMP-01**: Temporal graph supports append-only versioning with background compaction of superseded versions

### RDF

- [ ] **RDF-01**: Engine validates graph data against SHACL shape constraints and reports violations

### Embedded API

- [ ] **EAPI-01**: Rust embedded library exposes full Cypher query execution surface (`db.query()`, `db.query_profiled()`) as stable public API with documented types

### Quality Gates

- [ ] **QUAL-01**: Memory budget validated: 1M nodes + 5M edges uses less than 500MB resident memory
- [ ] **QUAL-02**: Disk budget validated: 1M nodes + 5M edges uses less than 1GB on-disk storage

### Bugfixes (CHANGELOG Unreleased)

- [ ] **BUG-01**: MATCH planning correctly applies inline node-property filters (e.g., `(p:Person {name: 'Alice'})`)
- [ ] **BUG-02**: Projection output names are disambiguated deterministically when duplicates occur (e.g., `a.name`, `c.name` yields `name`, `name_2`)
- [ ] **BUG-03**: `CREATE INDEX ON :Label(property)` works end-to-end through parser, semantic analysis, planning, and execution
- [ ] **BUG-04**: `CALL db.indexes()` and `CALL db.algo.shortestPath(src, dst)` dispatch correctly as built-in procedures
- [ ] **BUG-05**: `CALL db.index.fulltext.queryNodes(...)` supports 1-3 argument forms with default k=10 and fallback property-scan
- [ ] **BUG-06**: Relationship property projection returns null for missing properties instead of inconsistent-type error
- [ ] **BUG-07**: Numeric `ORDER BY` sorts by value, not lexical insertion order
- [ ] **BUG-08**: `REMOVE n.prop` property removal works through parser/planner/executor
- [ ] **BUG-09**: `CREATE INDEX FOR (n:Label) ON (n.prop)` alternate syntax wired to existing index creation APIs
- [ ] **BUG-10**: CLI path-bearing commands consistently accept `--db <path>` fallback
- [ ] **BUG-11**: `query` parsing treats query text as single optional argument so `--format` flags work correctly
- [ ] **BUG-12**: `CALL ...` statements route through core query engine, not legacy handler
- [ ] **BUG-13**: `import` returns actionable error when database file does not exist
- [ ] **BUG-14**: `serve` startup output includes protocol + bind endpoint
- [ ] **BUG-15**: `serve` accepts `--port` with protocol-aware defaults (Bolt: 7687, HTTP: 8080, gRPC: 7689, MCP: 7687)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Query Language

- **QLNG-01**: Full GQL (ISO 39075) conformance beyond current keyword aliases
- **QLNG-02**: SPARQL endpoint (only if community demand is overwhelming)

### Deployment

- **DEPL-01**: Distributed sharding for horizontal scaling
- **DEPL-02**: Real-time streaming / CDC

### Advanced

- **ADVN-01**: Adaptive query re-optimization during execution
- **ADVN-02**: Graph schema evolution with online migration (zero-downtime)

## Out of Scope

| Feature | Reason |
|---------|--------|
| SPARQL query engine | One query language (Cypher) done well; RDF import/export handles interop |
| Distributed sharding | Embedded-first architecture; not a distributed database |
| Real-time streaming/CDC | Adds significant complexity; replication covers multi-node needs |
| mmap I/O path | Architecture locks pread/pwrite only; predictable behavior and robust recovery |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| QOPT-01 | Phase 4 | Pending |
| QOPT-02 | Phase 4 | Pending |
| INDX-01 | Phase 3 | Pending |
| IMEX-01 | Phase 3 | Pending |
| CLI-01 | Phase 3 | Pending |
| TEMP-01 | Phase 5 | Pending |
| RDF-01 | Phase 5 | Pending |
| EAPI-01 | Phase 3 | Pending |
| QUAL-01 | Phase 6 | Pending |
| QUAL-02 | Phase 6 | Pending |
| BUG-01 | Phase 1 | Pending |
| BUG-02 | Phase 1 | Pending |
| BUG-03 | Phase 1 | Pending |
| BUG-04 | Phase 1 | Pending |
| BUG-05 | Phase 1 | Pending |
| BUG-06 | Phase 1 | Pending |
| BUG-07 | Phase 1 | Pending |
| BUG-08 | Phase 1 | Pending |
| BUG-09 | Phase 1 | Pending |
| BUG-10 | Phase 1 | Pending |
| BUG-11 | Phase 1 | Pending |
| BUG-12 | Phase 1 | Pending |
| BUG-13 | Phase 1 | Pending |
| BUG-14 | Phase 1 | Pending |
| BUG-15 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
