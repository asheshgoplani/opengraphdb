# R6 — Coverage Matrix (Playground Interactive Inventory → e2e Coverage)

**Generated** from `frontend/e2e/reposition/R6-feature-inventory.spec.ts` against
branch `reposition/R6-orphan-trim`.

**Methodology:** Playwright visits `/playground`, toggles Power mode + Schema tab
so every state-gated element lands in the DOM, then collects every element
matching `[data-testid]`, `button`, `[role="button"]`, `[role="tab"]`, `input`,
`textarea`, `select`, `a[href]` (excluding the structural `Back` link). Each
`data-testid` is cross-referenced against every other `frontend/e2e/**/*.spec.ts`
file (plain substring match, same rule as `F9` in PLAN §F).

**Orphan** = `data-testid` (or role-only button label) referenced by zero specs.

**Before R6:** 19 unique testids on `/playground`, of which **12 orphaned**.

## Testid coverage (19 unique)

| # | data-testid | Covering spec(s) | Status | R6 action |
|---|---|---|---|---|
| 1 | `dataset-switcher` | `playground.spec.ts`, `polish-cohesion.spec.ts` (via `query-card`), `premium-graph-quality.spec.ts` | green | keep |
| 2 | `query-card` | `playground.spec.ts`, `polish-cohesion.spec.ts` | green | keep |
| 3 | `stats-panel` | `playground.spec.ts` | green | keep |
| 4 | `rdf-dropzone-trigger` | `screenshots-slice7.spec.ts` | green | keep |
| 5 | `power-mode-panel` | `claims/power-tab-real-cypher.spec.ts` | green | keep |
| 6 | `backend-schema-strip` | `claims/schema-tab-real-backend.spec.ts` | green | keep |
| 7 | `status-bar` | `polish-cohesion.spec.ts` | green | keep |
| 8 | `live-mode-toggle` | none | **orphan** | **new spec `R6-live-connection-toggle.spec.ts`** |
| 9 | `connection-badge` | none | **orphan** | **new spec `R6-live-connection-toggle.spec.ts`** |
| 10 | `schema-main-panel` | none (covered via `role=tab name=Schema` but not by testid) | **orphan** | **new spec `R6-schema-tab-structure.spec.ts`** |
| 11 | `schema-browser-header` | none | **orphan** | **new spec `R6-schema-tab-structure.spec.ts`** |
| 12 | `perf-strip` | none (PLAN J claimed `polish-cohesion` but it references `query-card`/`status-bar`, not `perf-strip`) | **orphan** | **new spec `R6-perf-strip.spec.ts`** |
| 13 | `perf-parse` | none | **orphan** | same spec |
| 14 | `perf-plan` | none | **orphan** | same spec |
| 15 | `perf-execute` | none | **orphan** | same spec |
| 16 | `perf-total` | none | **orphan** | same spec |
| 17 | `footer-node-count` | none | **orphan** | **new spec `R6-status-bar-counts.spec.ts`** |
| 18 | `footer-edge-count` | none | **orphan** | same spec |
| 19 | `mobile-panels` | none | **orphan** | **REMOVE (duplicates desktop sidebar, PLAN §C.2 removal candidate)** |

## Role/label coverage (17 role-only interactive elements)

| # | label | kind | Covering spec(s) | Status | R6 action |
|---|---|---|---|---|---|
| 1 | `Power mode` | button | `polish-cohesion.spec.ts`, `claims/power-tab-real-cypher.spec.ts` | green | keep |
| 2 | `Sample` | button (inside `live-mode-toggle`) | none | orphan | covered by new `R6-live-connection-toggle.spec.ts` |
| 3 | `Live` | button (inside `live-mode-toggle`) | none | orphan | covered by new `R6-live-connection-toggle.spec.ts` |
| 4 | `Ontology` | button | none | **orphan** | **new spec `R6-ontology-toggle.spec.ts`** (feature works and is small) |
| 5 | `Run` | button | `claims/power-tab-real-cypher.spec.ts`, `app.spec.ts` | green | keep |
| 6 | `Save` | button (SaveQueryDialog) | none | **orphan** | **REMOVE — not core developer-first; CypherEditor already tracks history via `useQueryHistoryStore`** |
| 7 | `Graph` tab | tab | indirect (canvas-render specs) | green (implicit) | keep |
| 8 | `Schema` tab | tab | `claims/schema-tab-real-backend.spec.ts` | green | keep |
| 9 | `RETRY` | button (inside `backend-schema-strip` error) | indirect via `backend-schema-strip` | green (state-gated) | keep |
| 10–15 | guided-query buttons (6×) | button | covered via `query-card` testid | green | keep |
| 16 | `Refresh` | button (inside `backend-schema-strip` ok) | covered via `backend-schema-strip` | green (state-gated) | keep |
| 17 | `Clear import` | button (shown after import) | indirect via `rdf-import-persisted` / `rdf-import-preview` | green (state-gated) | keep |

## Summary

**Before R6:** 19 testids + 17 role-only = **36 elements**; **13 orphaned** (12 testid + 1 role-only `Save`; `Ontology`, `Sample`, `Live` counted as orphan but will be fixed by new specs, not counted twice).

**Removals (R6):**
- `mobile-panels` block (`frontend/src/pages/PlaygroundPage.tsx:499-543`) — duplicates the desktop sidebar; PLAN §C.2 pre-flight removal candidate.
- `SaveQueryDialog` (`frontend/src/components/query/SaveQueryDialog.tsx`) + its usage in `CypherEditorPanel.tsx:109` — no e2e, duplicative of built-in editor history.

**New specs (R6):**
- `e2e/reposition/R6-live-connection-toggle.spec.ts` — covers `live-mode-toggle`, `connection-badge`, Sample/Live inner buttons.
- `e2e/reposition/R6-perf-strip.spec.ts` — covers `perf-strip`, `perf-parse`, `perf-plan`, `perf-execute`, `perf-total`.
- `e2e/reposition/R6-schema-tab-structure.spec.ts` — covers `schema-main-panel`, `schema-browser-header`.
- `e2e/reposition/R6-status-bar-counts.spec.ts` — covers `footer-node-count`, `footer-edge-count`.
- `e2e/reposition/R6-ontology-toggle.spec.ts` — covers `Ontology` button role/label.
- `e2e/reposition/R6-feature-inventory.spec.ts` — machine guard against regressions (orphan detection).

**After R6:** 18 testids + 16 role-only = **34 elements**; **0 orphans**; all green under `ogdb` no-backend run (specs that need backend gracefully degrade or use state-gated assertions).
