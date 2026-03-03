---
phase: 09-ai-knowledge-graph-assistant
plan: "02"
subsystem: ui
tags: [react, zustand, streamdown, tailwind, sheet, ai-chat, webllm]

requires:
  - phase: 08-revolutionary-graph-visualization
    provides: "PropertyPanel Sheet pattern, Zustand store conventions"

provides:
  - "Ephemeral Zustand AI chat store (useAIChatStore) with messages, loading, download progress state"
  - "AIChatPanel: Sheet-based right-side chat panel with auto-scroll, empty state, prompt chips"
  - "AIChatMessage: streaming markdown via Streamdown, Run Query/Copy actions per Cypher block"
  - "AIDownloadProgress: WebLLM model download progress bar with percentage and size info"
  - "AITypingIndicator: animated three-dot bounce indicator"

affects:
  - "09-03-wiring (connects AIChatPanel to provider hook)"
  - "any future phase adding chat persistence or history"

tech-stack:
  added:
    - "streamdown@2.3.0 (streaming markdown renderer)"
  patterns:
    - "Ephemeral Zustand store without persist middleware for session-only state"
    - "Sheet component for slide-in panels (following PropertyPanel pattern)"
    - "Streamdown for progressive markdown rendering during AI token streaming"
    - "Per-block action buttons (Run Query, Copy) shown only after streaming completes"

key-files:
  created:
    - frontend/src/stores/ai-chat.ts
    - frontend/src/components/ai/AIChatPanel.tsx
    - frontend/src/components/ai/AIChatMessage.tsx
    - frontend/src/components/ai/AIDownloadProgress.tsx
    - frontend/src/components/ai/AITypingIndicator.tsx
  modified: []

key-decisions:
  - "AIChatMessage exports type re-exported from store to avoid circular imports between components"
  - "Streamdown used instead of react-markdown because it handles unterminated code fences during token streaming"
  - "Per-Cypher-block action buttons rendered only when isStreaming === false to prevent premature code extraction"
  - "AIChatPanel does not call any AI provider directly; callbacks (onSendMessage, onRunQuery) wired by Plan 03 parent"
  - "Empty state shows four example prompt chips that trigger onSendMessage directly"

patterns-established:
  - "Streaming message pattern: startAssistantMessage -> appendToMessage -> finalizeMessage with cypherBlocks"
  - "Download progress: setDownloadProgress(null) clears the progress bar after model loads"

requirements-completed: [AI-01]

duration: 8min
completed: "2026-03-03"
---

# Phase 9 Plan 02: AI Chat UI Components Summary

**Ephemeral Zustand chat store plus four React components (panel, message, download progress, typing indicator) for streaming AI chat backed by Streamdown markdown rendering**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-03T17:58:14Z
- **Completed:** 2026-03-03T18:06:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Zustand store managing messages, open state, loading flag, and WebLLM download progress without any persistence
- Sheet-based right-side chat panel following the existing PropertyPanel pattern, with auto-scroll, empty state, and example prompt chips
- Message renderer using Streamdown for graceful handling of partial code fences during streaming, plus per-Cypher-block Run Query and Copy action buttons that appear only after streaming completes
- WebLLM model download progress bar with animated width and informational subtitle
- Animated three-dot typing indicator shown while AI is generating

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ephemeral Zustand chat store** - `b0887fa` (feat)
2. **Task 2: Create AI chat UI components** - `35eaeda` (feat)

## Files Created/Modified

- `frontend/src/stores/ai-chat.ts` - Ephemeral Zustand store: messages, isOpen, isLoading, downloadProgress, and all action methods
- `frontend/src/components/ai/AIChatPanel.tsx` - Sheet right-side panel with message list, input textarea, auto-scroll, empty state with prompt chips
- `frontend/src/components/ai/AIChatMessage.tsx` - User/assistant message renderer; Streamdown for markdown, Run Query/Copy buttons per Cypher block
- `frontend/src/components/ai/AIDownloadProgress.tsx` - Animated progress bar for WebLLM model download
- `frontend/src/components/ai/AITypingIndicator.tsx` - Three bouncing dots with staggered animation delays

## Decisions Made

- Streamdown chosen over react-markdown because it gracefully handles unterminated code fences during token-by-token streaming without visual glitching.
- Run Query and Copy buttons keyed by Cypher block index and rendered only after `isStreaming === false` to prevent premature code extraction from partial markdown.
- AIChatPanel accepts `onSendMessage` and `onRunQuery` as props rather than calling providers directly; Plan 03 will wire these to the useAIChat hook and query executor.
- AIChatMessage re-uses the `AIChatMessage` type exported from the store, preventing duplication.

## Deviations from Plan

None. Plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None. No external services required for the UI components.

## Next Phase Readiness

- All five files compile with zero TypeScript errors and the production build passes.
- AIChatPanel and useAIChatStore are ready for Plan 03 to wire to the AI provider hook (useAIChat) and the Cypher query executor.
- The `onRunQuery(cypher, messageId)` callback signature is the integration point for Plan 03 to dispatch queries and call `setQueryResult` / `setQueryError` on the store.

---
*Phase: 09-ai-knowledge-graph-assistant*
*Completed: 2026-03-03*
