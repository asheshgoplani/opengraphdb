---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: AI-First Developer Tools & Demo
status: active
last_updated: "2026-03-12T09:37:00.000Z"
progress:
  total_phases: 13
  completed_phases: 9
  total_plans: 30
  completed_plans: 28
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** AI-first graph database where developers install skills to work with graph data through natural language, and visitors can talk to knowledge graphs live on the website
**Current focus:** Milestone v2.0 — roadmap formalized, ready to begin Phase 10 (MCP Server)

## Current Position

Phase: 10 (MCP Server for OpenGraphDB) — In progress (Plan 01 complete)
Plan: 01 complete
Status: Phase 10 Plan 01 complete; next plan in Phase 10 if applicable, else Phase 11
Last activity: 2026-03-12 — Phase 10 Plan 01 executed: @opengraphdb/mcp npm package with 5 MCP tools

```
Milestone 2 Progress: [##        ] 1/4 phases in progress
Phase 10: [1/?] In progress — Plan 01 complete (@opengraphdb/mcp package + 5 tools)
Phase 11: [ ] Not started
Phase 12: [ ] Not started
Phase 13: [ ] Not started
```

## Performance Metrics

**Velocity:**
- Total plans completed: 27
- Average duration: ~15 min/plan
- Total execution time: ~6.75 hours (estimated)

**By Phase:**

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 1. Foundation and Graph Visualization | 5/5 | Complete | 2026-03-01 |
| 2. Cypher Editor and Query Workflow | 3/3 | Complete | 2026-03-01 |
| 3. Schema Browser | 1/1 | Complete | 2026-03-01 |
| 4. Landing Page and Playground | 3/3 | Complete | 2026-03-01 |
| 5. Frontend Polish & Knowledge Graph Showcase | 6/6 | Complete | 2026-03-01 |
| 6. Production Demo Datasets & Live Backend Integration | 3/3 | Complete | 2026-03-01 |
| 7. Real-World Famous Dataset Showcase | 3/3 | Complete | 2026-03-02 |
| 8. Revolutionary Graph Visualization | 3/3 | Complete | 2026-03-02 |
| 9. AI Knowledge Graph Assistant | 3/3 | Complete | 2026-03-03 |
| 10. MCP Server for OpenGraphDB | 1/? | In progress | — |
| 11. Developer Skills & CLI | 0/? | Not started | — |
| 12. Graph-Native RAG Engine | 0/? | Not started | — |
| 13. AI Demo Experience | 0/3 | Not started | — |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Use React + TypeScript + Vite + Tailwind + shadcn/ui per spec
- [Init]: Use react-force-graph-2d (canvas renderer) for graph visualization
- [Init]: Use CodeMirror 6 + @neo4j-cypher/react-codemirror@next for Cypher editor
- [Init]: Use TanStack Query for server state, Zustand for client state
- [Phase 1]: Tailwind v3 selected (per global CLAUDE.md preference)
- [Phase 2]: CodeMirror Cypher editor integrated with schema-aware autocomplete
- [Phase 3]: Schema panel with accordion sections for labels, types, properties
- [Phase 4]: Movies sample graph chosen for playground dataset
- [Phase 5]: Linear/Vercel aesthetic target, keep react-force-graph-2d but heavy polish
- [Phase 5]: Real-world graph showcase (Wikidata, IMDB, PubMed references)
- [Phase 5]: Split-pane playground with multiple datasets, query cards, connection status
- [Phase 5]: Playwright screenshot tests for visual verification
- [Phase 6]: Movies flagship (real data, ~200-500 nodes), expand social & fraud secondaries
- [Phase 6]: Dual mode playground (offline fallback + live backend toggle)
- [Phase 6]: JSON import files + shell seed script, idempotent reset & reload
- [Phase 7]: 4 famous datasets: MovieLens (subset), Air Routes (full), GoT (full), Wikidata (slice)
- [Phase 7]: Replace existing 3 synthetic datasets with 4 real-world famous datasets
- [Phase 7]: Download scripts fetch from original sources, convert, import via seed pipeline
- [Phase 7]: Air Routes must preserve lat/long for Phase 8 geographic rendering
- [Phase 07-real-world-famous-dataset-showcase]: Node IDs use short dataset prefixes (ml-, ar-, got-, wd-) to prevent collision with live backend numeric IDs
- [Phase 07-real-world-famous-dataset-showcase]: Air Routes airports use accurate real-world float lat/lon coordinates for Phase 8 geographic rendering
- [Phase 07-01]: ID ranges: MovieLens 0-99999, Air Routes 1M+, GoT 2M+, Wikidata 3M+ for zero-collision coexistence
- [Phase 07-01]: Air Routes CSV uses typed column suffixes (lat:double, code:string) - must use exact names in conversion
- [Phase 07-01]: Nobel Prize API returns multilingual dicts not strings - use get_en() helper to extract English values
- [Phase 07-03]: ShowcaseSection grid uses md:grid-cols-2 lg:grid-cols-4 for responsive 2x2 on medium, 1x4 on large screens
- [Phase 07-03]: Landing heading updated to 'Famous Graph Datasets' reflecting real-world benchmark nature
- [Phase 08-02]: TraceCollector instruments real traversal at PhysicalScan/PhysicalExpand, propagated through Filter/Project/Sort/Limit recursively
- [Phase 08-02]: POST /query/trace SSE endpoint intercepts before dispatch_http_request in serve_http loop — existing /query unchanged
- [Phase 08-02]: Frontend SSE parsing uses fetch + ReadableStream (not EventSource which lacks POST support)
- [Phase 08-revolutionary-graph-visualization]: MapLibre Map component imported as MapLibreMap alias to prevent shadowing JS global Map constructor causing TS7009 errors
- [Phase 08-01]: GeoCanvas uses CARTO Dark Matter tiles (no API key) with deck.gl ScatterplotLayer for airports and ArcLayer for great-circle routes with pulse animation
- [Phase 08-01]: isGeographic flag on DatasetMeta auto-activates geographic mode when Air Routes dataset is selected — no user toggle needed
- [Phase 08-03]: Viewport culling uses ctx.getTransform() to compute graph-space visible bounds — avoids react-force-graph-2d needing to expose viewport rect
- [Phase 09-01]: Dynamic imports per adapter: avoids bundling all AI SDKs in main chunk; each provider loaded only when createProvider() is called
- [Phase 09-01]: Singleton WebLLM engine: module-level variable prevents re-downloading model weights across re-renders
- [Phase 09-01]: System message separation in Anthropic adapter: Anthropic API takes system as top-level param, not in messages array
- [Phase 09-01]: Google Gemini uses @google/genai (GA May 2025) not deprecated @google/generative-ai
- [Phase 09-01]: createProvider factory is async (Promise-returning) to support dynamic imports — callers must await it
- [Phase 09-02]: Streamdown used over react-markdown for AI message rendering — handles unterminated code fences during token streaming without visual glitching
- [Phase 09-02]: Run Query and Copy buttons rendered only after isStreaming === false to prevent premature Cypher block extraction
- [Phase 09-02]: AIChatPanel accepts onSendMessage and onRunQuery as props; AI provider calls wired in Plan 03
- [Phase 09-03]: useAIChat hook wraps provider lifecycle, sends messages via rolling window, feeds trace results/errors back to AI automatically
- [Phase 09-03]: AIChatPanel rendered once per route (Header for /app via AppShell, PlaygroundPage for /playground) using shared Zustand store for open state
- [Phase 09-03]: MCPActivityPanel added as collapsible Activity section at bottom of AIChatPanel
- [Phase 09-03]: runCypherFromAI calls clearTrace() before executing to prevent animation conflicts (per Pitfall 5)
- [Milestone 2 Roadmap]: MCP server published as @opengraphdb/mcp, zero-config via npx
- [Milestone 2 Roadmap]: Skills built to Skills 2.0 open standard, portable across Claude Code, Copilot, Codex, Cursor
- [Milestone 2 Roadmap]: Graph-native RAG uses PageIndex-style navigation (graph IS the index, no separate construction)
- [Milestone 2 Roadmap]: Phase 12 RAG depends on Phase 10 MCP (RAG tools are MCP-exposed); Phase 13 depends on both 10 and 12
- [Phase 10-01]: @modelcontextprotocol/sdk v1 (stable) used — not v2 (pre-alpha)
- [Phase 10-01]: Native fetch (Node 18+) for HTTP client — no external HTTP library needed
- [Phase 10-01]: Tool registration via registerXxx(server, client) factory functions for clean separation
- [Phase 10-01]: Dual-block content responses: human-readable text + raw JSON for LLM flexibility
- [Phase 10-01]: search_nodes fetches schema first to build dynamic WHERE clause across string properties
- [Phase 10-01]: OGDB_URL env var with http://localhost:8080 default for zero-config local development

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-12
Stopped at: Phase 10 Plan 01 complete — @opengraphdb/mcp npm package with 5 MCP tools, builds and responds to MCP initialize handshake
Resume at: Phase 10 Plan 02 (if exists) or Phase 11
