import type { DatasetMeta } from '@/data/datasets'

interface DatasetHeaderProps {
  meta: DatasetMeta | undefined
  nodeCount: number
  edgeCount: number
  /** When a live/Cypher query has returned a specific row count, show it
   * alongside the dataset totals so the user can tell "I'm looking at a
   * subset of the dataset" vs "I'm looking at the full sample". */
  activeRowCount?: number | null
  activeQueryLabel?: string | null
}

// Self-explanatory strip that sits at the top of the playground canvas and
// tells the user, in plain words, exactly what they're looking at:
//   "Showing 74 nodes, 168 edges · Air Routes (sample) · Kelvin Lawrence's
//    Practical Gremlin · Apache 2.0"
// The slogan answers the second-most-common reviewer question ("what is this
// data?") without making the user dig through the sidebar or description.
export function DatasetHeader({
  meta,
  nodeCount,
  edgeCount,
  activeRowCount,
  activeQueryLabel,
}: DatasetHeaderProps) {
  if (!meta) return null
  const totals = `Showing ${nodeCount.toLocaleString()} nodes, ${edgeCount.toLocaleString()} edges`
  const activeLine =
    typeof activeRowCount === 'number' && activeQueryLabel
      ? ` · query ${activeQueryLabel} returned ${activeRowCount.toLocaleString()} rows`
      : ''
  // H6 (audit 2026-04-23b): `backdrop-blur-sm` used to sit on the <section>
  // below. This strip is directly above the WebGL canvas, so every zoom-wheel
  // / drag-pan invalidated the blur filter's compositor pass and showed up as
  // 100-166ms p99 frame tails on wikidata + movielens under software GL. The
  // strip still reads as "designed chrome" because of the cyan-bordered
  // gradient band — blur was load-bearing for aesthetics, not information.
  // Dropping it removes the per-frame repaint tax.
  return (
    <section
      data-testid="dataset-header"
      data-dataset-key={meta.key}
      data-node-count={nodeCount}
      data-edge-count={edgeCount}
      aria-label="Active dataset summary"
      className="border-b border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 via-slate-900/30 to-cyan-500/10 px-4 py-2 font-mono text-[11px] leading-tight text-white/85"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular-nums text-cyan-200">{totals}</span>
        <span className="text-white/40">·</span>
        <span className="font-serif text-[13px] text-white">{meta.name}</span>
        <span className="text-white/40">·</span>
        <span className="truncate text-white/65">{meta.sourceLabel}</span>
        <span className="text-white/40">·</span>
        <span className="rounded border border-white/15 px-1.5 py-[1px] text-[10px] uppercase tracking-[0.12em] text-white/55">
          {meta.license}
        </span>
        {activeLine && (
          <span data-testid="dataset-header-active" className="text-emerald-300/85">
            {activeLine}
          </span>
        )}
      </div>
    </section>
  )
}
