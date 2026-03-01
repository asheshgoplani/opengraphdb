import { getLabelColor } from './NodeRenderer.js'

interface GraphLegendProps {
  labels: string[]
  labelIndex: Map<string, number>
}

export function GraphLegend({ labels, labelIndex }: GraphLegendProps) {
  if (labels.length === 0) return null

  return (
    <div className="glass absolute bottom-3 left-3 rounded-lg border px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Legend
      </p>
      <div className="flex flex-col gap-1">
        {labels.map((label) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getLabelColor(label, labelIndex) }}
            />
            <span className="text-xs text-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
