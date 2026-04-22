# OpenGraphDB

**The single-file graph DB for Rust, Python, and Node. Embeddable. Cypher. MCP-ready. Apache 2.0.**

---

An embeddable graph database written in Rust. Single-file authoritative state plus WAL, Cypher queries, native vector search, and a built-in MCP server so AI tools can call the graph as a primitive.

> **Status: Pre-release — designing and building the foundation**
> **Architecture baseline:** See `ARCHITECTURE.md` for locked technical decisions

## The Idea

There's no good embeddable graph database that is truly open source, speaks Cypher, and works natively with AI tools. Neo4j requires a server and is AGPL. KuzuDB was the closest alternative but was abandoned in October 2025. We're building what should exist.

```
opengraphdb init mydata.ogdb
opengraphdb create-node mydata.ogdb
opengraphdb add-edge mydata.ogdb 0 1
opengraphdb neighbors mydata.ogdb 0
opengraphdb hop mydata.ogdb 0 3
opengraphdb checkpoint mydata.ogdb
opengraphdb backup mydata.ogdb mydata.backup.ogdb
```

One binary. One file. That's it.

## Current CLI Surface (Implemented)

```bash
opengraphdb [--format <table|json|jsonl|csv|tsv>] [--db <path>] <command> ...
opengraphdb init (<path> | --db <path>) [--page-size <power-of-two>=64]
opengraphdb info (<path> | --db <path>)
opengraphdb metrics (<path> | --db <path>)
opengraphdb stats (<path> | --db <path>)
opengraphdb schema (<path> | --db <path>)
opengraphdb checkpoint (<path> | --db <path>)
opengraphdb backup <src-path> <dst-path> [--online] [--compact]
opengraphdb query (<path> | --db <path>) [--format <table|json|jsonl|csv|tsv>] [query]
opengraphdb shell (<path> | --db <path>) [--commands <q1;q2;...> | --script <path>]
opengraphdb mcp (<path> | --db <path>) (--request <json-rpc-request> | --stdio [--max-requests <n>])
opengraphdb serve (<path> | --db <path>) [--bind <addr> | --port <port>] [--bolt|--http|--grpc] [--max-requests <n>]
opengraphdb import (<path> | --db <path>) <src-path> [--format <csv|json|jsonl>] [--batch-size <n>] [--continue-on-error]
opengraphdb export (<path> | --db <path>) <dst-path> [--format <csv|json|jsonl>] [--label <label>] [--edge-type <type>] [--node-id-range <start:end>]
opengraphdb import-rdf (<path> | --db <path>) <src-path> [--format <ttl|nt|xml|jsonld|nq>] [--base-uri <uri>] [--schema-only] [--batch-size <n>] [--continue-on-error]
opengraphdb export-rdf (<path> | --db <path>) <dst-path> [--format <ttl|nt|xml|jsonld>]
opengraphdb validate-shacl (<path> | --db <path>) <shapes-path>
opengraphdb create-node (<path> | --db <path>) [--labels <l1,l2,...>] [--props <k=type:value;...>]
opengraphdb add-edge (<path> | --db <path>) <src> <dst> [--type <edge-type>] [--props <k=type:value;...>]
opengraphdb neighbors (<path> | --db <path>) <src> [--format <table|json|jsonl|csv|tsv>]
opengraphdb incoming (<path> | --db <path>) <dst> [--format <table|json|jsonl|csv|tsv>]
opengraphdb hop-in (<path> | --db <path>) <dst> <hops> [--format <table|json|jsonl|csv|tsv>]
opengraphdb hop (<path> | --db <path>) <src> <hops> [--format <table|json|jsonl|csv|tsv>]
```

`shell` now supports interactive REPL mode (line editing/history/completion) when no `--commands`/`--script` input is provided in a TTY, and piped stdin script mode in non-interactive contexts.
`query` expects a single optional query argument; quote multi-token queries (for example, `"MATCH (n) RETURN n"`).
`serve --http` defaults to `127.0.0.1:8080` and `serve --bolt` defaults to `0.0.0.0:7687`; `--port` overrides only the port component when `--bind` is omitted.
`CALL db.index.fulltext.queryNodes(...)` accepts 1, 2, or 3 arguments (`query`, `(index, query)`, `(index, query, k)`) with default `k=10`.
For CSV graph import/export, the CLI uses paired files: `<base>.nodes.csv` and `<base>.edges.csv`.

Implemented and covered by tests: WAL logging + recovery, `checkpoint`, `backup` (including online and compact modes), machine-readable `--format` output on query/read traversal/shell command paths, full property-graph `import`/`export` (`csv`, `json`, `jsonl`) with auto format detection, streaming batch commits, `--continue-on-error`, and export filters (`--label`, `--edge-type`, `--node-id-range`), `schema`/`stats`/`metrics`, reverse traversal commands (`incoming`, `hop-in`), property-aware node/edge writes (`--labels`, `--type`, `--props`), typed scalar properties (`bool`, `i64`, `f64`, `string`, `bytes`), Roaring-bitmap label membership indexing with `find_nodes_by_label(...)`, property-filter query form (`find nodes <key=type:value>`), label-filter query form (`find nodes label <label>`), read/write transaction APIs (`begin_read`, `begin_write`, commit/rollback), optimistic multi-writer + snapshot coordination in `SharedDatabase`, observability APIs (`db.metrics()`, `db.query_profiled(...)`), MCP JSON-RPC adapter (`--request` and `--stdio`), Bolt/HTTP/gRPC server modes, Prometheus metrics endpoint (`/metrics/prometheus`), RBAC + audit logging + token auth integration, WAL-based replication APIs, WASM-oriented builds, and expanded GQL compatibility (`OPTIONAL MATCH`, `UNION`, `EXISTS`, pattern comprehension, CASE semantics).
Also implemented and covered by tests: RDF import/export (`ttl`, `nt`, `xml`, `jsonld`, `nq`) via `import-rdf`/`export-rdf`, ontology mapping (`owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`), `rdfs:subClassOf` hierarchy import, URI/prefix round-tripping, blank-node and named-graph handling, and `--schema-only`/`--base-uri` RDF options.
Also implemented and covered by tests: SHACL Core subset validation via `validate-shacl`, including `sh:targetClass` (IRI local-name matching to graph labels) and `sh:property` constraints with `sh:minCount >= 1`.
Also implemented: cucumber-backed openCypher TCK harness (`ogdb-tck`), crash/durability acceptance suite, benchmark gate harnesses in `ogdb-bench` (with dedicated strict threshold tests), optional `tracing` instrumentation (`query > plan > execute > storage_op`), and transparent LZ4/ZSTD page compression with legacy uncompressed-page readability.
Remaining architecture backlog items are narrower: auto-indexing heuristics, WCOJ/factorized query execution, CLI `migrate`, temporal append-only compaction, and explicit memory/disk budget validation gates.

## What We're Going For

- **Embeddable** — use as a Rust/Python/JS library or standalone CLI
- **Cypher / GQL** — the query language developers already know
- **Graph + Vector + Full-text** in one engine, not three
- **RDF/TTL import** — bring your ontologies, query them with Cypher
- **MCP server built-in** — plug into Claude, Cursor, or any AI agent
- **Rust, columnar storage, MVCC, WAL** — the boring, correct foundations

## Benchmark Harness (Pre-Implementation)

We include a synthetic storage-model benchmark to pressure-test the `CSR+delta` vs hybrid decision before full engine code exists.

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-bench
```

For heavier stress runs:

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-bench -- \
  --nodes 1000000 \
  --edges-per-node 16 \
  --ops 600000 \
  --hot-node-share 0.01 \
  --hot-access-share 0.97 \
  --delta-threshold 0.01 \
  --mem-segment-edges 4096
```

Interpretation follows `ARCHITECTURE.md` gates:
- keep CSR+delta if write share <= 10%, compaction stall p95 <= 50ms, and mixed-load traversal regression <= 20%
- reconsider hybrid if repeated runs at >=30% writes show compaction stall p95 > 200ms or traversal regression > 30%

Latest benchmark summary and policy log: `BENCHMARKS.md`.

## TCK Harness

Run the openCypher TCK harness against a local checkout of the TCK repository:

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-tck -- /path/to/openCypher/tck --floor 0.50
```

The harness parses `.feature` files, executes supported scenario query steps via `Database::query(...)`, and reports pass/fail/skip plus Tier-1 category coverage.

## Development Workflow

Implementation is now test-first and log-driven.

```bash
./scripts/test.sh
```

Changelog structure check:

```bash
./scripts/changelog-check.sh
```

Coverage gate (strict active-crate floor):

```bash
./scripts/coverage.sh
```

Current policy: `ogdb-core` + `ogdb-cli` must stay at or above 98% line coverage with at most 600 uncovered lines.

Method and progress logs:
- `docs/TDD-METHODOLOGY.md`
- `docs/IMPLEMENTATION-LOG.md`
- `docs/FULL-IMPLEMENTATION-CHECKLIST.md`
- `docs/VERSIONING.md`
- `CHANGELOG.md`
- `AGENTS.md` (workflow contract)

CI and review policy:
- `.github/workflows/ci.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

## Looking for Contributors

This is a greenfield project. Everything is being built from scratch.

**Areas we need help with:**

- Storage engines (buffer pools, WAL, crash recovery)
- Query engines (parsing, optimization, execution)
- Rust systems programming
- Vector search / HNSW
- RDF and knowledge graphs
- AI agent tooling / MCP
- Developer experience and documentation

If any of this interests you, please reach out. Open an issue, start a discussion, or just say hello. Every contribution matters.

→ [Issues](https://github.com/asheshgoplani/opengraphdb/issues) · [Discussions](https://github.com/asheshgoplani/opengraphdb/discussions)

## License

Apache 2.0
