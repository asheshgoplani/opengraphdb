export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatProvider {
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

export async function createProvider(
  type: AIProviderType,
  config: { apiKey: string; model: string; baseUrl: string }
): Promise<ChatProvider> {
  switch (type) {
    case 'webllm': {
      const { WebLLMProvider } = await import('./webllm-provider')
      return new WebLLMProvider()
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./openai-provider')
      return new OpenAIProvider({ apiKey: config.apiKey, model: config.model })
    }
    case 'openai-compatible': {
      const { OpenAIProvider } = await import('./openai-provider')
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic-provider')
      return new AnthropicProvider({ apiKey: config.apiKey, model: config.model })
    }
    case 'gemini': {
      const { GeminiProvider } = await import('./gemini-provider')
      return new GeminiProvider({ apiKey: config.apiKey, model: config.model })
    }
    default: {
      const exhaustive: never = type
      throw new Error(`Unknown provider type: ${String(exhaustive)}`)
    }
  }
}
