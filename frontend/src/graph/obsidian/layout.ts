import type { GraphData, GraphNode } from '@/types/graph'

// Deterministic Fibonacci-disc / cluster-aware seed positions so the layout
// is reproducible across reloads.
export function seedPositions(data: GraphData): Map<string | number, { x: number; y: number }> {
  const out = new Map<string | number, { x: number; y: number }>()
  const nodes = data.nodes
  if (nodes.length === 0) return out

  const clusterKeys = new Map<string, number>()
  for (const n of nodes) {
    const c = (n.properties?.cluster as string | undefined) ?? ''
    if (!clusterKeys.has(c)) clusterKeys.set(c, clusterKeys.size)
  }
  const clusterCount = Math.max(1, clusterKeys.size)
  const hasClusters =
    clusterCount >= 2 &&
    nodes.every((n) => typeof n.properties?.cluster === 'string')

  if (hasClusters) {
    const QUADRANT_R = 700
    const INTRA_R = 240
    nodes.forEach((n: GraphNode, i: number) => {
      const cid = clusterKeys.get(n.properties?.cluster as string) ?? 0
      const qAngle =
        (cid / clusterCount) * Math.PI * 2 - Math.PI / 2 + Math.PI / clusterCount
      const qx = Math.cos(qAngle) * QUADRANT_R
      const qy = Math.sin(qAngle) * QUADRANT_R
      const localAngle = i * 2.399
      const localR = INTRA_R * Math.sqrt((i * 0.61803) % 1)
      out.set(n.id, { x: qx + Math.cos(localAngle) * localR, y: qy + Math.sin(localAngle) * localR })
    })
  } else {
    const R = Math.max(220, Math.min(700, 38 * Math.sqrt(nodes.length)))
    nodes.forEach((n: GraphNode, i: number) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
      const r = R * (0.35 + ((i * 0.61803) % 1) * 0.65)
      out.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r })
    })
  }
  return out
}

export function neighborSet(data: GraphData, nodeId: string | number): Set<string | number> {
  const out = new Set<string | number>([nodeId])
  for (const l of data.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source
    const t = typeof l.target === 'object' ? l.target.id : l.target
    if (s === nodeId) out.add(t)
    if (t === nodeId) out.add(s)
  }
  return out
}
