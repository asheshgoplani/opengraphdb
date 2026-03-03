# Phase 9: AI Knowledge Graph Assistant - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Provider-agnostic AI chatbot that converts natural language questions into Cypher queries. Users can configure their own API keys (OpenAI, Anthropic, Google Gemini) or use a free browser-side model (WebLLM). When AI generates and runs a query, the graph trace animation shows the data path. All API calls happen client-side; keys are never sent to the backend.

</domain>

<decisions>
## Implementation Decisions

### Chat Panel Placement & Interaction
- Right Sheet panel (consistent with PropertyPanel pattern), toggled via header button
- Available on BOTH /app route and /playground route
- In playground: generates queries against sample/offline data. In /app: works against live backend
- Session-only persistence (Zustand store, no persist middleware). Fresh conversation on page reload
- Message format: AI responds with natural language explanation + syntax-highlighted Cypher code block + inline "Run query" and "Copy" buttons

### AI Response Flow & Execution
- Clicking "Run query" on AI-generated Cypher automatically uses the trace endpoint (POST /query/trace via SSE), triggering the graph trace animation seamlessly
- Responses stream token-by-token (progressive rendering like ChatGPT), not wait-and-show. Code blocks render once the full block is received
- When an executed query errors or returns empty results, the AI automatically receives that feedback and responds with an explanation and revised query (conversational retry loop)
- After successful query execution, feed a summary of results back to the AI so it can provide follow-up analysis (e.g., "Found 42 actors. The most connected is Tom Hanks with 12 movies.")

### Free Default Model Strategy
- WebLLM (browser-side inference) for the free default model. No server dependency, no CORS issues, works offline after first load
- Download triggered on first AI use: show message "Download free AI model (~500MB, one-time)" with progress bar. Model cached in IndexedDB for future sessions
- When WebGPU is not available (Firefox, older browsers): show graceful message "Your browser doesn't support local AI. Configure an API key in Settings to use the assistant." Clear path to alternative
- When user has BOTH a configured API key AND WebLLM available: API key takes priority. WebLLM is the fallback for when no key exists

### Provider Setup & Onboarding
- Supported providers: OpenAI, Anthropic, Google Gemini (dedicated native API support for each), PLUS a generic "OpenAI-compatible" option for services like Groq, Together, OpenRouter, local Ollama
- Configuration lives in a new "AI Assistant" section in the existing SettingsDialog (not inline in chat panel)
- Model selection: hardcoded curated list per provider (e.g., OpenAI: gpt-4o, gpt-4o-mini; Anthropic: claude-sonnet-4-20250514, claude-haiku-4-20250414; Gemini: gemini-2.0-flash, gemini-1.5-pro) PLUS a custom model name input for power users
- OpenAI-compatible provider: free text inputs for model name and base URL (required)
- Trust badge in Settings AI section: "Your API key is stored in your browser only. It is never sent to our servers."

### Claude's Discretion
- Exact WebLLM model choice (research best available small model for code/query generation)
- Streaming implementation details (SSE parsing, partial markdown rendering)
- System prompt engineering (how schema context is serialized, few-shot examples)
- Chat UI styling details (message bubble design, typing indicator, loading states)
- Token/context management strategy for result summarization

</decisions>

<specifics>
## Specific Ideas

- AI chat should feel like a knowledgeable assistant that understands the graph schema, not a generic chatbot
- The Run query button in AI messages should trigger trace animation automatically, creating a seamless "ask question, see data path light up" experience
- When AI auto-corrects on query errors, it should explain what went wrong (e.g., "That label doesn't exist in your schema. Here's the corrected query using...")
- Result summaries should highlight interesting patterns (most connected nodes, outliers, counts) rather than just echoing raw data

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sheet` component (Radix dialog variant): use for the right-side AI chat panel, matches PropertyPanel pattern
- `useSettingsStore` (Zustand + persist): extend with AI provider fields (aiProvider, aiApiKey, aiModel, aiBaseUrl)
- `SettingsDialog`: extend with "AI Assistant" section following existing pattern (local state on open, commit on save)
- `useSchemaQuery()` (TanStack Query): returns `{ labels, relationshipTypes, propertyKeys }` for LLM system prompt context
- `useQueryStore.setCurrentQuery()`: injects Cypher into CodeMirror editor (controlled component)
- `ApiClient.queryWithTrace()`: existing SSE streaming pattern (raw fetch + ReadableStream reader) to replicate for AI streaming
- `lucide-react`: icon library for AI button, message indicators
- `react-resizable-panels`: installed but unused (not needed since Sheet overlay chosen)

### Established Patterns
- State management: Zustand stores, ephemeral by default, persist middleware for settings/history
- Data fetching: TanStack Query with `useQuery` (reads) and `useMutation` (writes)
- SSE streaming: raw `fetch` + `ReadableStream` with buffer-based parsing (see `queryWithTrace`)
- UI components: shadcn/ui with `cn()` utility, Radix primitives, Tailwind v3 with HSL CSS variables
- Theme: dark mode via `.dark` class on `<html>`, full HSL token set, `.glass` utility class
- Panels: Sheet for slide-in panels (PropertyPanel, SchemaPanel)

### Integration Points
- Header: add AI chat toggle button (alongside settings gear, schema, etc.)
- Graph store (`graph.ts`): `setTrace()`, `advanceTrace()`, `clearTrace()` for trace animation wiring
- Trace system: `useTraceQuery` mutation wraps `queryWithTrace` with SSE streaming
- TraceControls: floating pill component for speed/replay during trace playback
- Playground: `PlaygroundPage.tsx` needs AI button in header alongside LiveMode toggle

</code_context>

<deferred>
## Deferred Ideas

None. Discussion stayed within phase scope.

</deferred>

---

*Phase: 09-ai-knowledge-graph-assistant*
*Context gathered: 2026-03-04*
