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

  // Bold-redesign change 5: legend lives top-RIGHT (cycle-12 was top-left
  // and clashed with the densest cluster), the frame is roughly twice
  // the cycle-12 size (px-4 py-3, min-w-[200px], larger label/swatch),
  // and we add a one-line wayfinding hint so the panel reads as
  // navigation aid rather than a debug widget.
  return (
    <div
      className="glass absolute right-3 top-3 min-w-[200px] rounded-lg border px-4 py-3 shadow-sm"
      data-testid="graph-legend"
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Legend
      </p>
      <div className="flex flex-col gap-2">
        {labels.map((label) => (
          <div key={label} className="flex items-center gap-2.5">
            <span
              className="inline-block h-4 w-4 rounded-full ring-1 ring-border/40"
              style={{ backgroundColor: colorForLabel(label, dark, labelIndex) }}
              aria-hidden="true"
            />
            <span className="text-sm text-foreground">{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
        drag to pan · scroll to zoom
      </p>
    </div>
  )
}
