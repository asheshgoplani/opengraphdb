# LLM → Cypher query generation

This page is a one-paragraph redirect. The full runnable walkthrough lives in
[`COOKBOOK.md` Recipe 1 — AI agent over MCP](../COOKBOOK.md#recipe-1--ai-agent-over-mcp).

## What this pattern is

Ship the DB's schema to an LLM, get back a Cypher query, execute it against
OpenGraphDB. The LLM owns natural-language understanding; the DB owns query
execution. Neither pretends to do the other's job.

## Real API surface (don't believe earlier drafts of this file)

- **Schema for the LLM context:** `Database::schema_catalog() -> SchemaCatalog`
  in Rust (`crates/ogdb-core/src/lib.rs::schema_catalog`), or the `schema` MCP
  tool over stdio / HTTP (`POST /mcp/invoke` with `{"name": "schema"}`). There
  is no `db.schema_summary()` method in 0.4.0 — earlier drafts of this page
  cited a name that was never shipped.
- **Cypher execution:** the same `Database::query()` /
  `POST /query` / `execute_cypher` MCP tool. There is no separate "AI" query
  path; the planner that runs the LLM's query is the same one running every
  other query.
- **MCP transport:** `ogdb mcp --stdio` (local), `POST /mcp/tools` +
  `POST /mcp/invoke` (HTTP). Bearer auth on HTTP mirrors the `/query` policy.

## Related

- [`../COOKBOOK.md` Recipe 1](../COOKBOOK.md#recipe-1--ai-agent-over-mcp) — full runnable LLM-to-Cypher walkthrough.
- [`../MIGRATION-FROM-NEO4J.md`](../MIGRATION-FROM-NEO4J.md) — Cypher coverage and what the planner accepts.
- `ARCHITECTURE.md` §4 — query path.
