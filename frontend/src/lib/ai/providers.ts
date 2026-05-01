// AI provider model catalog used by the Settings dialog.
//
// EVAL-FRONTEND-QUALITY-CYCLE2.md H-1: the runtime provider classes
// (webllm/anthropic/openai/gemini) and the `createProvider` dispatcher
// were never wired to a call site. They lived in the bundle as dead code
// that pulled ~50 MB of vendor SDKs (`@anthropic-ai/sdk`, `@google/genai`,
// `@mlc-ai/web-llm`, `openai`). Until the v0.6 chat surface ships, we
// keep only the UI catalog so the Settings dialog can offer model picks
// without dragging the SDKs into the bundle.
//
// EVAL-FRONTEND-QUALITY-CYCLE3.md H-4: refresh the catalog. The 2025-05
// Anthropic IDs are at least one full generation behind by 2026-05-01
// (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5` are the
// current Claude 4.7 family); Gemini 1.5 Pro is two generations behind.
// Catalog only — H-3 hides the Settings UI behind VITE_ENABLE_AI_SETTINGS.

export type AIProviderType = 'webllm' | 'openai' | 'anthropic' | 'gemini' | 'openai-compatible'

export const PROVIDER_MODELS: Record<AIProviderType, { id: string; label: string }[]> = {
  webllm: [
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B (Free, Local)' },
  ],
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  ],
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  'openai-compatible': [],
}
