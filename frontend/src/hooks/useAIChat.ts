import { useRef, useEffect, useCallback } from 'react'
import { createProvider, type ChatProvider } from '@/lib/ai/providers'
import { buildSystemPrompt, extractCypherBlocks, buildResultSummary } from '@/lib/ai/system-prompt'
import { useAIChatStore } from '@/stores/ai-chat'
import { useSettingsStore } from '@/stores/settings'
import { useSchemaQuery } from '@/api/queries'
import { useTraceQuery } from '@/api/queries'
import { useGraphStore } from '@/stores/graph'
import type { ChatMessage } from '@/lib/ai/providers'

// Rolling window: how many user+assistant message pairs to keep in context
const API_WINDOW_PAIRS = 6
const WEBLLM_WINDOW_PAIRS = 4

export function useAIChat() {
  const providerRef = useRef<ChatProvider | null>(null)
  const providerInitializedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const aiProvider = useSettingsStore((s) => s.aiProvider)
  const aiApiKey = useSettingsStore((s) => s.aiApiKey)
  const aiModel = useSettingsStore((s) => s.aiModel)
  const aiBaseUrl = useSettingsStore((s) => s.aiBaseUrl)

  const {
    messages,
    addUserMessage,
    startAssistantMessage,
    appendToMessage,
    finalizeMessage,
    setQueryResult,
    setQueryError,
    setIsLoading,
    setDownloadProgress,
  } = useAIChatStore()

  const schemaQuery = useSchemaQuery()
  const traceQuery = useTraceQuery()
  const clearTrace = useGraphStore((s) => s.clearTrace)
  const advanceTrace = useGraphStore((s) => s.advanceTrace)
  const setTrace = useGraphStore((s) => s.setTrace)

  // Determine which provider type to use: API key takes priority over WebLLM
  const effectiveProvider = aiApiKey.trim() !== '' && aiProvider !== 'webllm' ? aiProvider : 'webllm'

  // Recreate provider when settings change
  useEffect(() => {
    providerRef.current = null
    providerInitializedRef.current = false
  }, [aiProvider, aiApiKey, aiModel, aiBaseUrl])

  // Ensure the provider instance is ready, initializing if needed
  async function ensureProvider(
    onProgress?: (msg: string, pct: number) => void
  ): Promise<ChatProvider | null> {
    // Create the provider instance if not yet created
    if (!providerRef.current) {
      providerRef.current = await createProvider(effectiveProvider, {
        apiKey: aiApiKey,
        model: aiModel,
        baseUrl: aiBaseUrl,
      })
      providerInitializedRef.current = false
    }

    const provider = providerRef.current

    // For WebLLM, check availability and run init lazily
    if (effectiveProvider === 'webllm') {
      const available = await Promise.resolve(provider.isAvailable())
      if (!available) {
        return null
      }
      // Init only once per provider instance
      if (!providerInitializedRef.current && provider.init) {
        await provider.init({ onProgress })
        providerInitializedRef.current = true
        setDownloadProgress(null)
      }
    }

    return provider
  }

  // Build the message array for the provider: system prompt + rolling window
  function buildProviderMessages(userText: string): ChatMessage[] {
    const schema = schemaQuery.data
    const systemContent = schema
      ? buildSystemPrompt(schema)
      : 'You are a helpful Cypher query assistant for a graph database.'

    const systemMessage: ChatMessage = { role: 'system', content: systemContent }

    // Filter to only user/assistant messages (exclude system messages from history)
    const chatHistory = messages.filter((m) => m.role === 'user' || m.role === 'assistant')

    // Determine window size based on provider
    const windowPairs = effectiveProvider === 'webllm' ? WEBLLM_WINDOW_PAIRS : API_WINDOW_PAIRS
    const maxMessages = windowPairs * 2

    // Take the last N messages to stay within context window
    const recentHistory = chatHistory.slice(-maxMessages)

    const historyMessages: ChatMessage[] = recentHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    return [systemMessage, ...historyMessages, { role: 'user', content: userText }]
  }

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    addUserMessage(text)
    setIsLoading(true)

    try {
      let provider: ChatProvider | null = null

      if (effectiveProvider === 'webllm') {
        // WebLLM: check WebGPU availability before downloading
        try {
          provider = await ensureProvider((msg, pct) => {
            setDownloadProgress({ message: msg, percent: pct })
          })
        } catch {
          provider = null
        }

        if (provider === null) {
          // WebGPU unavailable — show fallback message
          const fallbackId = startAssistantMessage()
          const fallbackMsg =
            "Your browser doesn't support local AI. Configure an API key in Settings to use the assistant."
          appendToMessage(fallbackId, fallbackMsg)
          finalizeMessage(fallbackId, [])
          return
        }
      } else {
        provider = await ensureProvider()
        if (!provider) {
          const errId = startAssistantMessage()
          appendToMessage(errId, 'Failed to initialize AI provider. Please check your settings.')
          finalizeMessage(errId, [])
          return
        }
      }

      const providerMessages = buildProviderMessages(text)
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const assistantId = startAssistantMessage()
      let fullContent = ''

      await provider.streamChat({
        messages: providerMessages,
        signal: abortController.signal,
        onChunk: (token: string, done: boolean) => {
          if (!done) {
            fullContent += token
            appendToMessage(assistantId, token)
          } else {
            finalizeMessage(assistantId, extractCypherBlocks(fullContent))
          }
        },
      })

      // Ensure finalized even if done=true was never called
      finalizeMessage(assistantId, extractCypherBlocks(fullContent))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Silently ignore user-initiated aborts
        return
      }
      const errorId = startAssistantMessage()
      const errorMsg =
        err instanceof Error ? `Error: ${err.message}` : 'An unexpected error occurred.'
      appendToMessage(errorId, errorMsg)
      finalizeMessage(errorId, [])
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProvider, aiApiKey, aiModel, aiBaseUrl, messages, schemaQuery.data, effectiveProvider])

  const runCypherFromAI = useCallback(
    async (cypher: string, messageId: string): Promise<void> => {
      // Clear any existing trace before starting a new one (prevents animation conflicts)
      clearTrace()

      try {
        const collectedSteps: Array<{ nodeId: string | number; stepIndex: number }> = []

        const response = await traceQuery.mutateAsync({
          cypher,
          onTraceStep: (step) => {
            collectedSteps.push(step)
            if (collectedSteps.length === 1) {
              setTrace([], 1)
            }
            advanceTrace(step.nodeId, step.stepIndex)
          },
        })

        // Build result summary from the response
        const backendResponse = response as { rows?: unknown[]; row_count?: number; columns?: string[] } | null
        const rowCount = backendResponse?.row_count ?? backendResponse?.rows?.length ?? 0
        const nodeCount = collectedSteps.length

        // Sample a few property values for context
        const rows = backendResponse?.rows as Record<string, unknown>[] | undefined
        const sampleRow = rows?.[0]
        const sampleProps = sampleRow
          ? Object.entries(sampleRow)
              .slice(0, 3)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(', ')
          : 'none'

        const summary = buildResultSummary(nodeCount, rowCount, sampleProps)
        setQueryResult(messageId, summary)

        // Replay the full trace animation with collected steps
        if (collectedSteps.length > 0) {
          setTrace(
            collectedSteps.map((s) => ({ nodeId: s.nodeId, stepIndex: s.stepIndex }))
          )
        }

        // Feed results back to AI for follow-up analysis
        const feedbackText = `The query executed successfully. ${summary}. Can you explain what these results mean and suggest any follow-up queries?`
        await sendMessage(feedbackText)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Query execution failed'
        setQueryError(messageId, errorMessage)

        // Feed error back to AI for automatic correction
        const correctionText = `The query failed with this error: "${errorMessage}". Can you explain what went wrong and provide a corrected version?`
        await sendMessage(correctionText)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendMessage, clearTrace, advanceTrace, setTrace, traceQuery]
  )

  // Determine if the provider is ready (available for use)
  const isReady =
    effectiveProvider !== 'webllm' ? aiApiKey.trim() !== '' : true

  // Human-readable label for the active provider
  const PROVIDER_LABELS: Record<string, string> = {
    webllm: 'Local AI (WebLLM)',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    'openai-compatible': 'OpenAI-compatible',
  }
  const providerLabel = PROVIDER_LABELS[effectiveProvider] ?? effectiveProvider

  return {
    sendMessage,
    runCypherFromAI,
    isReady,
    providerLabel,
  }
}
