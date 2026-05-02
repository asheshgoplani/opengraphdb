interface PerfStripProps {
  queryTimeMs: number
  nodeCount: number
  edgeCount: number
  rowCount: number | null
  isLive: boolean
}

interface PerfCellProps {
  testId: string
  label: string
  value: string
  unit: string
  caption: string
  accent?: 'primary' | 'cyan' | 'emerald' | 'muted'
}

function PerfCell({ testId, label, value, unit, caption, accent = 'muted' }: PerfCellProps) {
  const accentClass =
    accent === 'cyan'
      ? 'text-accent'
      : accent === 'emerald'
        ? 'text-accent'
        : accent === 'primary'
          ? 'text-primary'
          : 'text-foreground'

  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-1 flex-col justify-center border-l border-border/60 px-4 first:border-l-0"
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`font-serif text-[22px] leading-none tracking-tight tabular-nums ${accentClass}`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[10px] font-medium lowercase tracking-wider text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{caption}</p>
    </div>
  )
}

// 2026-05-02 (C9 audit): the strip used to show synthesized parse/plan/execute
// cells computed as fixed 5/20/75% ratios of the total time. The backend does
// not expose `db.query_profiled` yet — every per-stage µs/ms reading was a lie
// rendered as "Verified perf · live · profiled". The four cells are now real
// counters: rows returned by the query (or — if none yet), visible nodes and
// edges in the canvas, and the actual total wall-clock for the last query.
export function PerfStrip({ queryTimeMs, nodeCount, edgeCount, rowCount, isLive }: PerfStripProps) {
  const hasRun = queryTimeMs > 0
  const total = hasRun
    ? queryTimeMs < 10
      ? queryTimeMs.toFixed(2)
      : queryTimeMs.toFixed(1)
    : '—'

  const rowsValue = rowCount == null ? '—' : rowCount.toLocaleString()
  const nodesValue = nodeCount.toLocaleString()
  const edgesValue = edgeCount.toLocaleString()

  return (
    <section
      data-testid="perf-strip"
      aria-label="Query performance sidebar"
      className="flex items-stretch gap-0 rounded-lg border border-border/60 bg-background/80 px-4 py-2 shadow-lg shadow-black/20 backdrop-blur-md"
    >
      <div className="flex w-[170px] shrink-0 flex-col justify-center border-r border-border/60 pr-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">
          Last query
        </p>
        <p className="mt-0.5 font-serif text-[15px] leading-tight tracking-tight text-foreground">
          measured locally
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          {isLive ? 'live · http /query' : 'sample · in-memory filter'}
        </p>
      </div>

      <PerfCell
        testId="perf-rows"
        label="Rows"
        value={rowsValue}
        unit=""
        caption="result set size"
        accent="primary"
      />
      <PerfCell
        testId="perf-nodes"
        label="Nodes"
        value={nodesValue}
        unit=""
        caption="drawn in canvas"
        accent="primary"
      />
      <PerfCell
        testId="perf-edges"
        label="Edges"
        value={edgesValue}
        unit=""
        caption="drawn in canvas"
        accent="cyan"
      />
      <PerfCell
        testId="perf-total"
        label="Total"
        value={total}
        unit="ms"
        caption={hasRun ? 'wall-clock, last query' : 'awaiting first query'}
        accent="emerald"
      />
    </section>
  )
}
