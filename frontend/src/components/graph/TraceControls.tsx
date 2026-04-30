import { RotateCcw, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGraphStore } from '@/stores/graph'

const SPEED_OPTIONS = [0.5, 1, 2, 5] as const

export function TraceControls() {
  const trace = useGraphStore((s) => s.trace)
  const setTraceSpeed = useGraphStore((s) => s.setTraceSpeed)
  const setTrace = useGraphStore((s) => s.setTrace)
  const clearTrace = useGraphStore((s) => s.clearTrace)

  if (!trace) return null

  const progress = trace.steps.length > 0
    ? Math.round((trace.currentStepIndex / trace.steps.length) * 100)
    : 0

  const handleReplay = () => {
    setTrace(trace.steps, trace.speedMultiplier)
  }

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border/60 bg-card/90 px-3 py-2 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5 text-accent" />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {trace.isPlaying ? `${progress}%` : 'Complete'}
        </span>
      </div>
      <div className="h-1 w-20 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center gap-0.5">
        {SPEED_OPTIONS.map((speed) => (
          <button
            key={speed}
            onClick={() => setTraceSpeed(speed)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              trace.speedMultiplier === speed
                ? 'bg-accent/30 text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>
      {!trace.isPlaying && (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleReplay}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clearTrace}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
