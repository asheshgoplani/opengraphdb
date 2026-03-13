import { useRef, useEffect, useCallback } from 'react'
import { createProvider, type ChatProvider } from '@/lib/ai/providers'
import { buildDemoSystemPrompt } from '@/lib/ai/demo-system-prompt'
import { extractCypherBlocks } from '@/lib/ai/system-prompt'
import { useDemoStore } from '@/stores/demo'
import { useSettingsStore } from '@/stores/settings'
import { useGraphStore } from '@/stores/graph'
import { DEMO_QUESTIONS } from '@/data/demo-questions'
import { getDemoResponse, DEMO_RESPONSES } from '@/data/demo-responses'
import { runSimulatedTrace } from '@/lib/demo-trace'
import type { DatasetKey } from '@/data/datasets'
import type { ChatMessage } from '@/lib/ai/providers'

// Rolling window pairs for demo context
const DEMO_WINDOW_PAIRS = 4

// Target ~60 chars/sec via requestAnimationFrame batching (16ms/frame * 4 chars = 64 chars/sec)
const TYPEWRITER_CHARS_PER_FRAME = 4

export function useDemoChat() {
  const providerRef = useRef<ChatProvider | null>(null)
  const providerInitializedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const typewriterRafRef = useRef<number | null>(null)

  const aiProvider = useSettingsStore((s) => s.aiProvider)
  const aiApiKey = useSettingsStore((s) => s.aiApiKey)
  const aiModel = useSettingsStore((s) => s.aiModel)
  const aiBaseUrl = useSettingsStore((s) => s.aiBaseUrl)

  const {
    activeDataset,
    messages,
    addUserMessage,
    startAssistantMessage,
    appendToMessage,
    finalizeMessage,
    setGraphData,
    setIsLoading,
    setIsTraceAnimating,
    setActiveDataset: storeSetActiveDataset,
  } = useDemoStore()

  const clearTrace = useGraphStore((s) => s.clearTrace)
  const advanceTrace = useGraphStore((s) => s.advanceTrace)
  const setTrace = useGraphStore((s) => s.setTrace)

  // Determine effective provider: API key configured takes priority over WebLLM
  const effectiveProvider = aiApiKey.trim() !== '' && aiProvider !== 'webllm' ? aiProvider : 'webllm'

  // Recreate provider on settings change
  useEffect(() => {
    providerRef.current = null
    providerInitializedRef.current = false
  }, [aiProvider, aiApiKey, aiModel, aiBaseUrl])

  // Cancel any pending RAF typewriter tick
  function cancelTypewriterRaf() {
    if (typewriterRafRef.current !== null) {
      cancelAnimationFrame(typewriterRafRef.current)
      typewriterRafRef.current = null
    }
  }

  async function ensureProvider(): Promise<ChatProvider | null> {
    if (!providerRef.current) {
      providerRef.current = await createProvider(effectiveProvider, {
        apiKey: aiApiKey,
        model: aiModel,
        baseUrl: aiBaseUrl,
      })
      providerInitializedRef.current = false
    }

    const provider = providerRef.current

    if (effectiveProvider === 'webllm') {
      const available = await Promise.resolve(provider.isAvailable())
      if (!available) return null
      if (!providerInitializedRef.current && provider.init) {
        await provider.init()
        providerInitializedRef.current = true
      }
    }

    return provider
  }

  // Typewriter effect using requestAnimationFrame for smooth ~60 chars/sec output
  function streamTypewriter(
    assistantId: string,
    text: string,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve) => {
      let pos = 0

      function tick() {
        if (signal.aborted) {
          resolve()
          return
        }

        if (pos >= text.length) {
          typewriterRafRef.current = null
          resolve()
          return
        }

        const chunk = text.slice(pos, pos + TYPEWRITER_CHARS_PER_FRAME)
        appendToMessage(assistantId, chunk)
        pos += TYPEWRITER_CHARS_PER_FRAME

        typewriterRafRef.current = requestAnimationFrame(tick)
      }

      typewriterRafRef.current = requestAnimationFrame(tick)
    })
  }

  // Compute adaptive step delay based on node count to keep total animation 2-4 seconds
  function adaptiveStepDelay(nodeCount: number): number {
    if (nodeCount < 15) return 120
    if (nodeCount <= 30) return 80
    return 50
  }

  // Start simulated trace animation from a list of node IDs
  function startSimulatedTrace(nodeIds: (string | number)[], signal: AbortSignal) {
    if (nodeIds.length === 0) return

    clearTrace()
    setTrace([], 1)
    setIsTraceAnimating(true)

    const stepDelayMs = adaptiveStepDelay(nodeIds.length)

    runSimulatedTrace({
      nodeIds,
      stepDelayMs,
      signal,
      onStep: (step) => {
        advanceTrace(step.nodeId, step.stepIndex)
      },
      onComplete: () => {
        setIsTraceAnimating(false)
      },
    })
  }

  const sendQuestion = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim()
      if (!trimmed) return

      // Abort any in-flight work (typewriter RAF + previous AbortController)
      cancelTypewriterRaf()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Pre-computed fast path: check if this is a suggested question
      const questions = DEMO_QUESTIONS[activeDataset]
      const matchedQuestion = questions.find(
        (q) => q.text.trim().toLowerCase() === trimmed.toLowerCase()
      )

      if (matchedQuestion) {
        const response = getDemoResponse(matchedQuestion.id)
        if (response) {
          addUserMessage(trimmed)
          const assistantId = startAssistantMessage()

          const fullText = `${response.nlAnswer}\n\n\`\`\`cypher\n${response.cypher}\n\`\`\``

          await streamTypewriter(assistantId, fullText, abortController.signal)

          if (!abortController.signal.aborted) {
            finalizeMessage(assistantId, response.cypher)
            setGraphData(response.graphData)
            startSimulatedTrace(response.traceNodeIds, abortController.signal)
          }
          return
        }
      }

      // Live AI fallback for custom questions
      addUserMessage(trimmed)
      setIsLoading(true)

      try {
        let provider: ChatProvider | null = null

        try {
          provider = await ensureProvider()
        } catch {
          provider = null
        }

        if (provider === null) {
          const fallbackId = startAssistantMessage()
          // Friendly WebGPU unavailability message for custom questions
          const fallbackMsg =
            effectiveProvider === 'webllm'
              ? "For custom questions, you'll need a browser with WebGPU support or an API key. Try the suggested questions above for instant results!"
              : 'Failed to initialize AI provider. Please check your settings.'
          appendToMessage(fallbackId, fallbackMsg)
          finalizeMessage(fallbackId)
          return
        }

        // Build system + rolling history context
        const systemContent = buildDemoSystemPrompt(activeDataset)
        const systemMessage: ChatMessage = { role: 'system', content: systemContent }

        const chatHistory = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
        const recentHistory = chatHistory.slice(-(DEMO_WINDOW_PAIRS * 2))
        const historyMessages: ChatMessage[] = recentHistory.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

        const providerMessages: ChatMessage[] = [
          systemMessage,
          ...historyMessages,
          { role: 'user', content: trimmed },
        ]

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
              const cypherBlocks = extractCypherBlocks(fullContent)
              const firstCypher = cypherBlocks[0]
              finalizeMessage(assistantId, firstCypher)

              // Try to find a matching offline graph result
              if (!abortController.signal.aborted) {
                const matchingResponse = findBestOfflineMatch(activeDataset, firstCypher)
                if (matchingResponse) {
                  setGraphData(matchingResponse.graphData)
                  startSimulatedTrace(matchingResponse.traceNodeIds, abortController.signal)
                }
              }
            }
          },
        })

        // Ensure finalized
        const cypherBlocks = extractCypherBlocks(fullContent)
        finalizeMessage(assistantId, cypherBlocks[0])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return

        const errorId = startAssistantMessage()
        const errorMsg =
          err instanceof Error ? `Error: ${err.message}` : 'An unexpected error occurred.'
        appendToMessage(errorId, errorMsg)
        finalizeMessage(errorId)
      } finally {
        setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDataset, messages, aiProvider, aiApiKey, aiModel, aiBaseUrl, effectiveProvider]
  )

  const setActiveDataset = useCallback(
    (key: DatasetKey) => {
      // Abort any in-flight animation, typewriter RAF, or request
      cancelTypewriterRaf()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      setIsLoading(false)
      clearTrace()
      storeSetActiveDataset(key)
    },
    [clearTrace, setIsLoading, storeSetActiveDataset]
  )

  const isReady = effectiveProvider !== 'webllm' ? aiApiKey.trim() !== '' : true

  return {
    sendQuestion,
    isReady,
    activeDataset,
    setActiveDataset,
  }
}

// Best-effort heuristic: find the closest offline dataset response for a live AI query
function findBestOfflineMatch(
  dataset: DatasetKey,
  cypher: string | undefined,
): { graphData: import('@/types/graph').GraphData; traceNodeIds: (string | number)[] } | null {
  if (!cypher) return null

  const datasetQuestions = DEMO_QUESTIONS[dataset]
  if (!datasetQuestions) return null

  // Pick the first pre-computed response for this dataset as a representative fallback
  const firstQuestion = datasetQuestions[0]
  if (!firstQuestion) return null

  const response = DEMO_RESPONSES.get(firstQuestion.id)
  return response ?? null
}
