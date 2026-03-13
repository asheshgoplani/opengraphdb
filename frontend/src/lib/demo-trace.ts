import type { TraceStep } from '@/types/graph'

export interface SimulatedTraceOptions {
  nodeIds: (string | number)[]
  stepDelayMs?: number
  onStep: (step: TraceStep) => void
  onComplete: () => void
  signal?: AbortSignal
}

export function runSimulatedTrace(options: SimulatedTraceOptions): void {
  const { nodeIds, stepDelayMs = 80, onStep, onComplete, signal } = options

  let currentIndex = 0

  function tick() {
    if (signal?.aborted) return
    if (currentIndex >= nodeIds.length) {
      onComplete()
      return
    }

    onStep({
      nodeId: nodeIds[currentIndex],
      stepIndex: currentIndex,
    })

    currentIndex++
    setTimeout(tick, stepDelayMs)
  }

  tick()
}

export function estimateTraceDuration(nodeCount: number, stepDelayMs = 80): number {
  return nodeCount * stepDelayMs
}
