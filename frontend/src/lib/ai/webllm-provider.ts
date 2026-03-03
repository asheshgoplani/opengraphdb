import type { ChatProvider, ChatMessage } from './providers'

// Singleton engine — shared across all WebLLMProvider instances
let engine: import('@mlc-ai/web-llm').MLCEngineInterface | null = null

export class WebLLMProvider implements ChatProvider {
  readonly id = 'webllm'
  readonly label = 'WebLLM (Free, Local)'

  isAvailable(): boolean {
    return 'gpu' in navigator
  }

  async init(opts?: { onProgress?: (msg: string, pct: number) => void }): Promise<void> {
    if (engine !== null) return

    const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
    const model = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

    engine = await CreateMLCEngine(model, {
      initProgressCallback: (progress) => {
        opts?.onProgress?.(progress.text, progress.progress)
      },
    })
  }

  async streamChat(args: {
    messages: ChatMessage[]
    signal?: AbortSignal
    onChunk: (text: string, done: boolean) => void
  }): Promise<void> {
    if (!engine) {
      throw new Error('WebLLM engine not initialized. Call init() first.')
    }

    const stream = await engine.chat.completions.create({
      messages: args.messages,
      stream: true,
    })

    for await (const chunk of stream) {
      if (args.signal?.aborted) break
      const token = chunk.choices[0]?.delta.content ?? ''
      args.onChunk(token, false)
    }
    args.onChunk('', true)
  }

  async dispose(): Promise<void> {
    if (engine) {
      await engine.unload()
      engine = null
    }
  }
}
