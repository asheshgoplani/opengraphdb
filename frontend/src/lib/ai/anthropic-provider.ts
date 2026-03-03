import type { ChatProvider, ChatMessage } from './providers'

interface AnthropicProviderConfig {
  apiKey: string
  model: string
}

export class AnthropicProvider implements ChatProvider {
  readonly id = 'anthropic'
  readonly label = 'Anthropic'

  private readonly apiKey: string
  private readonly model: string

  constructor(config: AnthropicProviderConfig) {
    this.apiKey = config.apiKey
    this.model = config.model
  }

  isAvailable(): boolean {
    return true
  }

  async streamChat(args: {
    messages: ChatMessage[]
    signal?: AbortSignal
    onChunk: (text: string, done: boolean) => void
  }): Promise<void> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default

    const client = new Anthropic({
      apiKey: this.apiKey,
      dangerouslyAllowBrowser: true,
    })

    // Separate system message from conversation messages
    const systemMessages = args.messages.filter((m) => m.role === 'system')
    const nonSystemMessages = args.messages.filter((m) => m.role !== 'system')
    const systemContent = systemMessages.map((m) => m.content).join('\n\n')

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      ...(systemContent ? { system: systemContent } : {}),
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    for await (const event of stream) {
      if (args.signal?.aborted) break
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        args.onChunk(event.delta.text, false)
      }
    }
    args.onChunk('', true)
  }
}
