interface ConnectionBadgeProps {
  queryTimeMs?: number
}

function formatQueryTime(queryTimeMs: number): string {
  if (queryTimeMs < 1) {
    return '<1ms (in-memory)'
  }
  return `${Math.round(queryTimeMs)}ms (in-memory)`
}

export function ConnectionBadge({ queryTimeMs }: ConnectionBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-medium text-foreground">Sample Data</span>
      {typeof queryTimeMs === 'number' ? <span>· {formatQueryTime(queryTimeMs)}</span> : null}
    </div>
  )
}
