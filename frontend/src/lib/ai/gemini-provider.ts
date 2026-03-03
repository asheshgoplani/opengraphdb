import type { ChatProvider, ChatMessage } from './providers'

interface GeminiProviderConfig {
  apiKey: string
  model: string
}

export class GeminiProvider implements ChatProvider {
  readonly id = 'gemini'
  readonly label = 'Google Gemini'

  private readonly apiKey: string
  private readonly model: string

  constructor(config: GeminiProviderConfig) {
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
    const { GoogleGenAI } = await import('@google/genai')

    const ai = new GoogleGenAI({ apiKey: this.apiKey })

    // Separate system message and convert remaining messages to Gemini format
    const systemMessages = args.messages.filter((m) => m.role === 'system')
    const conversationMessages = args.messages.filter((m) => m.role !== 'system')
    const systemInstruction = systemMessages.map((m) => m.content).join('\n\n')

    const contents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const response = await ai.models.generateContentStream({
      model: this.model,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        maxOutputTokens: 2048,
      },
    })

    for await (const chunk of response) {
      if (args.signal?.aborted) break
      const token = chunk.text ?? ''
      args.onChunk(token, false)
    }
    args.onChunk('', true)
  }
}
