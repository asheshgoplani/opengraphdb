import { useMemo, useState, type FormEvent } from 'react'
import { Search, Sparkles, Layers, FileText } from 'lucide-react'
import type { SearchHit, SearchMode } from '@/data/semanticSearch'
import { runSearch } from '@/data/semanticSearch'
import { SearchResultRow } from './SearchResultRow'
import { cn } from '@/lib/utils'

interface SemanticSearchPanelProps {
  highlightedIds: Set<string | number>
  onHoverHit: (id: string | number | null) => void
  onFocusHit: (id: string | number) => void
  onResultsChange: (hits: SearchHit[]) => void
}

interface ModeConfig {
  id: SearchMode
  label: string
  blurb: string
  Icon: typeof Search
  accent: string
  activeBg: string
}

const MODES: ModeConfig[] = [
  {
    id: 'fulltext',
    label: 'Full-text',
    blurb: 'BM25 over tantivy — matches exact terms, fuzzy stems, and phrase boosts.',
    Icon: FileText,
    accent: 'text-amber-200',
    activeBg: 'bg-amber-400/15 border-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.2)]',
  },
  {
    id: 'vector',
    label: 'Vector',
    blurb: 'usearch HNSW — cosine ANN over 4k-dim embeddings, pure semantic neighbourhood.',
    Icon: Sparkles,
    accent: 'text-violet-200',
    activeBg: 'bg-violet-400/15 border-violet-400/40 shadow-[0_0_10px_rgba(167,139,250,0.2)]',
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    blurb: 'Reciprocal Rank Fusion of BM25 + vector + graph centrality — the best of three signals.',
    Icon: Layers,
    accent: 'text-cyan-200',
    activeBg: 'bg-cyan-400/15 border-cyan-400/40 shadow-[0_0_10px_rgba(34,211,238,0.25)]',
  },
]

export function SemanticSearchPanel({
  highlightedIds,
  onHoverHit,
  onFocusHit,
  onResultsChange,
}: SemanticSearchPanelProps) {
  const [mode, setMode] = useState<SearchMode>('hybrid')
  const [query, setQuery] = useState<string>('')
  const [submittedQuery, setSubmittedQuery] = useState<string>('')
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [hits, setHits] = useState<SearchHit[]>([])

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[2]

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    const start = performance.now()
    const next = runSearch(trimmed, mode, 5)
    const latency = Math.max(0.05, +(performance.now() - start).toFixed(2))
    setHits(next)
    setSubmittedQuery(trimmed)
    setLastLatencyMs(latency)
    onResultsChange(next)
  }

  const handleModeSwitch = (nextMode: SearchMode) => {
    setMode(nextMode)
    if (submittedQuery) {
      const start = performance.now()
      const next = runSearch(submittedQuery, nextMode, 5)
      const latency = Math.max(0.05, +(performance.now() - start).toFixed(2))
      setHits(next)
      setLastLatencyMs(latency)
      onResultsChange(next)
    }
  }

  const topHit = useMemo(() => hits[0] ?? null, [hits])

  return (
    <section
      data-testid="semantic-search-panel"
      className="flex h-full flex-col overflow-hidden bg-background"
    >
      <header className="border-b border-white/10 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-serif text-[22px] leading-tight tracking-tight text-foreground">
              Semantic search
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-white/55">
              One engine, three retrieval signals — full-text, vector ANN, and graph-boosted RRF.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-200">
            dev embeddings
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Search mode"
          className="mt-4 grid grid-cols-3 gap-2"
        >
          {MODES.map((m) => {
            const Icon = m.Icon
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={m.label}
                onClick={() => handleModeSwitch(m.id)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-all duration-200',
                  isActive
                    ? m.activeBg
                    : 'border-white/10 bg-muted/20 hover:-translate-y-0.5 hover:border-white/25 hover:bg-muted/35',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', isActive ? m.accent : 'text-white/55')} />
                  <span
                    className={cn(
                      'font-serif text-[14px] leading-none tracking-tight',
                      isActive ? 'text-foreground' : 'text-white/70',
                    )}
                  >
                    {m.label}
                  </span>
                </div>
                <p className="text-[10px] leading-snug text-white/50">{m.blurb}</p>
              </button>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex items-stretch gap-2">
          <label htmlFor="semantic-search-input" className="sr-only">
            Semantic search query
          </label>
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/15 bg-muted/30 px-3 py-2 transition-colors focus-within:border-cyan-400/50 focus-within:bg-muted/50">
            <Search className="h-4 w-4 text-white/45" />
            <input
              id="semantic-search-input"
              type="search"
              role="searchbox"
              aria-label="Semantic search query"
              value={query}
              placeholder="e.g. space opera, heist thriller, dreams within dreams"
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[13px] leading-tight text-foreground placeholder:text-white/35 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 font-serif text-[13px] leading-none tracking-tight text-cyan-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-500/25 hover:shadow-[0_0_14px_rgba(34,211,238,0.3)] active:translate-y-0"
          >
            Search
          </button>
        </form>
      </header>

      <div className="flex min-h-0 flex-1 gap-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-r border-white/10 px-5 py-4">
          {submittedQuery ? (
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Top-{hits.length || 0} for
                </p>
                <p className="mt-0.5 font-serif text-[17px] leading-tight tracking-tight text-foreground">
                  "{submittedQuery}"
                </p>
              </div>
              <p className="text-[10px] tabular-nums text-white/45">
                {activeMode.label} · {lastLatencyMs != null ? `${lastLatencyMs}ms` : '—'}
              </p>
            </div>
          ) : null}

          {!submittedQuery ? <EmptyState /> : null}

          {submittedQuery && hits.length === 0 ? (
            <p className="text-[12px] text-white/50">
              No results for "{submittedQuery}" in this mode. Try hybrid to widen recall.
            </p>
          ) : null}

          <div className="space-y-2">
            {hits.map((hit, idx) => (
              <SearchResultRow
                key={String(hit.item.id)}
                hit={hit}
                mode={mode}
                rank={idx + 1}
                isHighlighted={highlightedIds.has(hit.item.id)}
                onHover={onHoverHit}
                onFocus={onFocusHit}
              />
            ))}
          </div>
        </div>

        <aside
          data-testid="score-breakdown-sidebar"
          className="hidden w-[280px] shrink-0 flex-col overflow-y-auto bg-muted/15 px-5 py-4 lg:flex"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Score breakdown
          </p>
          {topHit ? (
            <div className="mt-2">
              <p className="font-serif text-[15px] leading-tight tracking-tight text-foreground">
                {topHit.item.title}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
                top hit · node {String(topHit.item.id)}
              </p>

              <ScoreRow
                label="BM25"
                caption={`rank ${topHit.rankBm25 ?? '—'} · tantivy`}
                value={topHit.bm25.toFixed(3)}
                active={mode === 'fulltext' || mode === 'hybrid'}
                accent="amber"
              />
              <ScoreRow
                label="Cosine"
                caption={`rank ${topHit.rankVector ?? '—'} · usearch ANN`}
                value={topHit.cosine.toFixed(3)}
                active={mode === 'vector' || mode === 'hybrid'}
                accent="violet"
              />
              <ScoreRow
                label="Graph boost"
                caption="centrality × rating"
                value={topHit.graphBoost.toFixed(3)}
                active={mode === 'hybrid'}
                accent="emerald"
              />
              <div className="mt-3 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
                  Final {mode === 'hybrid' ? 'RRF' : mode === 'fulltext' ? 'BM25' : 'cosine'}
                </p>
                <p className="mt-0.5 font-serif text-[22px] leading-none tracking-tight tabular-nums text-cyan-100">
                  {topHit.finalScore.toFixed(mode === 'hybrid' ? 4 : 3)}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-white/55">
                  {mode === 'hybrid'
                    ? 'Σ 1/(60+rank_i) across signals + 0.35× graph boost'
                    : mode === 'fulltext'
                      ? 'Classic Okapi BM25 over title + genre tokens'
                      : 'Dot product of L2-normalised topic vectors'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-snug text-white/45">
              Run a search to see how BM25, cosine, and graph signals combine into the final score.
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}

function ScoreRow({
  label,
  caption,
  value,
  active,
  accent,
}: {
  label: string
  caption: string
  value: string
  active: boolean
  accent: 'amber' | 'violet' | 'emerald'
}) {
  const dot =
    accent === 'amber'
      ? 'bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.55)]'
      : accent === 'violet'
        ? 'bg-violet-300 shadow-[0_0_6px_rgba(196,181,253,0.55)]'
        : 'bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.55)]'

  return (
    <div
      className={cn(
        'mt-3 flex items-start justify-between gap-2 border-t border-white/5 pt-3 transition-opacity',
        active ? 'opacity-100' : 'opacity-40',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
            {label}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-white/45">{caption}</p>
      </div>
      <p className="font-mono text-[12px] tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mt-2 space-y-4">
      <div>
        <p className="font-serif text-[18px] leading-tight tracking-tight text-foreground">
          Three retrieval signals, one query.
        </p>
        <p className="mt-1 text-[12px] leading-snug text-white/55">
          Pick a mode above, type a phrase, and watch how OpenGraphDB combines classic full-text,
          vector similarity, and graph structure in a single engine.
        </p>
      </div>
      <div className="space-y-2">
        {MODES.map((m) => {
          const Icon = m.Icon
          return (
            <div
              key={m.id}
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-muted/20 px-3 py-2"
            >
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', m.accent)} />
              <div>
                <p className="font-serif text-[13px] leading-none tracking-tight text-foreground">
                  {m.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/50">{m.blurb}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
