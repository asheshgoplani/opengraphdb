import type { GuidedQuery } from '@/data/datasets'
import { cn } from '@/lib/utils'

interface QueryCardProps {
  query: GuidedQuery
  isActive: boolean
  resultCount?: number
  onClick: () => void
}

export function QueryCard({ query, isActive, resultCount, onClick }: QueryCardProps) {
  const count = resultCount ?? query.expectedResultCount

  return (
    <button
      type="button"
      data-testid="query-card"
      className={cn(
        'w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors',
        'flex flex-col gap-1',
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight text-foreground">{query.label}</p>
        <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          {count.toLocaleString()} results
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
