# Phase 2: Cypher Editor and Query Workflow - Research

**Researched:** 2026-03-01
**Domain:** Code editor integration, persistent state management, file export in React/TypeScript SPA
**Confidence:** HIGH (stack confirmed via npm registry + official source inspection)

## Summary

Phase 2 upgrades the plain `<textarea>` query input established in Phase 1 into a full-featured Cypher editor. The three distinct capability clusters are: (1) the editor itself with syntax highlighting, autocomplete, and keyboard shortcuts; (2) persistent query history and saved queries stored in localStorage via Zustand persist middleware; and (3) client-side JSON/CSV export triggered from the results panel.

The chosen stack from the Phase 1 decision log (STATE.md) is `@neo4j-cypher/react-codemirror@next`. This is the official Neo4j-maintained CodeMirror 6 wrapper for Cypher, and it covers highlighting, autocomplete, linting, and the `onExecute` hook needed for Ctrl+Enter natively. The package is pre-1.0 and uses a `next` dist-tag (latest stable is `2.0.0-next.32`). Its peer dependency declares `react: '^16.8.0 || ^17.0.0 || ^18.0.0'`, which does NOT include React 19. The project uses React 19.2.0. This is the single highest-risk issue for the phase and requires mitigation at install time.

Schema-aware autocomplete is implemented by passing a `DbSchema` object to the `schema` prop. The `DbSchema` type (from `@neo4j-cypher/language-support`) accepts string arrays for `labels`, `relationshipTypes`, and `propertyKeys`. The project already has a `client.schema()` call scaffolded in the API client layer; Phase 2 must wire that into a TanStack Query hook and transform the response into `DbSchema` shape. Persistent history and saved queries extend the existing Zustand pattern already established by `useSettingsStore` (which uses `persist` middleware with `localStorage`). Export is pure browser-side: `Blob` + `URL.createObjectURL` + anchor click.

**Primary recommendation:** Install `@neo4j-cypher/react-codemirror@next` with `--legacy-peer-deps`, wrap `CypherEditor` in a thin component that calls `onRunQuery` from the `onExecute` prop, add a Zustand store for history/saved queries with `persist` middleware, and implement export as a utility function operating on the existing `QueryResponse` data already available in app state.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUERY-01 | User can write Cypher queries in an editor with syntax highlighting | `CypherEditor` from `@neo4j-cypher/react-codemirror@next` provides syntax highlighting out of the box via the `value`/`onChange` props |
| QUERY-02 | User can get schema-aware autocomplete suggestions for labels, relationship types, and property keys | Pass `DbSchema` object with `labels`, `relationshipTypes`, `propertyKeys` arrays to the `schema` prop of `CypherEditor` |
| QUERY-03 | User can execute queries with Ctrl+Enter keyboard shortcut | `CypherEditor` fires the `onExecute` callback on Ctrl+Enter natively; no custom keybinding needed |
| QUERY-04 | User can browse query history persisted across browser sessions | Zustand `persist` middleware with `localStorage` storage; history stored as `string[]` in a `useQueryHistoryStore` |
| QUERY-05 | User can navigate history with Ctrl+Up/Down keyboard shortcuts | `CypherEditor` accepts a `history: string[]` prop — arrow-key navigation over that array is built-in to the component |
| QUERY-06 | User can save/bookmark frequently used queries | Extend the Zustand history store to include a `savedQueries` array of `{ id, name, query }` objects, also persisted via localStorage |
| QUERY-07 | User can re-run any query from history or saved queries | Call existing `onRunQuery` callback with the selected query string from history or saved queries panel |
| QUERY-08 | User can export query results as JSON | `JSON.stringify(queryResponse, null, 2)` + Blob download triggered from results banner |
| QUERY-09 | User can export query results as CSV | Flatten `QueryResponse` rows/columns (or node/relationship properties) to CSV string + Blob download triggered from results banner |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@neo4j-cypher/react-codemirror` | `2.0.0-next.32` (via `@next` dist-tag) | Cypher syntax highlighting, autocomplete, linting, history navigation | Official Neo4j-maintained CodeMirror 6 wrapper; only production-ready Cypher editor for React |
| `@neo4j-cypher/language-support` | `2.0.0-next.29` (installed as transitive dep) | Provides `DbSchema` type and language intelligence worker | Required peer of react-codemirror; provides the type needed for schema prop |
| `zustand` (already installed) | `5.0.x` | Persistent query history and saved queries stores | Already used for settings; `persist` middleware handles localStorage serialization |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zustand/middleware` `persist` | bundled with zustand 5 | localStorage persistence for history/saved queries | Use `partialize` to control which slices persist |
| `@tanstack/react-query` (already installed) | `5.x` | Fetching schema from backend for autocomplete | Already used for health check and query execution |
| Native `Blob` + `URL.createObjectURL` | Browser built-in | JSON and CSV file export | No library needed; pattern is 3 lines of code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@neo4j-cypher/react-codemirror@next` | Monaco Editor | Monaco is 4-6MB bundle; no built-in Cypher grammar; overkill |
| `@neo4j-cypher/react-codemirror@next` | CodeMirror 6 raw + `@codemirror/lang-cypher` | `lang-cypher` community package is less maintained; react-codemirror bundles everything coherently |
| Zustand persist | `react-query` persistence adapter | react-query persistence is for server state; local UI state (history, saved queries) belongs in Zustand |
| Native Blob export | `export-to-csv` npm package | 3-line native implementation is simpler and avoids a dependency |

**Installation:**
```bash
# From inside frontend/
npm install --legacy-peer-deps @neo4j-cypher/react-codemirror@next
```
The `--legacy-peer-deps` flag is required because the package declares `react: '^16.8.0 || ^17.0.0 || ^18.0.0'` but the project uses React 19.2.0. React 19 is backward compatible at the API level; this flag is safe for this library.

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/src/
├── components/
│   ├── query/
│   │   ├── CypherEditorPanel.tsx    # wraps CypherEditor, owns onExecute + history prop wiring
│   │   ├── QueryHistoryPanel.tsx    # drawer/sheet listing history entries with re-run buttons
│   │   ├── SavedQueriesPanel.tsx    # drawer/sheet for saved/bookmarked queries
│   │   ├── query-utils.ts           # prepareCypherQuery (existing)
│   │   └── export-utils.ts          # exportAsJson, exportAsCsv utility functions
│   ├── results/
│   │   ├── ResultsBanner.tsx        # extend with JSON/CSV export buttons
│   │   ├── ResultsView.tsx          # existing
│   │   └── TableView.tsx            # existing
├── stores/
│   ├── settings.ts                  # existing
│   ├── query.ts                     # existing (currentQuery, viewMode)
│   └── queryHistory.ts              # NEW: history: string[], savedQueries: SavedQuery[]
├── api/
│   ├── client.ts                    # existing (has schema() stub)
│   └── queries.ts                   # extend with useSchemaQuery hook
├── types/
│   ├── api.ts                       # extend with SchemaResponse type
│   └── graph.ts                     # existing
```

### Pattern 1: CypherEditor Integration

**What:** Replace `<textarea>` in `QueryInput.tsx` (or create a new `CypherEditorPanel.tsx`) with `CypherEditor`. Wire `onExecute` to the run callback and `history` to the persisted history array.

**When to use:** Always — this is the primary editor replacement for Phase 2.

```typescript
// Source: https://github.com/neo4j/cypher-language-support/blob/main/packages/react-codemirror-playground/src/App.tsx
import { CypherEditor } from '@neo4j-cypher/react-codemirror'
import type { DbSchema } from '@neo4j-cypher/language-support'

interface CypherEditorPanelProps {
  onRunQuery: (query: string) => void
  isRunning?: boolean
}

export function CypherEditorPanel({ onRunQuery, isRunning }: CypherEditorPanelProps) {
  const currentQuery = useQueryStore((s) => s.currentQuery)
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const history = useQueryHistoryStore((s) => s.history)
  const addToHistory = useQueryHistoryStore((s) => s.addToHistory)
  const schema = useSchemaAsDbSchema()  // hook that fetches and transforms schema

  const handleExecute = useCallback((cmd: string) => {
    const finalQuery = prepareCypherQuery(cmd, resultLimit)
    if (!finalQuery) return
    addToHistory(cmd.trim())
    onRunQuery(finalQuery)
  }, [onRunQuery, addToHistory, resultLimit])

  return (
    <CypherEditor
      value={currentQuery}
      onChange={setCurrentQuery}
      onExecute={handleExecute}
      history={history}
      schema={schema}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      className="..."
      ariaLabel="Cypher query editor"
    />
  )
}
```

### Pattern 2: Schema-Aware Autocomplete via DbSchema

**What:** Fetch the backend schema, transform it into `DbSchema` shape, and pass to `CypherEditor`. The component handles autocomplete suggestions automatically once `schema` is populated.

**When to use:** On mount and after schema changes (use TanStack Query with staleTime).

```typescript
// DbSchema structure (from @neo4j-cypher/language-support src/dbSchema.ts)
// All fields are optional
interface DbSchema {
  labels?: string[]
  relationshipTypes?: string[]
  propertyKeys?: string[]
  databaseNames?: string[]
  parameters?: Record<string, unknown>
  procedures?: unknown  // ScopedRegistry<Neo4jProcedure>
  functions?: unknown   // ScopedRegistry<Neo4jFunction>
  graphSchema?: Array<{ from: string; to: string; relType: string }>
  defaultLanguage?: string
}

// Hook: fetch schema and map to DbSchema
function useSchemaAsDbSchema(): DbSchema | undefined {
  const { data } = useSchemaQuery()  // TanStack Query hook wrapping client.schema()
  if (!data) return undefined
  return {
    labels: data.labels ?? [],
    relationshipTypes: data.relationshipTypes ?? [],
    propertyKeys: data.propertyKeys ?? [],
  }
}
```

### Pattern 3: Zustand Persist for History and Saved Queries

**What:** New `queryHistory.ts` store using `persist` middleware with localStorage. History is a bounded array (last 100 entries), deduplicated on add. Saved queries are named entries with stable IDs.

**When to use:** All query executions push to history. User-triggered bookmark action saves to `savedQueries`.

```typescript
// Source: Zustand v5 persist middleware docs
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SavedQuery {
  id: string
  name: string
  query: string
  savedAt: string
}

interface QueryHistoryState {
  history: string[]          // newest first, max 100
  savedQueries: SavedQuery[]
  addToHistory: (query: string) => void
  saveQuery: (name: string, query: string) => void
  removeSavedQuery: (id: string) => void
  clearHistory: () => void
}

export const useQueryHistoryStore = create<QueryHistoryState>()(
  persist(
    (set) => ({
      history: [],
      savedQueries: [],
      addToHistory: (query) =>
        set((state) => {
          const deduped = state.history.filter((q) => q !== query)
          return { history: [query, ...deduped].slice(0, 100) }
        }),
      saveQuery: (name, query) =>
        set((state) => ({
          savedQueries: [
            { id: crypto.randomUUID(), name, query, savedAt: new Date().toISOString() },
            ...state.savedQueries,
          ],
        })),
      removeSavedQuery: (id) =>
        set((state) => ({
          savedQueries: state.savedQueries.filter((q) => q.id !== id),
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'ogdb-query-history',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
```

### Pattern 4: Client-Side File Export

**What:** Export results as JSON or CSV from the `ResultsBanner` component. No dependencies needed; use native `Blob` + anchor download.

**When to use:** When `queryResponse` is present and user clicks the export button.

```typescript
// Source: MDN Web API docs (Blob, URL.createObjectURL)

// export-utils.ts
import type { QueryResponse } from '@/types/api'

export function exportAsJson(data: QueryResponse, filename = 'query-results.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function exportAsCsv(data: QueryResponse, filename = 'query-results.csv') {
  const rows: string[][] = []

  if (data.columns && data.rows) {
    // Tabular path: use columns/rows directly
    rows.push(data.columns)
    data.rows.forEach((row) => rows.push(row.map(String)))
  } else {
    // Graph path: flatten node properties
    const allKeys = Array.from(
      new Set(data.nodes.flatMap((n) => Object.keys(n.properties)))
    )
    rows.push(['id', 'labels', ...allKeys])
    data.nodes.forEach((n) => {
      rows.push([
        String(n.id),
        n.labels.join(';'),
        ...allKeys.map((k) => String(n.properties[k] ?? '')),
      ])
    })
  }

  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Anti-Patterns to Avoid

- **Storing raw `QueryResponse` in Zustand:** Query results are server state owned by TanStack Query. Pass them from `mutation.data` directly to export utils; do not copy into Zustand.
- **Custom Ctrl+Enter handler on the CypherEditor:** The editor already fires `onExecute` on Ctrl/Cmd+Enter when that prop is provided. Adding a parallel `domEventHandlers` handler will double-fire.
- **Using `history` prop as the sole history store:** The `history` prop on `CypherEditor` is for the editor's internal up-arrow navigation, but the History Panel UI also needs to render those entries. Keep the `string[]` in Zustand and pass it to both.
- **Unbounded history arrays:** Without a cap, localStorage will eventually overflow (5MB limit). Cap at 100 entries by slicing on each `addToHistory` call.
- **Naive CSV escaping:** Always wrap values in double quotes and escape internal double quotes as `""`. Skipping this breaks CSV on values with commas, newlines, or quotes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cypher syntax highlighting | Custom PrismJS/highlight.js Cypher grammar | `@neo4j-cypher/react-codemirror` | Grammar is complex; Neo4j maintains it against spec changes |
| Autocomplete engine | Custom completion provider with keyword lists | `CypherEditor` `schema` prop | The language support worker does semantic completion (labels, rel types, params in scope) |
| History keyboard navigation | Custom Ctrl+Up/Down handlers on editor | `CypherEditor` `history` prop + built-in nav | The editor already implements history cycling; duplicating it causes conflicts |
| localStorage serialization | Custom JSON.stringify/parse wrappers | Zustand `persist` middleware | Handles hydration timing, partial persistence, version migrations |
| File download | `window.open`, form POST | `Blob` + `URL.createObjectURL` | Cleanest pattern; works fully client-side; no server round-trip |

**Key insight:** The `CypherEditor` component is a comprehensive editor, not a thin wrapper. `onExecute`, `history`, and `schema` are first-class props that eliminate the need for custom event handling and schema fetching logic inside the editor layer.

---

## Common Pitfalls

### Pitfall 1: React 19 Peer Dependency Conflict
**What goes wrong:** `npm install @neo4j-cypher/react-codemirror@next` fails with `ERESOLVE` because the package declares `peerDependencies: { react: '^16.8.0 || ^17.0.0 || ^18.0.0' }` and the project uses React 19.
**Why it happens:** The package hasn't updated its peer dependency range to include React 19, though the library works at runtime due to React's backward compatibility.
**How to avoid:** Always install with `--legacy-peer-deps`:
```bash
npm install --legacy-peer-deps @neo4j-cypher/react-codemirror@next
```
**Warning signs:** `ERESOLVE unable to resolve dependency tree` during `npm install`.

### Pitfall 2: CypherEditor CSS Not Loaded
**What goes wrong:** Editor renders without syntax-color styling (all text the same color).
**Why it happens:** CodeMirror 6 requires its base CSS to be imported. The `react-codemirror` package may bundle its own CSS that needs an explicit import.
**How to avoid:** Check the package's entry point for a CSS export and import it in `main.tsx` or the editor component:
```typescript
import '@neo4j-cypher/react-codemirror/dist/index.css'  // path may vary — verify at install
```
**Warning signs:** No syntax highlighting colors appear in the editor after mounting.

### Pitfall 3: DbSchema Type Import Path
**What goes wrong:** `import type { DbSchema } from '@neo4j-cypher/react-codemirror'` fails because `DbSchema` lives in `@neo4j-cypher/language-support`.
**Why it happens:** The type is defined in the language support package, not the React wrapper.
**How to avoid:**
```typescript
import type { DbSchema } from '@neo4j-cypher/language-support'
```
This package is installed automatically as a dependency of `react-codemirror`.

### Pitfall 4: Zustand Hydration Race in History Store
**What goes wrong:** On first render, `history` is `[]` even though localStorage has entries, causing the `history` prop on `CypherEditor` to be empty momentarily.
**Why it happens:** Zustand `persist` middleware rehydrates asynchronously after mount.
**How to avoid:** The race is generally harmless for the `history` prop (it will re-render once hydrated), but if the UI conditionally renders based on `history.length > 0`, add a hydration guard:
```typescript
// Zustand 5 persist middleware provides onRehydrateStorage callback
// For simple cases, the re-render on hydration is acceptable and no guard is needed.
```

### Pitfall 5: CSV Export Column Inconsistency
**What goes wrong:** CSV file has inconsistent columns when nodes have different property sets.
**Why it happens:** Graph results have heterogeneous node property bags; naively exporting row-by-row skips keys missing from the first node.
**How to avoid:** Collect the union of all property keys across all nodes before writing headers (see `exportAsCsv` pattern in Code Examples above).

### Pitfall 6: `onExecute` Fires Before LIMIT Injection
**What goes wrong:** Query executes without the automatic LIMIT appended, returning unlimited results.
**Why it happens:** The `onExecute` callback receives the raw query string from the editor. The `prepareCypherQuery` call must happen inside the `onExecute` handler, not after.
**How to avoid:** Call `prepareCypherQuery(cmd, resultLimit)` at the top of the `onExecute` handler before calling `onRunQuery`.

---

## Code Examples

Verified patterns from official sources:

### Full CypherEditor Props Signature
```typescript
// Source: https://raw.githubusercontent.com/neo4j/cypher-language-support/main/packages/react-codemirror/src/CypherEditor.tsx
interface CypherEditorProps {
  prompt?: string
  extraKeybindings?: KeyBinding[]    // KeyBinding from @codemirror/view
  onExecute?: (cmd: string) => void  // fires on Ctrl/Cmd+Enter
  newLineOnEnter?: boolean
  history?: string[]                  // newest-first array for up-arrow navigation
  overrideThemeBackgroundColor?: boolean
  autofocus?: boolean
  offset?: number
  lineWrap?: boolean
  lint?: boolean
  showSignatureTooltipBelow?: boolean
  featureFlags?: { consoleCommands?: boolean }
  schema?: DbSchema
  value?: string
  className?: string
  theme?: 'light' | 'dark' | Extension
  onChange?: (value: string, viewUpdate: ViewUpdate) => void
  domEventHandlers?: DomEventHandlers
  placeholder?: string
  lineNumbers?: boolean
  readonly?: boolean
  ariaLabel?: string
  moveFocusOnTab?: boolean
}
```

### DbSchema Fields (for autocomplete)
```typescript
// Source: https://raw.githubusercontent.com/neo4j/cypher-language-support/main/packages/language-support/src/dbSchema.ts
interface DbSchema {
  labels?: string[]              // e.g. ['Person', 'Movie']
  relationshipTypes?: string[]   // e.g. ['ACTED_IN', 'DIRECTED']
  propertyKeys?: string[]        // e.g. ['name', 'born', 'title']
  databaseNames?: string[]
  aliasNames?: string[]
  userNames?: string[]
  roleNames?: string[]
  parameters?: Record<string, unknown>
  procedures?: unknown           // ScopedRegistry<Neo4jProcedure>
  functions?: unknown            // ScopedRegistry<Neo4jFunction>
  graphSchema?: Array<{ from: string; to: string; relType: string }>
  defaultLanguage?: string
}
```

### History Panel: Re-run from History
```typescript
// Pattern: History Panel item component
function HistoryItem({ query, onRerun }: { query: string; onRerun: (q: string) => void }) {
  const setCurrentQuery = useQueryStore((s) => s.setCurrentQuery)
  const handleRerun = () => {
    setCurrentQuery(query)
    onRerun(query)
  }
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted rounded-md">
      <code className="text-xs truncate flex-1">{query}</code>
      <Button size="sm" variant="ghost" onClick={handleRerun}>
        <Play className="h-3 w-3" />
      </Button>
    </div>
  )
}
```

### Save Query Dialog Pattern
```typescript
// Use the existing Dialog pattern from SettingsDialog.tsx as template
// Trigger: a "Bookmark" icon button in CypherEditorPanel
// Dialog: single Input for name, then calls saveQuery(name, currentQuery)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cypher-codemirror` (old package, CodeMirror 5) | `@neo4j-cypher/react-codemirror@next` (CodeMirror 6) | 2022-2023 | Better bundle splitting, more accurate AST-based highlighting |
| Monaco Editor for Cypher (common in older tools) | `@neo4j-cypher/react-codemirror@next` | Ongoing | Monaco is 4-6x larger bundle; react-codemirror is purpose-built |
| `zustand` v4 with `persist` from separate path | `zustand` v5 with `persist` from `zustand/middleware` | v5 release (2024) | Import path consolidated; double-parenthesis `create<T>()()` pattern required for TypeScript |
| Manual `localStorage.setItem/getItem` for history | Zustand `persist` middleware | Standard pattern since 2022 | Automatic serialization, hydration, and version migrations |

**Deprecated/outdated:**
- `cypher-codemirror` (standalone, no React wrapper): archived; replaced by `@neo4j-cypher/react-codemirror`
- `@neo4j-cypher/react-codemirror@latest` (1.0.x): No longer maintained; all development on `@next` dist-tag

---

## Open Questions

1. **Backend `/schema` response shape**
   - What we know: `client.schema()` exists and returns `Promise<unknown>`; STATE.md flags this as unconfirmed
   - What's unclear: Whether the response has `labels`, `relationshipTypes`, `propertyKeys` directly or nested; whether the endpoint exists at all in the current backend
   - Recommendation: Define a `SchemaResponse` type optimistically (`{ labels: string[], relationshipTypes: string[], propertyKeys: string[] }`), wire the hook with error handling, and treat missing schema as `undefined` (autocomplete degrades gracefully — the editor still works without schema)

2. **CypherEditor CSS import path**
   - What we know: CodeMirror 6 requires CSS imports; the playground imports it but the exact bundled path for the `@next` version is not confirmed in docs
   - What's unclear: Whether `import '@neo4j-cypher/react-codemirror/dist/index.css'` is the correct path or if styles are injected via JS
   - Recommendation: At implementation time, check `node_modules/@neo4j-cypher/react-codemirror/dist/` for CSS files and import accordingly; test with dark/light theme switch

3. **History Panel UI placement**
   - What we know: Phase 1 established `Sheet` (from shadcn/ui) for the property panel; the header has room for additional icon buttons
   - What's unclear: Whether history and saved queries should be in separate sheets, a single tabbed sheet, or inline panels
   - Recommendation: Use a single `Sheet` with two tabs (History, Saved) triggered by a clock/bookmark icon in the results banner or header; keep the layout consistent with the existing property panel pattern

---

## Sources

### Primary (HIGH confidence)
- `https://raw.githubusercontent.com/neo4j/cypher-language-support/main/packages/react-codemirror/src/CypherEditor.tsx` — full TypeScript props interface verified directly from source
- `https://raw.githubusercontent.com/neo4j/cypher-language-support/main/packages/language-support/src/dbSchema.ts` — `DbSchema` type field list verified from source
- `https://raw.githubusercontent.com/neo4j/cypher-language-support/main/packages/react-codemirror-playground/src/App.tsx` — verified usage patterns (props, schema, history, onExecute, theme, extraKeybindings)
- `npm show @neo4j-cypher/react-codemirror@2.0.0-next.32` — confirmed version, peer deps (`react: '^16.8.0 || ^17.0.0 || ^18.0.0'`), dependencies
- `/Users/ashesh/opengraphdb/frontend/package.json` — confirmed React 19.2.0, Zustand 5.0.x, TanStack Query 5.x already installed
- `/Users/ashesh/opengraphdb/frontend/src/stores/settings.ts` — confirmed `persist` middleware pattern already established in project

### Secondary (MEDIUM confidence)
- WebSearch + npm show: confirmed `@neo4j-cypher/codemirror` (older package) vs `@neo4j-cypher/react-codemirror@next` distinction; next.32 is active development line
- WebSearch: Zustand v5 double-parenthesis TypeScript pattern `create<T>()()` confirmed by multiple sources

### Tertiary (LOW confidence)
- CSS import path for `@neo4j-cypher/react-codemirror@next` — not confirmed via official docs; must verify at install time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry + source code inspection confirmed versions and peer deps
- Architecture: HIGH — patterns verified against existing project structure and CypherEditor source
- Pitfalls: HIGH for React 19 peer dep (reproduced via npm show); MEDIUM for CSS import path (common CodeMirror pattern but path not docs-confirmed)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days — package is pre-1.0 and moves quickly; re-verify `@next` version at implementation start)
