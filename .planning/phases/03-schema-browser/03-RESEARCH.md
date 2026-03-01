# Phase 3: Schema Browser - Research

**Researched:** 2026-03-01
**Domain:** React UI panel, TanStack Query data fetching, shadcn/ui component composition
**Confidence:** HIGH

## Summary

Phase 3 is a focused, single-requirement phase (SCHEMA-01). The user needs a UI surface where they can see all node labels, relationship types, and property keys from the connected database without writing a Cypher query. A manual refresh button must allow them to re-fetch after data changes.

The implementation has two parts: (1) a TanStack Query hook wrapping the existing `client.schema()` stub in `api/client.ts`, and (2) a schema browser UI component surfaced via a button in the Header. The API layer and the UI pattern are both straightforward extensions of patterns already established in Phase 1 (health check via TanStack Query) and Phase 2 (schema fetch hook, `SchemaResponse` type in `api.ts`). No new dependencies are required.

The single open question from STATE.md concerns the `GET /schema` response shape, which is not confirmed in the SPEC or ARCHITECTURE docs. The Phase 2 research established a working assumption (`{ labels, relationshipTypes, propertyKeys }` as string arrays) that Phase 2 uses for autocomplete. Phase 3 must either confirm this shape against the real backend or design defensively against shape variations. Because Phase 3 depends on Phase 2, by Phase 3 execution the `useSchemaQuery` hook and `SchemaResponse` type will already exist; Phase 3 only needs to consume them to build the UI.

**Primary recommendation:** Add a Schema button to the Header that opens a shadcn Sheet (right-side panel, same pattern as PropertyPanel). Inside the sheet, render three collapsible sections (Labels, Relationship Types, Property Keys) populated from the existing `useSchemaQuery` hook. Add a refresh button that calls `refetch()`. No new libraries needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | User can browse database schema showing node labels, relationship types, and property keys | TanStack Query `useSchemaQuery` hook (established in Phase 2) fetches schema; shadcn Sheet + Accordion renders the three categories; manual refresh via `refetch()` from TanStack Query satisfies the second success criterion |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query` | `5.x` (already installed) | Fetch schema from `GET /schema`, cache result, expose `refetch` for manual refresh | Already used for health check and Cypher query; `useQuery` with `staleTime` gives background freshness with manual override |
| `zustand` | `5.x` (already installed) | Track schema panel open/closed state | Already used for graph selection, settings, query history; consistent pattern |
| shadcn/ui `Sheet` | Bundled via `@radix-ui/react-dialog` (already installed) | Slide-out panel to display the schema browser without obscuring the graph canvas | Already used by `PropertyPanel`; identical trigger-from-header pattern |
| shadcn/ui `Accordion` | Not yet installed | Collapsible sections for Labels, Relationship Types, Property Keys | Standard shadcn/ui pattern for grouped disclosure; avoids all-visible list clutter when counts are high |
| `lucide-react` | `0.575.x` (already installed) | Schema icon (e.g. `Database`, `LayoutList`) for header button | Already used throughout the app |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui `Badge` | Already installed | Render count chips (e.g. "42 labels") next to section headers | Already used in PropertyPanel for node label display |
| shadcn/ui `Button` | Already installed | Manual refresh trigger inside the schema panel | Standard button component |
| shadcn/ui `ScrollArea` | May need to add | Scroll within each accordion section when counts are high (>20 items) | Use only if Accordion content overflows viewport; skip if list is short |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Sheet (slide-out panel) | shadcn Dialog (centered modal) | Sheet is preferred because it leaves graph canvas partially visible; Dialog obscures everything. PropertyPanel already uses Sheet, so this is consistent |
| shadcn Accordion for three sections | Simple `<ul>` under three `<h3>` headings | Accordion provides collapse-to-save-space behavior that matters when any category has 50+ items; plain lists scroll the whole panel |
| TanStack Query `refetch()` for manual refresh | Button that invalidates query cache | `refetch()` is the direct API for manual refresh; invalidation is for cross-component cache busting which is not needed here |
| Schema panel in Header Sheet | Separate route/page | A separate route adds routing complexity; schema is a quick reference, not a primary navigation destination |

**Installation:**
```bash
# From inside frontend/ — only needed if Accordion not yet added in Phase 2
npx shadcn@latest add accordion
# ScrollArea if needed
npx shadcn@latest add scroll-area
```

Note: The Accordion component is a shadcn/ui primitive backed by `@radix-ui/react-accordion`. Check whether Phase 2 added it; if not, one command installs it.

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/src/
├── components/
│   ├── schema/
│   │   └── SchemaPanel.tsx        # Sheet + accordion content; consumes useSchemaQuery
│   ├── layout/
│   │   └── Header.tsx             # Extend: add SchemaButton that opens SchemaPanel
├── api/
│   └── queries.ts                 # Extend: useSchemaQuery hook (likely already added by Phase 2)
├── types/
│   └── api.ts                     # Extend: SchemaResponse type (likely already added by Phase 2)
```

If Phase 2 already added `useSchemaQuery` and `SchemaResponse`, Phase 3 only adds `SchemaPanel.tsx` and wires the trigger into `Header.tsx`.

### Pattern 1: Schema TanStack Query Hook

**What:** A `useQuery` hook wrapping `client.schema()`. Because schema changes infrequently, `staleTime` of 30 seconds is appropriate. Manual refresh is exposed via the `refetch` function.

**When to use:** Mount on the SchemaPanel open; let TanStack Query cache serve repeated opens without refetching.

```typescript
// Source: TanStack Query v5 docs (https://tanstack.com/query/latest)
// api/queries.ts — extend existing file

export function useSchemaQuery() {
  const client = useApiClient()
  return useQuery({
    queryKey: ['schema'],
    queryFn: () => client.schema(),
    staleTime: 30_000,           // schema is stable; avoid unnecessary refetches
    retry: false,
    placeholderData: undefined,
  })
}
```

The `SchemaResponse` type must align with the actual backend shape. Based on Phase 2's working assumption (used for autocomplete `DbSchema`):

```typescript
// types/api.ts — extend existing file
export interface SchemaResponse {
  labels: string[]
  relationshipTypes: string[]
  propertyKeys: string[]
}
```

If the backend returns a different shape, add a transform step inside the `queryFn` rather than in the component.

### Pattern 2: Schema Panel as Sheet

**What:** A Sheet opened by a button in the Header. The Sheet contains three Accordion sections. The `refetch` callback from `useSchemaQuery` is wired to a Refresh button.

**When to use:** This is the primary UI for SCHEMA-01.

```typescript
// Source: shadcn/ui Sheet docs (https://ui.shadcn.com/docs/components/radix/sheet)
//         shadcn/ui Accordion docs (https://ui.shadcn.com/docs/components/radix/accordion)

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Database } from 'lucide-react'
import { useSchemaQuery } from '@/api/queries'

export function SchemaPanel() {
  const { data, isFetching, refetch } = useSchemaQuery()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Schema Browser">
          <Database className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Schema
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh schema"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </SheetTitle>
        </SheetHeader>
        <Accordion type="multiple" defaultValue={['labels', 'relationships', 'properties']} className="mt-4">
          <AccordionItem value="labels">
            <AccordionTrigger>
              Node Labels
              <Badge variant="secondary" className="ml-2">{data?.labels.length ?? 0}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-sm">
                {data?.labels.map((label) => (
                  <li key={label} className="px-2 py-0.5 rounded hover:bg-muted">{label}</li>
                ))}
                {!data?.labels.length && (
                  <li className="text-muted-foreground italic">No labels found</li>
                )}
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="relationships">
            <AccordionTrigger>
              Relationship Types
              <Badge variant="secondary" className="ml-2">{data?.relationshipTypes.length ?? 0}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-sm">
                {data?.relationshipTypes.map((type) => (
                  <li key={type} className="px-2 py-0.5 rounded hover:bg-muted">{type}</li>
                ))}
                {!data?.relationshipTypes.length && (
                  <li className="text-muted-foreground italic">No relationship types found</li>
                )}
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="properties">
            <AccordionTrigger>
              Property Keys
              <Badge variant="secondary" className="ml-2">{data?.propertyKeys.length ?? 0}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-sm">
                {data?.propertyKeys.map((key) => (
                  <li key={key} className="px-2 py-0.5 rounded hover:bg-muted">{key}</li>
                ))}
                {!data?.propertyKeys.length && (
                  <li className="text-muted-foreground italic">No property keys found</li>
                )}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SheetContent>
    </Sheet>
  )
}
```

### Pattern 3: Header Integration

**What:** Add `SchemaPanel` alongside the existing `ConnectionStatus`, `ThemeToggle`, and `SettingsDialog` in the Header. `SchemaPanel` is self-contained (owns its Sheet trigger), so the Header only imports and renders it.

```typescript
// components/layout/Header.tsx
import { SchemaPanel } from '@/components/schema/SchemaPanel'

export function Header() {
  return (
    <header className="flex h-12 items-center justify-between border-b bg-card px-3 sm:px-4">
      <div className="text-base font-semibold sm:text-lg">OpenGraphDB</div>
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <SchemaPanel />   {/* new */}
        <ThemeToggle />
        <SettingsDialog />
      </div>
    </header>
  )
}
```

### Anti-Patterns to Avoid

- **Fetching schema inside a useEffect:** Schema is server state. Use TanStack Query; don't write manual fetch + useState.
- **Storing schema in Zustand:** Schema data is server state (fetched from backend), not client UI state. TanStack Query owns it; Zustand owns UI state like panel open/close if needed.
- **Opening panel via a separate Zustand boolean:** shadcn Sheet handles its own open/close state via the SheetTrigger + Sheet pairing. No external state is needed unless the panel must be opened programmatically from elsewhere. For Phase 3, it does not need to be.
- **Fetching schema on every render / on every Header mount:** TanStack Query with `staleTime: 30_000` handles this automatically. Do not add mount-based imperative `refetch()` calls.
- **Rendering schema items as buttons that auto-run queries:** The requirements say only "browse" and "refresh". Clicking a label to run a query is out of scope for this phase (see EXPLORE-04 in v2 requirements).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async fetch with caching and loading state | Custom useState + useEffect + fetch | TanStack Query `useQuery` | Cache invalidation, deduplication, and stale-while-revalidate handling are non-trivial to get right |
| Collapsible sections with keyboard accessibility | Custom `<details>` or toggle state | shadcn Accordion | WAI-ARIA compliance, keyboard navigation, animation, and focus management require significant effort to implement correctly |
| Slide-out panel with focus trap | Custom fixed-position div | shadcn Sheet | Focus trapping, scroll lock, and escape-key dismissal are already handled by the Radix Dialog primitive |

**Key insight:** Phase 3 is a pure composition task. Every piece of infrastructure (fetch layer, UI primitives, caching) already exists in the project. The only new code is the SchemaPanel component (~60 lines) and minor Header changes.

---

## Common Pitfalls

### Pitfall 1: Schema Response Shape Mismatch

**What goes wrong:** `client.schema()` is typed as `Promise<unknown>` in the current `api/client.ts`. If the backend returns a different shape than `{ labels, relationshipTypes, propertyKeys }`, the component silently renders nothing or crashes.

**Why it happens:** The Phase 2 research noted the response shape is unconfirmed. Phase 2 worked around this because autocomplete degrades gracefully with an undefined `DbSchema`. The schema browser has to display the data and cannot degrade silently.

**How to avoid:** Before implementation, run `curl http://localhost:8080/schema` against the actual backend and confirm the field names. If the backend uses different field names (e.g. `nodeLabels` instead of `labels`), add a transform inside the `queryFn`. Also add the `SchemaResponse` type as the generic parameter to `client.request<SchemaResponse>('/schema')` so TypeScript catches shape issues at build time.

**Warning signs:** Schema panel renders with all counts showing 0, or TypeScript errors on `data.labels`, `data.relationshipTypes`.

### Pitfall 2: Accordion Badge Alignment

**What goes wrong:** The Badge count inside `AccordionTrigger` may render poorly due to AccordionTrigger's internal flexbox layout. The trigger renders an arrow icon on the right; adding a Badge between the text and the arrow can break the layout.

**Why it happens:** shadcn AccordionTrigger uses `justify-between` and the chevron icon is positioned absolutely or as a flex child; extra elements inside the trigger disrupt the layout.

**How to avoid:** Wrap the label text and Badge in a `<span className="flex items-center gap-2">` inside the trigger. The chevron icon stays on the right side of the trigger's own flex container. Verify visually during implementation.

**Warning signs:** Badge appears after the chevron, or the chevron disappears.

### Pitfall 3: Two Sheets Open Simultaneously

**What goes wrong:** The PropertyPanel (node/edge inspector) is also a Sheet on the right side. If the user has a node selected and opens the schema browser, both Sheets try to open from the right simultaneously. Radix UI stacks them, but visually they overlap.

**Why it happens:** shadcn Sheet is implemented as a Dialog and multiple Dialogs/Sheets can be open at the same time in Radix without coordination.

**How to avoid:** Two options: (a) Use `side="left"` for the schema browser so it opens from the left while PropertyPanel opens from the right — cleanly separated. (b) Close PropertyPanel when schema browser opens by calling `clearSelection()` from the graph store. Option (a) is simpler and better UX — schema browsing and property inspection are independent tasks.

**Warning signs:** Two overlapping panels on screen simultaneously.

### Pitfall 4: Missing Error State

**What goes wrong:** If `GET /schema` fails (backend disconnected), the panel shows nothing with no feedback to the user.

**Why it happens:** Developers commonly handle loading and success states but forget the error state.

**How to avoid:** Use the `isError` and `error` fields from `useSchemaQuery()`. Render a simple error message: "Could not load schema. Is the backend connected?" with the Refresh button still visible.

---

## Code Examples

Verified patterns from project source and official sources:

### useApiClient (existing pattern from api/queries.ts)

```typescript
// Source: /Users/ashesh/opengraphdb/frontend/src/api/queries.ts (existing)
function useApiClient(): ApiClient {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  return useMemo(() => new ApiClient(serverUrl), [serverUrl])
}
```

This pattern is already used for health check and query hooks. `useSchemaQuery` follows the same shape.

### Existing client.schema() stub

```typescript
// Source: /Users/ashesh/opengraphdb/frontend/src/api/client.ts (existing)
async schema(): Promise<unknown> {
  return this.request<unknown>('/schema')
}
```

Phase 3 (or Phase 2) will change `Promise<unknown>` to `Promise<SchemaResponse>` and update the return type.

### TanStack Query manual refetch pattern

```typescript
// Source: TanStack Query v5 docs
const { data, isFetching, refetch } = useSchemaQuery()

// Manual refresh: user clicks Refresh button
<Button onClick={() => refetch()} disabled={isFetching}>
  <RefreshCw className={isFetching ? 'animate-spin' : ''} />
  Refresh
</Button>
```

### Accordion with count badge (shadcn pattern)

```typescript
// Source: shadcn/ui Accordion docs (https://ui.shadcn.com/docs/components/radix/accordion)
<AccordionItem value="labels">
  <AccordionTrigger>
    <span className="flex items-center gap-2">
      Node Labels
      <Badge variant="secondary">{data?.labels.length ?? 0}</Badge>
    </span>
  </AccordionTrigger>
  <AccordionContent>
    {/* list items */}
  </AccordionContent>
</AccordionItem>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom schema fetch with useState/useEffect | TanStack Query `useQuery` | Phase 1 established the pattern | Automatic caching, background refetch, loading/error states handled |
| Full-page schema route | Slide-out Sheet panel | shadcn/ui provides Sheet primitive | No page navigation needed; schema is reference data |

**Deprecated/outdated:**
- Using `SWR` for data fetching: This project chose TanStack Query in Phase 1; do not introduce SWR.
- Using `react-query` v3/v4: Project uses v5 (`@tanstack/react-query@5`); API differs significantly.

---

## Open Questions

1. **Confirmed `GET /schema` response shape**
   - What we know: `client.schema()` exists as a stub returning `Promise<unknown>`. Phase 2 research assumed `{ labels: string[], relationshipTypes: string[], propertyKeys: string[] }`.
   - What's unclear: Whether the OpenGraphDB backend actually implements this endpoint and what exact field names it uses.
   - Recommendation: Before implementation, run `curl http://localhost:8080/schema` against the dev backend. If the backend is not yet built, define the `SchemaResponse` type to match the Phase 2 assumption, and note in a comment that the type must be validated against the real endpoint when the Rust server implements it. The planner should add a verification task for this.

2. **Phase 2 completion state at Phase 3 start**
   - What we know: Phase 2 is listed as "Planned" in STATE.md, not complete. The ROADMAP says Phase 3 depends on Phase 2.
   - What's unclear: Whether `useSchemaQuery` and `SchemaResponse` were added in Phase 2.
   - Recommendation: At plan time, assume Phase 2 adds these (Phase 2 research shows this in its architecture pattern). If not, Phase 3's first task adds them.

3. **Accordion component installed**
   - What we know: The current `package.json` does not include `@radix-ui/react-accordion`.
   - What's unclear: Whether Phase 2 adds it (Phase 2 research does not reference Accordion).
   - Recommendation: Phase 3 Wave 0 should install it via `npx shadcn@latest add accordion`.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set to `true` in `.planning/config.json` — this section is skipped.

---

## Sources

### Primary (HIGH confidence)

- Project source `/Users/ashesh/opengraphdb/frontend/src/api/client.ts` — `client.schema()` stub confirmed; return type is `Promise<unknown>`
- Project source `/Users/ashesh/opengraphdb/frontend/src/api/queries.ts` — `useApiClient` pattern and `useQuery`/`useMutation` patterns confirmed
- Project source `/Users/ashesh/opengraphdb/frontend/src/components/layout/PropertyPanel.tsx` — Sheet usage pattern confirmed; same pattern for SchemaPanel
- Project source `/Users/ashesh/opengraphdb/frontend/src/components/layout/Header.tsx` — Header structure confirmed; gap-2 flex row for new trigger
- Project source `/Users/ashesh/opengraphdb/frontend/package.json` — Confirmed installed: `@tanstack/react-query@5`, `zustand@5`, `@radix-ui/react-dialog`, `lucide-react`, `react@19`
- `/Users/ashesh/opengraphdb/.planning/phases/02-cypher-editor-and-query-workflow/02-RESEARCH.md` — `DbSchema` shape and `useSchemaQuery` pattern confirmed; `SchemaResponse` type assumption documented
- `/Users/ashesh/opengraphdb/.planning/STATE.md` — Phase 3 blocker: "GET /schema response shape not yet confirmed" documented

### Secondary (MEDIUM confidence)

- [TanStack Query v5 useQuery docs](https://tanstack.com/query/latest) — `refetch()`, `staleTime`, `isFetching` API confirmed via official docs; version matches installed package
- [shadcn/ui Sheet docs](https://ui.shadcn.com/docs/components/radix/sheet) — Sheet component pattern confirmed; already in use in the project
- [shadcn/ui Accordion docs](https://ui.shadcn.com/docs/components/radix/accordion) — Accordion `type="multiple"` and `AccordionItem`/`AccordionTrigger`/`AccordionContent` pattern confirmed
- [Neo4j Browser schema UI pattern](https://neo4j.com/docs/browser-manual/current/visual-tour/) — three-category schema browser (labels, relationship types, property keys) confirmed as industry standard UX pattern

### Tertiary (LOW confidence)

- None. All claims are verified against project source or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed in the project; no new dependencies except possibly Accordion
- Architecture: HIGH — PropertyPanel provides an exact template for the Sheet pattern; schema fetch pattern is established in Phase 2 research
- Pitfalls: HIGH — pitfalls are grounded in the specific project code (two-sheet conflict is visible in existing PropertyPanel + new SchemaPanel), shadcn Accordion trigger layout is a known issue documented in multiple sources

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable stack; shadcn/ui and TanStack Query APIs change slowly)
