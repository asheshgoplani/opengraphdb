import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { GraphData } from '@/types/graph'
import { colorForLabel } from './colors'
import { prefersReducedMotion } from './tween'

interface Props {
  graphData: GraphData
  labelIndex?: Map<string, number>
  onTypeClick?: (label: string) => void
  onTypeHover?: (label: string | null) => void
}

interface SchemaNode {
  label: string
  count: number
  x: number
  y: number
  color: string
}

interface SchemaEdge {
  source: string
  target: string
  type: string
}

const INSET_W = 220
const INSET_H = 180
const NODE_R = 9
const PAD = 18

// Derive a TBox-shaped graph from the live ABox: distinct primary labels
// become schema nodes; distinct (sourceLabel, edgeType, targetLabel)
// triples become schema edges. Exact for the canonical demo dataset
// (Movie/Genre/User/Tag/Rating + relationships) and degrades gracefully
// on arbitrary user imports.
function deriveSchema(graphData: GraphData): {
  nodes: Array<{ label: string; count: number }>
  edges: SchemaEdge[]
} {
  const counts = new Map<string, number>()
  const idToLabel = new Map<string | number, string>()
  for (const n of graphData.nodes) {
    const lbl = n.labels?.[0]
    if (!lbl) continue
    counts.set(lbl, (counts.get(lbl) ?? 0) + 1)
    idToLabel.set(n.id, lbl)
  }
  const nodes = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)

  const seen = new Set<string>()
  const edges: SchemaEdge[] = []
  for (const l of graphData.links) {
    const sId = typeof l.source === 'object' ? l.source.id : l.source
    const tId = typeof l.target === 'object' ? l.target.id : l.target
    const sLbl = idToLabel.get(sId)
    const tLbl = idToLabel.get(tId)
    const type = l.type
    if (!sLbl || !tLbl || !type) continue
    const key = `${sLbl}|${type}|${tLbl}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ source: sLbl, target: tLbl, type })
  }
  return { nodes, edges }
}

function layoutSchema(
  nodes: Array<{ label: string }>,
  isDark: boolean,
  labelIndex?: Map<string, number>,
): SchemaNode[] {
  const cx = INSET_W / 2
  const cy = INSET_H / 2
  const radius = Math.min(INSET_W, INSET_H) / 2 - PAD
  const n = Math.max(1, nodes.length)
  return nodes.map((node, i) => {
    const theta = (i / n) * Math.PI * 2 - Math.PI / 2
    return {
      label: node.label,
      count: 0,
      x: cx + Math.cos(theta) * radius,
      y: cy + Math.sin(theta) * radius,
      color: colorForLabel(node.label, isDark, labelIndex),
    }
  })
}

export function SchemaInset({
  graphData,
  labelIndex,
  onTypeClick,
  onTypeHover,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const hoverStartRef = useRef<number | null>(null)
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    )
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => obs.disconnect()
  }, [])

  const schema = useMemo(() => deriveSchema(graphData), [graphData])
  const positioned = useMemo(
    () => layoutSchema(schema.nodes, isDark, labelIndex),
    [schema.nodes, isDark, labelIndex],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== INSET_W * dpr || canvas.height !== INSET_H * dpr) {
      canvas.width = INSET_W * dpr
      canvas.height = INSET_H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, INSET_W, INSET_H)

    const reduced = prefersReducedMotion()
    const now = performance.now()
    const pulse =
      hoverLabel != null && !reduced && hoverStartRef.current != null
        ? 1 + 0.18 * Math.abs(Math.sin(((now - hoverStartRef.current) / 600) * Math.PI))
        : 1

    const byLabel = new Map(positioned.map((n) => [n.label, n]))
    ctx.lineWidth = 1
    ctx.strokeStyle = isDark
      ? 'rgba(255,200,150,0.35)'
      : 'rgba(80,60,40,0.35)'
    for (const e of schema.edges) {
      const s = byLabel.get(e.source)
      const t = byLabel.get(e.target)
      if (!s || !t) continue
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
    }

    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const n of positioned) {
      const isHover = n.label === hoverLabel
      const r = NODE_R * (isHover ? pulse : 1)
      ctx.fillStyle = n.color
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fill()
      if (isHover) {
        ctx.lineWidth = 2
        ctx.strokeStyle = isDark ? '#ffffff' : '#000000'
        ctx.stroke()
      }
      ctx.fillStyle = isDark ? '#f5e6c8' : '#1a1410'
      ctx.fillText(n.label, n.x, n.y + r + 9)
    }
  }, [positioned, schema.edges, isDark, hoverLabel])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  const hitTest = useCallback(
    (px: number, py: number): SchemaNode | null => {
      for (const n of positioned) {
        const dx = px - n.x
        const dy = py - n.y
        if (dx * dx + dy * dy <= (NODE_R + 4) * (NODE_R + 4)) return n
      }
      return null
    },
    [positioned],
  )

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    const next = hit?.label ?? null
    if (next !== hoverLabel) {
      setHoverLabel(next)
      hoverStartRef.current = next ? performance.now() : null
      onTypeHover?.(next)
    }
  }
  const onMouseLeave = () => {
    if (hoverLabel) {
      setHoverLabel(null)
      hoverStartRef.current = null
      onTypeHover?.(null)
    }
  }
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) onTypeClick?.(hit.label)
  }

  return (
    <div
      role="complementary"
      aria-label="Schema legend"
      data-testid="obsidian-schema-inset"
      className="absolute bottom-3 right-3 rounded-lg border border-border/60 bg-background/85 shadow-md backdrop-blur"
      style={{ width: INSET_W, height: INSET_H }}
    >
      <canvas
        ref={canvasRef}
        data-testid="obsidian-schema-canvas"
        style={{ width: INSET_W, height: INSET_H, display: 'block' }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />
    </div>
  )
}

export const SCHEMA_INSET_W = INSET_W
export const SCHEMA_INSET_H = INSET_H
