import type { GraphNode } from '@/types/graph'
import type { CanvasColors } from './useGraphColors'

export const LABEL_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#a855f7',
]

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
  labelIndex: Map<string, number>
) {
  const label = node.label || node.labels?.[0] || String(node.id)
  const nodeColor = getLabelColor(node.labels?.[0] || 'default', labelIndex)
  const radius = 6
  const fontSize = Math.max(10 / globalScale, 2)

  // Draw circle
  ctx.beginPath()
  ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI)
  ctx.fillStyle = nodeColor
  ctx.fill()
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 0.5
  ctx.stroke()

  // Draw label text below node
  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = colors.nodeText
  const truncated = label.length > 15 ? label.slice(0, 12) + '...' : label
  ctx.fillText(truncated, node.x!, node.y! + radius + 2)
}
