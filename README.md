<div align="center">
  <a href="https://github.com/asheshgoplani/opengraphdb">
    <img src="frontend/public/logo-wordmark.svg" alt="OpenGraphDB" height="80" />
  </a>

  <p><strong>An embeddable, Cypher-speaking graph database with vector + full-text + RDF + MCP built in. Single binary. Single file. Apache&nbsp;2.0.</strong></p>

  <p>
    <a href="https://github.com/asheshgoplani/opengraphdb/actions/workflows/ci.yml"><img src="https://github.com/asheshgoplani/opengraphdb/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/asheshgoplani/opengraphdb/actions/workflows/verify-claims.yml"><img src="https://github.com/asheshgoplani/opengraphdb/actions/workflows/verify-claims.yml/badge.svg" alt="verify-claims"></a>
    <a href="https://github.com/asheshgoplani/opengraphdb/releases"><img src="https://img.shields.io/github/v/release/asheshgoplani/opengraphdb" alt="Latest release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License: Apache 2.0"></a>
    <a href="ARCHITECTURE.md"><img src="https://img.shields.io/badge/docs-architecture-informational" alt="Architecture"></a>
  </p>

  <img src="frontend/e2e/screenshots/playground-movielens-light.png" alt="OpenGraphDB playground rendering the MovieLens graph" width="80%" />
</div>

---

## What it is

OpenGraphDB is what should exist in the embeddable graph-database slot. Neo4j is JVM-based, AGPL or commercial, and server-only. KuzuDB was the closest open alternative but was abandoned in October 2025. OpenGraphDB embeds in your Rust, Python, or Node app — or runs as a single `ogdb serve` process — and ships Cypher, MVCC, WAL, vector search, full-text, RDF, and a 20-tool MCP surface for AI agents in one Apache-2.0 binary. No JVM, no separate search index to keep in sync, no commercial-license tier.

## Quickstart

```bash
# 1. Build (one-time)
cargo build --release -p ogdb-cli

# 2. Seed a demo database and query it
./target/release/ogdb demo demo.ogdb
./target/release/ogdb query demo.ogdb "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name, m.title LIMIT 5"

# 3. Serve HTTP + the embedded playground SPA on :8080
./target/release/ogdb serve --http demo.ogdb
```

Then visit `http://localhost:8080/` for the playground, or point an MCP-aware tool at `ogdb mcp --stdio demo.ogdb`. Embed in Rust:

```rust
use ogdb_core::Database;

let mut db = Database::open("demo.ogdb")?;
db.query("CREATE (p:Person {name: 'Alice'})")?;
let rows = db.query("MATCH (p:Person) RETURN p")?;
```

## Why OpenGraphDB instead of Neo4j

|                           | OpenGraphDB                                                                                                          | Neo4j Community                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Deployment**            | Single Rust binary; embeds as a crate (`ogdb-core`)                                                                  | JVM server, multi-process                                  |
| **Storage**               | Single file `mydb.ogdb` (+ WAL + props sidecars)                                                                     | Multiple stores under `data/databases/<name>/`             |
| **License**               | Apache&nbsp;2.0 (no enterprise tier)                                                                                 | AGPL&nbsp;v3 (Community) / commercial (Enterprise)         |
| **Query language**        | Cypher / openCypher                                                                                                  | Cypher / openCypher                                        |
| **Vector search**         | Built-in HNSW (recall@10 ≥ 0.95, p95 ≤ 5 ms; gated by `crates/ogdb-core/src/lib.rs::HNSW_EF_CONSTRUCTION`)            | Plugin (Neo4j 5.13+) or Aura cloud                         |
| **Full-text + RDF**       | Built-in Tantivy FTS + Turtle / N-Triples / RDF/XML / JSON-LD / N-Quads I/O + SHACL                                  | Plugin (`db.index.fulltext`) / external triplestore        |
| **MCP for AI agents**     | Native, 20 tools (`ogdb mcp --stdio` or `serve --http /mcp/*`)                                                       | Not native; community shims                                |

See [`documentation/MIGRATION-FROM-NEO4J.md`](documentation/MIGRATION-FROM-NEO4J.md) for a Cypher-by-Cypher mapping and Bolt-driver compatibility notes (`ogdb-bolt` ships Bolt v1; modern Neo4j drivers expect v4.4+).

## Features

- **Embeddable** — link `ogdb-core` as a Rust crate, call from Python (`crates/ogdb-python/`) or Node (`crates/ogdb-node/`) bindings, or run `ogdb serve` for HTTP, Bolt v1, or MCP. (gRPC is on the v2 roadmap; the `crates/ogdb-cli/src/lib.rs::handle_serve_grpc` endpoint is wired but currently returns Unimplemented — see [`SPEC.md`](SPEC.md) § 10.)
- **Cypher / openCypher** — `OPTIONAL MATCH`, `UNION`, `EXISTS`, pattern comprehension, `CASE`, `UNWIND` as a real physical operator, parameterized queries, transactions.
- **AI-native** — built-in MCP server (20 tools), hybrid retrieval (vector kNN + 1-hop graph expansion + Reciprocal Rank Fusion), graph-feature reranking — one engine, not three.
- **HNSW vector search** — `instant-distance` backend, fixed seed for reproducibility, sidecar persistence with rebuild-on-load fallback (`crates/ogdb-vector/`).
- **Full-text** — Tantivy-powered fulltext indexes with stable normalization (`crates/ogdb-text/`).
- **RDF interop** — Turtle, N-Triples, RDF/XML, JSON-LD, N-Quads import/export and SHACL validation via `ogdb` `import-rdf` / `export-rdf` / `validate-shacl`.
- **MVCC + WAL** — snapshot-isolated transactions; durability via fsynced `mydb.ogdb-wal`, recovery rebuilds `mydb.ogdb` and `mydb.ogdb-props` on crash ([`ARCHITECTURE.md`](ARCHITECTURE.md) § 5).
- **Embedded playground** — `ogdb serve --http` ships the React SPA inside the binary via `include_dir!`; visit `/` for a guided playground over your live data, with `/metrics` (Prometheus) and `/health` for ops.

## Architecture

OpenGraphDB ships as an 18-crate Rust workspace. Storage is a canonical property store + Roaring-bitmap label index + double CSR (forward and reverse) per edge type, with delta buffers absorbed by background compaction. Reads run through MVCC snapshots; writes fsync the WAL at commit and recover the main and props files on crash.

The byte-level model and design ratchets are in [`ARCHITECTURE.md`](ARCHITECTURE.md). The 18-crate map is in [`DESIGN.md`](DESIGN.md) § 1. The product / interface specification is in [`SPEC.md`](SPEC.md).

## Benchmarks

[`documentation/BENCHMARKS.md`](documentation/BENCHMARKS.md) is the public competitive sheet — N=5 medians versus Neo4j, Memgraph, and KuzuDB, with reproducibility notes and an honest wins / losses scorecard. We publish every measurement, including the rows where we lose. The harness lives at `crates/ogdb-eval/tests/publish_baseline.rs`; raw `EvaluationRun` JSON for every release is preserved under [`documentation/evaluation-runs/`](documentation/evaluation-runs/) for longitudinal diff.

## CLI

```bash
ogdb init mydata.ogdb              # create a fresh database file
ogdb demo demo.ogdb                # seed canonical movies / social / fraud datasets
ogdb create-node mydata.ogdb       # write a node
ogdb add-edge mydata.ogdb 1 2      # link two existing node ids
ogdb query mydata.ogdb "MATCH (n) RETURN n"
ogdb serve --http mydata.ogdb      # HTTP / MCP / Prometheus + embedded SPA on :8080
ogdb mcp --stdio mydata.ogdb       # speak MCP over stdio for Claude / Cursor / Goose
ogdb backup mydata.ogdb backup.ogdb --online --compact
ogdb --help                        # full command reference
```

The full surface includes `import` / `export` (CSV, JSON, JSONL), `import-rdf` / `export-rdf` (Turtle, N-Triples, RDF/XML, JSON-LD, N-Quads), `validate-shacl`, `migrate` (schema migrations: `CREATE INDEX` / `DROP INDEX`), `checkpoint`, `metrics`, `schema`, `stats`, `info`, `shell` (interactive REPL), and read traversals (`neighbors`, `incoming`, `hop`, `hop-in`).

## Documentation

- [`documentation/COOKBOOK.md`](documentation/COOKBOOK.md) — seven runnable AI-agent recipes (MCP, hybrid retrieval, doc → KG, time-travel, skill-quality eval, Neo4j migration, CI regression). Every snippet is exercised by e2e tests on every PR.
- [`documentation/BENCHMARKS.md`](documentation/BENCHMARKS.md) — competitive baseline (N=5 medians) versus Neo4j, Memgraph, KuzuDB.
- [`documentation/MIGRATION-FROM-NEO4J.md`](documentation/MIGRATION-FROM-NEO4J.md) — three differences that matter, Cypher-by-Cypher mapping, and where the latency comes from.

The full public-docs index is in [`documentation/README.md`](documentation/README.md).

## Roadmap

Tracked under [Issues](https://github.com/asheshgoplani/opengraphdb/issues) and [Discussions](https://github.com/asheshgoplani/opengraphdb/discussions). Near-term focus:

- **v0.5** — bulk-ingest path closing the row-1 / row-2 BENCHMARKS gap; incremental HNSW insert without commit-time rebuild.
- **v0.5** — multi-process / multi-writer access (today, `Database::open` takes a single-process exclusive write lock; see `documentation/BENCHMARKS.md` row 9).
- **v0.5** — Python and Node binding ergonomics (richer dataframe / async / streaming surfaces; tracked in `DESIGN.md` § 27 and § 28).
- **v0.5** — LDBC SF1+ benchmark numbers from a Workstation-tier box (`r7i.4xlarge` per `SPEC.md`); rolling Cypher TCK coverage ratchet.
- **v2** — gRPC transport alongside HTTP, Bolt v1, and stdio MCP.

## Contributing

OpenGraphDB is greenfield and contributor-friendly. Storage engines, query optimization, vector search, RDF tooling, MCP integrations, and developer experience are all open lanes. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the test-first workflow, coverage gate, TCK harness, and what every PR should include.

→ [Issues](https://github.com/asheshgoplani/opengraphdb/issues) · [Discussions](https://github.com/asheshgoplani/opengraphdb/discussions) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md)

## License & Acknowledgements

OpenGraphDB is licensed under [Apache 2.0](LICENSE).

Built on the work of: [Tantivy](https://github.com/quickwit-oss/tantivy) (full-text), [`instant-distance`](https://github.com/InstantDomain/instant-distance) (HNSW), [Roaring bitmaps](https://roaringbitmap.org/) (label index), the [openCypher](https://opencypher.org/) project, and Neo4j's Cypher language design.
