// AI provider model catalog used by the Settings dialog.
//
// EVAL-FRONTEND-QUALITY-CYCLE2.md H-1: the runtime provider classes
// (webllm/anthropic/openai/gemini) and the `createProvider` dispatcher
// were never wired to a call site. They lived in the bundle as dead code
// that pulled ~50 MB of vendor SDKs (`@anthropic-ai/sdk`, `@google/genai`,
// `@mlc-ai/web-llm`, `openai`). Until the v0.6 chat surface ships, we
// keep only the UI catalog so the Settings dialog can offer model picks
// without dragging the SDKs into the bundle.

export type AIProviderType = 'webllm' | 'openai' | 'anthropic' | 'gemini' | 'openai-compatible'

export const PROVIDER_MODELS: Record<AIProviderType, { id: string; label: string }[]> = {
  webllm: [
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B (Free, Local)' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
  'openai-compatible': [],
}
