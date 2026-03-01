interface ConnectionBadgeProps {
  queryTimeMs?: number
  isLive?: boolean
  liveError?: string | null
}

export function formatQueryTime(queryTimeMs: number, isLive: boolean): string {
  if (queryTimeMs < 1) {
    return isLive ? '<1ms' : '<1ms (in-memory)'
  }
  return isLive ? `${Math.round(queryTimeMs)}ms` : `${Math.round(queryTimeMs)}ms (in-memory)`
}

export function ConnectionBadge({ queryTimeMs, isLive = false, liveError = null }: ConnectionBadgeProps) {
  const dotColor = liveError ? 'bg-red-500' : isLive ? 'bg-emerald-500' : 'bg-sky-400'
  const pingColor = liveError ? 'bg-red-400' : isLive ? 'bg-emerald-400' : 'bg-sky-300'
  const label = liveError ? 'Error' : isLive ? 'Live' : 'Sample Data'

  return (
    <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        {liveError ? null : (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pingColor} opacity-75`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      <span className="font-medium text-foreground">{label}</span>
      {typeof queryTimeMs === 'number' && !liveError ? (
        <span>· {formatQueryTime(queryTimeMs, isLive)}</span>
      ) : null}
      {liveError ? (
        <span className="max-w-[120px] truncate text-red-400" title={liveError}>
          {liveError}
        </span>
      ) : null}
    </div>
  )
}
