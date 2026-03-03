---
phase: 09-ai-knowledge-graph-assistant
plan: "03"
subsystem: frontend-ai-wiring
tags: [ai, hooks, chat, trace, mcp]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [useAIChat hook, MCPActivityPanel, Header AI toggle, PlaygroundPage AI toggle]
  affects: [frontend/src/hooks, frontend/src/components/ai, frontend/src/components/layout, frontend/src/pages]
tech_stack:
  added: []
  patterns: [orchestration-hook, rolling-message-window, provider-priority, lazy-webllm-init, trace-result-feedback-loop]
key_files:
  created:
    - frontend/src/hooks/useAIChat.ts
    - frontend/src/components/ai/MCPActivityPanel.tsx
  modified:
    - frontend/src/components/layout/Header.tsx
    - frontend/src/pages/PlaygroundPage.tsx
    - frontend/src/components/ai/AIChatPanel.tsx
decisions:
  - "useAIChat hook wraps provider lifecycle, sends messages via rolling window, feeds trace results/errors back to AI automatically"
  - "AIChatPanel rendered once per route (Header for /app via AppShell, PlaygroundPage for /playground) using shared Zustand store for open state"
  - "MCPActivityPanel added as collapsible Activity section at bottom of AIChatPanel"
  - "runCypherFromAI calls clearTrace() before executing to prevent animation conflicts (per Pitfall 5)"
metrics:
  duration: "3m 5s"
  completed: "2026-03-03"
  tasks: 2
  files: 5
---

# Phase 9 Plan 03: AI Wiring and Integration Summary

**One-liner:** End-to-end AI chat wiring with useAIChat hook, trace feedback loop, rolling context window, and dual-route integration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useAIChat orchestration hook | e9543da | frontend/src/hooks/useAIChat.ts |
| 2 | Wire AI chat panel into Header and PlaygroundPage, add MCP activity placeholder | 2e54bbd | Header.tsx, PlaygroundPage.tsx, MCPActivityPanel.tsx, AIChatPanel.tsx |

## What Was Built

### Task 1: useAIChat Hook

`frontend/src/hooks/useAIChat.ts` orchestrates the full AI chat lifecycle:

- **Provider priority**: When `aiApiKey` is non-empty and `aiProvider !== 'webllm'`, the configured API provider is used. Otherwise falls back to WebLLM.
- **Lazy WebLLM init**: Provider instance is created on first `sendMessage` call with progress piped to `setDownloadProgress`. WebGPU unavailability shows a graceful fallback message.
- **Rolling message window**: 6 exchange pairs for API providers (12 messages), 4 pairs for WebLLM (8 messages), preventing context overflow.
- **sendMessage**: Adds user message, streams tokens via `appendToMessage`, finalizes with `extractCypherBlocks`. Aborts previous in-flight request if a new one starts.
- **runCypherFromAI**: Calls `clearTrace()` first (prevents trace conflicts), executes via `useTraceQuery.mutateAsync`, feeds result summary or error back to AI as a follow-up message automatically.
- Returns `{ sendMessage, runCypherFromAI, isReady, providerLabel }`.

### Task 2: Integration and MCP Activity

- **Header.tsx**: Added Sparkles toggle button before ThemeToggle. Renders `<AIChatPanel>` outside the `<header>` element (Sheet uses portal). Uses `useAIChat()` for callbacks.
- **PlaygroundPage.tsx**: Added AI button in the right-side header toolbar. Renders `<AIChatPanel>` at page root level. Uses shared `useAIChatStore` for open state.
- **MCPActivityPanel.tsx**: Placeholder component for future MCP tool call monitoring.
- **AIChatPanel.tsx**: Added collapsible "Activity" section at the bottom toggled by a chevron button, containing MCPActivityPanel.

## Architecture Notes

The AIChatPanel is rendered in two places (Header for /app route, PlaygroundPage for /playground route) but the Zustand `useAIChatStore` ensures open state is shared. Since AIChatPanel uses a Sheet (portaled), only one panel is visible at a time regardless.

The `useAIChat` hook does NOT maintain a provider ref that persists across component unmounts — settings changes invalidate the ref so the provider is recreated lazily. This matches the dynamic import pattern from Plan 01 (providers are code-split per adapter).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compilation: PASS (zero errors)
- Production build: PASS (`built in 7.38s`)
- All 8 verification criteria from plan met

## Self-Check: PASSED

Files confirmed present:
- FOUND: frontend/src/hooks/useAIChat.ts
- FOUND: frontend/src/components/ai/MCPActivityPanel.tsx
- FOUND: Sparkles in Header.tsx
- FOUND: AIChatPanel in Header.tsx
- FOUND: Sparkles in PlaygroundPage.tsx
- FOUND: AIChatPanel in PlaygroundPage.tsx
- FOUND: clearTrace called in useAIChat.ts
- FOUND: providers, system-prompt, ai-chat, queries imports in useAIChat.ts

Commits confirmed:
- e9543da: feat(09-03): create useAIChat orchestration hook
- 2e54bbd: feat(09-03): wire AI chat panel into Header and PlaygroundPage, add MCP activity placeholder
