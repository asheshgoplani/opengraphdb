import type { GraphNode } from '@/types/graph'
import type { CanvasColors } from './canvasColors.js'

export const LABEL_COLORS = [
  '#818cf8',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#a78bfa',
  '#fb923c',
  '#2dd4bf',
  '#e879f9',
  '#38bdf8',
  '#a3e635',
  '#fb7185',
]

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent))
  const g = Math.min(255, ((num >> 8) & 0x00ff) + Math.round(2.55 * percent))
  const b = Math.min(255, (num & 0x0000ff) + Math.round(2.55 * percent))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent))
  const g = Math.max(0, ((num >> 8) & 0x00ff) - Math.round(2.55 * percent))
  const b = Math.max(0, (num & 0x0000ff) - Math.round(2.55 * percent))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function toDisplayText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

export function getLabelColor(
  label: string,
  labelIndex: Map<string, number>
): string {
  if (!labelIndex.has(label)) {
    labelIndex.set(label, labelIndex.size)
  }
  return LABEL_COLORS[labelIndex.get(label)! % LABEL_COLORS.length]
}

export function paintNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  colors: CanvasColors,
  labelIndex: Map<string, number>,
  connectionCounts?: Map<string | number, number>,
  traceState?: {
    activeNodeId: string | number | null
    traversedNodeIds: Set<string | number>
    isPlaying: boolean
  } | null
) {
  const label = node.label || node.labels?.[0] || String(node.id)
  const displayName = toDisplayText(node.properties?.name ?? node.properties?.title, label)
  const nodeColor = getLabelColor(node.labels?.[0] || 'default', labelIndex)
  const connections = connectionCounts?.get(node.id) ?? 0
  const radius = 5 + Math.min(connections * 0.5, 7)
  const fontSize = Math.max(11 / globalScale, 2.5)
  const x = node.x ?? 0
  const y = node.y ?? 0

  const canvasWidth = ctx.canvas.width
  const canvasHeight = ctx.canvas.height
  const transform = ctx.getTransform()
  const margin = radius * 2
  const graphLeft = -transform.e / transform.a - margin
  const graphTop = -transform.f / transform.d - margin
  const graphRight = (canvasWidth - transform.e) / transform.a + margin
  const graphBottom = (canvasHeight - transform.f) / transform.d + margin

  if (x < graphLeft || x > graphRight || y < graphTop || y > graphBottom) {
    return
  }

  const isZoomedOut = globalScale < 0.4
  const isTraced = traceState?.traversedNodeIds.has(node.id) ?? false
  const isActiveTrace = traceState?.activeNodeId === node.id
  const isDimmed = traceState?.isPlaying && !isTraced && !isActiveTrace

  if (isZoomedOut && !isActiveTrace) {
    ctx.save()
    if (isDimmed) ctx.globalAlpha = colors.dimmedAlpha
    ctx.beginPath()
    ctx.arc(x, y, Math.max(radius * 0.6, 2), 0, 2 * Math.PI)
    ctx.fillStyle = isTraced ? colors.traceGlow : nodeColor
    ctx.fill()
    ctx.restore()
    return
  }

  ctx.save()
  if (isDimmed) ctx.globalAlpha = colors.dimmedAlpha
  const baseAlpha = ctx.globalAlpha

  if (isActiveTrace) {
    ctx.shadowColor = colors.traceGlow
    ctx.shadowBlur = 30 / globalScale
  } else if (isTraced) {
    ctx.shadowColor = colors.traceGlow
    ctx.shadowBlur = 15 / globalScale
  } else {
    ctx.shadowColor = nodeColor
    ctx.shadowBlur = Math.max(8 / globalScale, 4)
  }

  ctx.globalAlpha = baseAlpha * 0.2
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = nodeColor
  ctx.fill()
  ctx.globalAlpha = baseAlpha
  ctx.shadowBlur = 0

  const gradient = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    radius * 0.1,
    x,
    y,
    radius
  )
  gradient.addColorStop(0, lightenColor(nodeColor, 30))
  gradient.addColorStop(0.7, nodeColor)
  gradient.addColorStop(1, darkenColor(nodeColor, 20))

  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.strokeStyle = darkenColor(nodeColor, 30)
  ctx.lineWidth = 0.5
  ctx.stroke()

  if (isActiveTrace) {
    ctx.beginPath()
    ctx.arc(x, y, radius + 4, 0, 2 * Math.PI)
    ctx.strokeStyle = colors.traceGlow
    ctx.lineWidth = 2 / globalScale
    ctx.stroke()
  }

  // Draw label text below node with background-aware shadow for contrast.
  ctx.font = `500 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const text = displayName.length > 18 ? `${displayName.slice(0, 15)}...` : displayName
  ctx.shadowColor = colors.bg
  ctx.shadowBlur = 3
  ctx.fillStyle = colors.nodeText
  ctx.fillText(text, x, y + radius + 3)
  ctx.shadowBlur = 0
  ctx.restore()
}
