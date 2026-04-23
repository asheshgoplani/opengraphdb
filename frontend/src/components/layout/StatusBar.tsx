import { cn } from '@/lib/utils'

export interface StatusBarProps {
  nodeCount: number
  edgeCount: number
  labelCount?: number
  datasetLabel?: string
  isLive?: boolean
  timeCutoffLabel?: string | null
  className?: string
}

// Shared footer status bar — mounted on /playground AND /app so both surfaces
// reinforce the same dataset/live signal and tabular-nums counters.
export function StatusBar({
  nodeCount,
  edgeCount,
  labelCount,
  datasetLabel,
  isLive = false,
  timeCutoffLabel = null,
  className,
}: StatusBarProps) {
  return (
    <footer
      data-testid="status-bar"
      className={cn(
        // H6 (audit 2026-04-23b): dropped `backdrop-blur-sm` from the
        // canvas-adjacent footer for the same reason as DatasetHeader —
        // per-frame blur composite pass while zoom/panning was measurable in
        // the p99 frame-time tail. bg-card/60 still reads as a designed strip.
        'flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-card/60 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <span>
          <span className="text-white/40">nodes</span>{' '}
          <span
            data-testid="footer-node-count"
            data-status-node-count
            className="tabular-nums text-cyan-200"
          >
            {nodeCount.toLocaleString()}
          </span>
        </span>
        <span>
          <span className="text-white/40">edges</span>{' '}
          <span
            data-testid="footer-edge-count"
            data-status-edge-count
            className="tabular-nums text-cyan-200"
          >
            {edgeCount.toLocaleString()}
          </span>
        </span>
        {typeof labelCount === 'number' && (
          <span>
            <span className="text-white/40">labels</span>{' '}
            <span className="tabular-nums text-white/80">{labelCount}</span>
          </span>
        )}
        {timeCutoffLabel && (
          <span data-testid="status-time-cutoff" className="text-cyan-300/85">
            as-of {timeCutoffLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {datasetLabel && <span className="text-white/40">{datasetLabel}</span>}
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            isLive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-white/30',
          )}
        />
        <span className="text-white/45">{isLive ? 'live' : 'sample'}</span>
      </div>
    </footer>
  )
}
