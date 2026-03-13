---
phase: 13-ai-demo-experience
plan: 01
subsystem: ui
tags: [react, zustand, typescript, ai, demo, cypher, graph-visualization]

requires:
  - phase: 09-ai-knowledge-graph-assistant
    provides: AI provider infrastructure (createProvider, ChatProvider, useAIChat pattern)
  - phase: 07-real-world-famous-dataset-showcase
    provides: Offline dataset modules (MOVIELENS_SAMPLE, GOT_SAMPLE, etc.) with filterFn patterns
provides:
  - Demo data layer: 24 curated NL questions with pre-computed Cypher + NL answers + graph subsets
  - useDemoChat hook: pre-computed fast path (typewriter) + live AI fallback
  - useDemoStore: isolated Zustand store for landing page demo state
  - runSimulatedTrace: offline trace animation from node ID lists
  - buildDemoSystemPrompt: dataset-aware system prompt with schema + few-shot examples
affects: [13-02-ui-components, 13-03-integration]

tech-stack:
  added: []
  patterns:
    - Pre-computed demo responses: offline data serves suggested questions instantly without network
    - Typewriter simulation: 4-char chunks at 12ms for convincing AI streaming feel
    - Store isolation: separate useDemoStore prevents cross-page state pollution with useAIChatStore
    - AbortSignal threading: passed through typewriter, trace animation, and provider streaming

key-files:
  created:
    - frontend/src/data/demo-questions.ts
    - frontend/src/data/demo-responses.ts
    - frontend/src/stores/demo.ts
    - frontend/src/hooks/useDemoChat.ts
    - frontend/src/lib/ai/demo-system-prompt.ts
    - frontend/src/lib/demo-trace.ts
  modified: []

key-decisions:
  - "DEMO_RESPONSES uses Map<string, DemoResponse> keyed by questionId for O(1) lookup"
  - "buildDemoResponse helper sorts traceNodeIds by edge degree for expanding-outward animation"
  - "findBestOfflineMatch returns first dataset response as fallback for custom live AI questions"
  - "Demo store has no persist middleware — demo state is ephemeral, no localStorage needed"
  - "useDemoChat uses same createProvider/useSettingsStore pattern as useAIChat for provider consistency"

requirements-completed: [DEMO-AI-01, DEMO-AI-02, DEMO-AI-04, DEMO-AI-06]

duration: 7min
completed: 2026-03-13
---

# Phase 13 Plan 01: AI Demo Data Layer Summary

**24 pre-computed demo responses with Cypher + NL answers + graph subsets, useDemoChat hook with typewriter streaming and live AI fallback, isolated demo store, and dataset-aware system prompts**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T05:00:00Z
- **Completed:** 2026-03-13T05:07:14Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created 24 curated natural language questions (6 per dataset) with pre-computed Cypher queries, NL answers, graph subsets, and trace node orderings
- Built useDemoChat hook with pre-computed fast path (typewriter streaming, ~1-2s) and live AI fallback using existing provider infrastructure
- Established isolated demo store (useDemoStore) and simulated trace animation (runSimulatedTrace) for offline-first demo experience

## Task Commits

1. **Task 1: Demo questions and pre-computed responses** - `4a5ca1c` (feat)
2. **Task 2: Demo store and simulated trace utility** - `3e693f8` (feat)
3. **Task 3: Dataset-aware demo system prompt and useDemoChat hook** - `4fdb396` (feat)

## Files Created/Modified

- `frontend/src/data/demo-questions.ts` - 24 DemoQuestion entries (6 per dataset) with id, text, dataset, category
- `frontend/src/data/demo-responses.ts` - 25 DemoResponse entries with Cypher, NL answer, graphData subset, traceNodeIds
- `frontend/src/stores/demo.ts` - Zustand store: activeDataset, messages, graphData, loading/trace state + mutations
- `frontend/src/hooks/useDemoChat.ts` - Orchestration hook: pre-computed fast path + live AI fallback + abort handling
- `frontend/src/lib/ai/demo-system-prompt.ts` - Per-dataset system prompts with schema, sample entities, 2 few-shot examples
- `frontend/src/lib/demo-trace.ts` - runSimulatedTrace (AbortSignal, 80ms default) + estimateTraceDuration helper

## Decisions Made

- DEMO_RESPONSES uses `Map<string, DemoResponse>` keyed by questionId for O(1) lookup at send time
- `buildDemoResponse` sorts `traceNodeIds` by edge degree (highest connectivity first) to create expanding-outward animation
- Demo store has no `persist` middleware because demo state is ephemeral and should reset on page reload
- `useDemoChat` shares the same `createProvider`/`useSettingsStore` pattern as `useAIChat` for provider lifecycle consistency
- Live AI fallback returns first pre-computed response for the active dataset as a graph visualization, since no real backend is available

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused variable declarations in demo-responses.ts**
- **Found during:** Task 1 verification (npm run build with strict mode)
- **Issue:** Several intermediate `links` and `nodeIds` variables were computed but then `buildSubgraphFromNodeIds` was called instead, causing TS6133 errors
- **Fix:** Removed the redundant intermediate variables; `buildSubgraphFromNodeIds` already computes the correct edge set from node IDs
- **Files modified:** frontend/src/data/demo-responses.ts
- **Verification:** `npm run build` passes with zero TypeScript errors
- **Committed in:** 4a5ca1c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cleanup of redundant intermediate variables. No behavior change, no scope creep.

## Issues Encountered

None beyond the unused variable cleanup noted above.

## Next Phase Readiness

- All data and logic infrastructure is complete and ready for Plan 02 (UI components)
- useDemoChat exposes `sendQuestion`, `isReady`, `activeDataset`, `setActiveDataset` for UI consumption
- useDemoStore exposes `messages`, `graphData`, `isLoading`, `isTraceAnimating` for rendering
- Plan 02 can wire up the chat UI, dataset switcher, and embedded graph canvas without any data plumbing changes

---
*Phase: 13-ai-demo-experience*
*Completed: 2026-03-13*
