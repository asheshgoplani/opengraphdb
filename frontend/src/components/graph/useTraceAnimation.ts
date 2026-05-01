import { useEffect, useRef, useCallback } from 'react'
import { useGraphStore } from '@/stores/graph'

export function useTraceAnimation() {
  const trace = useGraphStore((s) => s.trace)
  const advanceTrace = useGraphStore((s) => s.advanceTrace)
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const isPlaying = trace?.isPlaying ?? false
  const currentStepIndex = trace?.currentStepIndex ?? 0
  const speedMultiplier = trace?.speedMultiplier ?? 1
  const stepsLen = trace?.steps.length ?? 0

  useEffect(() => {
    if (!isPlaying || stepsLen === 0) return

    if (currentStepIndex >= stepsLen) {
      useGraphStore.setState((state) => ({
        trace: state.trace ? { ...state.trace, isPlaying: false } : null,
      }))
      return
    }

    const baseDelay = 150 / speedMultiplier

    const tick = () => {
      const currentTrace = useGraphStore.getState().trace
      if (!currentTrace || !currentTrace.isPlaying) return

      const idx = currentTrace.currentStepIndex
      if (idx >= currentTrace.steps.length) {
        useGraphStore.setState((state) => ({
          trace: state.trace ? { ...state.trace, isPlaying: false } : null,
        }))
        return
      }

      const step = currentTrace.steps[idx]
      if (!step) return
      advanceTrace(step.nodeId, idx + 1)

      timeoutRef.current = setTimeout(() => {
        rafRef.current = requestAnimationFrame(tick)
      }, baseDelay)
    }

    rafRef.current = requestAnimationFrame(tick)
    return stop
  }, [isPlaying, currentStepIndex, speedMultiplier, stepsLen, advanceTrace, stop])

  return { isPlaying: trace?.isPlaying ?? false, stop }
}
