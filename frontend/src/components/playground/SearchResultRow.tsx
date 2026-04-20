import type { SearchHit, SearchMode } from '@/data/semanticSearch'
import { cn } from '@/lib/utils'

interface SearchResultRowProps {
  hit: SearchHit
  mode: SearchMode
  rank: number
  isHighlighted: boolean
  onHover: (id: string | number | null) => void
  onFocus: (id: string | number) => void
}

function scoreLabel(mode: SearchMode): string {
  if (mode === 'fulltext') return 'BM25'
  if (mode === 'vector') return 'cos'
  return 'RRF'
}

function scoreValue(hit: SearchHit, mode: SearchMode): string {
  if (mode === 'fulltext') return hit.bm25.toFixed(2)
  if (mode === 'vector') return hit.cosine.toFixed(3)
  return hit.rrf.toFixed(4)
}

const GENRE_ACCENT: Record<string, string> = {
  'Sci-Fi': 'bg-cyan-400/15 text-cyan-200 border-cyan-400/30',
  Fantasy: 'bg-violet-400/15 text-violet-200 border-violet-400/30',
  Action: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
  Crime: 'bg-red-400/15 text-red-200 border-red-400/30',
  Thriller: 'bg-red-400/15 text-red-200 border-red-400/30',
  Drama: 'bg-rose-400/15 text-rose-200 border-rose-400/30',
  War: 'bg-orange-400/15 text-orange-200 border-orange-400/30',
  Adventure: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30',
  Animation: 'bg-pink-400/15 text-pink-200 border-pink-400/30',
}

export function SearchResultRow({
  hit,
  mode,
  rank,
  isHighlighted,
  onHover,
  onFocus,
}: SearchResultRowProps) {
  const accent = GENRE_ACCENT[hit.item.label] ?? 'bg-white/5 text-white/80 border-white/15'

  return (
    <button
      type="button"
      data-testid="search-result-row"
      data-node-id={hit.item.id}
      onMouseEnter={() => onHover(hit.item.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onFocus(hit.item.id)}
      className={cn(
        'group w-full rounded-lg border bg-muted/25 px-3 py-2.5 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-muted/40 hover:shadow-lg hover:shadow-cyan-500/10',
        isHighlighted
          ? 'border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
          : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-serif text-[10px] leading-none tracking-[0.18em] text-white/40">
              #{rank}
            </span>
            <p className="truncate font-serif text-[15px] leading-tight tracking-tight text-foreground">
              {hit.item.title}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em]',
                accent,
              )}
            >
              {hit.item.label || 'Unknown'}
            </span>
            <span className="text-[10px] text-white/45">
              node <span className="font-mono">{String(hit.item.id)}</span>
            </span>
          </div>
        </div>
        <div
          data-testid="score-badge"
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums',
            'border-cyan-400/40 bg-cyan-500/10 text-cyan-200 shadow-[0_0_6px_rgba(34,211,238,0.25)]',
          )}
        >
          <span className="mr-1 text-[8px] uppercase tracking-[0.16em] text-cyan-200/70">
            {scoreLabel(mode)}
          </span>
          {scoreValue(hit, mode)}
        </div>
      </div>
    </button>
  )
}
