import type { ChatProvider, ChatMessage } from './providers'

interface OpenAIProviderConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export class OpenAIProvider implements ChatProvider {
  readonly id: string
  readonly label: string

  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl?: string

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey
    this.model = config.model
    this.baseUrl = config.baseUrl

    if (config.baseUrl) {
      this.id = 'openai-compatible'
      this.label = 'OpenAI-Compatible'
    } else {
      this.id = 'openai'
      this.label = 'OpenAI'
    }
  }

  isAvailable(): boolean {
    return true
  }

  async streamChat(args: {
    messages: ChatMessage[]
    signal?: AbortSignal
    onChunk: (text: string, done: boolean) => void
  }): Promise<void> {
    const { default: OpenAI } = await import('openai')

    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    })

    const stream = await client.chat.completions.create(
      {
        model: this.model,
        messages: args.messages,
        stream: true,
        max_tokens: 2048,
      },
      { signal: args.signal }
    )

    for await (const chunk of stream) {
      if (args.signal?.aborted) break
      const token = chunk.choices[0]?.delta?.content ?? ''
      args.onChunk(token, false)
    }
    args.onChunk('', true)
  }
}
