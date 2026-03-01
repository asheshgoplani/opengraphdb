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

  useEffect(() => {
    if (!trace || !trace.isPlaying || trace.steps.length === 0) return

    const { steps, currentStepIndex, speedMultiplier } = trace
    if (currentStepIndex >= steps.length) {
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

      advanceTrace(currentTrace.steps[idx].nodeId, idx + 1)

      timeoutRef.current = setTimeout(() => {
        rafRef.current = requestAnimationFrame(tick)
      }, baseDelay)
    }

    rafRef.current = requestAnimationFrame(tick)
    return stop
  }, [trace?.isPlaying, trace?.currentStepIndex, trace?.speedMultiplier, advanceTrace, stop])

  return { isPlaying: trace?.isPlaying ?? false, stop }
}
