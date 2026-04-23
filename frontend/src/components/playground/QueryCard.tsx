import type { GuidedQuery } from '@/data/datasets'
import { cn } from '@/lib/utils'

interface QueryCardProps {
  query: GuidedQuery
  isActive: boolean
  // `number` = a real, measured count. `null` = live-mode card that has not yet
  // executed against the backend — show "—" instead of the stale in-browser
  // `expectedResultCount`, which would lie when the live DB is empty.
  // `undefined` = fall back to the static `expectedResultCount` (non-live).
  resultCount?: number | null
  onClick: () => void
}

export function QueryCard({ query, isActive, resultCount, onClick }: QueryCardProps) {
  const countLabel =
    resultCount === null
      ? '— results'
      : `${(resultCount ?? query.expectedResultCount).toLocaleString()} results`

  return (
    <button
      type="button"
      data-testid="query-card"
      className={cn(
        'w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left',
        'flex flex-col gap-1',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5',
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight text-foreground">{query.label}</p>
        <span
          data-testid="query-card-count"
          className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          {countLabel}
        </span>
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{query.description}</p>
      <code
        className="block overflow-hidden rounded bg-muted/50 px-2 py-1 font-mono text-[11px] leading-snug text-muted-foreground"
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
      >
        {query.cypher}
      </code>
    </button>
  )
}
