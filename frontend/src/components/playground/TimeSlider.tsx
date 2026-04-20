import { useEffect, useMemo, useState } from 'react'
import { Database, History, Loader2, RotateCcw } from 'lucide-react'
import type { CompactDiff, TemporalRange } from '@/data/temporal'
import { formatBytes, simulateCompactHistory } from '@/data/temporal'
import type { GraphData } from '@/types/graph'
import { cn } from '@/lib/utils'

export interface TimeSliderProps {
  range: TemporalRange | null
  cutoff: number | null
  onCutoffChange: (cutoff: number) => void
  onReset: () => void
  graph: GraphData
  isLive: boolean
  visibleNodeCount: number
  totalNodeCount: number
}

export function TimeSlider({
  range,
  cutoff,
  onCutoffChange,
  onReset,
  graph,
  isLive,
  visibleNodeCount,
  totalNodeCount,
}: TimeSliderProps) {
  const [compactDiff, setCompactDiff] = useState<CompactDiff | null>(null)
  const [isCompacting, setIsCompacting] = useState(false)

  const effectiveCutoff = cutoff ?? range?.max ?? 0

  const percent = useMemo(() => {
    if (!range || range.max === range.min) return 100
    return ((effectiveCutoff - range.min) / (range.max - range.min)) * 100
  }, [range, effectiveCutoff])

  // Reset diff when dataset (range identity) changes.
  useEffect(() => {
    setCompactDiff(null)
  }, [range?.label, range?.min, range?.max])

  if (!range) {
    return (
      <section
        data-testid="temporal-empty-state"
        className="rounded-lg border border-dashed border-white/15 bg-background/60 px-4 py-6 text-center backdrop-blur-md"
      >
        <p className="font-serif text-[14px] text-white/85">No temporal axis on this dataset</p>
        <p className="mx-auto mt-1 max-w-md text-[11px] text-white/55">
          Switch to MovieLens (release year) or Game of Thrones (season) to scrub the time slider.
          With a live{' '}
          <code className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/75">.ogdb</code>{' '}
          file, the slider would issue{' '}
          <code className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/75">
            CALL ogdb.query_as_of(ts)
          </code>{' '}
          per frame and stream the as-of subgraph.
        </p>
      </section>
    )
  }

  const handleCompact = () => {
    setIsCompacting(true)
    setCompactDiff(null)
    // Simulate a 600ms async ogdb compact_temporal_versions call.
    window.setTimeout(() => {
      setCompactDiff(simulateCompactHistory(graph, range))
      setIsCompacting(false)
    }, 600)
  }

  const formatValue = (n: number): string => {
    if (range.unit === 'season') return `Season ${n}`
    return String(n)
  }

  return (
    <section
      data-testid="time-slider-panel"
      className="rounded-lg border border-white/10 bg-background/85 px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-md"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300/85">
            Bi-temporal · valid_from
          </p>
          <p className="mt-0.5 font-serif text-[15px] leading-tight text-white/95">
            Time travel · {range.label}
          </p>
        </div>
        <div className="flex items-baseline gap-2 text-right">
          <span className="font-serif text-[20px] tabular-nums leading-none text-cyan-200">
            {formatValue(effectiveCutoff)}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="ml-2 inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55 hover:border-white/30 hover:text-white/85"
          >
            <RotateCcw className="h-2.5 w-2.5" /> now
          </button>
        </div>
      </div>

      <div className="relative mt-3">
        <input
          type="range"
          aria-label="time cutoff"
          role="slider"
          min={range.min}
          max={range.max}
          step={1}
          value={effectiveCutoff}
          onChange={(event) => onCutoffChange(Number(event.target.value))}
          className="time-slider-thumb peer w-full appearance-none bg-transparent"
        />
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-400/70 via-cyan-300/60 to-cyan-400/40"
          style={{ width: `${percent}%` }}
        />
        <div className="pointer-events-none absolute left-0 top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full bg-white/10" />
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
        {range.ticks.map((tick) => (
          <span
            key={tick.value}
            className={cn(
              'transition-colors',
              tick.value <= effectiveCutoff ? 'text-cyan-300/80' : 'text-white/35',
            )}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-[10px] text-white/65">
        <span>
          As-of view · <span className="font-mono tabular-nums text-cyan-200">{visibleNodeCount}</span>
          <span className="text-white/35"> / {totalNodeCount} nodes</span>
        </span>
        <button
          type="button"
          data-testid="compact-history-btn"
          onClick={handleCompact}
          disabled={isCompacting}
          className={cn(
            'group inline-flex items-center gap-1.5 rounded border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-60',
          )}
        >
          {isCompacting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <History className="h-3 w-3" />
          )}
          {isCompacting ? 'Compacting…' : 'Compact history'}
        </button>
      </div>

      {compactDiff && (
        <div
          data-testid="compact-history-diff"
          className="mt-2 grid grid-cols-3 gap-2 rounded border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-[10px]"
        >
          <DiffCell
            label="Before"
            value={formatBytes(compactDiff.beforeBytes)}
            sub={`${compactDiff.versionsBefore.toLocaleString()} versions`}
            tone="muted"
          />
          <DiffCell
            label="After"
            value={formatBytes(compactDiff.afterBytes)}
            sub={`${compactDiff.versionsAfter.toLocaleString()} versions`}
            tone="cyan"
          />
          <DiffCell
            label="Reclaimed"
            value={`-${compactDiff.reclaimedPct}%`}
            sub={isLive ? 'live · compact_temporal_versions' : 'simulated · attach .ogdb to verify'}
            tone="emerald"
          />
        </div>
      )}

      {!isLive && !compactDiff && (
        <p className="mt-2 flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-white/40">
          <Database className="h-2.5 w-2.5" /> sample mode · live db will call ogdb-core temporal API
        </p>
      )}
    </section>
  )
}

interface DiffCellProps {
  label: string
  value: string
  sub: string
  tone: 'muted' | 'cyan' | 'emerald'
}

function DiffCell({ label, value, sub, tone }: DiffCellProps) {
  const valueClass =
    tone === 'cyan' ? 'text-cyan-200' : tone === 'emerald' ? 'text-emerald-300' : 'text-white/85'
  return (
    <div>
      <p className="text-[8px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className={cn('mt-0.5 font-serif text-[14px] leading-none tabular-nums', valueClass)}>{value}</p>
      <p className="mt-0.5 truncate text-[8px] text-white/40">{sub}</p>
    </div>
  )
}
