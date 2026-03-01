---
phase: 06-demo-datasets-and-live-backend
plan: 03
subsystem: ui
tags: [frontend, playground, live-mode, query-grouping, vitest]
requires:
  - phase: 06-demo-datasets-and-live-backend
    provides: live-descriptor metadata and transform contracts from plan 02
provides:
  - playground header Live/Sample toggle with explicit offline fallback behavior
  - live query execution path using backend Cypher + `transformLiveResponse()`
  - category-grouped guided query cards (Explore/Traverse/Analyze)
  - mode-aware ConnectionBadge with live/offline timing and live error signaling
  - graph-area loading overlay and visible live-query error panel
affects: [playground, guided-queries, connection-badge, live-backend]
tech-stack:
  added: []
  patterns: [dual-mode query execution, descriptor-gated live rendering, grouped query navigation]
key-files:
  created:
    - frontend/src/components/playground/LiveModeToggle.tsx
    - .planning/phases/06-demo-datasets-and-live-backend/06-03-SUMMARY.md
  modified:
    - frontend/src/components/playground/ConnectionBadge.tsx
    - frontend/src/pages/PlaygroundPage.tsx
    - frontend/vitest/playground-polish.test.tsx
requirements-completed: [DEMO-03, DEMO-04]
completed: 2026-03-01
---

# Phase 6 Plan 03 Summary

**Playground now supports a user-visible Live/Sample mode switch, grouped query navigation, and resilient live query UX (loading + error states) while preserving offline behavior.**

## Accomplishments

- Added `LiveModeToggle` component with compact Sample/Live controls for header placement.
- Updated `ConnectionBadge` to support:
  - offline label (`Sample Data`) + in-memory timing suffix
  - live label (`Live`) + live timing format
  - live error state (`Error`) with red status styling and truncated message
- Reworked `PlaygroundPage` to:
  - maintain `isLiveMode`, `isLiveLoading`, and `liveError` state
  - execute live Cypher through `ApiClient.query()` when `liveDescriptor` exists
  - transform live row responses via `transformLiveResponse()`
  - fall back to `runDatasetQuery()` when offline or when a query has no `liveDescriptor`
  - render guided queries grouped by `Explore`, `Traverse`, `Analyze`
  - show an in-graph loading overlay during live requests
  - show a visible graph-area error panel when live queries fail
- Expanded vitest coverage in `vitest/playground-polish.test.tsx` for:
  - mode-aware `ConnectionBadge` behavior
  - `LiveModeToggle` rendering
  - category grouping fallback behavior
  - QueryClient-backed playground page rendering with grouped sections

## Verification

Executed in order requested:

1. `npx tsc --noEmit` (pass)
2. `npx vitest run` (pass; 5 files, 23 tests)
3. `npx vite build` (pass; includes existing Vite warnings about externalized Node modules and large chunk size)

## Notes

- Live mode intentionally keeps offline fallback for queries without `liveDescriptor`, preserving full guided-query coverage even when backend descriptors are incomplete.
- Build warnings are unchanged from baseline behavior and do not block compilation.
