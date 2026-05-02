import { useEffect, useState } from 'react'
import { colorForLabel } from '../../graph/obsidian/colors.js'

interface GraphLegendProps {
  labels: string[]
  labelIndex: Map<string, number>
  // Optional dark-mode override. When omitted, reads `document.documentElement`
  // class list. Tests pass `isDark` directly so SSR snapshots are deterministic.
  isDark?: boolean
}

export function GraphLegend({ labels, labelIndex, isDark }: GraphLegendProps) {
  // Track theme via the same MutationObserver pattern as ObsidianGraph so
  // toggling the class re-paints swatches without remounting the component.
  const [dark, setDark] = useState(() => {
    if (typeof isDark === 'boolean') return isDark
    return (
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark')
    )
  })
  useEffect(() => {
    if (typeof isDark === 'boolean' || typeof document === 'undefined') return
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    )
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => obs.disconnect()
  }, [isDark])

  if (labels.length === 0) return null

  return (
    <div
      className="glass absolute left-3 top-3 rounded-lg border px-3 py-2 shadow-sm"
      data-testid="graph-legend"
    >
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Legend
      </p>
      <div className="flex flex-col gap-1.5">
        {labels.map((label) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full ring-1 ring-border/40"
              style={{ backgroundColor: colorForLabel(label, dark, labelIndex) }}
              aria-hidden="true"
            />
            <span className="text-xs text-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
