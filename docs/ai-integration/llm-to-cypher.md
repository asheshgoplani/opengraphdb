# LLM → Cypher query generation

**Status:** stub — detailed walkthrough lands in a follow-up slice.

## What this pattern is

Ship the DB's schema to an LLM, get back a Cypher query, execute it against
OpenGraphDB. The LLM owns natural-language understanding; the DB owns query
execution. Neither one pretends to do the other's job.

## Why use OpenGraphDB here

- `db.schema_summary()` returns labels, edge types, and property keys in a
  machine-readable shape the model can condition on.
- The same Cypher the LLM writes runs through the planner every other query
  uses — no separate "AI" code path.
- `ogdb mcp --stdio` exposes the same surface as a JSON-RPC tool, so the
  same LLM integration works locally and in a Cursor / Claude session.

## Reference snippet

See `AIIntegrationSection.tsx` pattern 1 (landing page) for the canonical
copy.

## Related

- `ARCHITECTURE.md` §4 — query path
- `SPEC.md` §6 — MCP surface
