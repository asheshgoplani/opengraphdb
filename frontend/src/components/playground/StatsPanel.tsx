interface StatsPanelProps {
  nodeCount: number
  edgeCount: number
  labelCount: number
}

interface StatItemProps {
  label: string
  value: number
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="rounded-md border bg-background/70 px-2 py-2 text-center">
      <p className="text-sm font-semibold text-foreground">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function StatsPanel({ nodeCount, edgeCount, labelCount }: StatsPanelProps) {
  return (
    <section
      data-testid="stats-panel"
      className="rounded-lg border bg-muted/30 px-3 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
    >
      <p className="mb-2 font-serif text-[13px] leading-none tracking-tight text-foreground">
        Active Result
      </p>
      <div className="grid grid-cols-3 gap-2">
        <StatItem label="Nodes" value={nodeCount} />
        <StatItem label="Edges" value={edgeCount} />
        <StatItem label="Labels" value={labelCount} />
      </div>
    </section>
  )
}
