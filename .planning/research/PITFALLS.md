# Pitfalls Research

**Domain:** Graph database frontend/web UI (interactive visualization, Cypher editor, REST API, admin dashboard)
**Researched:** 2026-03-01
**Confidence:** HIGH (critical/performance pitfalls verified via multiple sources including GitHub issues, official docs, and academic benchmarks); MEDIUM (UX/integration pitfalls from community sources)

---

## Critical Pitfalls

### Pitfall 1: Rendering Technology Mismatch — Using SVG for Graphs Beyond ~500 Nodes

**What goes wrong:**
The default rendering mode in most high-level React graph libraries is SVG (or DOM-based). SVG performance degrades sharply beyond 500-1000 nodes and becomes unusable beyond 2000 nodes. Canvas extends this to ~5000 nodes. For graph exploration UIs where a single Cypher query can return thousands of results, choosing the wrong renderer in Phase 1 means a full architectural rewrite later.

**Why it happens:**
Developers pick libraries based on ease of integration (react-force-graph default, cytoscape.js default) without checking the rendering backend. The library "works" in demos with 50 test nodes, but breaks in production with real data.

**How to avoid:**
- Use WebGL-backed rendering by default: `react-force-graph` uses Three.js/WebGL for 3D and a canvas renderer for 2D — verify the renderer before committing.
- Set a hard query result cap (default 500 nodes, configurable up to 2000) before the graph renders.
- Benchmark the chosen library with 500, 1000, and 5000 nodes during library selection in Phase 1. Don't defer this.
- For react-force-graph specifically: the 2D variant uses canvas (acceptable for ~5k nodes), the 3D variant uses WebGL (acceptable for ~10k nodes). Start with 2D canvas.

**Warning signs:**
- Frame rate drops when adding more than 200 nodes to the canvas during development testing.
- The library's GitHub issues contain threads like "performance for large datasets" (react-force-graph has confirmed issues at 12k+ elements).
- Animation becomes jerky on laptop-class hardware with fewer than 1000 nodes.

**Phase to address:** Phase 1 (graph visualization foundation) — library selection benchmark must include 1k-node stress test.

---

### Pitfall 2: Unbounded Query Results Destroying the UI

**What goes wrong:**
A `MATCH (n) RETURN n` query on any non-trivial graph returns thousands or millions of nodes. Without a result cap, the browser receives an enormous JSON payload, tries to render every node in the force simulation, and either crashes the tab or freezes for 30+ seconds. This is the single most common "first bug" in graph database UIs.

**Why it happens:**
Developers focus on the happy path (small demo graphs) and treat result limiting as a future concern. The REST API will happily return 100k nodes if asked.

**How to avoid:**
- Always append `LIMIT N` to outgoing queries server-side or inject it in the query execution layer before sending to the backend. Never trust the user to limit their own queries.
- Display a visible "Results capped at 500 nodes" banner when the limit is applied.
- Implement a configurable cap with a hard maximum. Default: 500. Configurable: up to 2000. Never unlimited from the browser.
- Show the total count separately from the rendered count ("Showing 500 of 12,847 results").

**Warning signs:**
- No `LIMIT` clause visible in the query execution path.
- The query editor allows `MATCH (n) RETURN n` to execute without any interception.
- Network tab shows multi-MB responses for simple exploratory queries.

**Phase to address:** Phase 1 (query execution layer) — implement result cap before the visualization layer renders anything.

---

### Pitfall 3: Force Simulation Causing Continuous React Rerenders

**What goes wrong:**
Force-directed graph layouts run physics simulations that continuously update node positions (60fps while the simulation is active). If these position updates flow through React state, React rerenders the entire component tree on every tick — this creates 60 rerenders per second, makes the UI unresponsive, and degrades performance dramatically. This is confirmed in react-force-graph GitHub issues (issue #226: "is there a way to not always re-render the graph when I want to change a node color").

**Why it happens:**
Developers store graph node positions in React state to "keep things React-idiomatic." The force simulation calls setState on each physics tick.

**How to avoid:**
- Keep graph node positions in a ref, not state. Only update React state for structural changes (new nodes/edges added or removed).
- Use imperative APIs for graph mutations: react-force-graph exposes a ref-based API for direct canvas manipulation without triggering React rerenders.
- Separate data concerns (React state: which nodes exist) from layout concerns (ref: where nodes are positioned).
- Debounce color/style changes with requestAnimationFrame rather than immediate setState calls.

**Warning signs:**
- React DevTools profiler shows rerenders firing at 60fps even when the user is not interacting.
- "Graph update" logic modifies state that includes x/y position coordinates.
- Adding a new node causes visible layout "reset" where all other nodes jump.

**Phase to address:** Phase 1 (graph visualization foundation) — establish state management boundary between data and layout before building interactive features.

---

### Pitfall 4: Monaco Editor Adding 4-6MB to Initial Bundle

**What goes wrong:**
Monaco Editor (the VS Code editor) ships approximately 4-6MB of JavaScript. Imported naively, this goes into the main bundle and increases initial load time by 3-8 seconds on typical connections. This makes the app feel slow on first load before the user has done anything.

**Why it happens:**
Developers add `@monaco-editor/react` and import it at the top level. The bundler includes all of Monaco (all language modes, workers, CSS) in the main chunk.

**How to avoid:**
- Lazy-load the Cypher editor component using React.lazy() + Suspense — the editor only loads when the user navigates to the query page.
- Use Vite's dynamic import for the editor route: `const QueryEditor = lazy(() => import('./pages/QueryEditor'))`.
- Consider CodeMirror 6 as a lighter alternative (~500KB vs 4-6MB for Monaco) — Neo4j publishes `@neo4j-cypher/codemirror` which provides Cypher syntax support for CodeMirror 6.
- If using Monaco: use `@monaco-editor/react`'s CDN mode for development, and configure `monaco-editor-webpack-plugin` (or Vite equivalent) to only include the languages needed.

**Warning signs:**
- `vite build` output shows a single chunk exceeding 2MB.
- Lighthouse initial load score below 70 with the editor included in the main bundle.
- Running `npx bundlephobia monaco-editor` and seeing the 4MB+ gzipped size without planning for code splitting.

**Phase to address:** Phase 1 (Cypher editor setup) — lazy loading must be part of the initial integration, not a later optimization.

---

### Pitfall 5: Cypher Injection via Unsanitized Query Passthrough

**What goes wrong:**
If the frontend accepts any user input (node labels, property names, search terms) and interpolates it directly into Cypher queries sent to the backend, it creates Cypher injection vulnerabilities. This is equivalent to SQL injection — attackers can read all graph data, execute LOAD CSV to perform SSRF, or exfiltrate data. CVE-2024-8309 (LangChain's GraphCypherQAChain) demonstrates this class of vulnerability.

**Why it happens:**
Developers treat the graph database as internal tooling and assume users are trusted. When search boxes or filter inputs feed into `WHERE n.name = '${userInput}'`, the assumption breaks.

**How to avoid:**
- Never interpolate user input into Cypher strings. Use parameterized queries exclusively for all property values.
- For node labels and relationship types (which Cypher cannot parameterize), maintain a strict server-side allowlist — do not accept arbitrary label strings from the browser.
- Display generic error messages; never return raw database error text to the browser (it reveals schema information).
- The frontend should only pass query parameters (key-value pairs), not raw Cypher fragments, for any filter/search UI.
- Reserve raw Cypher execution (the query editor) as an explicit, acknowledged power-user feature.

**Warning signs:**
- Search/filter UI components that build Cypher strings by concatenation on the client side.
- Any `WHERE n.${propertyName} = '${value}'` pattern in the API layer.
- Database errors containing schema details (label names, property names) appearing in browser console.

**Phase to address:** Phase 2 (REST API integration layer) — establish parameterized query patterns before any filter UI is built.

---

## Moderate Pitfalls

### Pitfall 6: Layout Thrash When Adding Nodes Incrementally

**What goes wrong:**
When a user "expands" a node by clicking it (load its neighbors from the API), the force simulation restarts from scratch, causing all existing nodes to jump to new positions. Users lose their mental map of where nodes were. After several expansions, the graph becomes unusable because every interaction reshuffles everything.

**Why it happens:**
The default behavior of force-directed simulations is to reheat (alpha resets to 1) when nodes are added, recalculating all positions from initial conditions.

**How to avoid:**
- Pin existing nodes' positions when adding new ones: set `fx` and `fy` on already-positioned nodes before adding new neighbors.
- Use the library's `alphaDecay` and `velocityDecay` settings to reduce simulation energy on incremental updates.
- Animate new nodes fading in from the position of their parent node (rather than random placement), which makes the layout feel stable.
- Freeze the simulation (`simulation.stop()`) after initial layout stabilizes, only reactivate for new additions.

**Warning signs:**
- Clicking "expand node" causes all other nodes to move.
- The force simulation's alpha value is not being managed (left at default restart behavior).
- User testing shows participants losing track of previously explored nodes after expansion.

**Phase to address:** Phase 2 (interactive graph exploration) — node pinning strategy must be designed before expand/collapse is implemented.

---

### Pitfall 7: CORS Misconfiguration Blocking Development and Production

**What goes wrong:**
The frontend SPA runs on localhost:5173 (Vite dev server) and makes requests to the OpenGraphDB REST API on localhost:8080. Without CORS configuration on the server, all API calls fail with CORS errors. In production, if the SPA is served from a different origin than the API, the same issue recurs. Developers waste hours debugging what appears to be a network or auth problem.

**Why it happens:**
Backend developers configure CORS for the production domain but forget the Vite dev server port. Or the SPA is deployed to a CDN (different origin) but the API doesn't include the CDN origin in CORS headers.

**How to avoid:**
- Configure a Vite dev proxy in `vite.config.ts` to avoid CORS during development entirely: route `/api/*` requests through the dev server to the backend.
- Document the required CORS headers for OpenGraphDB's HTTP server: `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`.
- The configurable server URL feature must be tested across origins, not just same-origin.
- Never use `Access-Control-Allow-Origin: *` with credentialed requests (if credentials are added later, this breaks silently).

**Warning signs:**
- `CORS error` in the browser console on any API call.
- Development works but production fails (different origins).
- API calls succeed in Postman/curl but fail in the browser (classic CORS symptom).

**Phase to address:** Phase 2 (REST API integration) — Vite proxy setup must be in the initial API integration, not discovered when the first fetch fails.

---

### Pitfall 8: Schema Browser Showing Stale or Empty State

**What goes wrong:**
The schema browser (for autocomplete and node type display) fetches schema once on app load and caches it for the session. If the database schema changes (new labels added via import), the schema becomes stale. Worse, if the `/schema` endpoint is called before the database is ready, the schema browser shows empty — and the user gets no autocomplete, no label filtering, and no visual differentiation between node types.

**Why it happens:**
Schema fetch is treated as a one-time initialization step rather than a live, refreshable resource. Empty/error states for the schema fetch are not handled separately from "schema loaded but empty."

**How to avoid:**
- Implement a manual "Refresh Schema" button in the schema browser.
- Distinguish between "schema fetch failed" (network/server error) and "schema is genuinely empty" (new/empty database) — show different UI for each.
- Cache schema with a TTL (5 minutes reasonable default) and refetch after import operations complete.
- Cypher autocomplete must gracefully degrade when schema is unavailable — still allow free-form typing, just without label/property suggestions.

**Warning signs:**
- Schema fetch is a one-time call in a top-level useEffect with no refresh mechanism.
- Empty schema state shows the same UI as "schema loaded successfully with zero labels."
- After running an import, the schema browser still shows the pre-import state.

**Phase to address:** Phase 3 (schema browser and admin dashboard) — define schema refresh strategy before building autocomplete that depends on it.

---

### Pitfall 9: Importing Large Files in the Browser Causing Memory Crashes

**What goes wrong:**
The import UI allows users to select CSV/JSON files. If the frontend reads the entire file into memory before sending it (using `FileReader.readAsText()` on a 500MB CSV), the browser tab crashes. The POST body is too large for typical server configurations, and the user gets a silent failure or a cryptic network error.

**Why it happens:**
Browser file upload demos always use small files. The developer tests with a 10KB sample, it works, and the feature ships. Users then try to import their 200MB production dataset.

**How to avoid:**
- Stream file uploads using `ReadableStream` or chunked multipart uploads — never read the entire file into memory.
- Display a clear file size warning (e.g., "Files over 50MB should be imported via CLI for best performance").
- Implement upload progress with an `XMLHttpRequest` or `fetch` with `ReadableStream` body to show incremental progress.
- For large imports, recommend the CLI path rather than building a full chunked streaming pipeline in the browser for v1.
- Set a documented frontend file size limit (suggest 50MB) with a clear error message, not a silent crash.

**Warning signs:**
- Import UI uses `FileReader.readAsText()` or `FileReader.readAsArrayBuffer()` on the full file.
- No file size check before initiating the upload.
- Upload POST uses a simple `fetch` with the full file as the body, with no streaming.

**Phase to address:** Phase 3 (import/export UI) — file size limits and streaming approach must be designed before the UI is built.

---

### Pitfall 10: Polling Metrics Too Aggressively on the Admin Dashboard

**What goes wrong:**
The admin health/metrics dashboard polls `GET /health` and `GET /metrics` every second. With 5 dashboard widgets each polling independently, the frontend sends 300 requests per minute to a database that is trying to serve queries. This degrades database performance and creates misleading "the database is slow" signals caused by the monitoring overhead itself.

**Why it happens:**
"Real-time" dashboards feel like they should update continuously. Developers implement a simple `setInterval` in each widget's useEffect without considering the aggregate request load.

**How to avoid:**
- Use a single shared polling interval for all metrics (not one per widget). The dashboard component owns one interval, distributes data to children via context/props.
- Default polling interval: 15 seconds for metrics, 30 seconds for health. Make both configurable.
- Stop polling when the tab is hidden (`document.visibilityState === 'hidden'`) using the Page Visibility API.
- For a local development tool, polling is acceptable. For a future multi-user scenario, switch to Server-Sent Events.

**Warning signs:**
- Each dashboard widget has its own `setInterval` in useEffect.
- Network tab shows >10 requests per second to the backend from an idle dashboard.
- The polling interval is hardcoded to 1000ms (1 second).

**Phase to address:** Phase 3 (admin dashboard) — establish a shared metrics poller before wiring up individual widgets.

---

## Minor Pitfalls

### Pitfall 11: Node Label Overflow and Visual Crowding

**What goes wrong:**
Graph nodes render with their full label/property value as visible text. With more than 50 nodes on screen, labels overlap so severely that no individual node is readable. The "hairball" anti-pattern: the graph looks like a dense mass of overlapping text and lines.

**How to avoid:**
- Show node labels only on hover (tooltip) or when zoomed in past a threshold.
- Use short display labels (truncated to 15-20 characters) with full label in the detail side panel.
- Apply zoom-level-dependent label visibility: hide labels when zoom < 0.5, show truncated labels at 0.5-1.5, show full labels above 1.5.
- Differentiate node types with color and shape rather than relying on text labels for primary identification.

**Phase to address:** Phase 1 (graph visualization foundation) — label rendering strategy must be part of the initial node renderer, not retrofitted.

---

### Pitfall 12: Query History and Saved Queries Using localStorage Without Size Management

**What goes wrong:**
Query history is stored in localStorage. Large Cypher queries accumulate over time. When localStorage approaches the 5-10MB browser limit, writes silently fail. The user's history is then stuck in an inconsistent state — new queries don't save, but the UI shows no error.

**How to avoid:**
- Cap query history at 100 entries, evicting the oldest when the limit is reached.
- Wrap all localStorage writes in try/catch to handle `QuotaExceededError`.
- For saved/bookmarked queries, store only the query string and metadata — never store query result data in localStorage.
- Consider IndexedDB for larger persistent storage if history/saved queries grow beyond what localStorage handles cleanly.

**Phase to address:** Phase 2 (query editor with history) — cap and error handling must be in the initial localStorage implementation.

---

### Pitfall 13: Hardcoded localhost:8080 as Default Server URL

**What goes wrong:**
The configurable server URL defaults to `http://localhost:8080` and this value is hardcoded in multiple places: the API client, the health check component, and the connection settings form. When the frontend is served from a path where the backend is at a different address, every hardcoded reference needs to be found and updated. This also breaks when the frontend is served by OpenGraphDB's own HTTP server from a different port.

**How to avoid:**
- Store the server URL in a single location: a Zustand/React context store initialized from localStorage (falling back to `http://localhost:8080`).
- All API calls go through a single API client module that reads from this central store.
- Expose the server URL configuration prominently in a "Connection" settings panel accessible from the app header.
- Support a `VITE_API_BASE_URL` environment variable so deployment environments can set it at build time.

**Phase to address:** Phase 1 (REST API client setup) — single source of truth for server URL before any API call is implemented.

---

### Pitfall 14: Dark Mode CSS Variable Conflicts with Graph Library Styles

**What goes wrong:**
Shadcn/ui uses CSS custom properties for theming. The graph visualization library (react-force-graph, cytoscape.js) uses hardcoded color values (e.g., `#999` for edges, `#1f77b4` for nodes) that don't respond to the CSS variable system. When dark mode is toggled, the app chrome switches but the graph canvas stays in light-mode colors — black labels on dark backgrounds become invisible, light-colored edges disappear.

**How to avoid:**
- Read CSS variable values programmatically when constructing graph renderer options, rather than using hardcoded hex values in graph configuration.
- Define a graph color palette as JavaScript constants that are toggled when the theme changes (listen for `prefers-color-scheme` or the app's theme toggle).
- Test both themes explicitly during Phase 1 graph integration — don't defer dark mode to a later pass.
- Canvas/WebGL renderers require explicit color values; they cannot inherit CSS variables automatically.

**Phase to address:** Phase 1 (graph visualization foundation) — theme-aware graph color system must be established with the initial renderer.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline Cypher string building for filters | Faster to implement filter UI | Cypher injection vulnerability, hard to test | Never |
| Global polling interval per widget | Simpler widget code | 5x the network requests, degrades DB performance | Never |
| SVG rendering without evaluating node count | Works immediately with demo data | Forced rewrite when real data arrives | Never — benchmark before shipping |
| `localStorage` without error handling | Saves a try/catch | Silent data loss when storage is full | Never |
| Hardcoding `localhost:8080` | One less config surface | Every deployment environment requires code changes | Never |
| No result limit on Cypher query execution | Full result set returned | Browser crash on any non-trivial query | Never |
| Skipping lazy-load for Monaco editor | Simpler module imports | 4-6MB added to initial bundle | MVP only if initial load time is acceptable; fix before beta |
| One-time schema fetch without refresh | Simple initialization | Stale autocomplete after schema changes | Acceptable in v1 if "Refresh Schema" button exists |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenGraphDB REST API | Fetch without Vite dev proxy, hitting CORS errors | Configure `vite.config.ts` server proxy; document required CORS headers for the backend |
| react-force-graph | Importing the library without code-splitting | Dynamic import via React.lazy(); wrap in Suspense with skeleton loader |
| Monaco Editor | Top-level import adding 4-6MB to main bundle | React.lazy() + route-based code splitting; load only on query page route |
| `@neo4j-cypher/codemirror` | Using deprecated `cypher-codemirror` package | Use `@neo4j-cypher/react-codemirror` (the maintained successor) |
| Shadcn/ui + Tailwind | Using Tailwind v4 with components expecting v3 | Pin Tailwind to v3 as specified in PROJECT.md; check `tailwind-v4` migration docs before any upgrade |
| localStorage (history/bookmarks) | No QuotaExceededError handling | Wrap all writes in try/catch; cap history at 100 entries |
| File upload for import | `FileReader.readAsText()` on full file | Stream with ReadableStream; add size limit with user-facing error |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Force simulation positions in React state | 60fps rerenders; UI unresponsive during simulation | Store positions in refs; only put structural data in state | Immediately at first node drag |
| No query result cap | Tab freeze or crash on exploratory queries | Inject `LIMIT 500` in query execution layer | First time user runs `MATCH (n) RETURN n` |
| SVG rendering for graph | Frame drops >100 nodes; animation stuttering | Canvas or WebGL renderer; benchmark at 1k nodes before choosing library | ~200-500 nodes depending on hardware |
| Per-widget metrics polling | High request rate to backend; misleading perf signals | Single shared poller; 15s interval; pause on hidden tab | Immediately with >3 dashboard widgets |
| Full-file CSV read in browser | Tab memory crash on import | Stream upload; 50MB size limit with user warning | Files over ~100MB |
| Incremental node expansion reheat | All nodes jump on expand; user loses orientation | Pin existing node positions before adding neighbors | First expand interaction in a non-trivial graph |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| User input interpolated into Cypher strings | Cypher injection: full database read, SSRF via LOAD CSV, data exfiltration | Parameterized queries for all values; server-side allowlist for labels/types |
| Raw database error messages forwarded to browser | Schema leakage (node labels, property names visible to attacker) | Generic error messages in frontend; detailed errors only in server logs |
| Wildcard CORS (`Access-Control-Allow-Origin: *`) with credentials | Credential theft from cross-origin attackers | Explicit origin allowlist on the backend; no wildcard with credentialed requests |
| Accepting arbitrary label names from filter UI | Cypher injection via label concatenation (labels cannot be parameterized) | Allowlist: only labels known from schema are accepted as filter values |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing all data at once | "Hairball" visualization; no readable structure | Progressive disclosure: start with 20-50 nodes, expand on demand |
| Labels on every node at all zoom levels | Overlapping text makes graph unreadable | Zoom-level-dependent label visibility; labels on hover only at low zoom |
| Graph layout resets on every node expansion | User loses mental map; disorienting | Pin existing nodes; animate new nodes in from their parent's position |
| No empty state differentiation | User cannot tell if schema is empty vs. fetch failed | Explicit "Connected, database is empty" vs. "Failed to load schema" states |
| Monolithic loading state for dashboard | User sees spinner; nothing loads until all panels ready | Per-panel loading states with skeletons; panels load independently |
| No result count when cap is applied | User doesn't know results are truncated | "Showing 500 of 12,847 nodes" banner whenever cap is active |
| Single view mode only (graph or table) | Users who want tabular data for export forced to use graph | Persistent toggle between graph view and table view per query result |

---

## "Looks Done But Isn't" Checklist

- [ ] **Query editor:** Has Cypher syntax highlighting AND runs queries AND handles server errors AND shows loading state AND limits results — verify all five, not just syntax highlighting.
- [ ] **Graph visualization:** Works with demo data AND works with 1000 nodes AND dark mode colors are correct AND node expansion doesn't reset layout.
- [ ] **Admin dashboard:** Shows metrics AND handles "server unreachable" state AND stops polling when tab is hidden AND has manual refresh.
- [ ] **Import UI:** Accepts files AND validates size AND shows upload progress AND handles import errors from the server AND refreshes schema after import.
- [ ] **Saved queries:** Saves to localStorage AND loads on app restart AND handles localStorage full error AND has a delete mechanism (no way to exceed the cap without it).
- [ ] **Configurable server URL:** Input exists AND value persists across page reload AND all API calls use it AND there is a connection test button before saving.
- [ ] **Dark mode:** App chrome switches AND graph canvas colors switch AND code editor theme switches — all three, not just the Shadcn/ui components.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong rendering library chosen (SVG-only) | HIGH | Replace graph library entirely; all graph-specific interaction code must be rewritten |
| No result cap implemented | LOW | Add LIMIT injection to the query execution layer; no UI changes required |
| Monaco in main bundle | MEDIUM | Wrap in React.lazy(); test lazy boundary; add Suspense fallback |
| Cypher injection vulnerability | MEDIUM | Audit all Cypher construction paths; convert to parameterized queries; add server-side allowlist for labels |
| Force sim positions in React state | HIGH | Refactor state management boundary; requires touching all graph interaction code |
| Hardcoded server URL | LOW | Extract to config store; update all API call sites |
| Stale schema browser | LOW | Add refresh button; add TTL to schema cache |
| localStorage quota exceeded | LOW | Add try/catch; add eviction; one-time migration if existing data is corrupt |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SVG renderer chosen without benchmarking | Phase 1 (library selection) | Run 1k-node render benchmark before committing to library |
| No query result cap | Phase 1 (query execution layer) | `MATCH (n) RETURN n` on non-trivial graph returns capped result with banner |
| Force sim positions in React state | Phase 1 (graph state design) | React DevTools profiler shows no rerenders during simulation ticks |
| Monaco in main bundle | Phase 1 (Cypher editor setup) | Lighthouse shows initial bundle <500KB; editor chunk loads lazily |
| Cypher injection | Phase 2 (API integration) | Code review: no string concatenation in any Cypher-generating path |
| CORS misconfiguration | Phase 2 (API integration) | Vite proxy config exists; cross-origin test passes |
| Layout thrash on node expansion | Phase 2 (interactive exploration) | Expand 5 nodes sequentially; existing nodes stay pinned |
| Schema browser stale state | Phase 3 (schema browser) | Run import; verify schema browser reflects new labels after refresh |
| Aggressive metrics polling | Phase 3 (admin dashboard) | Network tab shows single poller at 15s interval; pauses on hidden tab |
| Large file import crash | Phase 3 (import/export UI) | Attempt 200MB file upload; receive size limit error, not crash |
| Node label crowding | Phase 1 (graph visualization) | Render 200 nodes; confirm labels only visible on hover or at zoom >1.5 |
| Dark mode graph colors | Phase 1 (graph visualization) | Toggle dark mode; verify graph canvas colors update correctly |
| localStorage quota | Phase 2 (query history) | Fill history to 100 entries; verify oldest is evicted; write failure is handled |

---

## Sources

- [react-force-graph GitHub Issues — Performance at 12k+ elements](https://github.com/vasturiano/react-force-graph/issues/223)
- [react-force-graph GitHub Issues — Rerender on node color change](https://github.com/vasturiano/react-force-graph/issues/226)
- [SVG vs Canvas vs WebGL rendering thresholds — SVG Genie Benchmark](https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025)
- [Comparing Rendering Performance for Large Graphs — IMLD Academic Paper](https://imld.de/cnt/uploads/Horak-2018-Graph-Performance.pdf)
- [Graph Visualization UX: Avoiding Common Mistakes — Cambridge Intelligence](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)
- [Graph Visualization at Scale — Cambridge Intelligence](https://cambridge-intelligence.com/visualize-large-networks/)
- [Protecting against Cypher Injection — Neo4j Knowledge Base](https://neo4j.com/developer/kb/protecting-against-cypher-injection/)
- [CVE-2024-8309: Prompt Injection in LangChain GraphCypherQAChain — Keysight](https://www.keysight.com/blogs/en/tech/nwvs/2025/08/29/cve-2024-8309)
- [Monaco Editor bundle size issue (4MB+) — GitHub](https://github.com/microsoft/monaco-editor-webpack-plugin/issues/40)
- [@neo4j-cypher/codemirror — npm (maintained successor)](https://www.npmjs.com/package/@neo4j-cypher/codemirror)
- [Best Libraries and Methods to Render Large Network Graphs on the Web — Medium](https://weber-stephen.medium.com/the-best-libraries-and-methods-to-render-large-network-graphs-on-the-web-d122ece2f4dc)
- [Migrating from Monaco Editor to CodeMirror — Sourcegraph Blog](https://sourcegraph.com/blog/migrating-monaco-codemirror)
- [UI Best Practices for Loading, Error, and Empty States in React — LogRocket](https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/)
- [Dynamic Layouting — React Flow documentation](https://reactflow.dev/examples/layout/dynamic-layouting)

---
*Pitfalls research for: Graph database frontend/web UI (OpenGraphDB)*
*Researched: 2026-03-01*
