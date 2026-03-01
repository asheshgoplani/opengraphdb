# OpenGraphDB End-to-End Real Data Tests

**Date:** 2026-02-22
**Database path:** `/tmp/ogdb-test-real`
**Build:** `cargo build --workspace` — **PASS** (clean build, exit 0)

---

## 1. Database Initialization

| Test | Command | Result |
|------|---------|--------|
| Init new database | `ogdb init /tmp/ogdb-test-real` | **PASS** — `format_version=1, page_size=4096` |
| Info on empty DB | `ogdb info /tmp/ogdb-test-real` | **PASS** — `node_count=0, edge_count=0` |

---

## 2. Create Nodes

| Test | Query | Result |
|------|-------|--------|
| Person with string+int props | `CREATE (a:Person {name: 'Alice', age: 30}) RETURN a` | **PASS** — returns `i64:0` |
| Multiple Person nodes | Bob (id=1), Charlie (id=2) | **PASS** |
| Company nodes | Acme Corp (id=3), TechStart (id=4) | **PASS** |
| Multi-label node | `CREATE (f:Person:Developer {name: 'Diana', age: 28, language: 'Rust'})` | **PASS** — id=5 |
| City nodes with large ints | Berlin (pop=3700000), Munich (pop=1500000) | **PASS** — ids 6,7 |
| Node count verification | `ogdb info` | **PASS** — `node_count=8` |

---

## 3. Create Relationships

| Test | Query | Result |
|------|-------|--------|
| KNOWS with properties | `MATCH ... CREATE (a)-[:KNOWS {since: 2015}]->(b)` | **PASS** |
| KNOWS without properties | `MATCH ... CREATE (b)-[:KNOWS]->(c)` | **PASS** |
| WORKS_AT with role+since | Alice->Acme, Bob->TechStart, Diana->Acme | **PASS** (3 edges) |
| LIVES_IN | Alice->Berlin, Bob->Munich | **PASS** (2 edges) |
| Edge count verification | `ogdb info` | **PASS** — `edge_count=8` |

---

## 4. MATCH Queries

| Test | Query | Result |
|------|-------|--------|
| All nodes | `MATCH (n) RETURN n` | **PASS** — 8 rows |
| By label | `MATCH (p:Person) RETURN p.name, p.age` | **PASS** — 4 rows (Alice, Bob, Charlie, Diana) |
| WHERE > filter | `WHERE p.age > 27` | **PASS** — 3 rows (Alice 30, Charlie 35, Diana 28) |
| WHERE compound AND | `WHERE p.age >= 28 AND p.age <= 35` | **PASS** — 3 rows |
| ORDER BY (numeric) | `ORDER BY p.age` | **FAIL** — results not sorted (returned 30, 35, 28 instead of 28, 30, 35) |
| ORDER BY (string) | `RETURN p.name ORDER BY p.name` | **PASS** — alphabetical (Alice, Bob, Charlie, Diana) |
| LIMIT | `RETURN p.name LIMIT 2` | **PASS** — 2 rows |
| DISTINCT | `RETURN DISTINCT c.name` | **PASS** — 2 distinct companies from 3 edges |
| Relationship pattern (KNOWS) | `MATCH (p)-[:KNOWS]->(q) RETURN p.name, q.name` | **PASS** — 3 rows |
| Relationship pattern (WORKS_AT) | `MATCH (p)-[:WORKS_AT]->(c) RETURN p.name, c.name` | **PASS** — 3 rows |
| Relationship property access (consistent) | `RETURN p.name, c.name, r.role` | **PASS** |
| Relationship property access (mixed types) | `RETURN r.since` (some edges lack `since`) | **FAIL** — `column 'since' has inconsistent types: expected i64, found string` |
| WITH clause | `MATCH (p) WITH p WHERE p.age > 25 RETURN p.name` | **PASS** — 3 rows |
| Column auto-rename (name collision) | `RETURN p.name, c.name` | **PASS** — renames to `name`, `name_2` |

---

## 5. Aggregations

| Test | Query | Expected | Result |
|------|-------|----------|--------|
| COUNT | `RETURN count(p)` | 4 | **PASS** — `i64:4` |
| SUM | `RETURN sum(p.age)` | 118 (30+25+35+28) | **PASS** — `i64:118` |
| AVG | `RETURN avg(p.age)` | 29.5 | **PASS** — `f64:29.5` |
| MIN | `RETURN min(p.age)` | 25 | **PASS** — `i64:25` |
| MAX | `RETURN max(p.age)` | 35 | **PASS** — `i64:35` |
| COLLECT | `RETURN collect(p.name)` | [Alice, Bob, Charlie, Diana] | **PASS** |
| Grouped COUNT | `RETURN c.name, count(p)` | Acme:2, TechStart:1 | **PASS** |
| Grouped COLLECT | `RETURN c.name, collect(p.name)` | Acme:[Alice,Diana], TechStart:[Bob] | **PASS** |

---

## 6. Indexes

| Test | Query | Result |
|------|-------|--------|
| CREATE INDEX (Cypher syntax) | `CREATE INDEX FOR (p:Person) ON (p.name)` | **FAIL** — `unsupported query` (not yet implemented) |
| Schema inspection | `ogdb schema` | **PASS** — reports 4 labels, 3 edge types, 7 property keys |

---

## 7. Import/Export

### Import

| Test | Command | Result |
|------|---------|--------|
| JSON graph import | `ogdb import db graph.json` (5 nodes, 4 edges) | **PASS** — `imported_nodes=5, imported_edges=4` |
| Query imported data | `MATCH (p:Product) RETURN p.name, p.price` | **PASS** — 3 products with correct float prices |
| Imported relationships | `MATCH (c)-[:PURCHASED]->(p) RETURN c.name, p.name` | **PASS** — 3 edges |
| CSV bundle import | `ogdb import db export.csv` (nodes.csv + edges.csv) | **PASS** — `imported_nodes=8, imported_edges=8` |
| JSONL import | `ogdb import db data.jsonl` (3 nodes, 2 edges) | **PASS** — `imported_nodes=3, imported_edges=2` |
| HTTP import (via server) | `POST /import` with JSON body | **PASS** — imports and immediately queryable |

### Export

| Test | Command | Result |
|------|---------|--------|
| JSON export | `ogdb export db out.json` | **PASS** — 8 nodes, 8 edges, all properties preserved |
| CSV export | `ogdb export db out.csv` | **PASS** — generates `.nodes.csv` + `.edges.csv`, multi-label `\|` separator |
| Round-trip JSON (export→import→query) | Re-import exported JSON | **PASS** — identical data |

---

## 8. CLI Direct Commands

| Test | Command | Result |
|------|---------|--------|
| `neighbors` | `ogdb neighbors db 0` | **PASS** — `count=4, neighbors=1,2,3,6` |
| `incoming` | `ogdb incoming db 2` | **PASS** — `count=2, incoming=0,1` |
| `hop` (2-hop) | `ogdb hop db 0 2` | **PASS** — `reachable_count=6`, level1=4 nodes, level2=2 nodes |
| `create-node` | `ogdb create-node --labels Project --props "name=string:GraphDB"` | **PASS** — `node_id=102` |
| `add-edge` | `ogdb add-edge db 0 102 --type CONTRIBUTES_TO` | **PASS** — `edge_id=8` |
| `stats` | `ogdb stats db` | **PASS** — degree stats, zero-degree count |
| `metrics` | `ogdb metrics db` | **PASS** — WAL size, delta buffer count |
| `backup` | `ogdb backup db /tmp/ogdb-backup` | **PASS** — backup is queryable |
| `checkpoint` | `ogdb checkpoint db` | **PASS** |
| `schema` (JSON) | `ogdb schema db --format json` | **PASS** |
| `shell --commands` | Multi-query via semicolons | **PASS** — executes queries sequentially |

---

## 9. Cypher Write Operations

| Test | Query | Result |
|------|-------|--------|
| SET property | `MATCH ... SET p.email = 'alice@example.com'` | **PASS** — persists on re-query |
| DELETE node | `MATCH (x:Temporary) DELETE x` | **PASS** — node no longer returned |
| REMOVE property | `MATCH ... REMOVE p.email` | **FAIL** — `unsupported query` (not yet implemented) |

---

## 10. Server Modes

| Test | Command | Result |
|------|---------|--------|
| Bolt server startup | `ogdb serve --bolt --port 7688` | **PASS** — listens, responds to handshake |
| Bolt max-requests | `--max-requests 3` auto-shutdown | **PASS** |
| HTTP server startup | `ogdb serve --http --port 7475` | **PASS** — listens |
| HTTP POST /query | Cypher query via HTTP | **PASS** — clean JSON output (no type prefixes) |
| HTTP POST /import | JSON graph import via HTTP | **PASS** |
| HTTP unknown endpoint | `GET /` | **PASS** — returns `{"error": "unknown endpoint: /"}` |

---

## 11. Output Formats

| Format | Test | Result |
|--------|------|--------|
| `--format json` | Query results | **PASS** — proper JSON with columns and rows |
| `--format csv` | Query results | **PASS** — CSV with headers |
| `--format table` | Query results | **PASS** — pipe-separated |
| Default (plain text) | Query results | **PASS** — `columns=... row_count=...` |

---

## Summary

| Category | Pass | Fail | Total |
|----------|------|------|-------|
| Initialization | 2 | 0 | 2 |
| Create Nodes | 6 | 0 | 6 |
| Create Relationships | 5 | 0 | 5 |
| MATCH Queries | 12 | 2 | 14 |
| Aggregations | 8 | 0 | 8 |
| Indexes | 1 | 1 | 2 |
| Import/Export | 9 | 0 | 9 |
| CLI Commands | 11 | 0 | 11 |
| Write Operations | 2 | 1 | 3 |
| Server Modes | 6 | 0 | 6 |
| Output Formats | 4 | 0 | 4 |
| **Total** | **66** | **4** | **70** |

**Overall: 66/70 tests pass (94.3%)**

### Known Failures

1. **ORDER BY numeric** — does not sort integer values correctly (sorts as insertion order, not by value)
2. **Relationship property access with mixed nulls** — `r.since` fails when some edges lack the `since` property (type inconsistency error)
3. **CREATE INDEX** — Cypher `CREATE INDEX FOR ... ON ...` syntax not yet implemented
4. **REMOVE property** — `REMOVE p.prop` syntax not yet implemented
