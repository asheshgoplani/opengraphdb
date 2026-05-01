# cosmos.gl visualization as an MCP tool

This page is a one-paragraph redirect. The MCP tool catalog is documented in
[`COOKBOOK.md` Recipe 1 — AI agent over MCP](../COOKBOOK.md#recipe-1--ai-agent-over-mcp);
the cosmos.gl renderer that this pattern wraps lives in
[`frontend/src/components/graph/GraphCanvas.tsx`](../../frontend/src/components/graph/GraphCanvas.tsx).

## What this pattern is

Wrap the cosmos.gl WebGL graph renderer as a Model Context Protocol (MCP)
tool. Any MCP-speaking agent can then ask the renderer for a visual of a
graph slice when topology is easier to read visually than as a JSON array of
edges.

## Real API surface

- **MCP transport:** `ogdb mcp --stdio` (local) or `POST /mcp/tools` +
  `POST /mcp/invoke` (HTTP). The 20-tool catalog returned by
  `POST /mcp/tools` is the canonical list — see
  [`COOKBOOK.md` Recipe 1](../COOKBOOK.md#recipe-1--ai-agent-over-mcp) and the
  source-of-truth handler at
  [`crates/ogdb-cli/src/lib.rs::execute_mcp_tools_list`](../../crates/ogdb-cli/src/lib.rs).
- **Rendering surface (this pattern):** A render-graph MCP tool wrapping
  the same cosmos.gl renderer the playground uses. The Cypher input runs
  through the same `ogdb serve --http` backend — there is no shadow query
  path.
- **Status:** the wrapper itself is illustrative; OpenGraphDB ships the data
  surface, the renderer is in the frontend tree, and the wrapper that joins
  them is recipe-shaped. Treat this page as a sketch of the integration
  shape, not a guarantee that a `render_graph` MCP tool ships in core today.

## Related

- [`../COOKBOOK.md` Recipe 1](../COOKBOOK.md#recipe-1--ai-agent-over-mcp) — the canonical 20-tool MCP catalog.
- [`frontend/src/components/graph/GraphCanvas.tsx`](../../frontend/src/components/graph/GraphCanvas.tsx) — the renderer this pattern wraps.
