# OpenGraphDB

**The SQLite of graph databases. Embeddable, AI-native, Apache 2.0.**

---

An embeddable graph database written in Rust. Single file, zero setup, Cypher queries, native vector search, and built-in MCP support for AI agents.

> **Status: Pre-release — designing and building the foundation**

## The Idea

There's no good embeddable graph database that is truly open source, speaks Cypher, and works natively with AI tools. Neo4j requires a server and is AGPL. KuzuDB was the closest alternative but was abandoned in October 2025. We're building what should exist.

```
opengraphdb init mydata.ogdb
opengraphdb query mydata.ogdb "MATCH (n:Person)-[:KNOWS]->(m) RETURN n.name, m.name"
```

One binary. One file. That's it.

## What We're Going For

- **Embeddable** — use as a Rust/Python/JS library or standalone CLI
- **Cypher / GQL** — the query language developers already know
- **Graph + Vector + Full-text** in one engine, not three
- **RDF/TTL import** — bring your ontologies, query them with Cypher
- **MCP server built-in** — plug into Claude, Cursor, or any AI agent
- **Rust, columnar storage, MVCC, WAL** — the boring, correct foundations

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
