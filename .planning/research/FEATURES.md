# Feature Research

**Domain:** Graph database frontend / web UI
**Researched:** 2026-03-01
**Confidence:** HIGH (based on direct product documentation for Neo4j Browser, Memgraph Lab, ArangoDB Web Interface, Neo4j Bloom, TigerGraph GraphStudio, G.V(), and FalkorDB Browser)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cypher query editor with syntax highlighting | Every graph DB UI ships this; absence is a dealbreaker for developers | MEDIUM | CodeMirror or Monaco; Cypher grammar mode required. Neo4j Browser, Memgraph Lab, G.V() all ship this as their primary surface. |
| Query autocomplete (schema-aware) | Users expect identifier suggestions for labels, rel-types, property keys; basic completion is table stakes | MEDIUM | Must be schema-driven, not generic keyword-only. Memgraph Lab calls this "IntelliSense". G.V() builds a live schema model from observed data. |
| Query history (persisted across sessions) | Neo4j Browser has persisted history; Memgraph Lab has run history; users assume this universally | LOW | Persisted in localStorage or backend. Ctrl+Up/Down navigation expected. |
| Force-directed graph visualization of query results | Every graph DB product ships graph-view of results as the first display mode | HIGH | WebGL or canvas rendering. Node/edge labels, directional arrows. Limited to a few thousand elements before performance degrades. |
| Node and edge property inspection (side panel) | Users need to inspect properties without re-running queries; all products provide this | LOW | Click-to-inspect on nodes/edges in the scene. Shown in a side/bottom panel. |
| Toggle between graph view and table view | Both views serve different use cases; Neo4j Browser ships graph + table + raw; omitting table breaks data inspection workflows | LOW | Most products show table alongside graph, sometimes as separate tabs. |
| Saved / bookmarked queries | Reduces repetition; every product provides some form of saved query storage | LOW | Neo4j Browser: "Saved Cypher" drawer with folders. Memgraph Lab: "Collections". TigerGraph: named queries. |
| Node color/size by label (basic styling) | Users need visual differentiation between node types; label-color assignment is baseline | LOW | Default palette per label. Point-and-click style editor shown in Neo4j Browser and Memgraph Lab. |
| Connection configuration (server URL, credentials) | Users must configure where the frontend points; required for any non-localhost setup | LOW | Configurable host/port/auth. PROJECT.md specifies this as a hard requirement. |
| Database schema browser (labels, rel-types, property keys) | Users explore what's in the database before querying; Neo4j Browser sidebar shows this at all times | LOW | Lists node labels, relationship types, property keys. Ideally clickable to generate starter queries. |
| Export query results (JSON, CSV) | Developer workflows include extracting data for downstream tools; this is standard | LOW | Download button on result frame. Neo4j Browser exports to CSV/PNG/SVG. Memgraph Lab has CSV export. |
| Database health / connection status indicator | Users need to know if the backend is live; all products show connection state | LOW | Green/red status badge. Health endpoint polling. |
| Dark mode | As of 2025 this is a baseline user expectation, not a differentiator | LOW | CSS variable theming or Tailwind dark-mode classes. TigerGraph GraphStudio ships dark mode by default. |
| Responsive layout (desktop and tablet) | Most graph tools target desktop-first but must degrade gracefully on tablet | LOW | Fluid grid, collapsible sidebar. Full mobile responsiveness is out-of-scope per PROJECT.md. |

---

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Interactive playground with pre-loaded sample graph and guided queries | Dramatically reduces time-to-wow for evaluators; Neo4j Sandbox and Ontotext Sandbox show this converts evaluators into users | MEDIUM | Embed a curated dataset (e.g. movies, social network) with step-by-step query guide in-UI. Guides new users who have never written Cypher. Directly addresses PROJECT.md "evaluators trying OpenGraphDB for the first time" goal. |
| Query execution plan viewer (EXPLAIN / PROFILE) | Developer-facing differentiator; Neo4j Browser renders execution plan trees with arrow thickness proportional to row count; helps users optimize queries | MEDIUM | Only shown for EXPLAIN/PROFILE queries. Requires parsing the plan response from the backend. Few competitors ship this as built-in UI. |
| Rule-based / property-based conditional node styling | Beyond label coloring: color/size nodes based on property values (e.g. PageRank score, status field); NeoDash and Memgraph Lab's Graph Style Script offer this | HIGH | Requires a mini-rule builder or a scripting interface. GSS (Memgraph) is a full DSL. A simpler rule-list UI is more achievable for v1. |
| Import / export UI for CSV and JSON | Gives non-CLI users a path to load data without touching the terminal; ArangoDB and Memgraph Lab both ship this | MEDIUM | Drag-and-drop file upload posting to the import endpoint. Progress feedback. Error report. |
| Admin dashboard (node count, edge count, storage size, query metrics) | Operators and power users need observability from the UI; Memgraph Lab ships monitoring as an enterprise feature but basic stats are expected by technical users | MEDIUM | Polls GET /metrics and GET /stats endpoints exposed by OpenGraphDB. Charts for latency histogram, node/edge counts, WAL size. |
| Index management UI (view and create indexes) | Saves developers from memorizing schema commands; ArangoDB web interface shows indexes per collection; Neo4j Browser exposes this through sidebar only | MEDIUM | List existing indexes (GET /schema), create new ones via form. |
| Clickable schema diagram (schema-as-graph) | Displaying the data model as a node-link diagram (labels as nodes, rel-types as edges) is visually striking and accelerates exploration; PuppyGraph and Memgraph Lab ship this | MEDIUM | Renders GET /schema response as a mini force-directed graph. Clicking a label inserts a starter MATCH query. |
| Node expansion via click ("expand neighbors") | Allows incremental graph exploration without writing Cypher; Neo4j Bloom and G.V() make this central to their UX; Neo4j Browser supports it but deprioritizes it | MEDIUM | Right-click or double-click on a node to expand its neighborhood. Sends a MATCH (n)-[r]->(m) WHERE id(n)=$id query behind the scenes. |
| Natural language query (AI-assisted Cypher generation) | Memgraph Lab "GraphChat" (GPT-4 backed), Neo4j AuraDB natural language queries, NebulaGraph Text2Cypher all ship this in 2025; users are starting to expect it | HIGH | Requires LLM API key configuration or a backend proxy. High complexity; should be a v2 feature but worth designing the UI hook for. |
| MCP integration display / AI agent activity panel | OpenGraphDB is AI-native; surfacing MCP tool calls and agent interactions in the UI is unique to OpenGraphDB's positioning vs Neo4j/Memgraph | HIGH | Shows recent MCP tool invocations, agent queries, and their results. No competitor ships this natively. Fits perfectly with the MCP-first architecture in SPEC.md. |
| Landing / demo page with hero section and feature highlights | Needed for the "showcase/demo experience" goal in PROJECT.md; drives evaluation conversions | MEDIUM | Static marketing section within the SPA. Links to playground. Feature highlights grid. Getting started code snippets. |
| Query parameters panel | Neo4j Browser ships a dedicated drawer for setting `$param` values; Memgraph Lab supports it; avoids string-concatenation hacks in saved queries | LOW | Key-value editor. Values injected into queries at run time. Persisted per session. |
| Multi-result pane / pinnable frames | Neo4j Browser lets users pin a result frame so it stays visible while running new queries; enables side-by-side comparison | LOW | Drag-to-reorder result frames. Pin/unpin toggle. This is a polish feature but users who know Neo4j Browser will miss it. |
| Cypher reference / cheat sheet in-sidebar | Neo4j Browser ships an embedded Cypher cheat sheet with searchable syntax examples; reduces context-switching to docs | LOW | Static embedded reference. Can be seeded from openCypher spec. High value for new users, minimal build cost. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Render the entire graph by default | Users click "show me everything" and expect all nodes to appear | Causes browser freeze with > 1000 nodes; hairball visualizations are unreadable; crashes low-memory devices | Default to LIMIT-bounded queries in the playground; show a node count warning before rendering large result sets; provide a count-first flow ("this query returns 45,000 nodes, show first 500?") |
| Real-time push / subscription view | "Live updating graph" sounds appealing for monitoring use cases | Requires WebSocket infrastructure; subscription-over-REST polling is janky; scope explosion; PROJECT.md explicitly lists real-time streaming as out-of-scope | Provide manual refresh button with last-updated timestamp; auto-refresh metrics panel on configurable interval |
| SPARQL query editor | Some RDF-oriented users will request SPARQL | OpenGraphDB deliberately does not support SPARQL (SPEC.md Section 4.8); building a SPARQL editor implies supporting the protocol | Document the Cypher-over-RDF-import story clearly; provide example Cypher queries that match common SPARQL patterns |
| User authentication and access control in the frontend | Teams want to log in with different permissions | Frontend auth requires a backend auth system; PROJECT.md explicitly lists this as out-of-scope for v1; adds session management, JWT handling, multi-user state complexity | Document that OpenGraphDB frontend is a local-first developer tool; defer to OS-level access control or network isolation for v1 |
| Multi-database switcher | Advanced users want to toggle between databases | Requires backend multi-database support; adds connection state complexity; PROJECT.md lists multi-database as out-of-scope for v1 | Provide a connection URL input field so users can manually reconnect to a different database file |
| Bolt protocol / WebSocket connection from browser | Some users know Neo4j and expect Bolt compatibility | Bolt from browser requires a WebSocket bridge; PROJECT.md specifies HTTP REST only as the transport; adds significant infrastructure complexity | Use HTTP REST API exclusively; document the tradeoff; the same queries work, the protocol just differs |
| Case management and investigation workflows (Linkurious-style) | Enterprise fraud/security teams want annotation, tagging, and team assignment on graph nodes | This is a B2B vertical product, not a developer tool; adds multi-user persistence, notification systems, role-based workflows; out-of-scope for OpenGraphDB's developer positioning | Focus on the developer and evaluator persona; enterprise investigation workflows are a separate product direction if/when adopted |
| Full no-code graph builder (Bloom-style search phrases) | Non-technical users want to build graph views without Cypher | Requires a full perspective/template system; significant UX and backend complexity; OpenGraphDB's primary user is a developer who writes Cypher | Provide a playground with pre-built guided queries that non-technical users can run without modification; defer visual query building to v2+ |

---

## Feature Dependencies

```
[Schema Browser]
    └──requires──> [GET /schema endpoint on backend]
                       └──required by──> [Index Management UI]
                       └──required by──> [Autocomplete provider]
                       └──required by──> [Clickable schema diagram]

[Graph Visualization]
    └──requires──> [Query Editor]
                       └──enhances──> [Query Autocomplete]
                       └──enhances──> [Query History]
                       └──enhances──> [Saved Queries]
                       └──enhances──> [Query Parameters Panel]

[Node Expansion via Click]
    └──requires──> [Graph Visualization]
    └──requires──> [Node property inspection (to get node ID)]

[Query Execution Plan Viewer]
    └──requires──> [Query Editor]
    └──requires──> [EXPLAIN/PROFILE response parsing from backend]

[Admin Dashboard]
    └──requires──> [GET /metrics endpoint]
    └──requires──> [GET /stats / GET /info endpoints]

[Import/Export UI]
    └──requires──> [POST /import endpoint]
    └──requires──> [POST /export endpoint]

[Playground / Guided Queries]
    └──requires──> [Graph Visualization]
    └──requires──> [Query Editor]
    └──enhances──> [Landing / Demo Page]

[Landing / Demo Page]
    └──enhances──> [Playground / Guided Queries]

[Natural Language Query]
    └──requires──> [Query Editor] (output target)
    └──requires──> [Schema Browser] (context for LLM prompt)
    └──requires──> [LLM API key configuration]

[MCP Integration Panel]
    └──requires──> [MCP server running (ogdb mcp)]
    └──requires──> [GET /mcp/activity or equivalent endpoint]

[Rule-Based Node Styling]
    └──requires──> [Basic label-color styling]
    └──requires──> [Schema Browser] (to enumerate property keys)

[Index Management UI]
    └──requires──> [Schema Browser]
    └──requires──> [POST /schema or equivalent create-index endpoint]
```

### Dependency Notes

- **Schema Browser requires backend**: The backend must expose GET /schema before any schema-aware UI features work. This must ship first.
- **Autocomplete requires schema data**: Cannot provide label/rel-type suggestions without schema. Schema Browser is a prerequisite.
- **Node expansion requires node ID**: The click-to-expand feature needs the node's internal ID from the property inspection panel to construct the neighborhood query.
- **Execution plan viewer requires EXPLAIN/PROFILE**: Backend must correctly return plan data in response to EXPLAIN/PROFILE prefixed queries. The UI renders whatever the backend provides.
- **Admin dashboard requires metrics endpoints**: OpenGraphDB must expose GET /metrics and GET /stats. These are already specified in ARCHITECTURE.md but must be wired before the dashboard is useful.
- **Playground depends on visualization and query editor**: The playground is a configuration layer on top of existing core features, not a standalone system.
- **Natural language query conflicts with simple query editor**: Adding an AI text-box in the editor area creates UX ambiguity about which input box to use. Design must be intentional about placement (separate panel vs inline toggle).

---

## MVP Definition

### Launch With (v1)

Minimum viable product for validating the concept with developers and evaluators.

- [ ] Cypher query editor with syntax highlighting — core functionality, no alternative
- [ ] Schema-aware autocomplete — reduces the learning curve to near-zero for new users
- [ ] Force-directed graph visualization of results — the defining visual experience
- [ ] Toggle between graph view and table view — table view is essential for non-graph results
- [ ] Node/edge property inspection via side panel — users need to see data, not just shape
- [ ] Query history (persisted) — prevents repetitive retyping in iterative exploration
- [ ] Saved/bookmarked queries — supports recurring workflows
- [ ] Database schema browser — needed before writing any query
- [ ] Export results as JSON and CSV — necessary for downstream use
- [ ] Connection configuration (server URL) — required for any non-localhost deployment
- [ ] Database health / connection status indicator — baseline operational awareness
- [ ] Dark mode — expected by target audience (developers); low implementation cost
- [ ] Landing/demo page with hero and getting started — serves evaluator persona from PROJECT.md
- [ ] Playground with pre-loaded sample graph and guided queries — serves evaluator persona; converts first impressions

### Add After Validation (v1.x)

Features to add once core visualization and query workflow is proven.

- [ ] Admin dashboard (metrics, node/edge count, storage) — add when the admin/ops persona is validated
- [ ] Import/export UI — add when users demonstrate friction with CLI-only import
- [ ] Index management UI — add when schema management becomes a common support request
- [ ] Query execution plan viewer — add for developer adoption; high-value for power users
- [ ] Node expansion via click — add when exploration-without-Cypher becomes a requested pattern
- [ ] Clickable schema diagram — add after schema browser is in use and users request visual schema
- [ ] Rule-based / conditional node styling — add when users request visual differentiation beyond labels
- [ ] Query parameters panel — add when users report workarounds for parameterized queries
- [ ] Multi-result pane / pinnable frames — polish feature; add when core UX is stable

### Future Consideration (v2+)

Features to defer until product-market fit and deeper user research.

- [ ] Natural language / AI-assisted Cypher generation — requires LLM integration; wait for user demand signal
- [ ] MCP integration display / agent activity panel — unique to OpenGraphDB; build after MCP server is mature
- [ ] Cypher reference / cheat sheet sidebar — valuable but can live in external docs initially

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Cypher query editor + syntax highlighting | HIGH | MEDIUM | P1 |
| Schema-aware autocomplete | HIGH | MEDIUM | P1 |
| Force-directed graph visualization | HIGH | HIGH | P1 |
| Graph / table view toggle | HIGH | LOW | P1 |
| Node/edge property side panel | HIGH | LOW | P1 |
| Query history (persisted) | HIGH | LOW | P1 |
| Schema browser | HIGH | LOW | P1 |
| Connection configuration | HIGH | LOW | P1 |
| Health/connection status | HIGH | LOW | P1 |
| Export results (JSON, CSV) | HIGH | LOW | P1 |
| Dark mode | MEDIUM | LOW | P1 |
| Landing/demo page | HIGH | MEDIUM | P1 |
| Playground with guided queries | HIGH | MEDIUM | P1 |
| Saved/bookmarked queries | MEDIUM | LOW | P1 |
| Admin dashboard (metrics) | MEDIUM | MEDIUM | P2 |
| Import/export UI | MEDIUM | MEDIUM | P2 |
| Index management UI | MEDIUM | MEDIUM | P2 |
| Query execution plan viewer | HIGH | MEDIUM | P2 |
| Node expansion via click | HIGH | MEDIUM | P2 |
| Clickable schema diagram | MEDIUM | MEDIUM | P2 |
| Rule-based node styling | MEDIUM | HIGH | P2 |
| Query parameters panel | MEDIUM | LOW | P2 |
| Multi-result pane / pinnable frames | LOW | MEDIUM | P3 |
| Cypher reference sidebar | MEDIUM | LOW | P3 |
| Natural language query (AI) | HIGH | HIGH | P3 |
| MCP integration panel | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Neo4j Browser | Memgraph Lab | ArangoDB Web UI | TigerGraph GraphStudio | G.V() | OpenGraphDB Frontend Approach |
|---------|--------------|--------------|-----------------|----------------------|-------|------------------------------|
| Cypher editor + highlighting | Yes | Yes | AQL (not Cypher) | GSQL (not Cypher) | Yes (Cypher + Gremlin + SPARQL) | Yes, Cypher-first |
| Schema-aware autocomplete | Yes | Yes ("IntelliSense") | Yes (AQL) | Yes (GSQL) | Yes (schema-model from data) | Yes |
| Graph visualization | Yes | Yes (Orb library, GSS) | Yes | Yes | Yes (WebGL high-perf) | Yes (force-directed) |
| Table view | Yes | Yes | Yes | Yes | Yes | Yes |
| Node property inspection | Yes | Yes | Yes | Yes | Yes | Yes |
| Query history | Yes (persisted) | Yes | Yes | Yes | Yes | Yes (persisted) |
| Saved queries | Yes (folders) | Yes (Collections) | Yes | Yes (named queries) | Yes | Yes |
| Schema browser | Yes (sidebar) | Yes | Yes | Yes (Design Schema page) | Yes (schema-as-graph) | Yes |
| Export results | Yes (CSV/PNG/SVG) | Yes (CSV) | Yes | Yes | Yes | Yes (JSON + CSV) |
| Dark mode | Yes | Yes | No | Yes (default) | Yes | Yes |
| Admin / monitoring dashboard | No (limited) | Yes (Enterprise) | Yes | Yes | No | Yes (core, not enterprise-gated) |
| Import UI | No | Yes (CSV) | Yes | Yes (data mapping wizard) | No | Yes |
| Index management UI | Partial (sidebar only) | No | Yes | Yes | No | Yes |
| Query plan viewer (EXPLAIN/PROFILE) | Yes | No | Yes (AQL explain) | Yes | No | Yes (v1.x) |
| Node expansion via click | Partial | No | No | Yes | Yes | Yes (v1.x) |
| Rule-based styling | No | Yes (GSS script) | No | No | No | Simplified rule-list (v1.x) |
| Natural language / AI query | Yes (AuraDB only) | Yes (GraphChat) | No | No | No | Defer to v2 |
| Playground / demo mode | No (separate Neo4j Sandbox) | No | No | No | No | Yes (v1 differentiator) |
| MCP integration panel | No | No | No | No | No | Yes (unique to OpenGraphDB, v2) |
| Landing / marketing page in-app | No | No | No | No | No | Yes (v1 differentiator) |

---

## Sources

- Neo4j Browser documentation and visual tour: [https://neo4j.com/docs/browser-manual/current/visual-tour/](https://neo4j.com/docs/browser-manual/current/visual-tour/)
- Neo4j Browser GitHub: [https://github.com/neo4j/neo4j-browser](https://github.com/neo4j/neo4j-browser)
- Memgraph Lab features: [https://memgraph.com/docs/memgraph-lab/features](https://memgraph.com/docs/memgraph-lab/features)
- Memgraph GraphChat: [https://memgraph.com/blog/graphchat-natural-language-graph-db-queries](https://memgraph.com/blog/graphchat-natural-language-graph-db-queries)
- Neo4j Bloom overview: [https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-overview/](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-overview/)
- Neo4j Bloom scene actions: [https://neo4j.com/blog/developer/bloom-scene-actions-different-way-to-interact-with-your-graph/](https://neo4j.com/blog/developer/bloom-scene-actions-different-way-to-interact-with-your-graph/)
- ArangoDB web interface: [https://docs.arangodb.com/3.11/components/web-interface/graphs/](https://docs.arangodb.com/3.11/components/web-interface/graphs/)
- TigerGraph GraphStudio: [https://www.tigergraph.com/graphstudio/](https://www.tigergraph.com/graphstudio/) and [https://docs.tigergraph.com/gui/current/graphstudio/overview](https://docs.tigergraph.com/gui/current/graphstudio/overview)
- G.V() Graph Database IDE: [https://gdotv.com/](https://gdotv.com/)
- Linkurious Enterprise features: [https://linkurious.com/blog/linkurious-enterprise-3-0/](https://linkurious.com/blog/linkurious-enterprise-3-0/)
- Graph visualization UX pitfalls: [https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)
- NeoDash rule-based styling: [https://neo4j.com/labs/neodash/2.4/user-guide/extensions/rule-based-styling/](https://neo4j.com/labs/neodash/2.4/user-guide/extensions/rule-based-styling/)
- Neo4j EXPLAIN/PROFILE browser support: [https://support.neo4j.com/s/article/6638160188691-How-to-get-Cypher-query-execution-plans-using-EXPLAIN-and-PROFILE](https://support.neo4j.com/s/article/6638160188691-How-to-get-Cypher-query-execution-plans-using-EXPLAIN-and-PROFILE)
- Neo4j Sandbox playground: [https://neo4j.com/sandbox/](https://neo4j.com/sandbox/)
- GraphDB Sandbox (Ontotext): [https://graphwise.ai/blog/introducing-graphwise-sandbox-explore-the-power-of-graphdb-in-minutes/](https://graphwise.ai/blog/introducing-graphwise-sandbox-explore-the-power-of-graphdb-in-minutes/)

---
*Feature research for: Graph database frontend / web UI*
*Researched: 2026-03-01*
