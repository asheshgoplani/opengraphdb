# Migrating from Neo4j to OpenGraphDB

OGDB is Apache-2.0, single-file, embedded by default, with no JVM. The
Cypher dialect is openCypher 9 + extensions, so most existing queries
work unchanged. This doc covers the gaps.

## Compatibility matrix

| Neo4j feature | OGDB status | Notes |
|---------------|-------------|-------|
| openCypher 9 core (MATCH, CREATE, MERGE, SET, DELETE, RETURN, WHERE, ORDER BY, LIMIT, SKIP, WITH, UNWIND, OPTIONAL MATCH, UNION, CASE, EXISTS, pattern comprehension) | ✅ | Fully supported. |
| Variable-length paths `*1..N` | ✅ | |
| Multi-statement transactions over Bolt | ✅ | |
| Multi-statement transactions over HTTP | ✅ | `/transaction` endpoint. |
| Indexes (B-tree on properties) | ✅ | `CREATE INDEX FOR (n:L) ON (n.p)` |
| Unique constraints | ✅ | `CREATE CONSTRAINT FOR (n:L) REQUIRE n.p IS UNIQUE` |
| Full-text indexes | ✅ | `ogdb.text.search` (different proc namespace) |
| Vector indexes (`db.index.vector.*`) | ✅ as `ogdb.vector.*` | Same idea, OGDB-native namespace. |
| GraphRAG (vector + graph hop in one query) | ✅ as `ogdb.hybrid_retrieve` | First-class — Neo4j needs APOC + custom. |
| Time-travel / bitemporal queries | ✅ as `AT TIME` / `ogdb.temporal.*` | Not in Neo4j Community. |
| RDF import / export | ✅ as `ogdb.rdf.import/export` | Built-in. Neo4j needs neosemantics plugin. |
| SHACL validation | ✅ as `ogdb validate-shacl` | CLI command. |
| Bolt protocol | ✅ | `ogdb serve --bolt --port 7687` |
| MCP tool catalog | ✅ | 20 tools — Neo4j has none. |
| Browser GUI | ⚠️ separate `ogdb-frontend` web UI | No bundled browser. |
| Cluster / Causal Cluster | ❌ | Single-node only. |
| Fabric (cross-database queries) | ❌ | Use multiple `ogdb serve` instances. |
| APOC procedures | ⚠️ partial → `ogdb.*` | See mapping below. |
| GDS algorithms | ⚠️ in `ogdb-algorithms` crate | Pagerank, BFS, SSSP, components today. |

## APOC → OGDB mapping (most-used calls)

| APOC | OGDB equivalent |
|------|-----------------|
| `apoc.load.csv` | `ogdb import <db> <csv>` (CLI) |
| `apoc.load.json` | `ogdb import <db> <json> --format json` |
| `apoc.create.node` | `CREATE (n:Label {p: v})` (no proc needed) |
| `apoc.merge.node` | `MERGE (n:Label {p: v})` |
| `apoc.path.expand` | Variable-length pattern `()-[*1..N]->()` |
| `apoc.coll.toSet` | `collect(DISTINCT x)` |
| `apoc.text.fuzzyMatch` | `ogdb.text.search('q~', ...)` (Lucene-style) |
| `apoc.periodic.iterate` | Native batching: split your write into smaller transactions client-side |
| `apoc.export.csv.all` | `ogdb export <db> <out.csv>` |

## Migration playbook

1. **Inventory**: list all your APOC calls and custom plugins.
   `egrep -r 'apoc\.|gds\.|db\.index\.' your-cypher/`
2. **Translate**: rewrite APOC calls to the table above. For GDS, check
   `ogdb-algorithms` crate's catalog.
3. **Export Neo4j → CSV**:
   `neo4j-admin database dump` then convert with `neo4j-export-csv` — OR
   use APOC's `apoc.export.cypher.all('out.cypher', {})` and replay.
4. **Replay into OGDB**:
   `ogdb shell new.ogdb --script out.cypher`
5. **Diff**: run a count query in both — `MATCH (n) RETURN count(n)` and
   `MATCH ()-[r]->() RETURN count(r)`. They should match.
6. **Validate**: pick 3 representative queries and assert identical results.
7. **Cut over**: redirect Bolt clients from `bolt://neo4j:7687` to
   `bolt://localhost:7687` (OGDB serves Bolt on the same port by default).

## What you GAIN by migrating

- One file, no JVM, no Cypher Shell installer.
- MCP server in the binary — agents talk to OGDB directly with no sidecar.
- Vector + full-text + graph in one query (`ogdb.hybrid_retrieve`).
- Time-travel without a separate audit table.
- Apache 2.0 — embeddable in commercial products without AGPL.

## What you LOSE

- Cluster / causal cluster.
- Browser UI (use the `ogdb-frontend` SPA bundled via `ogdb serve --http`).
- Mature GDS algorithm library (OGDB has core algos but not all of GDS).
- The Neo4j vendor support contract.

## When NOT to migrate

- You're on Aura with cluster + Browser as hard requirements.
- Your team has 100k lines of Cypher leaning on APOC heavily — translation
  cost may exceed the gain.
- You need > 4 concurrent writers — OGDB is single-writer in v1.
