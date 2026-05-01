# OpenGraphDB

[![CI](https://github.com/asheshgoplani/opengraphdb/actions/workflows/ci.yml/badge.svg)](https://github.com/asheshgoplani/opengraphdb/actions/workflows/ci.yml)
[![verify-claims](https://github.com/asheshgoplani/opengraphdb/actions/workflows/verify-claims.yml/badge.svg)](https://github.com/asheshgoplani/opengraphdb/actions/workflows/verify-claims.yml)
[![Latest release](https://img.shields.io/github/v/release/asheshgoplani/opengraphdb)](https://github.com/asheshgoplani/opengraphdb/releases)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**An embeddable, Cypher-speaking graph database with vector + full-text + RDF + MCP built in. Single binary. Single file. Apache 2.0.**

---

## The Idea

There is no good embeddable graph database that is truly open source, speaks Cypher, and works natively with AI tools. Neo4j requires a JVM server and is AGPL. KuzuDB was the closest alternative but was abandoned in October 2025. OpenGraphDB is what should exist.

It embeds in your Rust, Python, or Node app — or runs as a single `ogdb serve` process. Cypher queries, MVCC, WAL, and an MCP surface for AI tools. No JVM. No separate search index to keep in sync.

## 30-second Quickstart

```bash
# 1. Build (one-time)
cargo build --release -p ogdb-cli

# 2. Open a database, write a node, query it
./target/release/ogdb init mydata.ogdb
./target/release/ogdb create-node mydata.ogdb --labels Person --props name=string:Ada
./target/release/ogdb query mydata.ogdb "MATCH (p:Person) RETURN p.name"
```

Embed in Rust:

```rust
use ogdb_core::Database;

let mut db = Database::open("mydata.ogdb")?;
let id = db.create_node(&["Person".into()], &Default::default())?;
let rows = db.query("MATCH (p:Person) RETURN p")?;
```

## What's in the box

- **Embeddable** — link as a Rust crate, call from Python/Node bindings, or run `ogdb serve` for HTTP/Bolt/gRPC.
- **Cypher / GQL** — the query language developers already know, with `OPTIONAL MATCH`, `UNION`, `EXISTS`, pattern comprehension, and CASE semantics.
- **AI-native** — MCP server built in (20 tools), hybrid retrieval (vector kNN + 1-hop + RRF), and graph-feature reranking — all in one engine, not three.

## Documentation

- **[documentation/BENCHMARKS.md](documentation/BENCHMARKS.md)** — competitive baseline (N=5 medians) versus Neo4j, Memgraph, KuzuDB. Wins, losses, and follow-ups, all reproducible.
- **[documentation/COOKBOOK.md](documentation/COOKBOOK.md)** — seven runnable AI-agent recipes (MCP, hybrid retrieval, doc → KG, time-travel, skill-quality eval, Neo4j migration, CI regression). Every snippet exercised by e2e tests on every PR.
- **[documentation/MIGRATION-FROM-NEO4J.md](documentation/MIGRATION-FROM-NEO4J.md)** — three differences that matter, Cypher-by-Cypher mapping, and where the latency comes from.

The full public-docs index is in [`documentation/README.md`](documentation/README.md).

## CLI

```bash
ogdb init mydata.ogdb              # create a fresh database file
ogdb create-node mydata.ogdb       # write a node
ogdb query mydata.ogdb "MATCH (n) RETURN n"
ogdb serve --http mydata.ogdb      # HTTP / MCP / Prometheus on :8080
ogdb mcp --stdio mydata.ogdb       # speak MCP over stdio for Claude/Cursor/Goose
ogdb backup mydata.ogdb backup.ogdb --online --compact
```

The full surface includes `import`/`export` (CSV, JSON, JSONL), `import-rdf`/`export-rdf` (Turtle, N-Triples, RDF/XML, JSON-LD, N-Quads), `validate-shacl`, `checkpoint`, `metrics`, `schema`, `stats`, `info`, `shell` (interactive REPL), and read traversals (`neighbors`, `incoming`, `hop`, `hop-in`).

```bash
ogdb --help        # full command reference
```

## Contributing

OpenGraphDB is greenfield and contributor-friendly. Storage engines, query optimization, vector search, RDF tooling, MCP integrations, and developer experience are all open lanes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test-first workflow, coverage gate, TCK harness, and what every PR should include.

→ [Issues](https://github.com/asheshgoplani/opengraphdb/issues) · [Discussions](https://github.com/asheshgoplani/opengraphdb/discussions)

## License

Apache 2.0 — see [LICENSE](LICENSE).
