---
phase: 09-ai-knowledge-graph-assistant
plan: "01"
subsystem: ui
tags: [ai, webllm, openai, anthropic, gemini, chat, streaming, settings, zustand]

# Dependency graph
requires:
  - phase: 05-frontend-polish
    provides: settings store pattern (Zustand + persist), SettingsDialog component structure
provides:
  - ChatProvider interface with streaming support (five adapters)
  - PROVIDER_MODELS registry and createProvider factory
  - WebLLM local inference adapter with WebGPU detection
  - OpenAI and OpenAI-compatible streaming adapter
  - Anthropic Claude streaming adapter with system message separation
  - Google Gemini streaming adapter using @google/genai
  - Schema-aware system prompt builder with few-shot examples
  - extractCypherBlocks utility for parsing Cypher from AI markdown responses
  - AI settings (provider, API key, model, base URL) persisted to localStorage
  - SettingsDialog AI Assistant section with conditional field display and trust badge
affects:
  - 09-02 (AI chat panel UI — imports ChatProvider, createProvider, settings)
  - 09-03 (query wiring — uses streamChat, extractCypherBlocks)

# Tech tracking
tech-stack:
  added:
    - "@mlc-ai/web-llm ^0.2.81 (already installed)"
    - "openai ^6.25.0 (already installed)"
    - "@anthropic-ai/sdk ^0.78.0 (already installed)"
    - "@google/genai ^1.43.0 (already installed)"
  patterns:
    - Dynamic imports (lazy) per provider to avoid bundling all SDKs upfront
    - ChatProvider interface abstraction decoupling UI from provider implementation
    - Singleton WebLLM engine pattern to avoid double-loading model weights
    - System message extracted from messages array for Anthropic API compliance

key-files:
  created:
    - frontend/src/lib/ai/providers.ts
    - frontend/src/lib/ai/webllm-provider.ts
    - frontend/src/lib/ai/openai-provider.ts
    - frontend/src/lib/ai/anthropic-provider.ts
    - frontend/src/lib/ai/gemini-provider.ts
    - frontend/src/lib/ai/system-prompt.ts
  modified:
    - frontend/src/stores/settings.ts
    - frontend/src/components/layout/SettingsDialog.tsx

key-decisions:
  - "Dynamic imports per adapter: avoids bundling all AI SDKs in main chunk; each provider loaded only when createProvider() is called"
  - "Singleton WebLLM engine: module-level variable prevents re-downloading model weights across re-renders"
  - "System message separation in Anthropic adapter: Anthropic API takes system as a top-level param, not in messages array"
  - "Google Gemini uses @google/genai (GA May 2025) not deprecated @google/generative-ai"
  - "createProvider factory is async (returns Promise<ChatProvider>) to support dynamic imports; plan spec said sync but async is correct"

patterns-established:
  - "Provider pattern: all adapters implement ChatProvider with id, label, isAvailable(), streamChat(), optional init()/dispose()"
  - "Streaming via onChunk callback: onChunk(text, false) per token, onChunk('', true) when done"
  - "Settings local-state-then-commit: handleOpen syncs store to local state, handleSave commits all at once"

requirements-completed: [AI-03, AI-04]

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 9 Plan 01: AI Provider Infrastructure Summary

**Five streaming AI provider adapters (WebLLM, OpenAI, Anthropic, Gemini, OpenAI-compatible) with unified ChatProvider interface, schema-aware system prompt builder, and AI settings UI in SettingsDialog**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T17:57:59Z
- **Completed:** 2026-03-03T18:02:27Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- Created the complete AI provider abstraction layer: ChatProvider interface, PROVIDER_MODELS registry, and async createProvider factory with lazy dynamic imports per adapter
- Implemented five provider adapters (WebLLM, OpenAI, OpenAI-compatible, Anthropic, Gemini) each with streaming via onChunk callback pattern
- Built schema-aware system prompt builder that injects node labels, relationship types, and property keys, plus extractCypherBlocks regex utility and buildResultSummary helper
- Extended Zustand settings store with AI fields (aiProvider, aiApiKey, aiModel, aiBaseUrl) persisted automatically via existing persist middleware
- Added AI Assistant section to SettingsDialog with conditional fields per provider, custom model entry, and trust badge confirming browser-only key storage

## Task Commits

1. **Task 1: ChatProvider interface and all provider adapters** - `5fcaf35` (feat)
2. **Task 2: Settings store and SettingsDialog AI section** - `2ceacf9` (feat)

## Files Created/Modified

- `frontend/src/lib/ai/providers.ts` - ChatProvider interface, AIProviderType, PROVIDER_MODELS, async createProvider factory
- `frontend/src/lib/ai/webllm-provider.ts` - WebLLM adapter with WebGPU detection (navigator.gpu), singleton MLCEngine
- `frontend/src/lib/ai/openai-provider.ts` - OpenAI and OpenAI-compatible adapter with streaming
- `frontend/src/lib/ai/anthropic-provider.ts` - Anthropic adapter with system message separation per API spec
- `frontend/src/lib/ai/gemini-provider.ts` - Google Gemini adapter using @google/genai (GA SDK)
- `frontend/src/lib/ai/system-prompt.ts` - buildSystemPrompt, extractCypherBlocks, buildResultSummary
- `frontend/src/stores/settings.ts` - Extended with aiProvider, aiApiKey, aiModel, aiBaseUrl fields and setters
- `frontend/src/components/layout/SettingsDialog.tsx` - AI Assistant section with provider select, API key input, model select (presets + custom), base URL (openai-compatible only), trust badge

## Decisions Made

- createProvider is async (returns Promise) rather than sync, because dynamic imports are async. The plan spec implied sync but async is the correct implementation for lazy loading.
- WebLLM engine stored as module-level singleton so the model weights are not re-downloaded on every createProvider call.
- For Anthropic, system messages are extracted from the ChatMessage array and passed as the top-level `system` parameter as the Anthropic API requires.
- Used @google/genai (GA since May 2025) rather than the deprecated @google/generative-ai as the plan specifies.

## Deviations from Plan

None. Plan executed exactly as written, with one minor adaptation: createProvider factory is async (Promise-returning) rather than sync, which is a correctness requirement for dynamic imports and does not change the external contract for callers.

## Issues Encountered

None. All SDKs were pre-installed. TypeScript compiled clean and the production build succeeded on the first attempt.

## User Setup Required

None. No external service configuration required at this phase. API keys are entered by users at runtime through the SettingsDialog.

## Next Phase Readiness

- All provider adapters are ready to stream completions. Plan 02 (AI chat panel UI) can import ChatProvider and createProvider immediately.
- PROVIDER_MODELS registry provides the model list for any additional UI in Plan 02.
- extractCypherBlocks is ready for Plan 03 query wiring.
- Settings store fields are stable contracts for both Plan 02 and Plan 03.
- No blockers.

---
*Phase: 09-ai-knowledge-graph-assistant*
*Completed: 2026-03-03*
