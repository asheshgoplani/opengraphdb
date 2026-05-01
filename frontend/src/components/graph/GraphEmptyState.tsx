import { Database, GitBranch, Link2, MapPin, Sparkles, User } from 'lucide-react'
import { GRAPH_THEME } from '@/graph/theme'

interface GraphEmptyStateProps {
  message?: string
  hint?: string
}

const NODES = [
  { x: 96, y: 60, color: '#7AA2FF', icon: User, label: 'Person' },
  { x: 200, y: 38, color: '#A78BFA', icon: Sparkles, label: 'Movie' },
  { x: 282, y: 102, color: '#34D399', icon: MapPin, label: 'Place' },
  { x: 184, y: 154, color: '#F472B6', icon: GitBranch, label: 'Genre' },
  { x: 60, y: 152, color: '#22D3EE', icon: Database, label: 'Item' },
]

const EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [3, 4],
  [0, 4],
  [2, 3],
]

export function GraphEmptyState({
  message = 'Run a query or load a sample dataset',
  hint = 'The canvas waits for a result set — empty graphs render as the placeholder above.',
}: GraphEmptyStateProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: GRAPH_THEME.bg,
          backgroundImage: `radial-gradient(circle at center, ${GRAPH_THEME.gridDot} 1px, transparent 1px)`,
          backgroundSize: `${GRAPH_THEME.gridSize}px ${GRAPH_THEME.gridSize}px`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: GRAPH_THEME.vignette }}
      />

      <div className="relative z-10 max-w-md text-center">
        <svg
          viewBox="0 0 340 220"
          className="mx-auto mb-6 h-44 w-auto opacity-90"
          aria-hidden="true"
        >
          {EDGES.map(([a, b], i) => {
            const sa = NODES[a]
            const sb = NODES[b]
            if (!sa || !sb) return null
            const mx = (sa.x + sb.x) / 2 + 12
            const my = (sa.y + sb.y) / 2 - 12
            return (
              <path
                key={i}
                d={`M ${sa.x} ${sa.y} Q ${mx} ${my} ${sb.x} ${sb.y}`}
                stroke="rgba(148,163,255,0.32)"
                strokeWidth="1.1"
                fill="none"
              />
            )
          })}
          {NODES.map((n, i) => (
            <g key={i} transform={`translate(${n.x},${n.y})`}>
              <circle r={16} fill={n.color} fillOpacity="0.18" />
              <circle r={11} fill={n.color} fillOpacity="0.9" />
              <circle r={11} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />
            </g>
          ))}
        </svg>

        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Link2 className="h-3 w-3" aria-hidden="true" />
          empty canvas
        </div>

        <h3 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          {message}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}
