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
    // Spread radius scales with node count so a 100-node graph gets ~700px
    // canvas, and a 10-node graph stays compact.
    const R = Math.max(260, Math.min(900, 60 * Math.sqrt(nodes.length)))
    nodes.forEach((n: GraphNode, i: number) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
      const r = R * (0.4 + ((i * 0.61803) % 1) * 0.6)
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

// k-hop neighborhood via BFS. Returns a map from node-id to hop-distance
// (0 = self, 1 = direct neighbor, 2 = 2-hop, …). Nodes not within `k` hops
// are absent from the map. Used for the tiered fade (focus / 1-hop / 2-hop).
export function kHopNeighbors(
  data: GraphData,
  nodeId: string | number,
  k: number,
): Map<string | number, number> {
  const dist = new Map<string | number, number>()
  dist.set(nodeId, 0)
  if (k <= 0) return dist
  // Build adjacency once (O(m)) so BFS is O(n+m), not O(k·m).
  const adj = new Map<string | number, Array<string | number>>()
  for (const l of data.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source
    const t = typeof l.target === 'object' ? l.target.id : l.target
    if (!adj.has(s)) adj.set(s, [])
    if (!adj.has(t)) adj.set(t, [])
    adj.get(s)!.push(t)
    adj.get(t)!.push(s)
  }
  let frontier: Array<string | number> = [nodeId]
  for (let h = 1; h <= k; h += 1) {
    const next: Array<string | number> = []
    for (const u of frontier) {
      const nbrs = adj.get(u)
      if (!nbrs) continue
      for (const v of nbrs) {
        if (!dist.has(v)) {
          dist.set(v, h)
          next.push(v)
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return dist
}

// Priority comparator for the label-collision pass. Order:
//   focused (1) > highest-degree > deterministic-by-id (lex on String(id)).
// Extracted as a pure function so the ordering is testable without rendering.
export function compareLabelPriority(
  a: { id: string | number },
  b: { id: string | number },
  focused: string | number | null,
  degrees: Map<string | number, number>,
): number {
  const fa = focused != null && a.id === focused ? 1 : 0
  const fb = focused != null && b.id === focused ? 1 : 0
  if (fa !== fb) return fb - fa
  const da = degrees.get(a.id) ?? 0
  const db = degrees.get(b.id) ?? 0
  if (da !== db) return db - da
  return String(a.id).localeCompare(String(b.id))
}

export function degreeMap(data: GraphData): Map<string | number, number> {
  const out = new Map<string | number, number>()
  for (const n of data.nodes) out.set(n.id, 0)
  for (const l of data.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source
    const t = typeof l.target === 'object' ? l.target.id : l.target
    out.set(s, (out.get(s) ?? 0) + 1)
    out.set(t, (out.get(t) ?? 0) + 1)
  }
  return out
}

export interface ForceTuning {
  chargeStrength: number
  chargeDistanceMax: number
  linkDistance: number
  collideRadius: number
  cooldownTime: number
}

// Tune the simulation by node count.
// - charge formula from KG-viz research: -clamp(60, 30√n, 400) so a 100-node
//   graph gets ~-300 (vs the d3 default of -30 that flattens past ~50 nodes).
// - distanceMax(400) caps long-range repulsion for the >500-node perf win.
// - link distance 60 is the canonical Obsidian feel; we widen with √n for
//   larger graphs so they breathe instead of clumping.
// - cooldownTime 8000ms for ≤500 nodes — the default 4000ms freezes the
//   simulation mid-settle on dense graphs.
export function tuneForces(nodeCount: number): ForceTuning {
  const n = Math.max(1, nodeCount)
  const chargeStrength = -Math.max(60, Math.min(400, 30 * Math.sqrt(n)))
  const chargeDistanceMax = 400
  const linkDistance = Math.max(60, Math.min(110, 50 + Math.sqrt(n) * 5))
  const collideRadius = 22 + Math.min(20, Math.sqrt(n))
  const cooldownTime = n <= 500 ? 8000 : 15000
  return { chargeStrength, chargeDistanceMax, linkDistance, collideRadius, cooldownTime }
}

export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
  id: string | number
}

// Pure rect overlap (in world coords) — used by label-collision pass and tests.
export function rectsOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// Entry-animation constants (cycle D). On the first engine-cool, the
// camera starts at ENTRY_OVERZOOM and animates to the natural fit over
// ENTRY_DURATION_MS — reads as a cinematic "settle from outside" dolly
// instead of the prior cut-to-fit, so the first impression is dynamic.
export const ENTRY_OVERZOOM = 1.6
export const ENTRY_DURATION_MS = 900

// Default count of "always-visible" hub labels (cycle C). With no node
// focused, the top-N highest-degree nodes get labels drawn unconditionally
// (skipCollision = true) so the user always sees the principal vertices
// at first paint, not just on hover. 8 is the empirical sweet spot —
// fewer than that and a 50-node ontology shows mostly anonymous dots;
// more than that and the dense-graph case starts crowding.
export const TOP_HUB_LABELS_DEFAULT = 8

// Returns the top-N node ids by degree (descending), ties broken
// deterministically by stringified-id ascending — same priority key as
// `compareLabelPriority`'s no-focus branch, so the chosen hubs match the
// label-pass priority ordering exactly.
export function topHubsByDegree(
  data: GraphData,
  degrees: Map<string | number, number>,
  n: number,
): Array<string | number> {
  if (n <= 0 || data.nodes.length === 0) return []
  const sorted = [...data.nodes].sort((a, b) => {
    const da = degrees.get(a.id) ?? 0
    const db = degrees.get(b.id) ?? 0
    if (da !== db) return db - da
    return String(a.id).localeCompare(String(b.id))
  })
  return sorted.slice(0, Math.min(n, sorted.length)).map((node) => node.id)
}

// Returns the id the entry-dolly should target (top-1 hub by degree, with
// the same deterministic tie-break as `topHubsByDegree`). Returns null
// for an empty graph so the caller can fall back to viewport-fit. Brief:
// "dolly-into-top-1-hub at ~1.6× fit-zoom, so the first frame shows a
// labeled hub neighborhood, not a fog of dots."
export function selectEntryFocusNodeId(
  data: GraphData,
  degrees: Map<string | number, number>,
): string | number | null {
  const top = topHubsByDegree(data, degrees, 1)
  return top[0] ?? null
}
