import { formatQueryTime } from './connection-badge-utils'

interface ConnectionBadgeProps {
  queryTimeMs?: number
  isLive?: boolean
  liveError?: string | null
}

export function ConnectionBadge({ queryTimeMs, isLive = false, liveError = null }: ConnectionBadgeProps) {
  const dotColor = liveError ? 'bg-destructive' : isLive ? 'bg-accent' : 'bg-muted-foreground'
  const pingColor = liveError ? 'bg-destructive' : isLive ? 'bg-accent' : 'bg-muted-foreground'
  const label = liveError ? 'Error' : isLive ? 'Live' : 'Sample Data'

  return (
    <div
      data-testid="connection-badge"
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
    >
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
        <span className="max-w-[120px] truncate text-destructive" title={liveError}>
          {liveError}
        </span>
      ) : null}
    </div>
  )
}
