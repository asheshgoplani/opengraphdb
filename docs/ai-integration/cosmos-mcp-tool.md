# cosmos.gl visualization as an MCP tool

**Status:** stub — detailed walkthrough lands in a follow-up slice.

## What this pattern is

Wrap the cosmos.gl WebGL graph renderer as a Model Context Protocol (MCP)
tool, exposed over stdio. Any MCP-speaking agent can then call
`render_graph(cypher, width)` and receive a PNG of the result — useful when
graph topology is easier to read visually than as a JSON array of edges.

## Why use OpenGraphDB here

- The Cypher query runs through the same `ogdb serve --http` backend the
  playground uses — there is no shadow query path.
- Because MCP returns rich content blocks, an agent can inline the PNG into
  its reasoning without the user ever leaving the chat surface.
- Paired with pattern 1 (LLM → Cypher), the LLM can ask follow-up questions
  like "zoom in on this component" and get another rendered frame.

## Reference snippet

See `AIIntegrationSection.tsx` pattern 3 (landing page).

## Related

- `frontend/src/components/graph/GraphCanvas.tsx` — the renderer this wraps
- `SPEC.md` §6 — MCP surface
