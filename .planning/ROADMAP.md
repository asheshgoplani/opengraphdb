# Roadmap: OpenGraphDB

## Overview

OpenGraphDB is a brownfield project with approximately 50K lines of Rust across 9 crates and Phases 1-15 of the implementation checklist already complete. This roadmap closes the remaining gaps: verifying 15 existing bugfixes that are implemented but unreleased, extending the type system with temporal and collection types, hardening operational capabilities, adding worst-case optimal join and factorized execution strategies, delivering independent extensions (temporal compaction and SHACL), and validating the complete system against memory and disk budgets.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Bugfix Verification** - Verify and release the 15 implemented bugfixes that appear in the unreleased CHANGELOG section
- [ ] **Phase 2: Type System Completion** - Add temporal (date, datetime, duration) and collection (list, map) property types throughout the engine
- [ ] **Phase 3: Operational Capabilities** - Deliver auto-indexing, atomic bulk import, schema migration, and stable embedded API
- [ ] **Phase 4: Query Optimization** - Implement worst-case optimal joins and factorized intermediate results for multi-pattern queries
- [ ] **Phase 5: Independent Extensions** - Add temporal versioning compaction and SHACL shape validation
- [ ] **Phase 6: Quality Validation** - Validate memory and disk size budgets against the 1M-node 5M-edge target

## Phase Details

### Phase 1: Bugfix Verification
**Goal**: The 15 implemented bugfixes ship as a verified release, with every fix confirmed by a passing test that was previously failing or absent
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-13, BUG-14, BUG-15
**Success Criteria** (what must be TRUE):
  1. `MATCH (p:Person {name: 'Alice'}) RETURN p` returns only matching nodes, not all Person nodes
  2. `RETURN a.name, c.name` produces columns named `name` and `name_2` without error
  3. `CREATE INDEX ON :Label(property)` and `CREATE INDEX FOR (n:Label) ON (n.prop)` both complete without error and the index appears in `CALL db.indexes()`
  4. `CALL db.algo.shortestPath(src, dst)` and `CALL db.index.fulltext.queryNodes(...)` dispatch correctly without routing errors
  5. `ORDER BY n.score` on numeric values sorts by numeric value, not string order; `REMOVE n.prop` executes without error; `serve --port 9000 --protocol http` starts and prints the bound endpoint
**Plans**: 3 plans

Plans:
- [ ] 01-01: Audit and write regression tests for BUG-01 through BUG-09 (query engine and parser bugs)
- [ ] 01-02: Audit and write regression tests for BUG-10 through BUG-15 (CLI bugs)
- [ ] 01-03: Run full test suite, confirm all 15 bugs are green, move CHANGELOG entries to released section

### Phase 2: Type System Completion
**Goal**: Users can store and query date, datetime, duration, list, and map property values using natural Cypher syntax
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. `CREATE (e:Event {date: date('2026-01-15')}) RETURN e.date` returns a date value, not a string
  2. `CREATE (e:Event {ts: datetime('2026-01-15T09:00:00Z')}) RETURN e.ts` returns a datetime value with timezone and is comparable with `<`, `>`, `=`
  3. `CREATE (e:Event {dur: duration('P1Y2M')}) RETURN e.dur + duration('P3D')` performs duration arithmetic and returns a duration value
  4. `CREATE (n {tags: ['a','b','c']}) RETURN n.tags[1], n.tags[0..2]` returns indexed and sliced list elements correctly
  5. `CREATE (n {meta: {key: 'val'}}) RETURN n.meta.key, n.meta{key}` returns map values via dot-access and projection
**Plans**: TBD

Plans:
- [ ] 02-01: Implement date and datetime property types (storage, Cypher literals, comparison operators)
- [ ] 02-02: Implement duration property type (storage, Cypher literals, arithmetic operations)
- [ ] 02-03: Implement list property type (storage, indexing, slicing, comprehensions)
- [ ] 02-04: Implement map property type (storage, key access, projection operators)

### Phase 3: Operational Capabilities
**Goal**: Developers can evolve schemas, perform reliable bulk imports, rely on automatic indexing, and call any Cypher query from the Rust embedded API
**Depends on**: Phase 2
**Requirements**: INDX-01, IMEX-01, CLI-01, EAPI-01
**Success Criteria** (what must be TRUE):
  1. A property queried more times than the auto-index threshold gains a B-tree index automatically, and subsequent queries use it (visible in `EXPLAIN`)
  2. A bulk import with one corrupt record rolls back the entire import and leaves the database unchanged, not partially written
  3. `ogdb migrate --db mydb.ogdb schema.migrate --dry-run` prints the planned changes; running without `--dry-run` applies them and reports completion
  4. A Rust program calling `db.query("MATCH (n) RETURN n")` compiles against stable public types and returns typed results without internal type leakage
**Plans**: TBD

Plans:
- [ ] 03-01: Implement auto-index creation based on query frequency threshold
- [ ] 03-02: Implement all-or-nothing bulk import mode with transactional rollback
- [ ] 03-03: Implement `migrate` CLI command with dry-run support
- [ ] 03-04: Stabilize Rust embedded API (`db.query()`, `db.query_profiled()`) with documented public types

### Phase 4: Query Optimization
**Goal**: Multi-pattern queries against large graphs select worst-case optimal join strategies and avoid Cartesian intermediate explosions
**Depends on**: Phase 2
**Requirements**: QOPT-01, QOPT-02
**Success Criteria** (what must be TRUE):
  1. `EXPLAIN MATCH (a)-[:R]->(b)-[:S]->(c) RETURN a, b, c` on a graph where the WCOJ strategy is cheaper shows a WCOJ plan node, not a sequence of binary hash joins
  2. A three-way pattern query on a 1M-edge graph runs to completion without producing more intermediate rows than the final result count times a bounded fan-out factor
  3. The same query run with and without factorized execution shows equivalent result sets, confirming correctness parity
**Plans**: TBD

Plans:
- [ ] 04-01: Implement WCOJ strategy in the query planner with cardinality-based selection
- [ ] 04-02: Implement factorized intermediate result representation in the execution engine

### Phase 5: Independent Extensions
**Goal**: Temporal graphs compact superseded versions automatically, and SHACL constraints can be enforced on graph data
**Depends on**: Phase 1
**Requirements**: TEMP-01, RDF-01
**Success Criteria** (what must be TRUE):
  1. After inserting 1000 versioned updates to the same node, running compaction reduces on-disk version count and does not change any AT TIME query result
  2. A graph loaded with a SHACL shapes file reports a violation when a node is missing a required property, and reports no violation when the graph is conformant
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md — Temporal versioning: TemporalNodeVersion data model, add/query/compact APIs, persistence, background compaction, 1000-version compaction test
- [ ] 05-02-PLAN.md — SHACL validation: shapes parser via oxrdfio, validate-against-shacl engine, validate-shacl CLI command, conformance and violation tests

### Phase 6: Quality Validation
**Goal**: The complete system fits within the published memory and disk budgets for the canonical 1M-node 5M-edge benchmark
**Depends on**: Phase 3, Phase 4, Phase 5
**Requirements**: QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. Loading 1M nodes and 5M edges into a database, then reading resident memory via `/proc/self/status` or equivalent, shows RSS below 500MB
  2. Loading the same dataset and measuring on-disk size of all `.ogdb` and `.ogdb-wal` files shows total below 1GB
  3. Both measurements are enforced as CI gate assertions that fail the build if exceeded
**Plans**: TBD

Plans:
- [ ] 06-01: Implement memory budget benchmark and gate assertion (1M nodes + 5M edges < 500MB RSS)
- [ ] 06-02: Implement disk budget benchmark and gate assertion (1M nodes + 5M edges < 1GB on-disk)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phase 4 depends on Phase 2 (type system must be stable). Phase 5 depends only on Phase 1 (independent extensions). Phase 6 depends on Phases 3, 4, and 5.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bugfix Verification | 0/3 | Not started | - |
| 2. Type System Completion | 0/4 | Not started | - |
| 3. Operational Capabilities | 0/4 | Not started | - |
| 4. Query Optimization | 0/2 | Not started | - |
| 5. Independent Extensions | 0/2 | Not started | - |
| 6. Quality Validation | 0/2 | Not started | - |
