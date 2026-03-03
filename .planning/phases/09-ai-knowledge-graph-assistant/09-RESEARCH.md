# Phase 9: AI Knowledge Graph Assistant - Research

**Researched:** 2026-03-04
**Domain:** Browser-side AI inference, provider-agnostic LLM clients, streaming markdown rendering, natural language to Cypher prompt engineering
**Confidence:** HIGH (core stack), MEDIUM (CORS provider specifics), HIGH (architecture patterns)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Chat Panel Placement & Interaction**
- Right Sheet panel (consistent with PropertyPanel pattern), toggled via header button
- Available on BOTH /app route and /playground route
- In playground: generates queries against sample/offline data. In /app: works against live backend
- Session-only persistence (Zustand store, no persist middleware). Fresh conversation on page reload
- Message format: AI responds with natural language explanation + syntax-highlighted Cypher code block + inline "Run query" and "Copy" buttons

**AI Response Flow & Execution**
- Clicking "Run query" on AI-generated Cypher automatically uses the trace endpoint (POST /query/trace via SSE), triggering the graph trace animation seamlessly
- Responses stream token-by-token (progressive rendering like ChatGPT), not wait-and-show. Code blocks render once the full block is received
- When an executed query errors or returns empty results, the AI automatically receives that feedback and responds with an explanation and revised query (conversational retry loop)
- After successful query execution, feed a summary of results back to the AI so it can provide follow-up analysis (e.g., "Found 42 actors. The most connected is Tom Hanks with 12 movies.")

**Free Default Model Strategy**
- WebLLM (browser-side inference) for the free default model. No server dependency, no CORS issues, works offline after first load
- Download triggered on first AI use: show message "Download free AI model (~500MB, one-time)" with progress bar. Model cached in IndexedDB for future sessions
- When WebGPU is not available (Firefox, older browsers): show graceful message "Your browser doesn't support local AI. Configure an API key in Settings to use the assistant." Clear path to alternative
- When user has BOTH a configured API key AND WebLLM available: API key takes priority. WebLLM is the fallback for when no key exists

**Provider Setup & Onboarding**
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

### Deferred Ideas (OUT OF SCOPE)
None. Discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | User can generate Cypher queries from natural language input | WebLLM + provider SDK client pattern; system prompt with schema injection; streaming response with code block extraction |
| AI-02 | User can view MCP tool call activity from AI agents | Separate from chatbot; requires a feed/log UI panel that shows MCP tool invocations — lower priority than AI-01 per decisions |
| AI-03 | Provider-agnostic AI with configurable API keys (OpenAI, Anthropic, Gemini, OpenAI-compatible) | Per-provider SDK with dangerouslyAllowBrowser; unified provider interface; settings store extension |
| AI-04 | Free default model via WebLLM browser inference with WebGPU | @mlc-ai/web-llm 0.2.81; Qwen2.5-1.5B-Instruct-q4f16_1-MLC (~1.6GB); WebGPU detection; download progress UI |
</phase_requirements>

## Summary

Phase 9 adds a provider-agnostic AI chat assistant that converts natural language to Cypher queries. The architecture is fully client-side: all AI API calls happen directly from the browser using provider SDKs with `dangerouslyAllowBrowser` flags, and the free tier uses WebLLM for GPU-accelerated in-browser inference via WebGPU. No server-side proxy is needed.

The critical research finding is that **CORS support varies by provider**: Anthropic explicitly supports browser calls via `anthropic-dangerous-direct-browser-access: true` header (exposed via `dangerouslyAllowBrowser` in their SDK). OpenAI officially supports browser calls with `dangerouslyAllowBrowser: true`. OpenRouter explicitly supports CORS and allows client-side calls. Groq's CORS stance is unconfirmed (LOW confidence) and may require testing. Google Gemini's `@google/genai` SDK works in browser but CORS behavior with streaming is inconsistent and needs validation.

The recommended streaming markdown library is **streamdown** (Vercel, drop-in react-markdown replacement), which handles the hardest streaming problem: partial/unterminated code blocks rendered correctly token-by-token. This pairs with the established SSE streaming pattern already in the codebase (`ApiClient.queryWithTrace`).

**Primary recommendation:** Build a `useChatProvider` hook with a unified `ChatProvider` interface, implement each provider (WebLLM, OpenAI, Anthropic, Gemini, OpenAI-compatible) as a separate adapter, wire into a Zustand ephemeral store for messages, and render with streamdown inside a Sheet panel following the PropertyPanel pattern.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mlc-ai/web-llm` | 0.2.81 | Browser-side LLM inference via WebGPU | Only mature WebGPU inference library; OpenAI-compatible API |
| `streamdown` | 2.3.0 | Streaming markdown rendering with partial code block support | Drop-in react-markdown replacement; handles unterminated blocks during token streaming; Shiki syntax highlighting built in |
| `openai` | 6.25.0 | OpenAI + OpenAI-compatible provider client | `dangerouslyAllowBrowser: true` enables direct browser calls; also covers OpenRouter, Groq, Together, local Ollama via `baseURL` override |
| `@anthropic-ai/sdk` | 0.78.0 | Anthropic Claude direct browser calls | `dangerouslyAllowBrowser: true` added in v0.27.0; automatically adds CORS header |
| `@google/genai` | 1.43.0 | Google Gemini browser client | Official unified SDK (GA May 2025); works in browser for text generation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zustand` | 5.0.11 | Ephemeral chat message store | Already installed; no persist middleware needed for session-only state |
| `lucide-react` | 0.575.0 | AI chat toggle button, indicators | Already installed |
| `@radix-ui/react-dialog` (via `sheet.tsx`) | Already installed | Sheet panel for chat UI | Use existing `Sheet` component from `components/ui/sheet.tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| streamdown | react-markdown + rehype-highlight | streamdown handles partial blocks during streaming natively; react-markdown shows broken UI with unterminated code fences |
| streamdown | assistant-ui | assistant-ui is heavier (full headless chat kit); overkill since we're building custom UI in Sheet pattern |
| Direct provider SDKs | Vercel AI SDK useChat | AI SDK requires a backend route for streaming (Next.js oriented); pure client-side is simpler for this BYO-key pattern |
| @mlc-ai/web-llm | Transformers.js | WebLLM uses WebGPU (GPU-accelerated); Transformers.js uses WebAssembly (CPU, much slower); WebLLM is 5-10x faster |

**Installation:**
```bash
npm install @mlc-ai/web-llm streamdown openai @anthropic-ai/sdk @google/genai
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── ai/                      # All AI assistant components
│   │   ├── AIChatPanel.tsx      # Sheet wrapper + message list + input
│   │   ├── AIChatMessage.tsx    # Single message: text + code block + action buttons
│   │   ├── AIDownloadProgress.tsx # WebLLM model download progress bar
│   │   └── AITypingIndicator.tsx # Animated dots while streaming
├── hooks/
│   └── useAIChat.ts             # Main hook: provider selection, message streaming
├── lib/
│   └── ai/
│       ├── providers.ts         # ChatProvider interface + factory
│       ├── webllm-provider.ts   # WebLLM adapter (WebGPU)
│       ├── openai-provider.ts   # OpenAI + OpenAI-compatible adapter
│       ├── anthropic-provider.ts # Anthropic adapter
│       ├── gemini-provider.ts   # Google Gemini adapter
│       └── system-prompt.ts     # Schema serialization + few-shot examples
└── stores/
    └── ai-chat.ts               # Zustand ephemeral message store (no persist)
```

### Pattern 1: Unified ChatProvider Interface
**What:** All provider adapters implement a single interface, making the UI layer fully agnostic to the underlying LLM.
**When to use:** Always — this is the contract between the hook and each provider implementation.
**Example:**
```typescript
// Inspired by: https://dev.to/thelogicwarlock/provider-agnostic-chat-in-react-webllm-local-mode-remote-fallback-25dd
interface ChatProvider {
  id: string
  label: string
  isAvailable: () => boolean | Promise<boolean>
  init?: (opts?: { onProgress?: (msg: string, pct: number) => void }) => Promise<void>
  streamChat: (args: {
    messages: ChatMessage[]
    signal?: AbortSignal
    onChunk: (text: string, done: boolean) => void
  }) => Promise<void>
  dispose?: () => Promise<void>
}
```

### Pattern 2: WebLLM Adapter with WebGPU Detection
**What:** Check `navigator.gpu` before attempting to load WebLLM; show graceful fallback if unavailable.
**Example:**
```typescript
// Source: https://webllm.mlc.ai/docs/user/basic_usage.html
// Source: https://appwrite.io/blog/post/chatbot-with-webllm-and-webgpu

// WebGPU detection
const isWebGPUAvailable = (): boolean => 'gpu' in navigator

// Engine initialization with progress tracking
const engine = await CreateMLCEngine('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', {
  initProgressCallback: (progress) => {
    const pct = typeof progress === 'number'
      ? Math.floor(progress * 100)
      : Math.floor(progress.progress * 100)
    onProgress(`Downloading AI model...`, pct)
  },
})

// Streaming chat
const stream = await engine.chat.completions.create({
  messages,
  stream: true,
})
for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta.content ?? ''
  onChunk(token, false)
}
onChunk('', true)
```

### Pattern 3: Anthropic Browser Adapter
**What:** Use `dangerouslyAllowBrowser: true` to enable CORS-permissive direct calls from the browser.
**Example:**
```typescript
// Source: https://github.com/anthropics/anthropic-sdk-typescript/issues/248
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: userApiKey,           // from useSettingsStore
  dangerouslyAllowBrowser: true // adds anthropic-dangerous-direct-browser-access: true header
})

const stream = client.messages.stream({
  model: userSelectedModel,
  max_tokens: 2048,
  system: systemPrompt,
  messages,
})
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    onChunk(event.delta.text, false)
  }
}
```

### Pattern 4: OpenAI + OpenAI-Compatible Adapter
**What:** Single adapter covers OpenAI and all compatible services (Groq, OpenRouter, Together, Ollama) by overriding `baseURL`.
**Example:**
```typescript
import OpenAI from 'openai'

// For OpenAI
const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
// For OpenAI-compatible (Groq, OpenRouter, local Ollama)
const client = new OpenAI({ apiKey, baseURL: userBaseUrl, dangerouslyAllowBrowser: true })

const stream = await client.chat.completions.create({
  model: userSelectedModel,
  messages,
  stream: true,
})
for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content ?? ''
  if (token) onChunk(token, false)
}
onChunk('', true)
```

### Pattern 5: System Prompt with Schema Context
**What:** Serialize the graph schema from `useSchemaQuery()` into the system prompt to enable accurate Cypher generation.
**Example:**
```typescript
// Based on: https://aclanthology.org/2025.genaik-1.11.pdf (Text2Cypher research)
function buildSystemPrompt(schema: SchemaResponse): string {
  return `You are an expert Cypher query generator for a graph database.

Graph Schema:
Node Labels: ${schema.labels.join(', ')}
Relationship Types: ${schema.relationshipTypes.join(', ')}
Property Keys: ${schema.propertyKeys.join(', ')}

Rules:
1. Generate only valid openCypher queries compatible with this schema.
2. Use LIMIT 100 unless the user requests more data.
3. Always explain the query before showing it.
4. Wrap the Cypher query in a \`\`\`cypher code block.
5. If a query fails, explain the error and provide a corrected query.

Few-shot examples:
User: Show me all movies
Assistant: Here are all movies in the graph.
\`\`\`cypher
MATCH (m:Movie) RETURN m LIMIT 100
\`\`\`

User: Find actors who worked with Tom Hanks
Assistant: This finds actors who share a movie with Tom Hanks.
\`\`\`cypher
MATCH (a:Actor)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(tom:Actor {name: "Tom Hanks"})
RETURN DISTINCT a.name LIMIT 50
\`\`\``
}
```

### Pattern 6: Streaming Markdown with streamdown
**What:** Use streamdown instead of react-markdown for progressive rendering; it handles unterminated code fences during streaming.
**Example:**
```tsx
// Source: https://github.com/vercel/streamdown
import { Streamdown } from 'streamdown'

// In AIChatMessage component, while streaming:
<Streamdown>{partialMessageContent}</Streamdown>

// streamdown handles "```cypher\nMATCH (n" during streaming — no broken UI
```

### Pattern 7: Extracting Cypher from AI Response
**What:** Parse the completed AI response to extract Cypher code blocks and wire "Run query" button.
**Example:**
```typescript
function extractCypherBlocks(markdown: string): string[] {
  const pattern = /```(?:cypher|CYPHER)\n([\s\S]*?)```/g
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markdown)) !== null) {
    matches.push(match[1].trim())
  }
  return matches
}
```

### Pattern 8: Ephemeral Zustand Chat Store
**What:** Session-only message store, no persist middleware.
**Example:**
```typescript
// Based on: project's existing stores/settings.ts pattern
import { create } from 'zustand'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
  cypherBlocks?: string[]   // extracted after streaming completes
  queryError?: string       // set if run query failed
}

interface AIChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isLoading: boolean
  addUserMessage: (content: string) => void
  startAssistantMessage: () => string  // returns id
  appendToMessage: (id: string, token: string) => void
  finalizeMessage: (id: string) => void
  setQueryError: (id: string, error: string) => void
  clearMessages: () => void
  setIsOpen: (open: boolean) => void
}

export const useAIChatStore = create<AIChatState>()((set) => ({
  // No persist() wrapper — session-only
  messages: [],
  isOpen: false,
  // ... actions
}))
```

### Anti-Patterns to Avoid
- **Storing API keys anywhere but the settings Zustand store (with persist):** Never log, send to backend, or expose keys in URLs.
- **Blocking the main thread with WebLLM:** Always use WebWorker or async iteration — inference takes seconds on large prompts.
- **Waiting for full response before rendering:** Stream token-by-token; users abandon if they see nothing for 5+ seconds.
- **Rendering markdown with react-markdown during streaming:** Causes broken/flickering code blocks. Use streamdown.
- **Including raw query results in AI context:** Truncate large result sets to a summary (first 5 rows + counts) to stay within context window.
- **Re-initializing the WebLLM engine on every chat:** Create the engine once and reuse; downloads are cached in browser Cache API, but re-init still takes 2-5 seconds.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Partial markdown streaming | Custom tokenizer for streaming markdown | `streamdown` | Handles all edge cases: unterminated code fences, partial bold/italic, CJK text |
| Syntax highlighting in code blocks | Manual highlight.js integration | `streamdown` (has Shiki built in) | Shiki themes, language detection, copy button all included |
| Token streaming from Anthropic | Raw fetch + SSE parsing | `@anthropic-ai/sdk` stream API | SDK handles chunked responses, reconnection, and type safety |
| Token streaming from OpenAI | Raw fetch + SSE parsing | `openai` SDK with `stream: true` | SDK returns async iterable; handles all edge cases |
| WebGPU model weight management | Custom Cache API storage | `@mlc-ai/web-llm` | Handles model sharding, cache keys, partial download resume |

**Key insight:** The providers' official SDKs handle all the SSE/streaming edge cases. The only custom streaming code needed is the SSE pattern already established in the codebase for `queryWithTrace` — and that pattern is for the backend trace endpoint, not AI providers.

## Common Pitfalls

### Pitfall 1: CORS Failures on OpenAI and Gemini
**What goes wrong:** Despite `dangerouslyAllowBrowser: true`, some OpenAI requests fail with CORS errors due to `x-stainless-*` preflight headers. Gemini streaming via SSE has inconsistent CORS support.
**Why it happens:** OpenAI's `x-stainless-*` headers trigger browser preflight checks, and OpenAI's CORS config may not permit them from all origins. Gemini's REST API CORS support varies by endpoint.
**How to avoid:** For OpenAI: test `dangerouslyAllowBrowser: true` with production origin before launch; if CORS fails, the OpenAI-compatible adapter with a user-configured base URL (Groq or OpenRouter as proxy) is the fallback path. For Gemini: use `@google/genai` SDK and rely on its streaming method rather than raw fetch.
**Warning signs:** Browser console shows `Access-Control-Allow-Origin` missing; requests succeed in Postman/curl but fail in browser.

### Pitfall 2: WebLLM Engine Initialization Blocks on Re-render
**What goes wrong:** If engine initialization is triggered inside a React component without proper memoization, it fires multiple times, causing multiple downloads or corrupted cache.
**Why it happens:** React StrictMode double-invokes effects; component remounts trigger `init()` again.
**How to avoid:** Hold the engine instance in a `useRef` or module-level singleton. Check `engineRef.current !== null` before calling `CreateMLCEngine`. Use a loading state to prevent concurrent init calls.
**Warning signs:** Multiple "Downloading model..." progress bars; console shows `MLCEngine already initialized` errors.

### Pitfall 3: Context Window Overflow on Long Conversations
**What goes wrong:** After many exchanges (especially with result summaries), the message history grows beyond the model's context window (4096 tokens for most WebLLM models).
**Why it happens:** All messages are sent in each request; long result summaries compound quickly.
**How to avoid:** Implement a rolling window: keep the system prompt + last N messages (6-8 exchanges). Truncate result summaries to 200 characters max. For WebLLM models (4096 token limit), be more aggressive: keep last 4 exchanges.
**Warning signs:** WebLLM throws a context length exceeded error; Anthropic/OpenAI responses become incoherent or start ignoring earlier context.

### Pitfall 4: Code Block Extraction Before Streaming Completes
**What goes wrong:** If Cypher extraction regex runs on partial streaming content, it either finds nothing (code block not closed) or extracts truncated queries.
**Why it happens:** Streaming delivers partial chunks; regex needs the closing ` ``` ` to match.
**How to avoid:** Run `extractCypherBlocks()` only after `isStreaming === false` (message finalized). During streaming, show streamdown's live render but don't show "Run query" buttons until finalized.
**Warning signs:** "Run query" button appears mid-stream; clicking it runs an incomplete query.

### Pitfall 5: Trace Animation Conflict with AI-Initiated Queries
**What goes wrong:** Clicking "Run query" in the AI panel while a trace animation is already playing causes visual glitches or corrupted trace state.
**Why it happens:** `setTrace()` in graph store is called while `trace.isPlaying === true`, overwriting the active trace state.
**How to avoid:** Call `clearTrace()` before calling `useTraceQuery.mutateAsync()` for AI-initiated queries. Disable "Run query" button while `trace.isPlaying === true`.
**Warning signs:** Trace animation plays backwards or freezes; node glow states don't clear.

### Pitfall 6: WebLLM Model Choice — Size vs. Quality Trade-off
**What goes wrong:** The smallest models (SmolLM2-135M, Qwen2.5-0.5B) generate nonsensical or invalid Cypher because they lack code generation capability.
**Why it happens:** Sub-1B parameter models lack the reasoning depth required for structured query generation.
**How to avoid:** Use **Qwen2.5-1.5B-Instruct-q4f16_1-MLC** (~1.6GB) as the minimum for acceptable Cypher generation. Do not go smaller.
**Warning signs:** Model generates Python or SQL instead of Cypher; queries reference non-existent labels.

## Code Examples

Verified patterns from official sources:

### WebLLM: Engine Init + Streaming
```typescript
// Source: https://webllm.mlc.ai/docs/user/basic_usage.html
import { CreateMLCEngine } from '@mlc-ai/web-llm'

// Recommended model for Cypher generation (balance: size vs. quality)
const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

const engine = await CreateMLCEngine(MODEL_ID, {
  initProgressCallback: (progress) => {
    const pct = typeof progress === 'number'
      ? Math.floor(progress * 100)
      : Math.floor(progress.progress * 100)
    updateUI(pct) // show download progress bar
  },
  // Model weights cached in browser Cache API automatically
})

const chunks = await engine.chat.completions.create({
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuestion },
  ],
  stream: true,
})

for await (const chunk of chunks) {
  const token = chunk.choices[0]?.delta.content ?? ''
  appendToken(token)
}
```

### Anthropic: Direct Browser Streaming
```typescript
// Source: https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

const stream = client.messages.stream({
  model: 'claude-haiku-4-20250414',
  max_tokens: 2048,
  system: systemPrompt,
  messages: conversationHistory,
})

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    appendToken(event.delta.text)
  }
}
await stream.finalMessage()
```

### OpenAI + OpenAI-Compatible: Direct Browser Streaming
```typescript
// Source: https://github.com/openai/openai-node
import OpenAI from 'openai'

// Standard OpenAI
const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })

// OpenAI-compatible (Groq, OpenRouter, Ollama, Together)
const client = new OpenAI({
  apiKey,
  baseURL: userConfiguredBaseUrl, // e.g., "https://api.groq.com/openai/v1"
  dangerouslyAllowBrowser: true,
})

const stream = await client.chat.completions.create({
  model: selectedModel,
  messages: conversationHistory,
  stream: true,
  max_tokens: 2048,
})

for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content ?? ''
  if (token) appendToken(token)
}
```

### Google Gemini: Browser Streaming
```typescript
// Source: https://github.com/googleapis/js-genai
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey })

const response = await ai.models.generateContentStream({
  model: 'gemini-2.0-flash',
  contents: conversationHistory,
  config: {
    systemInstruction: systemPrompt,
    maxOutputTokens: 2048,
  },
})

for await (const chunk of response) {
  const token = chunk.text ?? ''
  if (token) appendToken(token)
}
```

### streamdown: Progressive Markdown Rendering
```tsx
// Source: https://github.com/vercel/streamdown
import { Streamdown } from 'streamdown'

// During streaming: handles partial/unterminated code blocks gracefully
function AIChatMessage({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Streamdown>{content}</Streamdown>
    </div>
  )
}
```

### Result Summarization Feed-back Pattern
```typescript
// After successful trace query execution, build a summary to feed back to AI
function buildResultSummary(response: BackendQueryResponse): string {
  const nodeCount = response.nodes?.length ?? 0
  const rowCount = response.rows?.length ?? 0
  if (nodeCount > 0) {
    const sample = response.nodes!.slice(0, 3).map(n =>
      Object.entries(n.properties ?? {}).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ')
    ).join(' | ')
    return `Query returned ${nodeCount} nodes. Sample: ${sample}${nodeCount > 3 ? '...' : ''}`
  }
  return `Query returned ${rowCount} rows.`
}
```

### SettingsStore Extension Pattern
```typescript
// Extend existing stores/settings.ts — follow existing pattern exactly
interface SettingsState {
  // ... existing fields ...
  aiProvider: 'webllm' | 'openai' | 'anthropic' | 'gemini' | 'openai-compatible'
  aiApiKey: string
  aiModel: string
  aiBaseUrl: string  // for openai-compatible provider
  setAiProvider: (p: SettingsState['aiProvider']) => void
  setAiApiKey: (key: string) => void
  setAiModel: (model: string) => void
  setAiBaseUrl: (url: string) => void
}
// persist middleware already in place — these fields will be persisted automatically
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-markdown for AI responses | streamdown (drop-in replacement) | 2024 (Vercel) | Handles streaming partial code blocks without flickering |
| Server-side proxy for AI calls | `dangerouslyAllowBrowser` + direct SDK calls | 2024 (Anthropic Aug 2024, OpenAI earlier) | No backend needed for BYOK pattern |
| Transformers.js for browser inference | WebLLM with WebGPU | 2023-2024 | 5-10x faster due to GPU acceleration |
| google-generative-ai (deprecated) | @google/genai (GA May 2025) | May 2025 | New unified SDK; old package deprecated |
| Custom SSE parsers for streaming | Provider SDK stream iterators | 2024 | Async iterables over streaming responses |

**Deprecated/outdated:**
- `@google/generative-ai`: Deprecated; replaced by `@google/genai`. Do NOT use.
- WebLLM models smaller than 1B: Too small for Cypher generation. SmolLM2-135M and Qwen2.5-0.5B will fail on structured query tasks.

## Open Questions

1. **OpenAI CORS in production**
   - What we know: `dangerouslyAllowBrowser: true` exists and is officially supported; `x-stainless-*` headers sometimes cause preflight failures
   - What's unclear: Whether `api.openai.com` currently allows all origins in CORS headers (may have changed recently)
   - Recommendation: Test in browser against `api.openai.com` during Wave 0. If CORS fails, document it and guide users toward OpenAI-compatible with OpenRouter as a workaround.

2. **Groq CORS support**
   - What we know: Groq is OpenAI-compatible via `openai` SDK with `baseURL: 'https://api.groq.com/openai/v1'`
   - What's unclear: Whether Groq's CORS headers permit browser origins
   - Recommendation: Mark Groq as "may require testing" in settings UI. OpenRouter proxies Groq models and explicitly supports browser CORS, so OpenRouter is a safer choice for the OpenAI-compatible option.

3. **WebLLM model size messaging**
   - What we know: Qwen2.5-1.5B-Instruct-q4f16_1-MLC is ~1.63GB in VRAM, actual download may differ
   - What's unclear: Exact download size vs. VRAM size
   - Recommendation: Show "~1.6GB one-time download" in the download prompt; this is the VRAM figure and download size is similar for q4f16 quantization.

4. **Google Gemini streaming CORS reliability**
   - What we know: `@google/genai` SDK initializes identically in browser and server; CORS errors reported with OpenAI-compatibility endpoint
   - What's unclear: Whether `generateContentStream` works reliably from browser origins for `generativelanguage.googleapis.com`
   - Recommendation: Implement and test during development. If streaming fails, fall back to non-streaming `generateContent` for Gemini only.

5. **MCP tool activity panel (AI-02)**
   - What we know: AI-02 requires a view of MCP tool call activity from AI agents
   - What's unclear: Whether this is about the chat assistant's own tool calls or a separate external agent monitoring panel
   - Recommendation: Defer AI-02 to a later pass within this phase if AI-01 + AI-03 + AI-04 consume the planned budget. AI-02 is listed as a v2 requirement and does not appear in the locked decisions. Clarify scope if needed.

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json`. Skipping this section.

## Sources

### Primary (HIGH confidence)
- `@mlc-ai/web-llm` 0.2.81 — WebLLM official docs (https://webllm.mlc.ai/docs/user/basic_usage.html)
- `streamdown` 2.3.0 — Vercel official repo (https://github.com/vercel/streamdown)
- `@anthropic-ai/sdk` `dangerouslyAllowBrowser` — Anthropic SDK GitHub issue #248 + Simon Willison blog confirming CORS header (https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/)
- `openai` SDK `dangerouslyAllowBrowser` — openai-node official GitHub (https://github.com/openai/openai-node)
- `@google/genai` 1.43.0 — googleapis/js-genai official repo (https://github.com/googleapis/js-genai)
- WebLLM model list — GitHub issue #683 confirmed model IDs and sizes (https://github.com/mlc-ai/web-llm/issues/683)
- Text2Cypher prompt patterns — 2025 ACL paper + Neo4j labs documentation
- Provider-agnostic React pattern — DEV community article with verified code (https://dev.to/thelogicwarlock/provider-agnostic-chat-in-react-webllm-local-mode-remote-fallback-25dd)

### Secondary (MEDIUM confidence)
- OpenAI CORS browser support — community reports from Jan 2024 suggest CORS is supported at `/v1/chat/completions`, but `x-stainless-*` headers may cause issues (OpenAI community forum, multiple threads)
- OpenRouter CORS browser support — developer gist confirming direct browser fetch works (https://gist.github.com/tluyben/1e0c5f23be09573e9989d5abc83fac90) + community discussion
- Google Gemini browser usage — API reference confirms browser init is identical to server-side; CORS for streaming unconfirmed
- streamdown for streaming AI — Reactscript analysis + Vercel changelog (https://vercel.com/changelog/introducing-streamdown)

### Tertiary (LOW confidence)
- Groq CORS browser support — inferred from OpenAI-compatible pattern; no direct CORS confirmation found
- Qwen2.5-1.5B Cypher generation quality — inferred from Qwen2.5 code benchmark rankings; no Cypher-specific benchmark found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages are officially maintained, versions confirmed via npm, APIs verified via official docs
- Architecture: HIGH — follows established codebase patterns (Sheet, Zustand, SSE streaming); provider interface pattern verified via working examples
- CORS per-provider: MEDIUM — Anthropic HIGH confirmed; OpenAI MEDIUM (works but stainless headers risk); OpenRouter MEDIUM; Groq LOW; Gemini streaming MEDIUM
- Pitfalls: HIGH — most come from established streaming/WebLLM implementation experience + verified community reports

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable stack, but provider CORS policies can change; verify OpenAI CORS during implementation)
